'use strict'
/**
 * qq.cjs — QQ音乐音源
 * 搜索/歌词走 c.y.qq.com 公开接口，播放地址走 u.y.qq.com 的 vkey 接口
 */
const { request } = require('./request.cjs')
const store = require('../store.cjs')
const cu = require('./cookie-utils.cjs')

const PLATFORM = 'qq'
const YQQ = 'https://y.qq.com/'
const GUID = '10000'

/* ══════════ 工具 ══════════ */
function decodeEntities (s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function coverOf (albumMid) {
  return albumMid
    ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg`
    : ''
}

function mapSong (s) {
  // 兼容老接口（songmid/songname/singer）与 new_json（mid/name/singer）两种风格
  const mid = s.mid || s.songmid || s.media_mid || ''
  const singers = s.singer || s.singers || []
  const artist = singers.length
    ? singers.map((a) => a.name).join(' / ')
    : (s.singername || '')
  const albumMid = (s.album && s.album.mid) || s.albummid || ''
  const albumName = (s.album && s.album.name) || s.albumname || ''
  return {
    key: `${PLATFORM}:${mid}`,
    platform: PLATFORM,
    id: mid,
    mid,
    songId: s.id || s.songid,
    name: s.name || s.songname || s.title || '',
    artist,
    album: albumName,
    cover: coverOf(albumMid),
    duration: (s.interval || 0) * 1000,
    // 老接口的付费标志是 pay.payplay（不是 pay_play）
    vip: (s.pay && s.pay.payplay === 1) || s.privilege === 10
  }
}

/* ══════════ 接口 ══════════ */

async function search ({ keyword, limit = 30, page = 1 }) {
  // 实测：musicu.fcg 的 SearchCgiService 会返回空列表（反爬），
  //       client_search_cp 已 500，只有 search_for_qq_cp 仍可用。
  const url =
    'https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp' +
    `?w=${encodeURIComponent(keyword)}&format=json&p=${page}&n=${limit}` +
    '&catZhida=1&remoteplace=txt.yqq.top&t=0&aggr=1&cr=1&zorro=0&lossless=0&flag_qc=0'
  const r = await request(url, {
    platform: PLATFORM,
    referer: YQQ,
    headers: { Cookie: 'uin=0' }
  })
  const list = (r.data && r.data.song && r.data.song.list) || []
  return list.map(mapSong)
}

async function songDetail ({ mid }) {
  const body = {
    comm: { ct: 24, cv: 0, format: 'json' },
    songinfo: {
      module: 'music.pf_song_detail_svr',
      method: 'get_song_detail_yqq',
      param: { song_mid: mid, song_type: 0 }
    }
  }
  const r = await request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    platform: PLATFORM,
    referer: YQQ
  })
  const t = r.songinfo && r.songinfo.data && r.songinfo.data.track_info
  if (!t) throw new Error('未找到该歌曲')
  return mapSong(t)
}

async function songUrl ({ mid }) {
  // vkey 接口的 uin 必须和 Cookie 里的登录态一致，否则一律按游客算（只有试听）
  const ck = cu.parseCookieString((store.get('cookies') || {})[PLATFORM] || '')
  const uin = cu.qqCookieUin(ck) || '0'
  const body = {
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        guid: GUID,
        songmid: [mid],
        songtype: [0],
        uin,
        loginflag: uin === '0' ? 0 : 1,
        platform: '20',
        // 实测必须带 filename，否则一律返回 104003
        filename: [`M500${mid}.mp3`]
      }
    },
    loginUin: uin,
    comm: { uin, format: 'json', ct: 24, cv: 0, platform: 'yqq.json' }
  }
  const r = await request('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    platform: PLATFORM,
    referer: YQQ
  })
  const d = r.req_0 && r.req_0.data
  const info = d && d.midurlinfo && d.midurlinfo[0]
  if (!info || !info.purl) {
    const why = (info && info.result !== undefined) ? `（错误码 ${info.result}）` : ''
    throw new Error(`该歌曲暂无可用音源${why}：VIP 专享 / 需购买 / 已下架`)
  }
  const sip = (d.sip && d.sip[0]) || 'https://ws.stream.qqmusic.qq.com/'
  return { url: sip + info.purl }
}

async function lyric ({ mid }) {
  const url =
    'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg' +
    `?songmid=${mid}&format=json&nobase64=1&g_tk=5381`
  const r = await request(url, {
    platform: PLATFORM,
    referer: 'https://y.qq.com/portal/player.html'
  })
  return {
    lyric: decodeEntities(r.lyric || ''),
    tlyric: decodeEntities(r.trans || '')
  }
}

/** QQ 音乐排行榜 */
const TOPS = [
  { id: '26', name: '热歌榜' },
  { id: '4', name: '新歌榜' },
  { id: '27', name: '欧美榜' },
  { id: '62', name: '飙升榜' },
  { id: '58', name: '内地榜' },
  { id: '5', name: '香港地区榜' },
  { id: '6', name: '台湾地区榜' },
  { id: '3', name: '日韩榜' }
]

async function toplists () {
  return TOPS.map((t) => ({
    id: t.id,
    platform: PLATFORM,
    name: t.name,
    cover: '',
    updateTime: 0
  }))
}

async function ranking ({ id = '26' }) {
  const url =
    'https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg' +
    `?topid=${id}&format=json&page=detail&tpl=3&song_begin=0&song_num=100`
  const r = await request(url, { platform: PLATFORM, referer: YQQ })
  const list = (r.songlist || []).map((x) => x.data).filter(Boolean)
  return {
    id: String(id),
    platform: PLATFORM,
    name: (TOPS.find((t) => t.id === String(id)) || {}).name || '排行榜',
    cover: '',
    songs: list.map(mapSong)
  }
}

async function playlist ({ id }) {
  const url =
    'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg' +
    `?type=1&json=1&utf8=1&onlysong=0&disstid=${id}&format=json&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8`
  const r = await request(url, { platform: PLATFORM, referer: YQQ })
  const cd = (r.cdlist && r.cdlist[0]) || {}
  return {
    id: String(id),
    platform: PLATFORM,
    name: cd.dissname || '歌单',
    cover: cd.logo || '',
    playCount: cd.visitnum,
    trackCount: cd.songnum,
    creator: (cd.nickname) || '',
    songs: (cd.songlist || []).map(mapSong)
  }
}

async function playlistCat () {
  const url =
    'https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg' +
    '?picmid=1&rnd=0.1&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8' +
    '&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&categoryId=10000000&sortId=5&sin=0&ein=29'
  const r = await request(url, { platform: PLATFORM, referer: YQQ })
  const list = (r.data && r.data.list) || []
  return list.map((p) => ({
    id: String(p.dissid),
    platform: PLATFORM,
    name: p.dissname,
    cover: p.imgurl,
    playCount: p.listennum,
    trackCount: p.song_count,
    creator: p.creator && p.creator.name
  }))
}

async function recommend () {
  return ranking({ id: '26' }).then((r) => r.songs)
}

async function userPlaylists () {
  const uin = cu.qqCookieUin(cu.parseCookieString((store.get('cookies') || {})[PLATFORM] || ''))
  if (!uin) throw new Error('请先登录 QQ音乐账号')
  const url =
    'https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss' +
    `?hostUin=0&hostuin=${uin}&sin=0&size=200&g_tk=5381&loginUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`
  const r = await request(url, { platform: PLATFORM, referer: YQQ })
  const list = (r.data && r.data.disslist) || []
  return list.map((p) => ({
    id: String(p.dissid),
    platform: PLATFORM,
    name: p.dissname,
    cover: p.imgurl,
    trackCount: p.song_cnt,
    creator: ''
  }))
}

/* ---------- 扫码登录（QQ 互联 ptlogin2） ---------- */
function hash33 (s) {
  let e = 0
  for (let i = 0; i < s.length; i++) e += (e << 5) + s.charCodeAt(i)
  return 2147483647 & e
}

async function loginQr () {
  const t = Date.now()
  const url =
    'https://ssl.ptlogin2.qq.com/ptqrshow' +
    `?appid=716027609&e=2&l=M&s=3&d=72&v=4&t=${t}&daid=383&pt_3rd_aid=100497308&u1=https%3A%2F%2Fgraph.qq.com%2Foauth2.0%2Flogin_jump`
  const res = await request(url, { platform: PLATFORM, raw: true, json: false })
  const buf = Buffer.from(await res.arrayBuffer())
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  let qrsig = ''
  for (const sc of setCookies) {
    const m = /qrsig=([^;]+)/.exec(sc)
    if (m) qrsig = m[1]
  }
  const token = qrsig ? String(hash33(qrsig)) : ''
  const jar = store.get('cookies') || {}
  jar[`${PLATFORM}_qr`] = `qrsig=${qrsig}`
  store.set('cookies', jar)
  return {
    platform: PLATFORM,
    key: token,
    // 直接把二维码图片以 dataURL 交给渲染层，省掉本地生成
    imageDataUrl: `data:image/png;base64,${buf.toString('base64')}`
  }
}

async function loginCheck ({ key }) {
  const jar = store.get('cookies') || {}
  const qrCookie = jar[`${PLATFORM}_qr`] || ''
  const url =
    'https://ssl.ptlogin2.qq.com/ptqrlogin' +
    `?u1=https%3A%2F%2Fgraph.qq.com%2Foauth2.0%2Flogin_jump&ptqrtoken=${key}` +
    `&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052&action=0-0-${Date.now()}` +
    '&js_ver=20102616&js_type=1&login_sig=&pt_uistyle=40&aid=716027609&daid=383&pt_3rd_aid=100497308&has_onekey=1'
  const res = await request(url, { platform: PLATFORM, raw: true, headers: { Cookie: qrCookie } })
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  const text = await res.text()
  const code = (/ptuiCB\('(\d+)'/.exec(text) || [])[1]
  // 0 登录成功 65 二维码失效 66 未扫描 67 已扫描待确认
  if (code === '0') {
    const j = store.get('cookies') || {}
    const old = (j[PLATFORM] || '') + '; ' + setCookies.map((c) => c.split(';')[0]).join('; ')
    j[PLATFORM] = old.replace(/^;\s*/, '')
    store.set('cookies', j)
    const m = /\((\d+),\s*'[^']*',\s*'[^']*',\s*'[^']*',\s*'([^']*)'/.exec(text)
    const uin = (new URL((/'(https?:\/\/[^']+)'/.exec(text) || [])[1] || 'https://x.cn'))
      .searchParams.get('uin') || ''
    const lg = store.get('login') || {}
    lg[PLATFORM] = { platform: PLATFORM, logged: true, uin, nickname: (m && m[2]) || 'QQ音乐用户' }
    store.set('login', lg)
    const info = await loginState()
    // ptlogin2 扫码经常只带回 uin，qm_keyst 这类播放票据要进了播放器页才会下发。
    // 检测不到播放票据就标 partial，前端引导用户改走官方窗口 / Cookie 导入补全。
    if (info.logged && !info.playbackKeyReady) {
      return {
        platform: PLATFORM,
        code: 0,
        logged: true,
        partial: true,
        message: 'QQ 账号已识别，但播放授权未生成，部分歌曲可能无法播放。请改用「官方页面登录」或导入完整 Cookie',
        profile: { ...lg[PLATFORM], playbackKeyReady: false }
      }
    }
    return { platform: PLATFORM, code: 0, logged: true, profile: info }
  }
  return { platform: PLATFORM, code: Number(code || -1), logged: false, message: text.slice(0, 120) }
}

/**
 * 手动导入 QQ Cookie（Mineradio 同款通道）。
 * 扫码拿不到播放票据时的正解：从已登录的 y.qq.com 会话整包导入。
 * 分级校验：
 *   - uin + 播放票据齐全  → 登录成功
 *   - 只有 uin 没有票据   → QQ_PLAYBACK_AUTH_INCOMPLETE（账号对得上，放不了歌）
 *   - 两者皆无            → INVALID_QQ_COOKIE
 */
async function loginCookie ({ cookie: raw } = {}) {
  const normalized = cu.normalizeQQCookieInput(raw) || cu.normalizeCookieHeader(raw) || cu.rawCookieFallback(raw)
  const obj = cu.parseCookieString(normalized)
  const uin = cu.qqCookieUin(obj)
  const playbackKey = cu.qqCookiePlaybackKey(obj)
  const hasWebSession = !!(uin && cu.qqCookieMusicKey(obj))
  if (!uin || !playbackKey) {
    const err = new Error(hasWebSession
      ? 'QQ 账号验证已完成，但播放授权未生成（缺 qm_keyst / qqmusic_key）—— 请在 QQ 音乐网页里进入任意播放器页面后，重新复制整包 Cookie'
      : 'QQ Cookie 缺少 uin 或有效的播放票据，请确认粘贴的是 y.qq.com 的登录态')
    err.code = hasWebSession ? 'QQ_PLAYBACK_AUTH_INCOMPLETE' : 'INVALID_QQ_COOKIE'
    throw err
  }
  const jar = store.get('cookies') || {}
  jar[PLATFORM] = normalized
  store.set('cookies', jar)
  return loginState()
}

/** 拉一次 QQ 个人主页资料（失败不影响登录态，走 cookie 兜底） */
async function fetchQQProfile (uin) {
  const u = new URL('https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg')
  u.searchParams.set('cid', '205360838')
  u.searchParams.set('userid', uin)
  u.searchParams.set('reqfrom', '1')
  u.searchParams.set('g_tk', '5381')
  u.searchParams.set('loginUin', uin)
  u.searchParams.set('hostUin', '0')
  u.searchParams.set('format', 'json')
  u.searchParams.set('inCharset', 'utf8')
  u.searchParams.set('outCharset', 'utf-8')
  u.searchParams.set('notice', '0')
  u.searchParams.set('platform', 'yqq.json')
  u.searchParams.set('needNewCode', '0')
  const text = await request(u.toString(), {
    platform: PLATFORM,
    referer: YQQ,
    json: false
  })
  let body = text
  if (typeof body === 'string') {
    try { body = JSON.parse(text) } catch (_) { return null }
  }
  return body || null
}

async function loginState () {
  const obj = cu.parseCookieString((store.get('cookies') || {})[PLATFORM] || '')
  const uin = cu.qqCookieUin(obj)
  const musicKey = cu.qqCookieMusicKey(obj)
  if (!uin || !musicKey) return { platform: PLATFORM, logged: false }
  const playbackKeyReady = !!cu.qqCookiePlaybackKey(obj)
  const base = {
    platform: PLATFORM,
    logged: true,
    uin,
    playbackKeyReady,
    nickname: cu.qqCookieNickname(obj, uin) || `QQ ${uin}`,
    avatar: cu.qqCookieAvatar(obj, uin),
    vipType: 0
  }
  // 资料接口失败 / 风控都不掉登录态：cookie 里的昵称头像已经够展示
  try {
    const body = await fetchQQProfile(uin)
    const creator = body && (body.creator || (body.data && body.data.creator))
    if (creator && (creator.nick || creator.nickname || creator.name)) {
      const info = {
        ...base,
        nickname: cu.decodeQQCookieValue(creator.nick || creator.nickname || creator.name),
        avatar: creator.headpic || creator.avatar || creator.avatarUrl || base.avatar
      }
      const lg = store.get('login') || {}
      lg[PLATFORM] = info
      store.set('login', lg)
      return info
    }
  } catch (_) {}
  const lg = store.get('login') || {}
  lg[PLATFORM] = base
  store.set('login', lg)
  return base
}

async function logout () {
  const j = store.get('cookies') || {}
  delete j[PLATFORM]
  delete j[`${PLATFORM}_qr`]
  store.set('cookies', j)
  const lg = store.get('login') || {}
  delete lg[PLATFORM]
  store.set('login', lg)
  return true
}

module.exports = {
  platform: PLATFORM,
  search, songDetail, songUrl, lyric, playlist, playlistCat,
  toplists, ranking, recommend, userPlaylists,
  loginQr, loginCheck, loginCookie, loginState, logout
}
