'use strict'
/** 诊断：网易云 web 搜索接口里 album 对象到底有哪些字段（排查封面取不到） */
const https = require('node:https')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const key = process.argv[2] || '全息恋人'
const url =
  `https://music.163.com/api/search/get/web?s=${encodeURIComponent(key)}` +
  '&type=1&offset=0&limit=3&total=true'

https.get(url, { headers: { 'User-Agent': UA, Referer: 'https://music.163.com/' } }, (res) => {
  let buf = ''
  res.setEncoding('utf8')
  res.on('data', (d) => { buf += d })
  res.on('end', () => {
    try {
      const j = JSON.parse(buf)
      const songs = (j.result && j.result.songs) || []
      console.log('HTTP', res.statusCode, 'songs=', songs.length)
      const s = songs[0]
      if (!s) { console.log(buf.slice(0, 500)); return }
      console.log('song keys :', Object.keys(s).join(','))
      console.log('album 对象:', JSON.stringify(s.album))
      console.log('album keys:', Object.keys(s.album || {}).join(','))
    } catch (e) {
      console.log('解析失败:', e.message)
      console.log(buf.slice(0, 400))
    }
  })
}).on('error', (e) => console.log('请求失败:', e.message))
