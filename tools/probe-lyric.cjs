'use strict'
/**
 * 逐字歌词接口探测（一次性工具）
 *   node tools/probe-lyric.cjs
 * 目的：确认 QQ 的 QRC 和网易云的 YRC 逐字歌词分别怎么拿，
 * 为 v1.2.0 全屏歌词舞台准备数据层。
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
  id: FAKE,
  filename: FAKE,
  loaded: true,
  exports: { app: { getPath: () => path.join(os.tmpdir(), 'quasar-test') } }
}

const sources = require(path.join(__dirname, '..', 'electron', 'sources', 'index.cjs'))

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

async function jget (url, referer) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer || '' } })
  return r.text()
}

async function main () {
  /* ---- QQ：确认 lyric 字段就是 QRC ---- */
  console.log('══════════ QQ 逐字歌词 ══════════')
  try {
    const list = await sources.search({ platform: 'qq', keyword: '周杰伦 稻香', limit: 3 })
    const s = list[0]
    console.log('样本：' + s.name + ' — ' + s.artist + ' mid=' + s.mid)
    const r = await sources.lyric({ platform: 'qq', mid: s.mid })
    const raw = r.lyric || ''
    console.log('lyric 前 300 字：')
    console.log(raw.slice(0, 300))
    console.log('tlyric 前 120 字：' + (r.tlyric || '').slice(0, 120))
    console.log('QRC 判定（行头 [ms,ms] 且含 (ms,ms) 词 tag）：',
      /^\[\d+,\d+\]/.test(raw.trim()) && /\(\d+,\d+\)/.test(raw))
  } catch (e) { console.log('QQ 探测失败：' + e.message) }

  /* ---- 网易云：试几个逐字接口 ---- */
  console.log('\n══════════ 网易云 逐字歌词 ══════════')
  try {
    const list = await sources.search({ platform: 'netease', keyword: '周杰伦 稻香', limit: 3 })
    const s = list[0]
    console.log('样本：' + s.name + ' — ' + s.artist + ' id=' + s.id)
    const r = await sources.lyric({ platform: 'netease', id: s.id })
    console.log('现有 lyric(lrc) 前 120 字：' + (r.lyric || '').slice(0, 120))
    console.log('返回字段：' + Object.keys(r).join(','))

    // 候选 1：官方 web  lyric 接口（不加密）
    for (const [name, url] of [
      ['lyric/v1', `https://music.163.com/api/song/lyric/v1?os=pc&appver=8.10.90&id=${s.id}&tv=-1&lv=-1&kv=-1&yv=-1`],
      ['lyric/new', `https://music.163.com/api/song/lyric/new?id=${s.id}`]
    ]) {
      try {
        const txt = await jget(url, 'https://music.163.com/')
        const j = JSON.parse(txt)
        const d = j.data || j
        console.log(`\n[${name}] 字段：` + Object.keys(d).join(','))
        if (d.yrc && d.yrc.lyric) {
          console.log(`[${name}] yrc 前 300 字：`)
          console.log(String(d.yrc.lyric).slice(0, 300))
        }
      } catch (e) { console.log(`[${name}] 失败：` + e.message.slice(0, 80)) }
    }
  } catch (e) { console.log('网易云探测失败：' + e.message) }
}

main()
