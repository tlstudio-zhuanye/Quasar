<script setup>
/**
 * LyricStage.vue — 全屏沉浸式歌词舞台（v1.2.0）
 * Folia 式体验：封面放大模糊铺底、封面取色主题、三行视口、
 * 逐字卡拉OK高亮（网易云 YRC），60fps rAF 驱动。
 * 进入：PlayerBar「⛶」按钮 / 双击封面；退出：ESC / ✕ 按钮。
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { usePlayerStore, getAudio } from '../stores/player'
import { lineIndexAt, wordProgress, fmtTime } from '../utils/lyrics'

const emit = defineEmits(['close'])
const player = usePlayerStore()

/* ---- 播放位置（rAF 60fps，不走 store 的 4Hz timeupdate） ---- */
const sec = ref(0)
let raf = 0
function tick () {
  const a = getAudio()
  if (a && isFinite(a.currentTime)) sec.value = a.currentTime
  raf = requestAnimationFrame(tick)
}
onMounted(() => {
  raf = requestAnimationFrame(tick)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('keydown', onKey)
})
function onKey (e) {
  if (e.key === 'Escape') emit('close')
}

/* ---- 歌词三行视口 ---- */
const curIndex = computed(() => lineIndexAt(player.lyric, sec.value))
const curLine = computed(() => (curIndex.value >= 0 ? player.lyric[curIndex.value] : null))
const prevLine = computed(() => (curIndex.value > 0 ? player.lyric[curIndex.value - 1] : null))
const nextLine = computed(() => {
  const i = curIndex.value
  return i >= 0 && i + 1 < player.lyric.length ? player.lyric[i + 1] : null
})
const wordByWord = computed(() => !!(curLine.value && curLine.value.words && curLine.value.words.length))

/** 逐字渲染：词内 0~100% 填充进度 */
function wordPct (w) {
  const { index, progress } = wordProgress(curLine.value, sec.value)
  if (index < 0) return 0
  const cw = curLine.value.words[index]
  if (cw !== w) {
    // 非当前词：已唱完 100%，未开始 0%
    return sec.value >= w.end ? 100 : 0
  }
  return Math.round(progress * 100)
}

/* ---- 封面取色主题 ---- */
const accent = ref('#5b8cff')
const cover = computed(() => (player.current && player.current.cover) || '')
watch(cover, (url) => { if (url) pickAccent(url) }, { immediate: true })

function pickAccent (url) {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    try {
      const c = document.createElement('canvas')
      c.width = 32; c.height = 32
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, 32, 32)
      const d = ctx.getImageData(0, 0, 32, 32).data
      let best = null
      let bestScore = -1
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]; const g = d[i + 1]; const b = d[i + 2]
        const max = Math.max(r, g, b); const min = Math.min(r, g, b)
        if (max === 0) continue
        const sat = (max - min) / max
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if (lum < 40 || lum > 225) continue
        const score = sat * 1.3 + lum / 255 * 0.35
        if (score > bestScore) { bestScore = score; best = [r, g, b] }
      }
      if (best) {
        // 保证暗背景上的可读性：整体提亮到中等亮度
        const [r, g, b] = best
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        const k = lum < 90 ? Math.min(1.9, 110 / Math.max(lum, 1)) : 1
        accent.value = `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`
      }
    } catch (_) { /* CORS 污染等情况用默认色 */ }
  }
  img.src = url
}

/* ---- 底部信息 ---- */
const name = computed(() => (player.current && player.current.name) || '未在播放')
const artist = computed(() => (player.current && player.current.artist) || '—')
const album = computed(() => (player.current && player.current.album) || '')
const percent = computed(() => (player.duration ? Math.min(100, (sec.value / player.duration) * 100) : 0))
</script>

<template>
  <div class="stage" :class="{ 'no-cover': !cover }" :style="{ '--accent': accent }">
    <!-- 背景：封面放大模糊 -->
    <div v-if="cover" class="bg" :style="{ backgroundImage: `url(${cover})` }"></div>
    <div class="veil"></div>

    <!-- 退出 -->
    <button class="exit" title="退出全屏歌词（ESC）" @click="emit('close')">✕</button>

    <!-- 空态：还没有开始播放（无歌曲时整屏近黑会被当成黑屏，必须给明确引导） -->
    <div v-if="!player.current" class="emptystate">
      <div class="ei">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <div class="et">还没有在播放的歌曲</div>
      <div class="es">去列表里点一首开始播放<br>播放时双击封面或点 ⛶ 就能进入歌词舞台</div>
      <button class="back" @click="emit('close')">返回主界面（ESC）</button>
    </div>

    <!-- 歌词三行视口：上一行 / 当前行 / 下一行 -->
    <div v-else class="lyrics">
      <div v-if="prevLine" class="row prev">{{ prevLine.text }}</div>

      <div v-if="curLine" class="row cur">
        <div v-if="wordByWord" class="words">
          <span v-for="(w, i) in curLine.words" :key="i" class="w">
            <span class="base">{{ w.text }}</span>
            <span class="fill" :style="{ width: wordPct(w) + '%' }">{{ w.text }}</span>
          </span>
        </div>
        <div v-else class="plain">{{ curLine.text }}</div>
        <div v-if="curLine.trans" class="tr">{{ curLine.trans }}</div>
      </div>
      <div v-else-if="!player.lyric.length" class="row cur empty">暂无歌词</div>
      <div v-else class="row cur empty">· · ·</div>

      <div v-if="nextLine" class="row next">{{ nextLine.text }}</div>
    </div>

    <!-- 底部：歌曲信息 + 进度 -->
    <div v-if="player.current" class="foot">
      <div class="meta">
        <span class="nm ellipsis">{{ name }}</span>
        <span class="ar ellipsis">{{ artist }}<template v-if="album"> · {{ album }}</template></span>
      </div>
      <div class="bar">
        <span class="tm">{{ fmtTime(sec) }}</span>
        <div class="track"><div class="fill" :style="{ width: percent + '%' }"></div></div>
        <span class="tm">{{ fmtTime(player.duration) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: fixed;
  inset: 0;
  z-index: 200;
  overflow: hidden;
  background: #0b0d12;
  color: #fff;
  display: flex;
  flex-direction: column;
  user-select: none;
}
/* 无封面时：用主题色铺一层氛围光，避免整屏纯黑被当成黑屏 */
.stage.no-cover {
  background:
    radial-gradient(ellipse 85% 55% at 50% 26%, color-mix(in srgb, var(--accent) 26%, transparent) 0%, transparent 72%),
    radial-gradient(ellipse 55% 42% at 84% 88%, color-mix(in srgb, var(--accent) 13%, transparent) 0%, transparent 70%),
    #0b0d12;
}

/* 封面模糊背景 */
.bg {
  position: absolute;
  inset: -8%;
  background-size: cover;
  background-position: center;
  filter: blur(64px) saturate(1.5) brightness(0.85);
  transform: scale(1.15);
  transition: background-image 0.6s;
}
.veil {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 38%, transparent 0%, rgba(8, 9, 14, 0.55) 78%),
    linear-gradient(180deg, rgba(8, 9, 14, 0.5) 0%, rgba(8, 9, 14, 0.2) 35%, rgba(8, 9, 14, 0.82) 100%);
}

/* 退出按钮 */
.exit {
  position: absolute;
  top: 18px;
  right: 20px;
  z-index: 2;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.75);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.exit:hover { background: rgba(255, 255, 255, 0.14); color: #fff; }

/* 歌词区 */
.lyrics {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 0 9vw;
  text-align: center;
}
.row {
  max-width: 100%;
  transition: opacity 0.35s, transform 0.35s, filter 0.35s;
  line-height: 1.45;
}
.row.prev, .row.next {
  font-size: clamp(15px, 1.9vw, 21px);
  color: rgba(255, 255, 255, 0.32);
  filter: blur(0.4px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 82vw;
}
.row.cur {
  font-size: clamp(24px, 3.4vw, 44px);
  font-weight: 700;
  letter-spacing: 0.02em;
  text-shadow: 0 4px 30px rgba(0, 0, 0, 0.45);
  max-width: 86vw;
}
.row.empty {
  font-size: clamp(18px, 2.4vw, 28px);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.4);
}
.row.cur .tr {
  margin-top: 14px;
  font-size: clamp(14px, 1.6vw, 19px);
  font-weight: 400;
  color: rgba(255, 255, 255, 0.62);
}

/* 空态：无歌曲时的引导 */
.emptystate {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 0 9vw;
  text-align: center;
}
.emptystate .ei { color: rgba(255, 255, 255, 0.32); }
.emptystate .et {
  font-size: clamp(20px, 2.6vw, 30px);
  font-weight: 700;
  letter-spacing: 0.02em;
}
.emptystate .es {
  font-size: clamp(13px, 1.4vw, 15px);
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.55);
}
.emptystate .back {
  margin-top: 10px;
  padding: 9px 24px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.emptystate .back:hover { background: rgba(255, 255, 255, 0.16); color: #fff; }

/* 逐字卡拉OK */
.words {
  white-space: pre-wrap;
  word-break: break-word;
}
.w {
  position: relative;
  display: inline-block;
  white-space: pre-wrap;
  margin-right: 0.08em;
}
.w .base {
  color: rgba(255, 255, 255, 0.34);
}
.w .fill {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--accent);
  filter: drop-shadow(0 0 14px color-mix(in srgb, var(--accent) 55%, transparent));
  transition: width 0.09s linear;
}

/* 底部信息 + 进度 */
.foot {
  position: relative;
  z-index: 1;
  flex: none;
  padding: 0 7vw 26px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.meta { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.meta .nm { font-size: 15px; font-weight: 600; max-width: 70vw; }
.meta .ar { font-size: 12px; color: rgba(255, 255, 255, 0.55); max-width: 70vw; }
.bar { display: flex; align-items: center; gap: 12px; }
.bar .tm { font-size: 11px; color: rgba(255, 255, 255, 0.5); width: 36px; text-align: center; flex: none; }
.bar .track {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}
.bar .fill {
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 60%, transparent);
}
</style>
