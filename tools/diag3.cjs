'use strict'
/** 第三轮诊断：酷狗完整字段 + trackercdn 播放 + QQ vkey 参数变体 */
const path = require('node:path')
const os = require('node:os')
const Module = require('node:module')
const crypto = require('node:crypto')

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
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex')

async function kgSearchRaw () {
  console.log('══════ 酷狗 songsearch 完整字段 ══════')
  const url = 'https://songsearch.kugou.com/song_search_v2' +
    `?keyword=${encodeURIComponent('周杰伦 晴天')}&page=1&pagesize=2` +
    '&platform=WebFilter&tag=em&filter=2&iscorrection=1&privilege_filter=0'
  const r = await request(url, { referer: 'https://www.kugou.com/' })
  const one = (r.data && r.data.lists && r.data.lists[0]) || {}
  console.log('字段列表:', Object.keys(one).join(', '))
  console.log(JSON.stringify(one).slice(0, 1200))
  console.log('')
  return one
}

async function kgPlay (hash, albumId) {
  console.log('══════ 酷狗 trackercdn 播放 ══════')
  const key = md5(hash + 'kgcloudv2')
  const mid = md5('mid' + Math.random())
  const dfid = md5('dfid' + Math.random())
  const cookie = `kg_mid=${mid}; kg_dfid=${dfid}; kg_dfid_collect=${dfid}`
  const url = `https://trackercdn.kugou.com/i/v2/?key=${key}&hash=${hash}&br=hq&appid=1005&pid=2&cmd=25&behavior=play&album_id=${albumId || ''}`
  try {
    const r = await request(url, { referer: 'https://www.kugou.com/', headers: { Cookie: cookie } })
    console.log(JSON.stringify(r).slice(0, 700))
  } catch (e) { console.log('ERR', e.message) }
  console.log('')

  console.log('══════ 酷狗 wwwapi play/getdata ══════')
  const u2 = 'https://wwwapi.kugou.com/yy/index.php?r=play/getdata' +
    `&hash=${hash}&album_id=${albumId || ''}&dfid=${dfid}&mid=${mid}&platid=4&_=${Date.now()}`
  try {
    const r2 = await request(u2, { referer: 'https://www.kugou.com/', headers: { Cookie: cookie } })
    console.log(JSON.stringify(r2).slice(0, 900))
  } catch (e) { console.log('ERR', e.message) }
  console.log('')

  console.log('══════ 酷狗 m3ws/getSongInfo ══════')
  const u3 = `https://m3ws.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${hash}`
  try {
    const r3 = await request(u3, { referer: 'https://m.kugou.com/' })
    console.log(JSON.stringify(r3).slice(0, 700))
  } catch (e) { console.log('ERR', e.message) }
  console.log('')
}

async function qqVkey (mid) {
  const variants = [
    { label: 'base', param: { guid: '10000', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20' } },
    { label: 'with filename', param: { guid: '10000', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20', filename: [`M500${mid}.mp3`] } },
    { label: 'filename C400', param: { guid: '10000', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20', filename: [`C400${mid}.m4a`] } },
    { label: 'platform yqq', param: { guid: '10000', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: 'yqq.json', filename: [`M500${mid}.mp3`] } }
  ]
  console.log('══════ QQ vkey 参数变体 ══════')
  console.log('songmid =', mid)
  for (const v of variants) {
    const body = {
      req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: v.param },
      loginUin: '0',
      comm: { uin: '0', format: 'json', ct: 24, cv: 0, platform: 'yqq.json' }
    }
    try {
      const r = await request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', Cookie: 'uin=0' },
        referer: 'https://y.qq.com/'
      })
      const info = r.req_0 && r.req_0.data && r.req_0.data.midurlinfo && r.req_0.data.midurlinfo[0]
      const sip = r.req_0 && r.req_0.data && r.req_0.data.sip
      console.log(`  [${v.label}] result=${info && info.result} purl=${(info && info.purl) ? info.purl.slice(0, 60) : '(空)'} errType=${info && info.errtype} sip0=${sip && sip[0]}`)
    } catch (e) {
      console.log(`  [${v.label}] ERR ${e.message}`)
    }
  }
  console.log('')
}

async function main () {
  const one = await kgSearchRaw()
  const hash = one.FileHash || one.HQFileHash
  const albumId = one.AlbumID
  if (hash) await kgPlay(hash, albumId)

  // 取一个 QQ 歌曲 mid
  const r = await request(
    `https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?w=${encodeURIComponent('周杰伦 晴天')}&format=json&p=1&n=3&catZhida=1&remoteplace=txt.yqq.top&t=0&aggr=1&cr=1&zorro=0&lossless=0&flag_qc=0`,
    { referer: 'https://y.qq.com/', headers: { Cookie: 'uin=0' } }
  )
  const song = r.data.song.list[0]
  console.log('QQ 首条:', song.songname, 'songmid=', song.songmid, 'media_mid=', song.media_mid, 'strMediaMid=', song.strMediaMid, '\n')
  await qqVkey(song.songmid)
}

main().catch((e) => { console.error(e); process.exit(1) })
