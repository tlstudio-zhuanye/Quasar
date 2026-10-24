'use strict'
/**
 * store.cjs — 本地数据（收藏 / 历史 / 设置 / Cookie）
 * 落地为 userData/quasar-data.json，不依赖任何云服务。
 */
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

let file = null
let cache = null

function defaults () {
  return {
    favorites: [],   // 跨平台混合收藏
    history: [],     // 播放历史
    settings: {},    // 界面设置（模式、音量、主题…）
    cookies: {},     // 各平台登录态
    login: {}        // 各平台账号信息
  }
}

/* 改名迁移：产品名 TL音乐 → Quasar（2026-10-24），数据目录从
 * %APPDATA%\TL音乐 搬到 %APPDATA%\Quasar。老文件存在就搬过来，收藏/登录不丢。 */
function migrateLegacy () {
  try {
    if (!file || fs.existsSync(file)) return
    const dir = path.dirname(file)
    for (const legacy of ['TL音乐', 'tl-music']) {
      const old = path.join(dir, '..', legacy, 'tlmusic-data.json')
      if (fs.existsSync(old)) {
        fs.mkdirSync(dir, { recursive: true })
        fs.copyFileSync(old, file)
        console.log('[store] 已迁移旧数据：' + old)
        break
      }
    }
  } catch (_) {}
}

function init () {
  if (cache) return
  try {
    file = path.join(app.getPath('userData'), 'quasar-data.json')
  } catch (_) {
    file = path.join(process.cwd(), 'quasar-data.json')
  }
  migrateLegacy()
  try {
    cache = JSON.parse(fs.readFileSync(file, 'utf8')) || {}
  } catch (_) {
    cache = {}
  }
  const d = defaults()
  for (const k of Object.keys(d)) {
    if (cache[k] === undefined || cache[k] === null) cache[k] = d[k]
  }
}

function flush () {
  try {
    init()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(cache, null, 2), 'utf8')
  } catch (e) {
    console.error('[store] 写入失败:', e.message)
  }
}

function get (key) {
  init()
  return cache[key]
}

function set (key, value) {
  init()
  cache[key] = value
  flush()
  return true
}

/* ---------- 收藏 ---------- */

function songKey (s) {
  if (!s) return ''
  return s.key || `${s.platform}:${s.id}`
}

function favorites () {
  init()
  return cache.favorites
}

function isFavorite (key) {
  init()
  return cache.favorites.some((s) => songKey(s) === key)
}

function toggleFavorite (song) {
  init()
  const key = songKey(song)
  const i = cache.favorites.findIndex((s) => songKey(s) === key)
  let added
  if (i >= 0) {
    cache.favorites.splice(i, 1)
    added = false
  } else {
    cache.favorites.unshift({ ...song, key, addedAt: Date.now() })
    added = true
  }
  flush()
  return { added, key, total: cache.favorites.length }
}

/* ---------- 历史 ---------- */

const HISTORY_MAX = 500

function history () {
  init()
  return cache.history
}

function pushHistory (song) {
  init()
  const key = songKey(song)
  cache.history = cache.history.filter((s) => songKey(s) !== key)
  cache.history.unshift({ ...song, key, playedAt: Date.now() })
  if (cache.history.length > HISTORY_MAX) cache.history.length = HISTORY_MAX
  flush()
  return true
}

module.exports = {
  get, set,
  favorites, isFavorite, toggleFavorite,
  history, pushHistory
}
