<script setup>
import { computed } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useFavStore } from '../stores/favorites'
import { fmtTime } from '../utils/lrc'

defineProps({
  showLyric: { type: Boolean, default: false },
  showStage: { type: Boolean, default: false }
})
const emit = defineEmits(['toggle-lyric', 'toggle-stage'])

const player = usePlayerStore()
const favStore = useFavStore()
const win = window.TL.win

const cover = computed(() => (player.current && player.current.cover) || '')
const name = computed(() => (player.current && player.current.name) || '未在播放')
const artist = computed(() => (player.current && player.current.artist) || '—')
const curFaved = computed(() => (player.current ? favStore.has(player.current) : false))

const REPEAT_ICON = { list: '↻', one: '↻¹', shuffle: '⇄' }

function seekClick (e) {
  const r = e.currentTarget.getBoundingClientRect()
  if (!player.duration) return
  player.seek(((e.clientX - r.left) / r.width) * player.duration)
}

function dragSeek (e) {
  if (e.buttons !== 1) return
  seekClick(e)
}
</script>

<template>
  <footer class="player-bar">
    <!-- 左：封面 + 信息 -->
    <div class="left">
      <div class="cover" title="双击进入全屏歌词舞台" @dblclick="emit('toggle-stage')">
        <img v-if="cover" :src="cover" alt="" />
        <span v-else class="ph">♪</span>
      </div>
      <div class="meta">
        <div class="t ellipsis" :title="name">
          {{ name }}
          <span v-if="player.current && player.current.vip" class="badge-vip">VIP</span>
        </div>
        <div class="s ellipsis">{{ artist }}</div>
      </div>
      <button
        class="ic fav"
        :class="{ on: curFaved }"
        title="加入混合收藏"
        :disabled="!player.current"
        @click="player.current && favStore.toggle(player.current)"
      >♥</button>
    </div>

    <!-- 中：控制 + 进度 -->
    <div class="center">
      <div class="btns">
        <button class="ic" title="上一首" :disabled="!player.current" @click="player.prev()">⏮</button>
        <button
          class="ic big"
          :title="player.playing ? '暂停' : '播放'"
          :disabled="!player.current"
          @click="player.toggle()"
        >
          <span v-if="player.loading" class="spin">◌</span>
          <span v-else>{{ player.playing ? '⏸' : '▶' }}</span>
        </button>
        <button class="ic" title="下一首" :disabled="!player.current" @click="player.next()">⏭</button>
      </div>

      <div class="progress-wrap">
        <span class="time">{{ fmtTime(player.progress) }}</span>
        <div class="progress" @click="seekClick" @mousemove="dragSeek">
          <div class="track">
            <div class="fill" :style="{ width: player.percent + '%' }"></div>
            <div class="knob" :style="{ left: player.percent + '%' }"></div>
          </div>
        </div>
        <span class="time">{{ fmtTime(player.duration) }}</span>
      </div>
    </div>

    <!-- 右：模式 / 音量 / 歌词 / 小窗 -->
    <div class="right">
      <button class="ic" :title="player.repeatLabel" @click="player.cycleRepeat()">
        {{ REPEAT_ICON[player.repeat] }}
      </button>

      <div class="vol">
        <button class="ic" title="静音" @click="player.setVolume(player.volume ? 0 : 0.8)">
          {{ player.volume === 0 ? '🔇' : player.volume < 0.5 ? '🔉' : '🔊' }}
        </button>
        <input
          class="vol-slider"
          type="range" min="0" max="1" step="0.01"
          :value="player.volume"
          @input="player.setVolume($event.target.value)"
        />
      </div>

      <button class="ic" :class="{ on: showLyric }" title="歌词" @click="emit('toggle-lyric')">词</button>

      <button
        class="ic"
        :class="{ on: showStage }"
        title="全屏歌词舞台（也可双击封面）"
        @click="emit('toggle-stage')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
          <path d="M2 6V2.8A0.8 0.8 0 0 1 2.8 2H6M10 2h3.2A0.8 0.8 0 0 1 14 2.8V6M14 10v3.2a0.8 0.8 0 0 1-.8.8H10M6 14H2.8A0.8 0.8 0 0 1 2 13.2V10" />
        </svg>
      </button>

      <button class="ic" title="小窗播放" @click="win.enterMini()">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
          <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" />
          <rect x="7.5" y="8.5" width="6" height="5" rx="1" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </div>
  </footer>
</template>

<style scoped>
.player-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 74px;
  padding: 0 16px;
  flex: none;
  background: var(--player-bar);
  border-top: 1px solid var(--border);
}

/* ---- 左 ---- */
.left { display: flex; align-items: center; gap: 10px; width: 260px; flex: none; }
.cover {
  width: 46px; height: 46px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--hover);
  display: grid; place-items: center;
  flex: none;
}
.cover img { width: 100%; height: 100%; object-fit: cover; }
.cover .ph { color: var(--text-3); font-size: 18px; }
.meta { min-width: 0; flex: 1; }
.meta .t { font-size: 13px; color: var(--text); display: flex; align-items: center; gap: 5px; }
.meta .s { font-size: 11px; color: var(--text-3); margin-top: 2px; }

/* ---- 中 ---- */
.center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.btns { display: flex; align-items: center; gap: 12px; }

.progress-wrap { display: flex; align-items: center; gap: 10px; width: 100%; max-width: 560px; }
.time { font-size: 11px; color: var(--text-3); width: 36px; text-align: center; flex: none; }
.progress { flex: 1; padding: 6px 0; cursor: pointer; }
.track {
  position: relative;
  height: 3px;
  border-radius: 2px;
  background: var(--active);
}
.fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  border-radius: 2px;
  background: var(--brand);
}
.knob {
  position: absolute; top: 50%;
  width: 10px; height: 10px;
  margin-left: -5px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--brand);
  transform: translateY(-50%) scale(0);
  transition: transform 0.15s;
}
.progress:hover .knob { transform: translateY(-50%) scale(1); }

/* ---- 公共图标按钮 ---- */
.ic {
  display: grid; place-items: center;
  min-width: 28px; height: 28px;
  padding: 0 4px;
  border-radius: 6px;
  color: var(--text-2);
  font-size: 15px;
  transition: color 0.15s, background 0.15s;
}
.ic:hover:not(:disabled) { color: var(--text); background: var(--hover); }
.ic.big {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-size: 14px;
}
.ic.big:hover:not(:disabled) { background: var(--brand-dark); color: #fff; }
.ic.fav.on { color: var(--brand); }
.ic.on { color: var(--brand); }
.spin { animation: spin 1s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ---- 右 ---- */
.right { display: flex; align-items: center; gap: 4px; width: 260px; justify-content: flex-end; flex: none; }
.vol { display: flex; align-items: center; gap: 2px; }
.vol-slider {
  width: 68px;
  height: 3px;
  -webkit-appearance: none;
  background: var(--active);
  border-radius: 2px;
  cursor: pointer;
}
.vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--brand);
}
</style>
