'use strict'
/**
 * 逐字歌词探测 第七轮（一次性工具）
 *   node tools/probe-lyric7.cjs
 * QQ 带用户真实 cookie 最后努力一次：fcg_query_lyric_new.fcg / musicu.fcg
 * 不行就定案：QQ 行级 LRC + 网易云 yrc 逐字
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
  exports: { app: { getPath: () => path.join(os.homedir(), 'AppData', 'Roaming', 'Quasar') } }
}

const sources = require(path.join(__dirname, '..', 'electron', 'sources', 'index.cjs'))
const store = require(path.join(__dirname, '..', 'electron', 'store.cjs'))

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

async function main () {
  const jar = store.get('cookies') || {}
  const qqCookie = jar.qq || ''
  console.log('QQ cookie 长度：' + qqCookie.length + (qqCookie ? '（已登录）' : '（未登录，空）'))

  const list = await sources.search({ platform: 'qq', keyword: '周杰伦 稻香', limit: 1 })
  const mid = list[0].mid
  console.log('样本：' + list[0].name + ' mid=' + mid)

  /* 1. fcg_query_lyric_new.fcg 带 cookie */
  try {
    const url =
      'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg' +
      `?_=${Date.now()}&cv=4747474&ct=9&format=json&inCharset=utf-8&outCharset=utf-8` +
      `&notice=0&platform=yqq.json&needNewCode=1&g_tk=5381&songmid=${mid}`
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Referer: 'https://y.qq.com/portal/player.html',
        Cookie: qqCookie
      }
    })
    const j = JSON.parse(await r.text())
    const raw = String(j.lyric || '')
    const line = raw.split('\n').find((l) => /^\[\d+,\d+\]/.test(l.trim()))
    console.log('\n[fcg+cookie] keys=' + Object.keys(j).join(',') +
      ' QRC=' + (!!line && /\(\d+,\d+/.test(line)))
    console.log('  正文首行：' + (raw.split('\n').find((l) => /^\[\d/.test(l)) || '(空)').slice(0, 120))
    if (line) console.log('  QRC 行：' + line.slice(0, 160))
  } catch (e) { console.log('[fcg+cookie] 失败：' + e.message.slice(0, 100)) }

  /* 2. musicu.fcg 带 cookie + uin */
  try {
    const uin = (qqCookie.match(/uin=o?(\d+)/) || [])[1] || '0'
    const data = {
      comm: { ct: 11, cv: '4747474', uin: uin === '0' ? '0' : 'o' + uin, format: 'json', platform: 'yqq.json' },
      req_1: {
        method: 'GetLyric',
        module: 'music.musichallSong.LyricServer',
        param: { songmid: mid, g_tk: 5381 }
      }
    }
    const r = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(JSON.stringify(data)), {
      headers: {
        'User-Agent': UA,
        Referer: 'https://y.qq.com/portal/player.html',
        Cookie: qqCookie
      }
    })
    const txt = await r.text()
    console.log('\n[musicu+cookie] uin=' + uin + ' 前 400 字：')
    console.log(txt.slice(0, 400))
  } catch (e) { console.log('[musicu+cookie] 失败：' + e.message.slice(0, 100)) }
}
main()
