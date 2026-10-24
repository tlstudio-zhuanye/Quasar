'use strict'
/**
 * 在指定窗口的渲染层执行 JS。
 *   node tools/cdp-at.cjs mini "表达式"
 *   node tools/cdp-at.cjs main "表达式"
 * 第二参数为 'mini' / 'main'（按 URL hash 匹配），剩余参数拼成表达式。
 */
const PORT = 9222
const which = (process.argv[2] || 'main').toLowerCase()
const expr = process.argv.slice(3).join(' ') || 'document.title'

async function main () {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
  const pages = list.filter((t) => t.type === 'page')
  const page = pages.find((t) => t.url.toLowerCase().includes('#' + which)) || pages[0]
  if (!page) throw new Error('没有找到可执行页面')

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 连接失败')) })

  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id) }
  }
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })

  const r = await send('Runtime.evaluate', {
    expression: expr, awaitPromise: true, returnByValue: true
  })
  const out = r && r.result ? r.result.value : r
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2))
  ws.close()
}

main().catch((e) => { console.error('执行失败：' + e.message); process.exit(1) })
