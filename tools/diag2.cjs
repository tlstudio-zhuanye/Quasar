'use strict'
/** 第二轮诊断：QQ musicu 原始返回 + 酷狗域名连通性 */
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

async function qqDiag () {
  console.log('══════ QQ音乐 musicu.fcg 原始返回 ══════')
  const body = {
    comm: { ct: 24, cv: 0, format: 'json', platform: 'yqq.json', needNewCode: 0 },
    req_1: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: { num_per_page: 5, page_num: 1, query: '周杰伦', search_type: 0 }
    }
  }
  try {
    const r = await request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      referer: 'https://y.qq.com/'
    })
    console.log(JSON.stringify(r).slice(0, 1600))
  } catch (e) {
    console.log('ERR', e.message)
  }
  console.log('')
}

async function probeFetch (label, url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' }
    })
    const t = await res.text()
    console.log(`  [OK ${res.status}] ${label} :: ${t.replace(/\s+/g, ' ').slice(0, 200)}`)
  } catch (e) {
    const c = e.cause || {}
    console.log(`  [ERR] ${label} :: ${e.message} | cause=${c.code || c.message || JSON.stringify(c)}`)
  }
}

async function kgDiag () {
  console.log('══════ 酷狗域名连通性 ══════')
  const kw = encodeURIComponent('周杰伦')
  await probeFetch('mobilecdn/api/v3/search/song',
    `https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${kw}&page=1&pagesize=3&showtype=1`)
  await probeFetch('songsearch.kugou.com/song_search_v2',
    `https://songsearch.kugou.com/song_search_v2?keyword=${kw}&page=1&pagesize=3&platform=WebFilter&tag=em&filter=2&iscorrection=1&privilege_filter=0`)
  await probeFetch('complexsearch.kugou.com/v2/search/song',
    `https://complexsearch.kugou.com/v2/search/song?keyword=${kw}&page=1&pagesize=3&platform=WebFilter`)
  await probeFetch('www.kugou.com/api/v3/search/song',
    `https://www.kugou.com/api/v3/search/song?format=json&keyword=${kw}&page=1&pagesize=3&showtype=1`)
  await probeFetch('msearchcdn.kugou.com',
    `https://msearchcdn.kugou.com/api/v3/search/song?format=json&keyword=${kw}&page=1&pagesize=3&showtype=1`)
  await probeFetch('search推荐 wwwapi',
    `https://wwwapi.kugou.com/yy/index.php?r=search/song&keyword=${kw}&page=1&pagesize=3&_=${Date.now()}`)
  console.log('')

  console.log('══════ 酷狗 DNS（A 记录） ══════')
  const dns = require('node:dns').promises
  for (const h of ['mobilecdn.kugou.com', 'songsearch.kugou.com', 'complexsearch.kugou.com', 'msearchcdn.kugou.com', 'wwwapi.kugou.com']) {
    try {
      const a = await dns.resolve4(h)
      console.log(`  ${h} -> ${a.join(', ')}`)
    } catch (e) {
      try {
        const l = await dns.lookup(h)
        console.log(`  ${h} -> lookup: ${l.address} (resolve4 失败: ${e.code})`)
      } catch (e2) {
        console.log(`  ${h} -> 无解析 (${e.code} / ${e2.code})`)
      }
    }
  }
}

async function main () {
  await qqDiag()
  await kgDiag()
}

main().catch((e) => { console.error(e); process.exit(1) })
