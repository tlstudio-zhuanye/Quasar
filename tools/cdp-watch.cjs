'use strict'
/**
 * 在指定窗口里执行一段 JS，并把执行期间渲染层的报错/日志打出来。
 *   node tools/cdp-watch.cjs main "document.querySelector('.acct').click()"
 */
const PORT = 9222
const which = (process.argv[2] || 'main').toLowerCase()
const expr = process.argv.slice(3).join(' ') || '1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main () {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
  const pages = list.filter((t) => t.type === 'page')
  const page = pages.find((t) => (t.url || '').toLowerCase().includes('#' + which)) || pages[0]
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

  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  await sleep(4500)

  console.log('=== 执行结果 ===')
  console.log(r && r.result ? JSON.stringify(r.result.value) : JSON.stringify(r))
  console.log('=== 期间日志 ===')
  if (!logs.length) console.log('(无报错)')
  logs.slice(0, 30).forEach((l) => console.log(l))
  ws.close()
}

main().catch((e) => { console.error('失败：' + e.message); process.exit(1) })
