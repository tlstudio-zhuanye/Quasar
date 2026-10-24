'use strict'
/** 通过 CDP 给 Electron 窗口截图，用于自检 UI */
const fs = require('node:fs')
const path = require('node:path')

const OUT = process.argv[2] || path.join(__dirname, '..', 'shot.png')
const PORT = 9222

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getTargets () {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`)
  return res.json()
}

async function shoot (target, out) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = (e) => reject(new Error('WebSocket 连接失败'))
  })

  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result || msg.error)
      pending.delete(msg.id)
    }
  }
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })

  await send('Page.enable')
  await sleep(600)
  const r = await send('Page.captureScreenshot', { format: 'png' })
  if (!r || !r.data) throw new Error('截图失败：' + JSON.stringify(r))
  fs.writeFileSync(out, Buffer.from(r.data, 'base64'))
  ws.close()
  return out
}

async function main () {
  let targets = []
  for (let i = 0; i < 20; i++) {
    try {
      targets = await getTargets()
      if (targets.some((t) => t.type === 'page')) break
    } catch (_) {}
    await sleep(800)
  }
  const pages = targets.filter((t) => t.type === 'page')
  // 第二个参数既可按标题匹配，也可按 hash 匹配：main / mini
  const filter = process.argv[3] || ''
  console.log('目标窗口：')
  pages.forEach((t) => console.log(`  - ${t.title} | ${t.url}`))
  if (!pages.length) {
    console.log('没有可截图的页面（应用可能没起来）')
    process.exit(2)
  }
  const f = filter.toLowerCase()
  const target = filter
    ? (pages.find((p) => (p.url || '').toLowerCase().includes('#' + f)) ||
       pages.find((p) => (p.url || '').toLowerCase().includes(f)) ||
       pages.find((p) => (p.title || '').toLowerCase().includes(f)))
    : pages[0]
  if (!target) {
    console.log(`没有匹配「${filter}」的窗口`)
    process.exit(3)
  }
  const out = await shoot(target, OUT)
  console.log('已保存：' + out)
}

main().catch((e) => {
  console.error('截图失败：', e.message)
  process.exit(1)
})
