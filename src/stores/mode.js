import { defineStore } from 'pinia'
import { plain } from '../utils/bridge'

export const MODES = [
  { key: 'netease', name: '网易云模式', short: '网易云', color: '#ec4141' },
  { key: 'qq', name: 'QQ音乐模式', short: 'QQ音乐', color: '#31c27c' }
]

export const useModeStore = defineStore('mode', {
  state: () => ({
    mode: 'netease',
    settings: {}
  }),

  getters: {
    info: (s) => MODES.find((m) => m.key === s.mode) || MODES[0]
  },

  actions: {
    async init () {
      const s = (await window.TL.db.get('settings')) || {}
      this.settings = s
      if (s.mode) this.mode = s.mode
      document.body.dataset.mode = this.mode
    },

    async set (m) {
      this.mode = m
      document.body.dataset.mode = m
      await this.save({ mode: m })
    },

    async save (patch = {}) {
      this.settings = { ...this.settings, ...patch }
      await window.TL.db.set('settings', plain(this.settings))
    }
  }
})
