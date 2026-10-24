'use strict'
/**
 * 逐字歌词接口探测 第三轮（一次性工具）
 *   node tools/probe-lyric3.cjs
 * 修正：
 *   - 网易云逐字字段是 klyric（不是 yrc），且要换有逐字的原曲
 *   - QQ 换多首热门歌，排除"单首歌没逐字"的干扰
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

const QRC_HEAD = /^\[\d+,\d+\]/
const WORD_TAG = /\(\d+,\d+[,)]/

function verdict (raw) {
  const t = (raw || '').trim()
  const line = t.split('\n').find((l) => QRC_HEAD.test(l.trim())) || ''
  return {
    isQrc: QRC_HEAD.test(t) || (!!line && WORD_TAG.test(line)),
    sample: line.slice(0, 200)
  }
}

async function jget (url, referer) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer || '' } })
  return r.text()
}

async function probeQQ () {
  console.log('══════════ QQ QRC（多首歌） ══════════')
  const kwList = ['周杰伦 稻香', '陈奕迅 孤勇者', '买辣椒也用券 起风了', '周杰伦 夜曲', '周杰伦 青花瓷']
  let qrcCount = 0
  let lrcCount = 0
  for (const kw of kwList) {
    try {
      const list = await sources.search({ platform: 'qq', keyword: kw, limit: 2 })
      const s = list[0]
      const url =
        'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg' +
        `?_=${Date.now()}&cv=4747474&ct=9&format=json&inCharset=utf-8&outCharset=utf-8` +
        `&notice=0&platform=yqq.json&needNewCode=1&uin=0&g_tk=5381&songmid=${s.mid}`
      const j = JSON.parse(await jget(url, 'https://y.qq.com/portal/player.html'))
      const v = verdict(j.lyric)
      if (v.isQrc) qrcCount++; else lrcCount++
      console.log(`  ${s.name} — ${s.artist}（${kw}） QRC=${v.isQrc}`)
      if (v.sample) console.log('    ' + v.sample)
      else console.log('    LRC 首行：' + String(j.lyric || '').split('\n').find((l) => /^\[\d/.test(l)) || '(空)')
    } catch (e) { console.log(`  ${kw} 失败：` + e.message.slice(0, 100)) }
  }
  console.log(`  汇总：QRC ${qrcCount} 首 / 普通 LRC ${lrcCount} 首`)
}

async function probeNetease () {
  console.log('\n══════════ 网易云 klyric（原曲） ══════════')
  const kwList = ['稻香 周杰伦', '孤勇者 陈奕迅', '起风了 买辣椒也用券']
  let klyricCount = 0
  for (const kw of kwList) {
    try {
      const list = await sources.search({ platform: 'netease', keyword: kw, limit: 10 })
      const s = list.find((x) => x.name.replace(/\s*\(.*\)$/, '') === kw.split(' ')[0] &&
        x.artist.includes(kw.split(' ')[1])) || list[0]
      const url =
        `https://music.163.com/api/song/lyric/v1?os=pc&appver=8.10.90&id=${s.id}` +
        '&tv=-1&lv=-1&kv=-1&yv=-1'
      const j = JSON.parse(await jget(url, 'https://music.163.com/'))
      const d = j.data || j
      const fields = []
      for (const k of ['lrc', 'klyric', 'tlyric', 'romaLrc', 'yrc']) {
        if (d[k] && d[k].lyric) fields.push(k)
      }
      const v = verdict(d.klyric && d.klyric.lyric)
      if (v.isQrc) klyricCount++
      console.log(`  ${s.name} — ${s.artist}（id=${s.id}） 有字段=[${fields.join(',')}] 逐字判定=${v.isQrc}`)
      if (v.sample) console.log('    klyric 样本行：' + v.sample)
      if (d.tlyric && d.tlyric.lyric) console.log('    tlyric 首行：' + String(d.tlyric.lyric).split('\n')[0])
    } catch (e) { console.log(`  ${kw} 失败：` + e.message.slice(0, 100)) }
  }
  console.log(`  汇总：klyric 逐字 ${klyricCount} 首`)
}

async function main () {
  try { await probeQQ() } catch (e) { console.log('QQ 探测失败：' + e.message) }
  try { await probeNetease() } catch (e) { console.log('网易云探测失败：' + e.message) }
}
main()
