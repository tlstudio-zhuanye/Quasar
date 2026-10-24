'use strict'
/** 通过 CDP 在渲染层执行 JS，用于自检 / 触发交互  node tools/cdp.cjs "表达式" */
const PORT = 9222
const expr = process.argv.slice(2).join(' ') || 'document.title'

async function main () {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
  const page = list.find((t) => t.type === 'page')
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
