'use strict'
/** 第四轮：用免费曲目验证 QQ / 酷狗的播放链路是否真的可用 */
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

const KW = process.argv[2] || '纯音乐'

async function testKugou () {
  console.log(`══════ 酷狗 播放链路（关键词：${KW}） ══════`)
  const r = await request(
    'https://songsearch.kugou.com/song_search_v2' +
    `?keyword=${encodeURIComponent(KW)}&page=1&pagesize=10` +
    '&platform=WebFilter&tag=em&filter=2&iscorrection=1&privilege_filter=0',
    { referer: 'https://www.kugou.com/' })
  const list = (r.data && r.data.lists) || []
  console.log(`搜索 ${list.length} 条`)
  for (const s of list.slice(0, 6)) {
    console.log(`  ${s.SongName?.replace(/<\/?em>/g, '')} — ${s.SingerName?.replace(/<\/?em>/g, '')}  Priv=${s.Privilege}/${s.HQPrivilege} hash=${String(s.FileHash).slice(0, 10)}`)
  }
  // 逐个试播
  for (const s of list.slice(0, 5)) {
    const hash = s.FileHash
    try {
      const g = await request(`https://m3ws.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${hash}`,
        { referer: 'https://m.kugou.com/' })
      console.log(`  → ${s.SongName?.replace(/<\/?em>/g, '')}: url=${g.url ? g.url.slice(0, 70) : '(空)'} errcode=${g.errcode} extName=${g.extName} bitRate=${g.bitRate}`)
    } catch (e) {
      console.log(`  → ${s.SongName?.replace(/<\/?em>/g, '')}: ERR ${e.message}`)
    }
  }
  console.log('')
}

async function testQQ () {
  console.log(`══════ QQ 播放链路（关键词：${KW}） ══════`)
  const r = await request(
    `https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?w=${encodeURIComponent(KW)}&format=json&p=1&n=10&catZhida=1&remoteplace=txt.yqq.top&t=0&aggr=1&cr=1&zorro=0&lossless=0&flag_qc=0`,
    { referer: 'https://y.qq.com/', headers: { Cookie: 'uin=0' } })
  const list = (r.data && r.data.song && r.data.song.list) || []
  console.log(`搜索 ${list.length} 条`)
  for (const s of list.slice(0, 8)) {
    console.log(`  ${s.songname} — ${(s.singer || []).map((a) => a.name).join('/')}  mid=${s.songmid} pay=${JSON.stringify(s.pay || {})}`)
  }
  for (const s of list.slice(0, 5)) {
    const body = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: { guid: '10000', songmid: [s.songmid], songtype: [0], uin: '0', loginflag: 1, platform: '20', filename: [`M500${s.songmid}.mp3`] }
      },
      loginUin: '0',
      comm: { uin: '0', format: 'json', ct: 24, cv: 0, platform: 'yqq.json' }
    }
    try {
      const v = await request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', Cookie: 'uin=0' },
        referer: 'https://y.qq.com/'
      })
      const info = v.req_0?.data?.midurlinfo?.[0]
      console.log(`  → ${s.songname}: result=${info?.result} purl=${info?.purl ? info.purl.slice(0, 60) : '(空)'}`)
    } catch (e) {
      console.log(`  → ${s.songname}: ERR ${e.message}`)
    }
  }
  console.log('')
}

async function main () {
  await testKugou()
  await testQQ()
}

main().catch((e) => { console.error(e); process.exit(1) })
