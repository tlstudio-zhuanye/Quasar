'use strict'
/**
 * preload.cjs — 渲染进程与主进程之间唯一的桥
 * 只暴露必要能力，不把 Node 能力直接交给页面
 */
const { contextBridge, ipcRenderer } = require('electron')

/**
 * Vue 的响应式对象是 Proxy，IPC 无法结构化克隆，必须先转成普通数据。
 * 所有跨进程调用统一在这里压平，避免渲染层到处写 toRaw。
 */
function plain (v) {
  if (v === undefined || v === null) return v
  const t = typeof v
  if (t === 'string' || t === 'number' || t === 'boolean') return v
  if (t === 'function') return undefined
  try {
    return JSON.parse(JSON.stringify(v))
  } catch (_) {
    return undefined
  }
}

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args.map(plain))
const emit = (channel, payload) => ipcRenderer.send(channel, plain(payload))

contextBridge.exposeInMainWorld('TL', {
  /* ---------------- 窗口控制 ---------------- */
  win: {
    minimize: () => call('win:minimize'),
    toggleMaximize: () => call('win:toggleMaximize'),
    close: () => call('win:close'),
    hide: () => call('win:hide'),
    // 进入 / 退出小窗模式
    enterMini: () => call('win:enterMini'),
    exitMini: () => call('win:exitMini'),
    setAlwaysOnTop: (on) => call('win:setAlwaysOnTop', on),
    isAlwaysOnTop: () => call('win:isAlwaysOnTop'),
    current: () => call('win:current'),
    // 小窗 / 主窗尺寸微调（无边框窗口用）
    resizeBy: (w, h) => call('win:resizeBy', w, h)
  },

  /* ---------------- 音源能力 ---------------- */
  music: {
    search: (p) => call('music:search', p),
    songUrl: (p) => call('music:songUrl', p),
    songDetail: (p) => call('music:songDetail', p),
    lyric: (p) => call('music:lyric', p),
    playlist: (p) => call('music:playlist', p),
    playlistCat: (p) => call('music:playlistCat', p),
    recommend: (p) => call('music:recommend', p),
    ranking: (p) => call('music:ranking', p),
    toplists: (p) => call('music:toplists', p),
    // 登录
    loginQr: (p) => call('music:loginQr', p),
    loginCheck: (p) => call('music:loginCheck', p),
    // 手动导入 Cookie（扫码拿不到完整登录态时的通道）
    loginCookie: (p) => call('music:loginCookie', p),
    loginState: () => call('music:loginState'),
    // 兜底通道：打开官方登录页，登录后自动收 Cookie
    loginWindow: (p) => call('music:loginWindow', p),
    logout: (p) => call('music:logout', p),
    userPlaylists: (p) => call('music:userPlaylists', p)
  },

  /* ---------------- 本地数据（收藏 / 设置 / Cookie） ---------------- */
  db: {
    get: (key) => call('db:get', key),
    set: (key, value) => call('db:set', key, value),
    favorites: () => call('db:favorites'),
    toggleFavorite: (song) => call('db:toggleFavorite', song),
    isFavorite: (key) => call('db:isFavorite', key),
    history: () => call('db:history'),
    pushHistory: (song) => call('db:pushHistory', song)
  },

  /* ---------------- 主窗 ↔ 小窗 播放状态中继 ---------------- */
  player: {
    // 主窗广播当前播放状态
    broadcast: (p) => emit('player:broadcast', p),
    // 小窗下发播放指令
    command: (p) => emit('player:command', p),
    // 新开的窗口请求一次全量状态
    requestState: () => ipcRenderer.send('player:requestState')
  },

  /* ---------------- 系统 ---------------- */
  sys: {
    openExternal: (url) => call('sys:openExternal', url),
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    }
  },

  /* ---------------- 主进程广播事件 ---------------- */
  on: (channel, fn) => {
    const wrap = (_e, ...args) => fn(...args)
    ipcRenderer.on(channel, wrap)
    return () => ipcRenderer.removeListener(channel, wrap)
  }
})
