'use strict'
/**
 * sources/index.cjs — 音源调度
 * 按 payload.platform 分发到对应平台模块，对外暴露统一方法名。
 * 平台范围：网易云 + QQ音乐（酷狗已下线，2026-10-24）
 */
const netease = require('./netease.cjs')
const qq = require('./qq.cjs')
const store = require('../store.cjs')

const ADAPTERS = { netease, qq }
const PLATFORMS = ['netease', 'qq']

/* 酷狗下线后清掉本地遗留的登录态 / 扫码 cookie，只跑一次（有残留才写盘） */
;(function dropKugouResidue () {
  try {
    const jar = store.get('cookies') || {}
    const lg = store.get('login') || {}
    let touched = false
    for (const k of Object.keys(jar)) {
      if (k === 'kugou' || k.startsWith('kugou_')) { delete jar[k]; touched = true }
    }
    if (lg.kugou) { delete lg.kugou; touched = true }
    if (touched) {
      store.set('cookies', jar)
      store.set('login', lg)
    }
  } catch (_) {}
})()

function pick (payload = {}) {
  const p = payload.platform || 'netease'
  const a = ADAPTERS[p]
  if (!a) throw new Error(`不支持的平台: ${p}（可选 netease / qq）`)
  return a
}

/** 一次搜索多个平台，结果打平 */
async function searchAll ({ keyword, limit = 20 }) {
  const settled = await Promise.allSettled(
    PLATFORMS.map((p) => ADAPTERS[p].search({ keyword, limit, platform: p }))
  )
  const out = []
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') out.push(...s.value)
    else console.warn(`[search-all] ${PLATFORMS[i]} 失败:`, s.reason && s.reason.message)
  })
  return out
}

async function loginState () {
  const all = await Promise.all(
    PLATFORMS.map((p) => ADAPTERS[p].loginState().catch(() => ({ platform: p, logged: false })))
  )
  const map = {}
  for (const s of all) map[s.platform] = s
  return map
}

module.exports = {
  adapters: ADAPTERS,
  platforms: PLATFORMS,

  search: (p) => (p && p.platform === 'all' ? searchAll(p) : pick(p).search(p)),
  songUrl: (p) => pick(p).songUrl(p),
  songDetail: (p) => pick(p).songDetail(p),
  lyric: (p) => pick(p).lyric(p),
  playlist: (p) => pick(p).playlist(p),
  playlistCat: (p) => pick(p).playlistCat(p),
  recommend: (p) => pick(p).recommend(p),
  ranking: (p) => pick(p).ranking(p),
  toplists: (p) => pick(p).toplists(p),
  loginQr: (p) => pick(p).loginQr(p),
  loginCheck: (p) => pick(p).loginCheck(p),
  loginCookie: (p) => pick(p).loginCookie(p),
  loginState,
  logout: (p) => pick(p).logout(p),
  userPlaylists: (p) => pick(p).userPlaylists(p)
}
