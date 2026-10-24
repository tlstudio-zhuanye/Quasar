import { defineStore } from 'pinia'
import { plain } from '../utils/bridge'

/** 跨平台混合收藏：本地库存 {平台, 歌曲ID, 元数据}，不分平台统一展示 */
export const useFavStore = defineStore('favorites', {
  state: () => ({
    list: [],
    loading: false
  }),

  getters: {
    count: (s) => s.list.length,
    byPlatform: (s) => s.list.reduce((acc, x) => {
      acc[x.platform] = (acc[x.platform] || 0) + 1
      return acc
    }, {})
  },

  actions: {
    async load () {
      this.loading = true
      try {
        this.list = (await window.TL.db.favorites()) || []
      } finally {
        this.loading = false
      }
    },

    has (song) {
      if (!song) return false
      return this.list.some((x) => x.key === song.key)
    },

    async toggle (song) {
      const r = await window.TL.db.toggleFavorite(plain(song))
      await this.load()
      return r
    },

    async clear () {
      await window.TL.db.set('favorites', [])
      await this.load()
    }
  }
})
