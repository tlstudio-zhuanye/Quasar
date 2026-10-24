'use strict'
/** 网络与接口连通性诊断 */
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

async function probe (label, url, opt = {}) {
  const t0 = Date.now()
  try {
    const body = await request(url, { json: false, headers: { 'User-Agent': UA }, ...opt })
    console.log(`[OK ${Date.now() - t0}ms] ${label}`)
    console.log('   ' + String(body).replace(/\s+/g, ' ').slice(0, 260))
  } catch (e) {
    console.log(`[ERR ${Date.now() - t0}ms] ${label}`)
    console.log('   ' + e.message)
  }
  console.log('')
}

async function main () {
  console.log('--- DNS / 连通性 ---')
  const dns = require('node:dns').promises
  for (const h of ['music.163.com', 'c.y.qq.com', 'u.y.qq.com', 'mobilecdn.kugou.com', 'www.kugou.com', 'trackercdn.kugou.com']) {
    try {
      const a = await dns.lookup(h)
      console.log(`  ${h} -> ${a.address}`)
    } catch (e) {
      console.log(`  ${h} -> DNS 失败: ${e.code || e.message}`)
    }
  }
  console.log('')

  console.log('--- 网易云 ---')
  await probe('首页', 'https://music.163.com/')
  await probe('老搜索接口', 'https://music.163.com/api/search/get/web?s=%E5%91%A8%E6%9D%B0%E4%BC%A6&type=1&offset=0&limit=3',
    { referer: 'https://music.163.com/' })

  console.log('--- QQ音乐 ---')
  await probe('搜索', 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=3&w=%E5%91%A8%E6%9D%B0%E4%BC%A6&format=json',
    { referer: 'https://y.qq.com/' })
  await probe('搜索(new_json)', 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=3&w=%E5%91%A8%E6%9D%B0%E4%BC%A6&format=json&cr=1&new_json=1&aggr=1&lossless=0&t=0&platform=yqq.json&needNewCode=0',
    { referer: 'https://y.qq.com/portal/player.html' })

  console.log('--- 酷狗 ---')
  await probe('mobilecdn 搜索', 'https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=%E5%91%A8%E6%9D%B0%E4%BC%A6&page=1&pagesize=3&showtype=1',
    { referer: 'https://www.kugou.com/' })
  await probe('首页', 'https://www.kugou.com/')
}

main().catch((e) => { console.error(e); process.exit(1) })
