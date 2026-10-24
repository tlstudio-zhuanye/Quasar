'use strict'
/**
 * netease.cjs — 网易云音乐音源
 * 使用 weapi（AES-128-CBC 双层 + RSA）加密方式调用官方 Web 接口
 */
const crypto = require('node:crypto')
const { request } = require('./request.cjs')
const store = require('../store.cjs')
const cu = require('./cookie-utils.cjs')

const PLATFORM = 'netease'
const BASE = 'https://music.163.com'

/* ══════════ weapi 加密 ══════════ */
const PRESET_KEY = '0CoJUm6Qyw8W8jud'
const IV = '0102030405060708'
const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const PUB_KEY = '010001'
const MODULUS =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec' +
  '4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d8' +
  '13cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7'

function aesEncrypt (text, key) {
  const c = crypto.createCipheriv('aes-128-cbc', key, IV)
  return c.update(text, 'utf8', 'base64') + c.final('base64')
}

function modPow (base, exp, mod) {
  let r = 1n
  base %= mod
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod
    exp >>= 1n
    base = (base * base) % mod
  }
  return r
}

function rsaEncrypt (text) {
  const reversed = text.split('').reverse().join('')
  const hex = Buffer.from(reversed, 'utf8').toString('hex')
  const enc = modPow(BigInt('0x' + hex), BigInt('0x' + PUB_KEY), BigInt('0x' + MODULUS))
  return enc.toString(16).padStart(256, '0')
}

function randomKey () {
  let s = ''
  for (let i = 0; i < 16; i++) s += BASE62[Math.floor(Math.random() * BASE62.length)]
  return s
}

/** 生成 weapi 请求体 */
function weapi (obj) {
  const sk = randomKey()
  return {
    params: aesEncrypt(aesEncrypt(JSON.stringify(obj), PRESET_KEY), sk),
    encSecKey: rsaEncrypt(sk)
  }
}

async function weapiPost (path, obj, extra = {}) {
  const body = weapi(obj)
  return request(`${BASE}/weapi${path}?csrf_token=`, {
    method: 'POST',
    body: { ...body, csrf_token: '' },
    platform: PLATFORM,
    ...extra
  })
}

/* ══════════ Cookie ══════════ */
function cookie () {
  const jar = store.get('cookies') || {}
  return jar[PLATFORM] || ''
}

function saveCookie (str) {
  const jar = store.get('cookies') || {}
  jar[PLATFORM] = str
  store.set('cookies', jar)
}

/* ══════════ 统一歌曲结构 ══════════ */
function mapTrack (t) {
  const ar = t.ar || t.artists || []
  const al = t.al || t.album || {}
  return {
    key: `${PLATFORM}:${t.id}`,
    platform: PLATFORM,
    id: String(t.id),
    name: t.name,
    artist: ar.map((a) => a.name).join(' / '),
    album: al.name || '',
    cover: al.picUrl || '',
    duration: t.dt || t.duration || 0,
    vip: t.fee === 1 || t.fee === 4
  }
}

/* ══════════ 接口 ══════════ */

async function search ({ keyword, limit = 30, offset = 0 }) {
  // /api/search/get/web 实测比 weapi 版稳定，且无需登录
  const url =
    `${BASE}/api/search/get/web?s=${encodeURIComponent(keyword)}` +
    `&type=1&offset=${offset}&limit=${limit}&total=true`
  const r = await request(url, { platform: PLATFORM, referer: BASE + '/' })
  const songs = (r.result && r.result.songs) || []
  return songs.map((s) => {
    const al = s.album || s.al || {}
    return {
      key: `${PLATFORM}:${s.id}`,
      platform: PLATFORM,
      id: String(s.id),
      name: s.name,
      artist: (s.artists || s.ar || []).map((a) => a.name).join(' / '),
      album: al.name || '',
      cover: al.picUrl || al.picUrl_str || '',
      duration: s.duration || s.dt || 0,
      vip: s.fee === 1 || s.fee === 4
    }
  })
}

async function songDetail ({ id }) {
  const r = await weapiPost('/v3/song/detail', { c: JSON.stringify([{ id: String(id) }]) })
  const t = r.songs && r.songs[0]
  if (!t) throw new Error('未找到该歌曲')
  return mapTrack(t)
}

async function songUrl ({ id, level = 'exhigh' }) {
  const r = await weapiPost('/song/enhance/player/url/v1', {
    ids: JSON.stringify([String(id)]),
    level,
    encodeType: 'flac'
  })
  const d = r.data && r.data[0]
  if (!d || !d.url) throw new Error('该歌曲暂无可用音源（VIP 专享 / 已下架 / 需登录）')
  return { url: d.url, br: d.br, size: d.size, type: d.type, level: d.level }
}

/**
 * 歌词：优先走 lyric/v1（官方 web 接口，返回 JSON-LRC + yrc 逐字），
 * 失败回退 weapi /song/lyric（纯文本 LRC）。
 * 返回的是原始文本，统一由渲染层 src/utils/lyrics.js 解析：
 *   lyric  = JSON-LRC 原文   {"t":ms,"c":[{"tx":"文"}]}
 *   tlyric = JSON-LRC 译文
 *   yrc    = YRC 逐字（混合：制作名单 JSON-LRC + 正文 [起,时](词起,词时,0)文）
 */
async function lyric ({ id }) {
  try {
    const r = await request(
      `${BASE}/api/song/lyric/v1?os=pc&appver=8.10.90&id=${encodeURIComponent(String(id))}` +
      '&tv=-1&lv=-1&kv=-1&yv=-1',
      { platform: PLATFORM, referer: `${BASE}/` }
    )
    const d = (r && (r.data || r)) || {}
    if (d.lrc || d.yrc) {
      return {
        lyric: (d.lrc && d.lrc.lyric) || '',
        tlyric: (d.tlyric && d.tlyric.lyric) || '',
        yrc: (d.yrc && d.yrc.lyric) || ''
      }
    }
  } catch (_) { /* 落到回退 */ }

  const r2 = await weapiPost('/song/lyric', { id: String(id), lv: -1, kv: -1, tv: -1 })
  return {
    lyric: (r2.lrc && r2.lrc.lyric) || '',
    tlyric: (r2.tlyric && r2.tlyric.lyric) || '',
    yrc: ''
  }
}

async function playlist ({ id }) {
  const r = await weapiPost('/v6/playlist/detail', { id: String(id), n: 1000 })
  const p = r.playlist || {}
  return {
    id: String(p.id),
    platform: PLATFORM,
    name: p.name,
    cover: p.coverImgUrl,
    playCount: p.playCount,
    trackCount: p.trackCount,
    creator: (p.creator && p.creator.nickname) || '',
    songs: (p.tracks || []).map(mapTrack)
  }
}

async function playlistCat ({ cat = '全部', limit = 30, offset = 0 }) {
  const r = await weapiPost('/top/playlist', { cat, limit, offset, order: 'hot' })
  return (r.playlists || []).map((p) => ({
    id: String(p.id),
    platform: PLATFORM,
    name: p.name,
    cover: p.coverImgUrl,
    playCount: p.playCount,
    trackCount: p.trackCount,
    creator: (p.creator && p.creator.nickname) || ''
  }))
}

async function toplists () {
  const r = await weapiPost('/toplist', {})
  return (r.list || []).map((t) => ({
    id: String(t.id),
    platform: PLATFORM,
    name: t.name,
    cover: t.coverImgUrl,
    updateTime: t.updateTime
  }))
}

async function ranking ({ id }) {
  return playlist({ id })
}

async function recommend () {
  const r = await weapiPost('/v1/discovery/recommend/songs', {})
  const list = (r.data && r.data.dailySongs) || []
  return list.map(mapTrack)
}

async function userPlaylists () {
  const lg = (store.get('login') || {})[PLATFORM]
  if (!lg || !lg.userId) throw new Error('请先登录网易云账号')
  const r = await weapiPost('/user/playlist', { uid: String(lg.userId), limit: 1000, offset: 0 })
  return (r.playlist || []).map((p) => ({
    id: String(p.id),
    platform: PLATFORM,
    name: p.name,
    cover: p.coverImgUrl,
    trackCount: p.trackCount,
    creator: (p.creator && p.creator.nickname) || ''
  }))
}

/* ---------- 扫码登录 ---------- */
async function loginQr () {
  const r = await weapiPost('/login/qrcode/unikey', { type: 1 })
  if (!r.unikey) throw new Error('获取二维码失败：' + JSON.stringify(r))
  return {
    platform: PLATFORM,
    key: r.unikey,
    // 渲染层用这个内容本地生成二维码
    content: `https://music.163.com/login?codekey=${r.unikey}`
  }
}

/** 轮询一次扫码状态。noCookie=true 时接口风控更松，但 803 可能不下发 Set-Cookie */
async function checkQrOnce (key, noCookie) {
  const body = weapi({ key, type: 1, noCookie })
  const res = await request(`${BASE}/weapi/login/qrcode/client/login?csrf_token=`, {
    method: 'POST',
    body: { ...body, csrf_token: '' },
    platform: PLATFORM,
    raw: true
  })
  let setCookies = []
  try {
    setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  } catch (_) {}
  const data = await res.json()
  return { data, setCookies }
}

async function loginCheck ({ key }) {
  // 800 过期 / 801 待扫描 / 802 待确认 / 803 成功
  let { data, setCookies } = await checkQrOnce(key, true)
  // 803 却没抓到 Cookie：不带 noCookie 再要一次（Mineradio 同款兜底，
  // 实测偶发 803 的响应头里没有 Set-Cookie，不补这一枪就白扫了）
  if (data.code === 803 && !setCookies.length) {
    try {
      const retry = await checkQrOnce(key, false)
      if (retry.setCookies.length) {
        data = retry.data
        setCookies = retry.setCookies
      }
    } catch (_) {}
  }
  if (data.code === 803 && setCookies.length) {
    const jar = store.get('cookies') || {}
    jar[PLATFORM] = cu.mergeCookie(jar[PLATFORM], setCookies)
    store.set('cookies', jar)
    const info = await loginState()
    // 资料接口偶尔滞后，先给乐观态让 UI 登进去，下一次刷新会补上资料
    if (!info.logged) {
      return {
        code: 803,
        logged: true,
        pendingProfile: true,
        profile: { platform: PLATFORM, logged: true, pendingProfile: true, nickname: data.nickname || '网易云用户', avatar: data.avatarUrl || '' }
      }
    }
    return { code: 803, logged: true, profile: info }
  }
  if (data.code === 803) {
    return { code: 803, logged: false, message: '扫码已确认，但没有拿到登录凭证，请刷新二维码重试' }
  }
  return { code: data.code, logged: false, message: data.message }
}

/**
 * 手动导入 Cookie（扫码不好使时的兜底通道）。
 * 校验 MUSIC_U 非空，保存后立即拉一次资料；资料拉不到也给乐观态。
 */
async function loginCookie ({ cookie: raw } = {}) {
  const normalized = cu.normalizeCookieHeader(raw) || cu.rawCookieFallback(raw)
  const obj = cu.parseCookieString(normalized)
  if (!obj.MUSIC_U) {
    throw new Error('网易云 Cookie 缺少 MUSIC_U —— 请确认粘贴的是 music.163.com 的登录态')
  }
  saveCookie(normalized)
  const info = await loginState()
  if (!info.logged) {
    return { platform: PLATFORM, logged: true, pendingProfile: true, nickname: '网易云用户', avatar: '', vipType: 0 }
  }
  return info
}

async function loginState () {
  if (!cu.parseCookieString(cookie()).MUSIC_U) return { platform: PLATFORM, logged: false }
  try {
    const r = await weapiPost('/w/nuser/account/get', {})
    if (r.profile) {
      const info = {
        platform: PLATFORM,
        logged: true,
        userId: r.profile.userId,
        nickname: r.profile.nickname,
        avatar: r.profile.avatarUrl,
        vipType: r.profile.vipType
      }
      const lg = store.get('login') || {}
      lg[PLATFORM] = info
      store.set('login', lg)
      return info
    }
  } catch (_) {}
  // Cookie 还有效但资料接口没返回 profile（接口抖动 / 风控）：
  // 保持乐观登录态，别让用户明明登上了却显示未登录
  return { platform: PLATFORM, logged: true, pendingProfile: true, nickname: '网易云用户', avatar: '', vipType: 0 }
}

async function logout () {
  try { await weapiPost('/logout', {}) } catch (_) {}
  saveCookie('')
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
