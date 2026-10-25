'use strict'
/**
 * 用 GitHub Git Data API 把本地 HEAD 的整棵 tree 推到远端（绕开被代理挡掉的
 * github.com:443 git push；api.github.com 是通的）。
 *
 *   node tools/_api-push.cjs <owner/repo> <commit message>
 *
 * 序列：git ls-tree 取清单 → 逐文件 POST /git/blobs → POST /git/trees
 *       → POST /git/commits（parent = 远端当前 main）→ PATCH /git/refs/heads/main
 * 坑（都踩过）：tree / parents / refs 只认完整 40 位 sha；空仓库要先种子提交。
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const REPO = process.argv[2]
const MSG = process.argv[3] || 'update'
if (!REPO) { console.error('用法: node tools/_api-push.cjs <owner/repo> <message>'); process.exit(1) }

const ROOT = path.join(__dirname, '..')
const GIT = 'D:/git/cmd/git.exe'
const GH = 'C:/Program Files/GitHub CLI/gh.exe'
const API = 'https://api.github.com'

const TOKEN = execFileSync(GH, ['auth', 'token'], { encoding: 'utf8' }).trim()
if (!TOKEN) { console.error('gh 未登录，拿不到 token'); process.exit(1) }

async function api (method, urlPath, body) {
  const res = await fetch(API + urlPath, {
    method,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch (_) {}
  if (!res.ok) {
    const e = new Error(`${method} ${urlPath} -> ${res.status} ${text.slice(0, 300)}`)
    e.status = res.status
    throw e
  }
  return json
}

function sh (cmd, args) {
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

async function main () {
  /* 1. 文件清单（git 视角，天然排除 node_modules / dist / release） */
  const files = sh(GIT, ['ls-tree', '-r', 'HEAD', '--name-only']).split('\n').map((s) => s.trim()).filter(Boolean)
  console.log(`本地树文件数: ${files.length}`)

  /* 2. 逐文件建 blob */
  const tree = []
  for (let i = 0; i < files.length; i++) {
    const rel = files[i]
    const abs = path.join(ROOT, rel)
    const b64 = fs.readFileSync(abs).toString('base64')
    const r = await api('POST', `/repos/${REPO}/git/blobs`, { content: b64, encoding: 'base64' })
    tree.push({ path: rel, mode: '100644', type: 'blob', sha: r.sha })
    if (i % 10 === 0 || i === files.length - 1) console.log(`  blob ${i + 1}/${files.length} ${rel}`)
  }

  /* 3. 整棵树 */
  const t = await api('POST', `/repos/${REPO}/git/trees`, { tree })
  console.log(`tree=${t.sha}`)

  /* 4. 远端当前 main 作为 parent */
  let parent = null
  try {
    const ref = await api('GET', `/repos/${REPO}/git/refs/heads/main`)
    parent = ref.object.sha
  } catch (e) {
    if (e.status !== 404) throw e
    console.log('远端 main 不存在（空仓库）——先用 README 种子提交')
    const seed = await api('PUT', `/repos/${REPO}/contents/README.md`, {
      message: 'seed', content: Buffer.from('# Quasar\n').toString('base64')
    })
    parent = seed.commit.sha
  }
  if (!/^[0-9a-f]{40}$/.test(parent)) throw new Error('parent sha 不完整: ' + parent)
  console.log(`parent=${parent}`)

  /* 5. 提交 + 6. 推 ref */
  const c = await api('POST', `/repos/${REPO}/git/commits`, { message: MSG, tree: t.sha, parents: [parent] })
  console.log(`commit=${c.sha}`)
  await api('PATCH', `/repos/${REPO}/git/refs/heads/main`, { sha: c.sha, force: false })
  console.log(`PUSH_OK https://github.com/${REPO}/commit/${c.sha}`)
}

main().catch((e) => { console.error('推送失败: ' + e.message); process.exit(1) })
