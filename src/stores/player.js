import { defineStore } from 'pinia'
import { parseLyric, lineIndexAt } from '../utils/lyrics'
import { plain } from '../utils/bridge'

/** 小窗是纯镜像窗口：不持有 audio，只渲染主窗广播过来的状态 */
export const IS_MINI = location.hash.includes('mini')

let audio = null
let lastBroadcast = 0
let seeking = false

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
    ready: false
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

      a.addEventListener('play', () => { this.playing = true; this._broadcast(true) })
      a.addEventListener('pause', () => { this.playing = false; this._broadcast(true) })
      a.addEventListener('ended', () => { this._step(1) })
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
          else if (typeof this[action] === 'function') this[action]()
        } catch (e) {
          console.warn('[player] 指令执行失败', action, e)
        }
      })
      window.TL.on('player:needState', () => this._broadcast(true))

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
        }
      } catch (_) {}
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
    }
  }
})
