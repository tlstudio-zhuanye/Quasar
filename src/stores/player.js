import { defineStore } from 'pinia'
import { parseLyric, lineIndexAt } from '../utils/lyrics'
import { plain } from '../utils/bridge'

/** 小窗是纯镜像窗口：不持有 audio，只渲染主窗广播过来的状态 */
export const IS_MINI = location.hash.includes('mini')

let audio = null
let lastBroadcast = 0
let seeking = false
let sleepTimer = null
let eqGraph = null

/* EQ 5 段 peaking：频率覆盖低音到齿音，够用又不会把 slider 铺满屏 */
const EQ_FREQS = [60, 250, 1000, 4000, 12000]
const EQ_FLAT = [0, 0, 0, 0, 0]
/* 增益单位 dB，范围 -12 ~ +12（面板 slider 用这个范围） */
const EQ_PRESETS = {
  flat:    [0, 0, 0, 0, 0],
  pop:     [3, 1, 0, 2, 3],
  rock:    [5, 2, -1, 2, 4],
  jazz:    [3, 0, 1, 2, 3],
  classic: [4, 2, 0, 2, 3],
  vocal:   [-1, 1, 4, 2, 0],
  electronic: [6, 3, 0, 1, 5],
  acoustic: [2, 1, 2, 3, 2]
}

export const EQ_PRESET_NAMES = Object.keys(EQ_PRESETS)
export const EQ_BAND_FREQS = EQ_FREQS.slice()

function ensureAudio () {
  if (IS_MINI) return null
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
    audio.volume = 0.8
  }
  return audio
}

/** 舞台等组件用：拿主窗 audio 元素做 60fps 读取（不进响应式、不广播） */
export function getAudio () { return audio }

export const usePlayerStore = defineStore('player', {
  state: () => ({
    queue: [],
    index: -1,
    current: null,
    playing: false,
    progress: 0,
    duration: 0,
    volume: 0.8,
    repeat: 'list', // list | one | shuffle
    loading: false,
    error: '',
    lyric: [],
    lyricIndex: 0,
    lyricWordByWord: false,
    ready: false,
    commentPanel: { open: false, song: null },
    queuePanel: { open: false },
    sleep: { endAt: 0, remain: 0, mode: '' }, // 定时关闭：endAt=时间戳；mode=after-song 播完当前
    eq: { enabled: false, bands: [], preset: 'flat' }
  }),

  getters: {
    percent: (s) => (s.duration ? Math.min(100, (s.progress / s.duration) * 100) : 0),
    repeatLabel: (s) => ({ list: '列表循环', one: '单曲循环', shuffle: '随机播放' }[s.repeat] || '列表循环')
  },

  actions: {
    /* ═══════════ 初始化 ═══════════ */
    async init () {
      if (IS_MINI) {
        window.TL.on('player:state', (st) => Object.assign(this, st))
        window.TL.player.requestState()
        this.ready = true
        return
      }

      const a = ensureAudio()
      const cfg = (await window.TL.db.get('settings')) || {}
      if (typeof cfg.volume === 'number') { this.volume = cfg.volume; a.volume = cfg.volume }
      if (cfg.repeat) this.repeat = cfg.repeat

      a.addEventListener('play', () => {
        this.playing = true
        // 自动播放策略：AudioContext 必须在用户手势后 resume，播放事件是可靠时机
        if (eqGraph && eqGraph.ctx.state === 'suspended') eqGraph.ctx.resume().catch(() => {})
        this._broadcast(true)
      })
      a.addEventListener('pause', () => { this.playing = false; this._broadcast(true) })
      a.addEventListener('ended', () => {
        // 定时「播完当前曲」优先：到点就停，不走下一首
        if (this._afterSongDone()) return
        this._step(1)
      })
      a.addEventListener('loadedmetadata', () => {
        if (isFinite(a.duration) && a.duration > 0) this.duration = a.duration
        this._broadcast(true)
      })
      a.addEventListener('timeupdate', () => {
        if (seeking) return
        this.progress = a.currentTime
        this.lyricIndex = lineIndexAt(this.lyric, this.progress)
        this._broadcast(false)
      })
      a.addEventListener('error', () => {
        if (!a.src) return
        this.error = '音频加载失败：音源可能已过期，点播放重试'
        this.playing = false
        this._broadcast(true)
      })

      // 小窗下发的指令
      window.TL.on('player:cmd', ({ action, payload = {} }) => {
        try {
          if (action === 'playList') this.playList(payload.list, payload.index)
          else if (action === 'playSong') this.playSong(payload.song)
          else if (action === 'seek') this.seek(payload.sec)
          else if (action === 'setVolume') this.setVolume(payload.v)
          else if (action === 'playIndex') this.playIndex(payload.i)
          else if (action === 'removeAt') this.removeAt(payload.i)
          else if (action === 'move') this.move(payload.from, payload.to)
          else if (action === 'setSleep') this.setSleep(payload.minutes)
          else if (action === 'setEqEnabled') this.setEqEnabled(payload.on)
          else if (action === 'setEqBand') this.setEqBand(payload.idx, payload.gain)
          else if (action === 'setEqPreset') this.setEqPreset(payload.name)
          else if (typeof this[action] === 'function') this[action]()
        } catch (e) {
          console.warn('[player] 指令执行失败', action, e)
        }
      })
      window.TL.on('player:needState', () => this._broadcast(true))

      // 恢复定时关闭 / EQ 设置
      this.restoreSleep()
      this.restoreEq()

      this.ready = true
      this._broadcast(true)
    },

    /* ═══════════ 跨窗口 ═══════════ */
    cmd (action, payload) {
      window.TL.player.command(plain({ action, payload }))
    },

    _broadcast (force = false) {
      if (IS_MINI) return
      const now = Date.now()
      if (!force && now - lastBroadcast < 450) return
      lastBroadcast = now
      window.TL.player.broadcast(plain({
        current: this.current,
        playing: this.playing,
        progress: this.progress,
        duration: this.duration,
        volume: this.volume,
        repeat: this.repeat,
        loading: this.loading,
        error: this.error,
        queueLen: this.queue.length
      }))
    },

    /* ═══════════ 播放 ═══════════ */
    async playList (list, index = 0) {
      if (IS_MINI) return this.cmd('playList', { list, index })
      if (!list || !list.length) return
      this.queue = list.slice()
      await this._loadAt(index)
    },

    async playSong (song) {
      if (IS_MINI) return this.cmd('playSong', { song })
      if (!song) return
      const i = this.queue.findIndex((x) => x.key === song.key)
      if (i >= 0) return this._loadAt(i)
      this.queue = [song]
      return this._loadAt(0)
    },

    async _loadAt (i) {
      const n = this.queue.length
      if (!n) return
      this.index = ((i % n) + n) % n
      await this._load(this.queue[this.index])
    },

    async _load (song) {
      const a = ensureAudio()
      if (!a || !song) return

      this.loading = true
      this.error = ''
      this.current = song
      this.progress = 0
      this.duration = (song.duration || 0) / 1000
      this.lyric = []
      this.lyricIndex = 0
      this.lyricWordByWord = false
      this._broadcast(true)

      try {
        const r = await window.TL.music.songUrl({
          platform: song.platform, id: song.id, hash: song.hash, mid: song.mid,
          hqHash: song.hqHash, sqHash: song.sqHash
        })
        if (!r.ok) throw new Error(r.error)
        a.src = r.data.url
        await a.play()
        this.playing = true
        window.TL.db.pushHistory(plain(song))
        this._fillCover(song)
      } catch (e) {
        this.error = e.message || String(e)
        this.playing = false
      } finally {
        // 音源失败也加载歌词：歌词接口不需要登录，被下架的歌至少还能看到词
        this._loadLyric(song)
        this.loading = false
        this._broadcast(true)
      }
    },

    /**
     * 网易云的 web 搜索接口只返回 album.picId（数字），没有 picUrl，
     * 于是搜索来的歌封面是空的 —— 小窗的转盘和背景就只剩占位图。
     * 播放时补一次 songDetail 拿真封面（QQ 搜索自带封面，不会走这条路）。
     */
    async _fillCover (song) {
      if (!song || song.cover) return
      try {
        const r = await window.TL.music.songDetail({ platform: song.platform, id: song.id })
        const cover = r && r.ok && r.data && r.data.cover
        if (!cover) return
        if (this.current && this.current.key === song.key) {
          this.current = { ...this.current, cover }
        }
        const i = this.queue.findIndex((x) => x.key === song.key)
        if (i >= 0) this.queue[i] = { ...this.queue[i], cover }
        this._broadcast(true)
      } catch (_) {}
    },

    async _loadLyric (song) {
      // 切歌先清空，避免上一首歌词残留造成"加载不出来"的错觉
      if (this.current && this.current.key === song.key) {
        this.lyric = []
        this.lyricWordByWord = false
      }
      try {
        const r = await window.TL.music.lyric({
          platform: song.platform, id: song.id, hash: song.hash, mid: song.mid
        })
        if (r.ok && r.data) {
          const parsed = parseLyric(song.platform, r.data)
          // 换歌检查：异步返回时可能已经切到下一首
          if (this.current && this.current.key === song.key) {
            this.lyric = parsed.lines
            this.lyricWordByWord = parsed.wordByWord
            this.lyricIndex = lineIndexAt(this.lyric, this.progress)
          }
        } else {
          console.warn('[lyric] 接口未返回歌词数据', song.platform, song.id, r)
        }
      } catch (e) {
        console.error('[lyric] 歌词加载失败', song.platform, song.id, e && e.message)
      }
    },

    async toggle () {
      if (IS_MINI) return this.cmd('toggle', {})
      const a = ensureAudio()
      if (!this.current) return
      if (a.paused) {
        try {
          await a.play()
          this.error = ''
        } catch (e) {
          this.error = e.message || '播放失败'
        }
      } else {
        a.pause()
      }
    },

    async next () {
      if (IS_MINI) return this.cmd('next', {})
      await this._step(1)
    },

    async prev () {
      if (IS_MINI) return this.cmd('prev', {})
      await this._step(-1)
    },

    async _step (dir) {
      if (!this.queue.length) return
      if (this.repeat === 'one') return this._load(this.queue[this.index])
      const n = this.queue.length
      const i = this.repeat === 'shuffle'
        ? Math.floor(Math.random() * n)
        : (this.index + dir + n) % n
      await this._loadAt(i)
    },

    seek (sec) {
      if (IS_MINI) return this.cmd('seek', { sec })
      const a = ensureAudio()
      if (!a || !this.current) return
      const max = this.duration || a.duration || 0
      if (!max) return
      seeking = true
      a.currentTime = Math.max(0, Math.min(sec, max))
      this.progress = a.currentTime
      setTimeout(() => { seeking = false }, 150)
      this._broadcast(true)
    },

    setVolume (v) {
      if (IS_MINI) return this.cmd('setVolume', { v })
      this.volume = Math.max(0, Math.min(1, Number(v) || 0))
      const a = ensureAudio()
      if (a) a.volume = this.volume
      this._saveSetting({ volume: this.volume })
      this._broadcast(true)
    },

    async setRepeat (r) {
      if (IS_MINI) return this.cmd('setRepeat', { r })
      this.repeat = r
      this._saveSetting({ repeat: r })
      this._broadcast(true)
    },

    cycleRepeat () {
      const order = ['list', 'one', 'shuffle']
      const i = order.indexOf(this.repeat)
      this.setRepeat(order[(i + 1) % order.length])
    },

    async _saveSetting (patch) {
      try {
        const cfg = (await window.TL.db.get('settings')) || {}
        await window.TL.db.set('settings', { ...cfg, ...patch })
      } catch (_) {}
    },

    /** 从收藏/历史直接建队列播放 */
    async playFrom (list, song) {
      const i = list.findIndex((x) => x.key === song.key)
      await this.playList(list, i >= 0 ? i : 0)
    },

    /** 打开/关闭歌曲评论弹窗（独立弹窗，跟随当前歌曲） */
    openComments (song) {
      const s = song || this.current
      if (!s) return
      this.commentPanel = { open: true, song: s }
    },
    closeComments () {
      this.commentPanel.open = false
    },

    /* ═══════════ v1.2.9 新功能 ═══════════ */

    /* ---- 播放队列 ---- */
    openQueue () { this.queuePanel.open = true },
    closeQueue () { this.queuePanel.open = false },

    async playIndex (i) {
      if (IS_MINI) return this.cmd('playIndex', { i })
      await this._loadAt(i)
    },

    removeAt (i) {
      if (IS_MINI) return this.cmd('removeAt', { i })
      if (i < 0 || i >= this.queue.length) return
      this.queue.splice(i, 1)
      if (i === this.index) {
        // 移除的是当前曲：停掉并顺延到同位置的下一首
        const a = ensureAudio()
        if (a) { a.pause(); a.removeAttribute('src'); a.load() }
        this.current = null
        this.playing = false
        if (this.queue.length) this._loadAt(Math.min(i, this.queue.length - 1))
      } else if (i < this.index) {
        this.index--
      }
      this._broadcast(true)
    },

    clearQueue () {
      if (IS_MINI) return this.cmd('clearQueue', {})
      const a = ensureAudio()
      if (a) { a.pause(); a.removeAttribute('src'); a.load() }
      this.queue = []
      this.index = -1
      this.current = null
      this.playing = false
      this.progress = 0
      this.duration = 0
      this.lyric = []
      this._broadcast(true)
    },

    move (from, to) {
      if (IS_MINI) return this.cmd('move', { from, to })
      const n = this.queue.length
      if (from < 0 || from >= n || to < 0 || to >= n || from === to) return
      const curKey = this.queue[this.index] && this.queue[this.index].key
      const [item] = this.queue.splice(from, 1)
      this.queue.splice(to, 0, item)
      // 重排后重新定位当前曲，保证高亮/下一首不错乱
      if (curKey) this.index = this.queue.findIndex((x) => x.key === curKey)
      this._broadcast(true)
    },

    /* ---- 定时关闭 ---- */
    setSleep (minutes) {
      if (IS_MINI) return this.cmd('setSleep', { minutes })
      const m = Number(minutes)
      if (!m || m <= 0) return this.cancelSleep()
      const endAt = Date.now() + m * 60 * 1000
      this.sleep = { endAt, remain: m * 60, mode: 'timer' }
      this._startSleepTick()
      this._saveSetting({ sleepEndAt: endAt, sleepMode: 'timer' })
    },

    setSleepAfterSong () {
      if (IS_MINI) return this.cmd('setSleepAfterSong', {})
      this.sleep = { endAt: 0, remain: 0, mode: 'after-song' }
      this._stopSleepTick()
      this._saveSetting({ sleepEndAt: 0, sleepMode: 'after-song' })
    },

    cancelSleep () {
      if (IS_MINI) return this.cmd('cancelSleep', {})
      this.sleep = { endAt: 0, remain: 0, mode: '' }
      this._stopSleepTick()
      this._saveSetting({ sleepEndAt: 0, sleepMode: '' })
    },

    _startSleepTick () {
      this._stopSleepTick()
      sleepTimer = setInterval(() => {
        const left = Math.max(0, Math.round((this.sleep.endAt - Date.now()) / 1000))
        this.sleep.remain = left
        if (left <= 0) {
          const a = ensureAudio()
          if (a) a.pause()
          this.cancelSleep()
        }
      }, 1000)
    },
    _stopSleepTick () {
      if (sleepTimer) { clearInterval(sleepTimer); sleepTimer = null }
    },

    /** 由 a.ended 触发：播完当前曲的定时模式在这里收尾 */
    _afterSongDone () {
      if (this.sleep.mode === 'after-song') {
        const a = ensureAudio()
        if (a) a.pause()
        this.cancelSleep()
        return true
      }
      return false
    },

    /** 启动时恢复未到期的定时 */
    async restoreSleep () {
      try {
        const cfg = (await window.TL.db.get('settings')) || {}
        if (cfg.sleepMode === 'timer' && cfg.sleepEndAt > Date.now()) {
          this.sleep = { endAt: cfg.sleepEndAt, remain: Math.round((cfg.sleepEndAt - Date.now()) / 1000), mode: 'timer' }
          this._startSleepTick()
        } else if (cfg.sleepMode === 'after-song') {
          this.sleep = { endAt: 0, remain: 0, mode: 'after-song' }
        } else if (cfg.sleepEndAt || cfg.sleepMode) {
          this._saveSetting({ sleepEndAt: 0, sleepMode: '' })
        }
      } catch (_) {}
    },

    /* ---- EQ 均衡器（Web Audio） ---- */
    _eqBands () { return EQ_FREQS.slice() },

    async ensureEqGraph () {
      const a = ensureAudio()
      if (!a || IS_MINI || eqGraph) return eqGraph
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      try {
        const ctx = new AC()
        const source = ctx.createMediaElementSource(a)
        const filters = EQ_FREQS.map((f) => {
          const b = ctx.createBiquadFilter()
          b.type = 'peaking'
          b.frequency.value = f
          b.Q.value = 1.1
          b.gain.value = 0
          return b
        })
        // 链：source -> filter1 -> ... -> filter5 -> destination
        let node = source
        for (const f of filters) { node.connect(f); node = f }
        node.connect(ctx.destination)
        eqGraph = { ctx, source, filters }
        // 自动播放策略：首次用户交互后必须 resume
        if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
        return eqGraph
      } catch (e) {
        console.warn('[eq] 初始化失败（音频走直连）', e && e.message)
        return null
      }
    },

    async setEqEnabled (on) {
      if (IS_MINI) return this.cmd('setEqEnabled', { on })
      const enabled = !!on
      if (enabled) {
        const g = await this.ensureEqGraph()
        if (!g) { this.eq.enabled = false; return }
        if (g.ctx.state === 'suspended') await g.ctx.resume().catch(() => {})
      }
      this.eq.enabled = enabled
      if (!enabled) this._applyEqBands(this.eq.bands.length ? this.eq.bands : EQ_FLAT)
      this._saveSetting({ eqEnabled: enabled })
      this._broadcast(true)
    },

    async setEqBand (idx, gain) {
      if (IS_MINI) return this.cmd('setEqBand', { idx, gain })
      if (!this.eq.bands.length) this.eq.bands = EQ_FLAT.slice()
      this.eq.bands[idx] = Number(gain)
      this.eq.preset = 'custom'
      this._applyEqBands(this.eq.bands)
      this._saveSetting({ eqBands: this.eq.bands, eqPreset: 'custom' })
    },

    async setEqPreset (name) {
      if (IS_MINI) return this.cmd('setEqPreset', { name })
      const bands = EQ_PRESETS[name]
      if (!bands) return
      this.eq.preset = name
      this.eq.bands = bands.slice()
      if (this.eq.enabled) {
        const g = await this.ensureEqGraph()
        if (g) this._applyEqBands(bands)
      }
      this._saveSetting({ eqBands: this.eq.bands, eqPreset: name })
      this._broadcast(true)
    },

    _applyEqBands (bands) {
      if (!eqGraph) return
      const vals = (bands && bands.length === EQ_FREQS.length) ? bands : EQ_FLAT
      eqGraph.filters.forEach((f, i) => {
        // EQ 关闭时全部归零 = 直通（createMediaElementSource 不可逆，只能这样恢复原声）
        const v = this.eq.enabled ? Number(vals[i]) || 0 : 0
        try { f.gain.setTargetAtTime(v, eqGraph.ctx.currentTime, 0.02) } catch (_) { f.gain.value = v }
      })
    },

    async restoreEq () {
      try {
        const cfg = (await window.TL.db.get('settings')) || {}
        const bands = Array.isArray(cfg.eqBands) && cfg.eqBands.length === EQ_FREQS.length ? cfg.eqBands.slice() : EQ_FLAT.slice()
        this.eq.bands = bands
        this.eq.preset = cfg.eqPreset || 'flat'
        if (cfg.eqEnabled) {
          // 不主动 resume（要用户手势），标记为待启用；首次 toggle/play 时真正接图
          this.eq.enabled = true
          await this.ensureEqGraph().then((g) => {
            if (g) this._applyEqBands(bands)
          })
        }
      } catch (_) {}
    }
  }
})
