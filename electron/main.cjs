'use strict'
/**
 * Quasar — Electron 主进程
 * 负责：窗口管理（主窗 / WMP 式小窗）、防盗链请求头注入、
 *       音源调用（sources）、本地数据（store）、进程间状态中继
 */
const {
  app, BrowserWindow, ipcMain, shell, session, globalShortcut, screen
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')

/* 产品名（2026-10-24 起叫 Quasar，原 TL音乐）。显式 setName 保证 userData 目录
 * 在 dev / packaged 两种模式下都是 %APPDATA%\Quasar，不依赖 package.json 字段差异。 */
app.setName('Quasar')

// 只有显式设了 TL_DEV=1 才连 Vite 开发服务器，否则一律加载 dist 产物
const isDev = !app.isPackaged && process.env.TL_DEV === '1'
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5178'

const sources = require('./sources/index.cjs')
const store = require('./store.cjs')

/* ══════════════ 0. GPU 兜底 ══════════════
 * 独立 GPU 进程在受限环境（远程桌面 / 虚拟机 / 沙箱）里常常起不来，Chromium 的
 * 默认行为是重试几次后直接 FATAL 退出，用户看到的就是「双击没反应」。
 * 实测（本机）：--no-sandbox 时 GPU 只退一次就正常 ⇒ 显卡本身没问题，是进程隔离挡的。
 * 所以这里固定两个开关，把「GPU 起不来」这个失败模式从根上拿掉：
 *   1) disable-gpu-process-crash-limit：取消「失败重试超限就自杀」的上限，进程不会死；
 *   2) in-process-gpu：GPU 代码跑在主进程里，没有独立进程可崩，也就不存在重试风暴。
 * TL_NO_GPU=1 或远程桌面会话：连尝试都省掉，直接走软件渲染。
 */
const isRemoteSession = /^RDP/i.test(process.env.SESSIONNAME || '')

/* Chromium 自带的进程沙箱在这台机器上起不来（实测：GPU 进程 exit_code=1，
 * app.getGPUFeatureStatus() 一直是 disabled_software，音频服务也起不来 ⇒ 没声音）。
 * 处理办法是「先正常，失败了记一笔」：
 *   首次启动照常用沙箱；启动后如果发现 GPU 状态是软件降级，就把判定记到
 *   userData/.no-sandbox，下一次启动带上 --no-sandbox 让音频/GPU 正常工作。
 * 想恢复沙箱：删掉 %APPDATA%\Quasar\.no-sandbox
 */
const SANDBOX_FLAG = (() => {
  try { return path.join(app.getPath('userData'), '.no-sandbox') } catch (_) { return null }
})()
let sandboxOff = false
if (SANDBOX_FLAG) {
  try { sandboxOff = fs.existsSync(SANDBOX_FLAG) } catch (_) {}
}
/* 改名迁移：老目录（TL音乐）里的 .no-sandbox 标记搬过来，
 * 否则升级后第一发起在沙箱里，表现为没声音。 */
if (SANDBOX_FLAG && !sandboxOff) {
  try {
    for (const legacy of ['TL音乐', 'tl-music']) {
      const old = path.join(path.dirname(SANDBOX_FLAG), '..', legacy, '.no-sandbox')
      if (fs.existsSync(old)) {
        fs.copyFileSync(old, SANDBOX_FLAG)
        sandboxOff = true
        console.log('[TL] 已迁移沙箱兼容标记：' + legacy)
        break
      }
    }
  } catch (_) {}
}
if (sandboxOff) app.commandLine.appendSwitch('no-sandbox')

app.commandLine.appendSwitch('disable-gpu-process-crash-limit')
app.commandLine.appendSwitch('in-process-gpu')
// 本地播放器：允许无用户手势自动播放（列表双击即播，不用先点一下界面）
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

if (process.env.TL_NO_GPU === '1' || isRemoteSession) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-software-rasterizer')
  console.log('[TL] 软件渲染（' + (process.env.TL_NO_GPU === '1' ? 'TL_NO_GPU=1' : '远程桌面会话') + '）')
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

let mainWin = null
let miniWin = null
let tray = null
let isQuitting = false

/* ══════════════ 1. 防盗链 / 跨域请求头注入 ══════════════ */
function patchRequestHeaders () {
  const ses = session.defaultSession
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const h = details.requestHeaders
    const u = details.url || ''
    if (!h['User-Agent']) h['User-Agent'] = UA
    if (/163\.com|126\.net/.test(u)) {
      h['Referer'] = 'https://music.163.com/'
      h['Origin'] = 'https://music.163.com'
    } else if (/qq\.com|qqmusic/.test(u)) {
      h['Referer'] = 'https://y.qq.com/'
    }
    cb({ requestHeaders: h })
  })
}

/* ══════════════ 2. 窗口 ══════════════ */
function loadPage (win, hash) {
  if (isDev) return win.loadURL(`${DEV_URL}/#${hash}`)
  return win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash })
}

function baseWebPreferences () {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    backgroundThrottling: false,
    // 本地应用需要直接加载各平台封面 / 音频，放开同源限制
    webSecurity: false
  }
}

function createMainWindow () {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    frame: false,
    show: false,
    backgroundColor: '#f5f6f8',
    title: 'Quasar',
    autoHideMenuBar: true,
    webPreferences: baseWebPreferences()
  })

  mainWin.once('ready-to-show', () => mainWin.show())

  // 关闭主窗 = 退出整个应用（连带关掉小窗），避免"程序不见了"
  mainWin.on('close', () => {
    isQuitting = true
    if (loginWin && !loginWin.isDestroyed()) loginWin.close()
    if (miniWin && !miniWin.isDestroyed()) miniWin.close()
  })

  loadPage(mainWin, 'main')
  return mainWin
}

// 小窗：仿 Windows Media Player 紧凑模式（竖版窄条）
const MINI_W = 320
const MINI_H = 430

function createMiniWindow () {
  // 默认贴在屏幕右下角（和 WMP 紧凑模式一样，不挡事又随手能点）
  const { workArea } = screen.getPrimaryDisplay()
  const x = Math.round(workArea.x + workArea.width - MINI_W - 24)
  const y = Math.round(workArea.y + workArea.height - MINI_H - 24)

  miniWin = new BrowserWindow({
    width: MINI_W,
    height: MINI_H,
    x: Math.max(workArea.x, x),
    y: Math.max(workArea.y, y),
    minWidth: 280,
    minHeight: 360,
    maxWidth: 560,
    maxHeight: 760,
    frame: false,
    show: false,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#14151a',
    title: 'Quasar · 迷你',
    webPreferences: baseWebPreferences()
  })

  miniWin.once('ready-to-show', () => miniWin.show())

  miniWin.on('closed', () => {
    miniWin = null
    // 小窗被直接关掉时，把主窗还回来，避免应用"消失"
    if (mainWin && !mainWin.isVisible() && !isQuitting) mainWin.show()
  })

  loadPage(miniWin, 'mini')
  return miniWin
}

/* ══════════════ 2.5 官方登录窗口（登录兜底通道） ══════════════
 * 扫码接口对个别平台不稳定（QQ 扫码只带回 uin、播放票据要进播放器页才下发），
 * 所以再做一条兜底：直接开官方登录页，用户登完之后我们把 Cookie 收进本地库。
 * 全程不接触账号密码，只保存服务端下发的 Cookie。
 * 平台范围：网易云 + QQ音乐（酷狗已下线，2026-10-24）
 */
let loginWin = null
let loginPoll = null

const LOGIN_PARTITION = 'persist:quasar-login'

const LOGIN_SITES = {
  netease: {
    label: '网易云音乐',
    url: 'https://music.163.com/#/login',
    domain: '163.com',
    match: (ck) => /(^|;\s*)MUSIC_U=/.test(ck)
  },
  qq: {
    label: 'QQ音乐',
    url: 'https://y.qq.com/',
    // 首页右上角的「登录」，加载完自动点一下，直接把登录弹窗顶出来
    autoClick: '.top_login__link',
    domain: 'qq.com',
    // uin 必须非 0：游客态 qq.com 本身就带 uin=0，用旧的松规则会秒判「已登录」
    match: (ck) => /(^|;\s*)uin=o?[1-9]\d*/.test(ck)
  }
}

function closeLoginWindow () {
  if (loginPoll) { clearInterval(loginPoll); loginPoll = null }
  if (loginWin && !loginWin.isDestroyed()) loginWin.close()
  loginWin = null
}

/**
 * 打开官方登录页，轮询官方站点 Cookie；拿到登录态即写入本地库并关窗
 * @returns {Promise<{ok:boolean, logged:boolean, cancelled?:boolean, profile?:object, error?:string}>}
 */
function openLoginWindow (platform, parentWin) {
  const site = LOGIN_SITES[platform]
  if (!site) return Promise.resolve({ ok: false, error: `未知平台：${platform}` })
  closeLoginWindow()

  const ses = session.fromPartition(LOGIN_PARTITION)

  return new Promise((resolve) => {
    let settled = false
    const done = (payload) => {
      if (settled) return
      settled = true
      closeLoginWindow()
      resolve(payload)
    }

    loginWin = new BrowserWindow({
      width: 1220,
      height: 820,
      parent: parentWin || mainWin,
      autoHideMenuBar: true,
      title: `登录${site.label}（官方页面）`,
      backgroundColor: '#ffffff',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        partition: LOGIN_PARTITION
      }
    })

    loginWin.loadURL(site.url, { userAgent: UA })
    dbg(`login window open platform=${platform} url=${site.url}`)

    // 有的站点登录框要点一下才出来
    if (site.autoClick) {
      loginWin.webContents.on('did-finish-load', () => {
        const js = `(function(){try{var el=document.querySelector(${JSON.stringify(site.autoClick)});if(el){el.click();return true}}catch(e){}return false})()`
        loginWin.webContents.executeJavaScript(js).then((hit) => dbg(`login autoClick hit=${hit}`)).catch(() => {})
      })
    }

    loginWin.on('closed', () => {
      loginWin = null
      if (loginPoll) { clearInterval(loginPoll); loginPoll = null }
      done({ ok: true, logged: false, cancelled: true })
    })

    loginPoll = setInterval(async () => {
      try {
        const all = await ses.cookies.get({})
        const mine = all.filter((c) => (c.domain || '').includes(site.domain))
        const ck = mine.map((c) => `${c.name}=${c.value}`).join('; ')
        if (!site.match(ck)) return

        // 登录成功：把官方站点下发的 Cookie 整包存进本地库
        const jar = store.get('cookies') || {}
        jar[platform] = ck
        store.set('cookies', jar)

        const lg = store.get('login') || {}
        const prof = { platform, logged: true, nickname: `${site.label}用户` }
        if (platform === 'qq') {
          prof.uin = (/uin=o?(\d+)/.exec(ck) || [])[1] || ''
        }
        lg[platform] = prof
        store.set('login', lg)
        dbg(`login success platform=${platform} ckLen=${ck.length}`)

        // 有资料接口的平台顺手补一次昵称/头像；QQ 再探一次播放票据是否齐全
        let partial = false
        try {
          const st = await sources[platform].loginState()
          if (st && st.logged) {
            lg[platform] = { ...prof, ...st }
            store.set('login', lg)
            if (platform === 'qq' && st.playbackKeyReady === false) partial = true
          }
        } catch (_) {}

        done({
          ok: true,
          logged: true,
          partial,
          message: partial ? 'QQ 账号已同步，但播放授权未生成；请进入任意播放器页面后重试，或改用 Cookie 导入' : '',
          profile: (store.get('login') || {})[platform]
        })
      } catch (e) {
        dbg(`login poll error ${e && e.message}`)
      }
    }, 800)
  })
}

/* ══════════════ 3. 状态中继：主窗 ↔ 小窗 ══════════════ */
function dbg (msg) {
  if (process.env.TL_RELAY_LOG !== '1') return
  try {
    require('node:fs').appendFileSync(
      path.join(__dirname, '..', '_relay.log'),
      `${new Date().toISOString()} ${msg}\n`
    )
  } catch (_) {}
}

function who (w) {
  if (!w) return 'none'
  return w === miniWin ? 'mini' : (w === mainWin ? 'main' : 'other')
}

function broadcast (channel, payload, exceptWin) {
  const wins = BrowserWindow.getAllWindows()
  dbg(`broadcast ch=${channel} wins=${wins.length} except=${who(exceptWin)} -> [${wins.filter(x => x !== exceptWin).map(who).join(',')}]`)
  for (const w of wins) {
    if (w === exceptWin) continue
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

/* ══════════════ 4. IPC 注册 ══════════════ */
function registerWindowIPC () {
  // 一律以「发起调用的窗口」为准，不要用当前聚焦窗口：
  // 主窗隐藏 / 无焦点时 getFocusedWindow() 会返回 null 或串到另一个窗口上。
  const w = (e) => (e && BrowserWindow.fromWebContents(e.sender)) ||
    BrowserWindow.getFocusedWindow() || mainWin

  ipcMain.handle('win:minimize', (e) => { const x = w(e); if (x) x.minimize() })
  ipcMain.handle('win:toggleMaximize', (e) => {
    const x = w(e); if (!x) return false
    if (x.isMaximized()) x.unmaximize(); else x.maximize()
    return x.isMaximized()
  })
  ipcMain.handle('win:close', (e) => { const x = w(e); if (x) x.close() })
  ipcMain.handle('win:hide', (e) => { const x = w(e); if (x) x.hide() })

  ipcMain.handle('win:enterMini', () => {
    if (!miniWin || miniWin.isDestroyed()) createMiniWindow()
    else miniWin.show()
    if (mainWin && !mainWin.isDestroyed()) mainWin.hide()
    return true
  })

  ipcMain.handle('win:exitMini', () => {
    if (miniWin && !miniWin.isDestroyed()) miniWin.close()
    if (mainWin && !mainWin.isDestroyed()) { mainWin.show(); mainWin.focus() }
    return true
  })

  ipcMain.handle('win:setAlwaysOnTop', (e, on) => {
    const x = w(e); if (!x) return false
    x.setAlwaysOnTop(!!on, 'floating')
    return x.isAlwaysOnTop()
  })
  ipcMain.handle('win:isAlwaysOnTop', (e) => {
    const x = w(e); return x ? x.isAlwaysOnTop() : false
  })
  ipcMain.handle('win:current', (e) => {
    const x = w(e)
    if (!x) return 'main'
    return x === miniWin ? 'mini' : 'main'
  })
  ipcMain.handle('win:resizeBy', (e, dw, dh) => {
    const x = w(e); if (!x || x.isMaximized()) return
    const b = x.getBounds()
    const isMini = x === miniWin
    x.setBounds({
      x: b.x, y: b.y,
      width: Math.max(isMini ? 280 : 420, Math.min(isMini ? 560 : 4000, b.width + dw)),
      height: Math.max(isMini ? 360 : 120, Math.min(isMini ? 760 : 4000, b.height + dh))
    })
  })
}

function registerMusicIPC () {
  const names = [
    'search', 'songUrl', 'songDetail', 'lyric', 'playlist', 'playlistCat',
    'recommend', 'ranking', 'toplists',
    'loginQr', 'loginCheck', 'loginCookie', 'loginState', 'logout', 'userPlaylists'
  ]
  for (const name of names) {
    ipcMain.handle(`music:${name}`, async (_e, payload) => {
      try {
        const fn = sources[name]
        if (typeof fn !== 'function') throw new Error(`音源方法未实现: ${name}`)
        const data = await fn(payload || {})
        return { ok: true, data }
      } catch (err) {
        return { ok: false, error: (err && err.message) || String(err) }
      }
    })
  }

  // 登录兜底：开官方登录页收 Cookie
  ipcMain.handle('music:loginWindow', async (e, payload) => {
    try {
      const platform = (payload && payload.platform) || 'netease'
      const parent = BrowserWindow.fromWebContents(e.sender) || mainWin
      const data = await openLoginWindow(platform, parent)
      return { ok: data.ok !== false, data }
    } catch (err) {
      return { ok: false, error: (err && err.message) || String(err) }
    }
  })
}

function registerDBIPC () {
  ipcMain.handle('db:get', (_e, key) => store.get(key))
  ipcMain.handle('db:set', (_e, key, value) => store.set(key, value))
  ipcMain.handle('db:favorites', () => store.favorites())
  ipcMain.handle('db:toggleFavorite', (_e, song) => store.toggleFavorite(song))
  ipcMain.handle('db:isFavorite', (_e, key) => store.isFavorite(key))
  ipcMain.handle('db:history', () => store.history())
  ipcMain.handle('db:pushHistory', (_e, song) => store.pushHistory(song))

  ipcMain.handle('sys:openExternal', (_e, url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  // 播放状态中继（谁在播，广播给另一个窗口）
  ipcMain.on('player:broadcast', (e, payload) => {
    const sender = BrowserWindow.fromWebContents(e.sender)
    dbg(`on player:broadcast from=${who(sender)} keys=${Object.keys(payload || {}).join('|')}`)
    broadcast('player:state', payload, sender)
  })
  // 播放指令中继（小窗点按钮 → 主窗执行）
  ipcMain.on('player:command', (e, payload) => {
    const sender = BrowserWindow.fromWebContents(e.sender)
    dbg(`on player:command from=${who(sender)} action=${payload && payload.action}`)
    broadcast('player:cmd', payload, sender)
  })
  // 请求对端把最新状态回推一次
  ipcMain.on('player:requestState', (e) => {
    const sender = BrowserWindow.fromWebContents(e.sender)
    dbg(`on player:requestState from=${who(sender)}`)
    broadcast('player:needState', {}, sender)
  })
}

/* ══════════════ 5. 应用生命周期 ══════════════ */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWin) { mainWin.show(); mainWin.focus() }
  })

  app.whenReady().then(() => {
    // 落一行启动日志，出问题时能直接看出 GPU / 渲染模式是什么状态
    try {
      const st = app.getGPUFeatureStatus() || {}
      const gc = st.gpu_compositing || st.gpuCompositing || '?'
      const webgl = st.webgl || '?'
      // GPU 状态是「软件降级」= Chromium 沙箱在这台机器上没拉起来 →
      // 记一笔，下次启动关掉沙箱（否则音频服务起不来，表现为没声音）
      const sandboxBroken = /disabled_software|disabled_off|unavailable/i.test(String(gc) + String(webgl))
      if (!sandboxOff && SANDBOX_FLAG && sandboxBroken) {
        try { fs.writeFileSync(SANDBOX_FLAG, new Date().toISOString()) } catch (_) {}
        console.log('[TL] 检测到 Chromium 沙箱不可用，下次启动将自动关闭沙箱')
      }
      const line =
        new Date().toISOString() +
        ' v' + app.getVersion() +
        ' ' + (app.isPackaged ? 'packaged' : 'dev') +
        ' gpu=' + gc +
        ' webgl=' + webgl +
        ' noSandbox=' + String(sandboxOff) +
        ' softRender=' + String(process.env.TL_NO_GPU === '1' || isRemoteSession) +
        '\n'
      fs.appendFileSync(path.join(app.getPath('userData'), 'startup.log'), line)
    } catch (_) {}

    patchRequestHeaders()
    registerWindowIPC()
    registerMusicIPC()
    registerDBIPC()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    isQuitting = true
    if (loginPoll) { clearInterval(loginPoll); loginPoll = null }
    globalShortcut.unregisterAll()
  })
}
