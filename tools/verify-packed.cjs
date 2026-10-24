'use strict'
/**
 * 打包产物自检：确认「双击就能用」的那个 exe 真的能跑起来。
 *
 *   node tools/verify-packed.cjs [截图输出.png]
 *
 * 做的事：
 *   1. 列出 CDP 里的所有窗口
 *   2. 在主窗（#main）里执行健康检查表达式，确认：
 *        页面渲染出节点 / preload 桥存在 / Pinia store 挂上 / 当前是打包资源而非 dev server
 *   3. 收集渲染层的 console 报错与未捕获异常
 *   4. 截一张图落盘
 */
const fs = require('node:fs')
const path = require('node:path')

/* 宿主环境常注入 HTTP_PROXY（WorkBuddy 自己的本地代理），Node 的 fetch 会把它
 * 用于 127.0.0.1，导致连不上本应用的 CDP 端口、误报「应用没起来」。清掉再跑。 */
for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy']) {
  delete process.env[k]
}
process.env.NO_PROXY = '*'

const PORT = 9222
const OUT = process.argv[2] || path.join(__dirname, '..', '_packed-main.png')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const HEALTH = `(() => {
  const TL = window.TL || {}
  const s = window.__TL || {}
  const p = s.player || {}
  return {
    title: document.title,
    url: location.href,
    hash: location.hash,
    nodes: document.querySelectorAll('*').length,
    bridge: Object.keys(TL),
    storeKeys: Object.keys(s),
    platform: s.mode ? s.mode.platform : null,
    songCount: (p.list && p.list.length) || (p.current ? 1 : 0),
    current: p.current ? (p.current.name + ' - ' + p.current.artist) : null,
    textSample: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 200)
  }
})()`

async function connect (wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 连接失败')) })
  let seq = 0
  const pending = new Map()
  const notes = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); return }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {}
      notes.push('异常: ' + (d.exception && d.exception.description ? d.exception.description.split('\n')[0] : d.text))
    }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      notes.push(m.params.type + ': ' + (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '))
    }
  }
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })
  return { send, notes, close: () => ws.close() }
}

async function main () {
  let targets = []
  for (let i = 0; i < 15; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      if (targets.some((t) => t.type === 'page')) break
    } catch (_) {}
    await sleep(800)
  }
  const pages = targets.filter((t) => t.type === 'page')
  console.log('窗口列表:')
  pages.forEach((t) => console.log(`  - ${t.title} | ${t.url}`))
  if (!pages.length) {
    console.log('❌ 没有页面：应用没起来')
    process.exit(2)
  }

  const main = pages.find((t) => /#main/i.test(t.url)) || pages[0]
  const c = await connect(main.webSocketDebuggerUrl)
  await c.send('Runtime.enable')
  await c.send('Page.enable')
  await sleep(1200)

  const r = await c.send('Runtime.evaluate', { expression: HEALTH, returnByValue: true, awaitPromise: true })
  const info = r && r.result ? r.result.value : null
  console.log('\n健康检查:')
  console.log(JSON.stringify(info, null, 2))

  const isPacked = !/localhost|127\.0\.0\.1:\d+\/?#/.test((info && info.url) || '')
  const ok = info && info.nodes > 50 && Array.isArray(info.bridge) && info.bridge.length > 0 && isPacked
  console.log('\n判定:')
  console.log('  渲染节点数   :', info ? info.nodes : '?')
  console.log('  preload 桥   :', info ? info.bridge.join(',') : '?')
  console.log('  加载来源     :', isPacked ? '打包资源 ✓' : 'dev server ✗')
  console.log('  结果         :', ok ? '✅ 打包版可用' : '❌ 检查未通过')

  if (c.notes.length) {
    console.log('\n渲染层报错/警告:')
    c.notes.slice(0, 10).forEach((n) => console.log('  ' + n))
  } else {
    console.log('\n渲染层无报错 ✓')
  }

  const shot = await c.send('Page.captureScreenshot', { format: 'png' })
  if (shot && shot.data) {
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
    console.log('\n截图已保存: ' + OUT)
  }
  c.close()
  process.exit(ok ? 0 : 1)
}

main().catch((e) => { console.error('自检失败：' + e.message); process.exit(1) })
