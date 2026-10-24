<script setup>
import { computed, onMounted, ref } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useFavStore } from '../stores/favorites'
import { fmtTime } from '../utils/lrc'

const player = usePlayerStore()
const favStore = useFavStore()
const onTop = ref(true)
const win = window.TL.win

onMounted(async () => {
  await player.init()
  favStore.load()
  onTop.value = await win.isAlwaysOnTop()
})

const cover = computed(() => (player.current && player.current.cover) || '')
const name = computed(() => (player.current && player.current.name) || '未在播放')
const artist = computed(() => (player.current && player.current.artist) || 'Quasar')

function seek (e) {
  const r = e.currentTarget.getBoundingClientRect()
  if (!player.duration) return
  player.seek(((e.clientX - r.left) / r.width) * player.duration)
}

async function toggleTop () {
  onTop.value = await win.setAlwaysOnTop(!onTop.value)
}
</script>

<template>
  <div class="mini">
    <!-- 封面铺底（模糊放大） -->
    <div class="bg" :style="cover ? { backgroundImage: `url('${cover}')` } : {}"></div>
    <div class="shade"></div>

    <!-- 顶部：拖动区 + 标题 + 操作 -->
    <header class="top drag">
      <div class="head">
        <span class="dot"></span>
        <span class="title ellipsis">{{ name }}</span>
      </div>
      <div class="acts nodrag">
        <button :class="{ on: onTop }" title="窗口置顶" @click="toggleTop">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M6 2h4l-.6 4.2 2.6 2.1H4l2.6-2.1L6 2z" />
            <line x1="8" y1="8.3" x2="8" y2="14" />
          </svg>
        </button>
        <button title="返回主界面" @click="win.exitMini()">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M6 2H3v3M10 14h3v-3M2.5 6.5 6 3M13.5 9.5 10 13" />
          </svg>
        </button>
        <button title="关闭" @click="win.close()">
          <svg width="13" height="13" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
          </svg>
        </button>
      </div>
    </header>

    <!-- 中部：封面 + 歌手 -->
    <div class="mid nodrag" @click="player.toggle()">
      <div class="art" :class="{ spin: player.playing }" :style="cover ? { backgroundImage: `url('${cover}')` } : {}">
        <span v-if="!cover" class="ph">♪</span>
      </div>
      <div class="artist ellipsis">{{ artist }}</div>
      <div v-if="player.error" class="err ellipsis" :title="player.error">{{ player.error }}</div>
    </div>

    <!-- 底部：进度 + 控制 -->
    <footer class="bottom nodrag">
      <div class="prog" @click="seek">
        <div class="fill" :style="{ width: player.percent + '%' }"></div>
      </div>
      <div class="times">
        <span>{{ fmtTime(player.progress) }}</span>
        <span>{{ fmtTime(player.duration) }}</span>
      </div>

      <div class="ctrl">
        <button
          class="side fav" :class="{ on: player.current && favStore.has(player.current) }"
          :disabled="!player.current"
          title="收藏"
          @click="favStore.toggle(player.current)"
        >♥</button>

        <button class="side" title="上一首" :disabled="!player.current" @click="player.prev()">⏮</button>
        <button class="play" :title="player.playing ? '暂停' : '播放'" :disabled="!player.current" @click="player.toggle()">
          <span v-if="player.loading">◌</span>
          <span v-else-if="player.playing">❚❚</span>
          <span v-else>▶</span>
        </button>
        <button class="side" title="下一首" :disabled="!player.current" @click="player.next()">⏭</button>

        <div class="vol">
          <span class="vico">{{ player.volume === 0 ? '🔇' : player.volume < 0.5 ? '🔉' : '🔊' }}</span>
          <input
            type="range" min="0" max="1" step="0.01"
            :value="player.volume"
            @input="player.setVolume($event.target.value)"
          />
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.mini {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #14151a;
  color: #fff;
  font-size: 12px;
}

.bg {
  position: absolute;
  inset: -25%;
  background-size: cover;
  background-position: center;
  filter: blur(30px) saturate(1.4) brightness(0.5);
  transition: background-image 0.4s;
}
.shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.45) 0%,
    rgba(0, 0, 0, 0.12) 38%,
    rgba(0, 0, 0, 0.62) 100%
  );
}

/* ---- 顶部 ---- */
.top {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px 9px 12px;
  flex: none;
}
.head { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1; }
.dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 8px var(--brand);
  flex: none;
}
.title { font-size: 12px; letter-spacing: 0.3px; }

.acts { display: flex; gap: 1px; }
.acts button {
  display: grid;
  place-items: center;
  width: 24px; height: 24px;
  border-radius: 5px;
  color: rgba(255, 255, 255, 0.72);
}
.acts button:hover { background: rgba(255, 255, 255, 0.16); color: #fff; }
.acts button.on { color: var(--brand); }

/* ---- 中部 ---- */
.mid {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 4px 22px 8px;
  min-height: 0;
  cursor: pointer;
}
.art {
  width: min(190px, 76%);
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.06);
  background-size: cover;
  background-position: center;
  display: grid;
  place-items: center;
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.6), 0 0 0 6px rgba(255, 255, 255, 0.05);
  transition: transform 0.3s;
}
.art.spin { animation: revolve 22s linear infinite; }
@keyframes revolve { to { transform: rotate(360deg); } }
.art .ph { font-size: 40px; color: rgba(255, 255, 255, 0.28); }
.artist {
  max-width: 100%;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
}
.err {
  max-width: 100%;
  font-size: 11px;
  color: #ff8a8a;
}

/* ---- 底部 ---- */
.bottom {
  position: relative;
  flex: none;
  padding: 8px 14px 14px;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(14px);
}
.prog {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.22);
  cursor: pointer;
  overflow: hidden;
}
.fill { height: 100%; background: var(--brand); border-radius: 2px; }

.times {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
}

.ctrl {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 6px;
}
.side {
  display: grid; place-items: center;
  width: 28px; height: 28px;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 14px;
}
.side:hover:not(:disabled) { background: rgba(255, 255, 255, 0.15); color: #fff; }
.side:disabled { opacity: 0.3; }
.side.fav.on { color: var(--brand); }

.play {
  display: grid; place-items: center;
  width: 42px; height: 42px;
  margin: 0 4px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-size: 14px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.42);
}
.play:hover:not(:disabled) { background: var(--brand-dark); }
.play:disabled { opacity: 0.45; }

.vol { display: flex; align-items: center; gap: 4px; margin-left: 6px; }
.vico { font-size: 12px; }
.vol input {
  width: 54px;
  height: 3px;
  -webkit-appearance: none;
  background: rgba(255, 255, 255, 0.26);
  border-radius: 2px;
  cursor: pointer;
}
.vol input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #fff;
}
</style>
