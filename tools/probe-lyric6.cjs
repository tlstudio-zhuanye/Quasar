'use strict'
/**
 * 逐字歌词探测 第六轮（一次性工具）
 *   node tools/probe-lyric6.cjs
 * 1. 网易云：yrc 正文行完整原文（不 slice），看词级时长字段
 * 2. QQ：musicu.fcg 换 req_1 请求键 + 带用户真实 cookie
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
  // 用真实用户数据目录，让 sources 带上已登录的 QQ cookie
  exports: { app: { getPath: () => path.join(os.homedir(), 'AppData', 'Roaming', 'Quasar') } }
}

const sources = require(path.join(__dirname, '..', 'electron', 'sources', 'index.cjs'))

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

async function main () {
  /* ---- 网易云：yrc 正文行完整原文 ---- */
  console.log('══════════ 网易云 yrc 正文行完整原文 ══════════')
  try {
    const r = await fetch(
      'https://music.163.com/api/song/lyric/v1?os=pc&appver=8.10.90&id=1901371647&tv=-1&lv=-1&kv=-1&yv=-1',
      { headers: { 'User-Agent': UA, Referer: 'https://music.163.com/' } })
    const j = await r.json()
    const d = j.data || j
    const lines = String(d.yrc.lyric).split('\n')
    // 找一句正文（“都”是孤勇者第一句）
    const idx = lines.findIndex((l) => l.includes('都'))
    console.log('正文行下标：' + idx)
    for (const l of lines.slice(Math.max(0, idx - 1), idx + 2)) {
      console.log('---')
      console.log(l)
    }
    /* 顺带看 tlyric 译文行结构 */
    if (d.tlyric && d.tlyric.lyric) {
      const tl = String(d.tlyric.lyric).split('\n')
      const ti = tl.findIndex((l) => l.includes('都'))
      console.log('\n[tlyric 对应行]')
      console.log(tl[ti] || tl[0])
    }
  } catch (e) { console.log('失败：' + e.message.slice(0, 120)) }

  /* ---- QQ：musicu.fcg req_1 变体 ---- */
  console.log('\n══════════ QQ musicu.fcg req_1 变体 ══════════')
  try {
    const list = await sources.search({ platform: 'qq', keyword: '周杰伦 稻香', limit: 1 })
    const mid = list[0].mid
    for (const [name, data] of [
      ['req_1+ct11', {
        comm: { ct: 11, cv: '4747474', v: '1', tmeAppID: 'qqmusic', uin: '0', format: 'json', platform: 'yqq.json' },
        req_1: {
          method: 'GetLyric',
          module: 'music.musichallSong.LyricServer',
          param: { songmid: mid, g_tk: 5381 }
        }
      }],
      ['req_1+ct9', {
        comm: { ct: 9, cv: '4747474', uin: '0', format: 'json', platform: 'yqq.json' },
        req_1: {
          method: 'GetLyric',
          module: 'music.musichallSong.LyricServer',
          param: { songmid: mid, g_tk: 5381 }
        }
      }]
    ]) {
      const r = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(JSON.stringify(data)), {
        headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/portal/player.html' }
      })
      const txt = await r.text()
      console.log(`\n[${name}] HTTP ${r.status} 前 400 字：`)
      console.log(txt.slice(0, 400))
    }
  } catch (e) { console.log('失败：' + e.message.slice(0, 120)) }
}
main()
