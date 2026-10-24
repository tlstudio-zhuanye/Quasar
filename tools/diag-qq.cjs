'use strict'
/** QQ音乐搜索接口多方案探测 */
const path = require('node:path')
const os = require('node:os')
const Module = require('node:module')

const FAKE = 'mock-electron'
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'electron') return FAKE
  return origResolve.call(this, request, parent, ...rest)
}
require.cache[FAKE] = {
  id: FAKE, filename: FAKE, loaded: true,
  exports: { app: { getPath: () => path.join(os.tmpdir(), 'quasar-test') } }
}
const { request } = require(path.join(__dirname, '..', 'electron', 'sources', 'request.cjs'))

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const KW = '周杰伦'

async function show (label, fn) {
  try {
    const r = await fn()
    let n = '?'
    const s = JSON.stringify(r)
    const m = s.match(/"(?:song|list)":\{?"?list"?:\[/)
    if (/req_1|req_0/.test(s)) {
      const body = (r.req_1 && r.req_1.data && r.req_1.data.body) || (r.req_0 && r.req_0.data)
      const list = (body && body.song && body.song.list) || (body && body.list) || []
      n = list.length
    }
    console.log(`[${n}] ${label}`)
    console.log('    ' + s.replace(/\s+/g, ' ').slice(0, 300))
  } catch (e) {
    console.log(`[ERR] ${label} :: ${e.message}`)
  }
  console.log('')
}

async function main () {
  // A 基线
  await show('A. musicu.fcg SearchCgiService(Desktop)', () => request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    body: JSON.stringify({
      comm: { ct: 24, cv: 0, format: 'json', platform: 'yqq.json', needNewCode: 0 },
      req_1: { method: 'DoSearchForQQMusicDesktop', module: 'music.search.SearchCgiService', param: { num_per_page: 5, page_num: 1, query: KW, search_type: 0 } }
    }),
    headers: { 'Content-Type': 'application/json' },
    referer: 'https://y.qq.com/'
  }))

  // B 带 cookie
  await show('B. musicu.fcg + Cookie uin=0', () => request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    body: JSON.stringify({
      comm: { ct: 24, cv: 0, format: 'json', platform: 'yqq.json', needNewCode: 0, uin: '0' },
      req_1: { method: 'DoSearchForQQMusicDesktop', module: 'music.search.SearchCgiService', param: { num_per_page: 5, page_num: 1, query: KW, search_type: 0 } }
    }),
    headers: { 'Content-Type': 'application/json', Cookie: 'uin=0; qm_keyst=; pgv_pvid=1234567890' },
    referer: 'https://y.qq.com/n/ryqq/search'
  }))

  // C 老搜索接口 client_search_cp
  await show('C. client_search_cp', () => request(
    `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=5&w=${encodeURIComponent(KW)}&format=json&cr=1&new_json=1&aggr=1&lossless=0&t=0&platform=yqq.json&needNewCode=0`,
    { referer: 'https://y.qq.com/', headers: { Cookie: 'uin=0' } }
  ))

  // D search_for_qq_cp
  await show('D. search_for_qq_cp', () => request(
    `https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?w=${encodeURIComponent(KW)}&format=json&p=1&n=5&catZhida=1&remoteplace=txt.yqq.top&t=0&aggr=1&cr=1&zorro=0&lossless=0&flag_qc=0`,
    { referer: 'https://y.qq.com/', headers: { Cookie: 'uin=0' } }
  ))

  // E smartbox 搜索建议
  await show('E. smartbox_new', () => request(
    `https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?key=${encodeURIComponent(KW)}&format=json&g_tk=5381&inCharset=utf8&outCharset=utf-8&platform=yqq.json`,
    { referer: 'https://y.qq.com/' }
  ))

  // F musicu 用 Mobile 方法
  await show('F. musicu SearchCgiService(Mobile)', () => request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    body: JSON.stringify({
      comm: { ct: 24, cv: 0, format: 'json', platform: 'yqq.json', needNewCode: 0 },
      req_1: { method: 'DoSearchForQQMusicMobile', module: 'music.search.SearchCgiService', param: { num_per_page: 5, page_num: 1, query: KW, search_type: 0 } }
    }),
    headers: { 'Content-Type': 'application/json' },
    referer: 'https://y.qq.com/'
  }))

  // G 新搜索 service: music.search.SearchCgiService 走 u6
  await show('G. u6 musicu.fcg', () => request('https://u6.y.qq.com/cgi-bin/musics.fcg', {
    method: 'POST',
    body: JSON.stringify({
      comm: { ct: 24, cv: 0, format: 'json', platform: 'yqq.json', needNewCode: 0 },
      req_1: { method: 'DoSearchForQQMusicDesktop', module: 'music.search.SearchCgiService', param: { num_per_page: 5, page_num: 1, query: KW, search_type: 0 } }
    }),
    headers: { 'Content-Type': 'application/json' },
    referer: 'https://y.qq.com/'
  }))
}

main().catch((e) => { console.error(e); process.exit(1) })
