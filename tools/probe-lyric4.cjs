'use strict'
/**
 * 逐字歌词探测 第四轮（一次性工具）
 *   node tools/probe-lyric4.cjs
 * 1. 网易云：打印孤勇者(id=1901371647) yrc.lyric 原始文本，确认真实格式
 * 2. QQ：试 u.y.qq.com/cgi-bin/musicu.fcg 的 GetLyric（桌面客户端逐字接口）
 */
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

const sources = require(path.join(__dirname, '..', 'electron', 'sources', 'index.cjs'))

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

async function main () {
  /* ---- 网易云 yrc 原始文本 ---- */
  console.log('══════════ 网易云 yrc 原始文本（孤勇者 1901371647） ══════════')
  try {
    const r = await fetch(
      'https://music.163.com/api/song/lyric/v1?os=pc&appver=8.10.90&id=1901371647&tv=-1&lv=-1&kv=-1&yv=-1',
      { headers: { 'User-Agent': UA, Referer: 'https://music.163.com/' } })
    const j = await r.json()
    const d = j.data || j
    console.log('字段：' + Object.keys(d).join(','))
    for (const k of ['yrc', 'klyric', 'lrc', 'tlyric', 'romaLrc']) {
      if (d[k] && d[k].lyric) {
        console.log(`\n[${k}] 前 400 字：`)
        console.log(String(d[k].lyric).slice(0, 400))
      }
    }
  } catch (e) { console.log('失败：' + e.message.slice(0, 120)) }

  /* ---- QQ musicu.fcg GetLyric ---- */
  console.log('\n══════════ QQ musicu.fcg GetLyric（稻香/孤勇者） ══════════')
  const mids = []
  try {
    for (const kw of ['周杰伦 稻香', '陈奕迅 孤勇者']) {
      const list = await sources.search({ platform: 'qq', keyword: kw, limit: 1 })
      mids.push([kw, list[0].mid, list[0].name])
    }
  } catch (e) { console.log('搜索失败：' + e.message.slice(0, 100)) }
  for (const [kw, mid, name] of mids) {
    try {
      const body = JSON.stringify({
        comm: { ct: 9, cv: '00', uin: '0', format: 'json', platform: 'yqq.json' },
        lyric: {
          method: 'GetLyric',
          module: 'music.musichallSong.LyricServer',
          param: { songmid: mid, g_tk: 5381 }
        }
      })
      const r = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://y.qq.com/portal/player.html'
        },
        body: 'data=' + encodeURIComponent(body)
      })
      const j = await r.json()
      const ly = j.lyric || {}
      console.log(`\n  ${name}（${kw}） 顶层字段：${Object.keys(ly).join(',')}`)
      const raw = (ly.data && (ly.data.lyric || ly.data.QfcLyric)) || ly.lyric || ''
      console.log('  lyric 前 300 字：' + String(raw).slice(0, 300))
      if (ly.data) console.log('  data 字段：' + Object.keys(ly.data).join(','))
    } catch (e) { console.log(`  ${kw} 失败：` + e.message.slice(0, 120)) }
  }
}
main()
