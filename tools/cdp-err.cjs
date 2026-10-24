'use strict'
/** 抓渲染进程的控制台报错：连接 → 开 Runtime/Log → 重载页面 → 收集 6 秒日志 */
const PORT = 9222
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main () {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
  const page = list.find((t) => t.type === 'page')
  if (!page) throw new Error('没有页面')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 失败')) })

  let seq = 0
  const pending = new Map()
  const logs = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); return }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')
      logs.push(`[${m.params.type}] ${text}`)
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      logs.push(`[EXCEPTION] ${d.text} ${(d.exception && (d.exception.description || d.exception.value)) || ''}`)
    }
    if (m.method === 'Log.entryAdded') {
      const e = m.params.entry
      if (e.level === 'error' || e.level === 'warning') logs.push(`[LOG:${e.level}] ${e.text}`)
    }
  }
  const send = (method, params = {}) => new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })

  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Page.reload', { ignoreCache: true })
  await sleep(7000)

  console.log('=== 渲染层日志 ===')
  if (!logs.length) console.log('(无错误)')
  logs.slice(0, 40).forEach((l) => console.log(l))

  const r = await send('Runtime.evaluate', {
    expression: "JSON.stringify({ hasBar: !!document.querySelector('.player-bar'), appKids: Array.from(document.querySelector('.app').children).map(e=>e.tagName) })",
    returnByValue: true
  })
  console.log('=== 状态 ===')
  console.log(r && r.result ? r.result.value : JSON.stringify(r))
  ws.close()
}

main().catch((e) => { console.error('失败：' + e.message); process.exit(1) })
