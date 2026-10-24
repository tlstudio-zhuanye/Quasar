'use strict'
/**
 * 逐字歌词探测 第五轮（一次性工具）
 *   node tools/probe-lyric5.cjs
 * 1. 网易云：打印 yrc/lrc 正文行的完整 JSON，确认词级字段（时长在哪）
 * 2. QQ：打印 musicu.fcg 完整响应，定位为什么空
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
  /* ---- 网易云：正文行完整 JSON ---- */
  console.log('══════════ 网易云 yrc/lrc 正文行结构 ══════════')
  try {
    const r = await fetch(
      'https://music.163.com/api/song/lyric/v1?os=pc&appver=8.10.90&id=1901371647&tv=-1&lv=-1&kv=-1&yv=-1',
      { headers: { 'User-Agent': UA, Referer: 'https://music.163.com/' } })
    const j = await r.json()
    const d = j.data || j
    for (const k of ['yrc', 'lrc', 'tlyric', 'romaLrc']) {
      const txt = d[k] && d[k].lyric
      if (!txt) continue
      console.log(`\n[${k}] 行数：${String(txt).split('\n').length}`)
      // 跳过元信息行（作词/作曲），打印前 3 行正文
      const lines = String(txt).split('\n')
      const body = lines.filter((l) => l.includes('"tx"') && !/作词|作曲|编曲|混音|母带|制作人/.test(l))
      for (const l of body.slice(0, 3)) {
        console.log('  ' + l.slice(0, 500))
      }
    }
  } catch (e) { console.log('失败：' + e.message.slice(0, 120)) }

  /* ---- QQ：musicu.fcg 完整响应 ---- */
  console.log('\n══════════ QQ musicu.fcg 完整响应 ══════════')
  try {
    const list = await sources.search({ platform: 'qq', keyword: '周杰伦 稻香', limit: 1 })
    const mid = list[0].mid
    for (const [name, body] of [
      ['musicu-GET风格', JSON.stringify({
        comm: { ct: 9, cv: '00', uin: '0', format: 'json', platform: 'yqq.json' },
        lyric: {
          method: 'GetLyric',
          module: 'music.musichallSong.LyricServer',
          param: { songmid: mid, g_tk: 5381 }
        }
      })],
      ['musicu-带cv版本', JSON.stringify({
        comm: { ct: 24, cv: 4747474, uin: '0', format: 'json', platform: 'yqq.json' },
        lyric: {
          method: 'GetLyric',
          module: 'music.musichallSong.LyricServer',
          param: { songmid: mid, g_tk: 5381 }
        }
      })]
    ]) {
      const r = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(body), {
        headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/portal/player.html' }
      })
      const txt = await r.text()
      console.log(`\n[${name}] HTTP ${r.status} 前 500 字：`)
      console.log(txt.slice(0, 500))
    }
  } catch (e) { console.log('失败：' + e.message.slice(0, 120)) }
}
main()
