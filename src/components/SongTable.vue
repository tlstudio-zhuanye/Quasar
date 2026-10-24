<script setup>
import { usePlayerStore } from '../stores/player'
import { useFavStore } from '../stores/favorites'
import { fmtTime } from '../utils/lrc'

const props = defineProps({
  songs: { type: Array, default: () => [] },
  showPlatform: { type: Boolean, default: true },
  emptyText: { type: String, default: '这里还没有内容' }
})

const player = usePlayerStore()
const favStore = useFavStore()

const PLAT_NAME = { netease: '网易云', qq: 'QQ音乐' }
const isCur = (s) => player.current && player.current.key === s.key
</script>

<template>
  <div class="song-table">
    <div class="thead">
      <span class="c-idx">#</span>
      <span class="c-name">标题</span>
      <span class="c-album">专辑</span>
      <span v-if="showPlatform" class="c-plat">来源</span>
      <span class="c-dur">时长</span>
      <span class="c-fav"></span>
    </div>

    <div v-if="!songs.length" class="empty">{{ emptyText }}</div>

    <div class="tbody">
      <div
        v-for="(s, i) in songs"
        :key="s.key + '-' + i"
        class="row"
        :class="{ cur: isCur(s) }"
        @dblclick="player.playList(songs, i)"
      >
        <span class="c-idx">
          <span v-if="isCur(s)" class="playing-dot">{{ player.playing ? '♫' : '⏸' }}</span>
          <template v-else>{{ i + 1 }}</template>
        </span>

        <span class="c-name">
          <button class="name-btn ellipsis" :title="s.name" @click="player.playList(songs, i)">
            {{ s.name }}
          </button>
          <span v-if="s.vip" class="badge-vip">VIP</span>
          <span class="artist ellipsis" :title="s.artist">{{ s.artist }}</span>
        </span>

        <span class="c-album ellipsis" :title="s.album">{{ s.album }}</span>

        <span v-if="showPlatform" class="c-plat">
          <i class="plat-tag" :class="'plat-' + s.platform">{{ PLAT_NAME[s.platform] || s.platform }}</i>
        </span>

        <span class="c-dur">{{ fmtTime((s.duration || 0) / 1000) }}</span>

        <button
          class="c-fav"
          :class="{ on: favStore.has(s) }"
          :title="favStore.has(s) ? '取消收藏' : '加入混合收藏'"
          @click.stop="favStore.toggle(s)"
        >♥</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.song-table { display: flex; flex-direction: column; }

.thead, .row {
  display: grid;
  grid-template-columns: 44px minmax(200px, 2.2fr) minmax(120px, 1.4fr) 76px 62px 44px;
  align-items: center;
  gap: 8px;
}
.thead {
  height: 32px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--text-3);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--panel);
  z-index: 2;
}

.row {
  height: 42px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-2);
  cursor: default;
}
.row:nth-child(even) { background: rgba(0, 0, 0, 0.012); }
.row:hover { background: var(--hover); }
.row.cur { color: var(--brand); background: var(--brand-soft); }
.row.cur .artist { color: var(--brand); opacity: 0.7; }

.c-idx { text-align: center; color: var(--text-3); font-size: 12px; }
.row.cur .c-idx { color: var(--brand); }
.playing-dot { font-size: 13px; }

.c-name { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--text); }
.row.cur .c-name { color: var(--brand); }
.name-btn {
  font-size: 13px;
  text-align: left;
  color: inherit;
  max-width: 60%;
}
.name-btn:hover { text-decoration: underline; }
.artist { color: var(--text-3); font-size: 12px; flex: none; max-width: 42%; }

.c-album { font-size: 12px; color: var(--text-3); }
.c-plat { text-align: center; }
.c-dur { text-align: right; color: var(--text-3); font-size: 12px; }

.c-fav {
  font-size: 14px;
  color: var(--text-3);
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}
.row:hover .c-fav { opacity: 1; }
.c-fav.on { opacity: 1; color: var(--brand); }

.empty {
  padding: 48px 0;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
}
</style>
