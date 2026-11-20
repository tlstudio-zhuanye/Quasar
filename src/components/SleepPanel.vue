<script setup>
/**
 * SleepPanel.vue — 定时关闭（v1.2.9）
 * 倒计时到点暂停；或「播完当前曲」后停止。纯本地，设置持久化。
 */
import { computed } from 'vue'
import { usePlayerStore } from '../stores/player'

const player = usePlayerStore()

const OPTIONS = [
  { label: '15 分钟', min: 15 },
  { label: '30 分钟', min: 30 },
  { label: '45 分钟', min: 45 },
  { label: '60 分钟', min: 60 },
  { label: '90 分钟', min: 90 }
]

const active = computed(() => !!player.sleep.mode)
const countdown = computed(() => {
  if (player.sleep.mode !== 'timer') return ''
  const s = Math.max(0, player.sleep.remain)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
})
const modeLabel = computed(() => {
  if (player.sleep.mode === 'after-song') return '播完当前曲后停止'
  if (player.sleep.mode === 'timer') return `${countdown.value} 后停止`
  return '未设置'
})

function pick (min) { player.setSleep(min) }
</script>

<template>
  <div class="sleep-win">
    <div class="sleep-hd">
      <span class="sleep-title">定时关闭</span>
      <span v-if="active" class="sleep-live">{{ modeLabel }}</span>
    </div>
    <div class="sleep-opts">
      <button v-for="o in OPTIONS" :key="o.min" class="opt" @click="pick(o.min)">{{ o.label }}</button>
      <button
        class="opt"
        :class="{ on: player.sleep.mode === 'after-song' }"
        @click="player.setSleepAfterSong()"
      >播完当前曲</button>
    </div>
    <button v-if="active" class="sleep-cancel" @click="player.cancelSleep()">取消定时</button>
  </div>
</template>

<style scoped>
.sleep-win {
  width: 250px;
  background: var(--panel, #1e2027);
  border: 1px solid var(--border, #333);
  border-radius: 12px;
  padding: 13px 15px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
.sleep-hd { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
.sleep-title { font-size: 14px; font-weight: 600; color: var(--text, #eee); }
.sleep-live { font-size: 11px; color: var(--brand, #5a8cff); font-variant-numeric: tabular-nums; }
.sleep-opts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.opt {
  padding: 7px 4px; border-radius: 8px; font-size: 11px;
  border: 1px solid var(--border, #444); color: var(--text-2, #bbb);
  text-align: center; transition: all 0.14s;
}
.opt:hover { border-color: var(--brand, #5a8cff); color: var(--brand, #5a8cff); }
.opt.on { background: var(--brand-soft, rgba(90,140,255,0.14)); border-color: var(--brand, #5a8cff); color: var(--brand, #5a8cff); }
.sleep-cancel {
  width: 100%; margin-top: 10px; padding: 7px;
  border-radius: 8px; font-size: 12px;
  color: var(--text-2, #bbb); border: 1px solid var(--border, #444);
}
.sleep-cancel:hover { border-color: #e64848; color: #e64848; }
</style>
