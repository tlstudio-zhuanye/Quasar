<script setup>
/**
 * EQPanel.vue — 5 段图形均衡器（v1.2.9）
 * Web Audio BiquadFilter，增益 -12~+12 dB。切换预设 / 手拖滑块。
 * 关闭 EQ 时滤波 gain 归零 = 原声（createMediaElementSource 不可逆）。
 */
import { computed, onMounted } from 'vue'
import { usePlayerStore, EQ_PRESET_NAMES, EQ_BAND_FREQS } from '../stores/player'

const player = usePlayerStore()
const bands = computed(() => player.eq.bands.length ? player.eq.bands : [0, 0, 0, 0, 0])

const PRESET_LABEL = {
  flat: '原声', pop: '流行', rock: '摇滚', jazz: '爵士',
  classic: '古典', vocal: '人声', electronic: '电子', acoustic: '民谣'
}
const fmtFreq = (f) => f >= 1000 ? (f / 1000) + 'k' : String(f)
const fmtGain = (g) => (g > 0 ? '+' : '') + Number(g).toFixed(1)

function onSlider (idx, e) {
  player.setEqBand(idx, Number(e.target.value))
}

onMounted(() => {
  // 面板首次打开且 bands 为空时给一份默认
  if (!player.eq.bands.length) player.setEqPreset(player.eq.preset || 'flat')
})
</script>

<template>
  <div class="eq-win">
    <div class="eq-hd">
      <span class="eq-title">均衡器 <small>5 段</small></span>
      <label class="eq-switch">
        <input type="checkbox" :checked="player.eq.enabled" @change="player.setEqEnabled($event.target.checked)" />
        <span class="eq-track"></span>
        <span class="eq-state">{{ player.eq.enabled ? '开启' : '关闭' }}</span>
      </label>
    </div>

    <div class="eq-presets">
      <button
        v-for="name in EQ_PRESET_NAMES"
        :key="name"
        class="preset"
        :class="{ on: player.eq.preset === name }"
        @click="player.setEqPreset(name)"
      >{{ PRESET_LABEL[name] || name }}</button>
    </div>

    <div class="eq-bands">
      <div v-for="(f, i) in EQ_BAND_FREQS" :key="f" class="band">
        <span class="gain">{{ fmtGain(bands[i]) }}</span>
        <div class="slider-col">
          <input
            class="band-slider"
            type="range" min="-12" max="12" step="0.5"
            :value="bands[i]"
            :disabled="!player.eq.enabled"
            @input="onSlider(i, $event)"
          />
        </div>
        <span class="freq">{{ fmtFreq(f) }}</span>
      </div>
      <div class="band-scale"><span>+12</span><span>0</span><span>-12</span></div>
    </div>

    <div class="eq-tip">关掉 EQ 即恢复原声 · 设置自动保存</div>
  </div>
</template>

<style scoped>
.eq-win {
  width: 300px;
  background: var(--panel, #1e2027);
  border: 1px solid var(--border, #333);
  border-radius: 12px;
  padding: 14px 16px 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
.eq-hd { display: flex; align-items: center; justify-content: space-between; }
.eq-title { font-size: 14px; font-weight: 600; color: var(--text, #eee); }
.eq-title small { font-size: 10px; color: var(--text-3, #888); font-weight: 400; margin-left: 4px; }
.eq-switch { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.eq-switch input { display: none; }
.eq-track {
  width: 30px; height: 16px; border-radius: 8px;
  background: var(--active, #444); position: relative; transition: background 0.18s;
}
.eq-track::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 12px; height: 12px; border-radius: 50%; background: #fff;
  transition: transform 0.18s;
}
.eq-switch input:checked + .eq-track { background: var(--brand, #5a8cff); }
.eq-switch input:checked + .eq-track::after { transform: translateX(14px); }
.eq-state { font-size: 11px; color: var(--text-2, #bbb); }

.eq-presets {
  display: flex; flex-wrap: wrap; gap: 5px;
  margin: 12px 0 14px;
}
.preset {
  padding: 4px 9px; border-radius: 12px; font-size: 11px;
  border: 1px solid var(--border, #444); color: var(--text-2, #bbb);
  transition: all 0.14s;
}
.preset:hover { border-color: var(--brand, #5a8cff); color: var(--brand, #5a8cff); }
.preset.on { background: var(--brand, #5a8cff); border-color: var(--brand, #5a8cff); color: #fff; }

.eq-bands { display: flex; align-items: flex-end; gap: 6px; height: 130px; }
.band { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.gain { font-size: 10px; color: var(--text-3, #888); height: 16px; }
.slider-col { flex: 1; display: flex; align-items: center; }
.band-slider {
  writing-mode: vertical-lr;
  direction: rtl;
  width: 6px; height: 100%;
  -webkit-appearance: none;
  appearance: none;
  background: var(--active, #444);
  border-radius: 3px;
  cursor: pointer;
}
.band-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px; height: 8px;
  background: var(--brand, #5a8cff);
  border-radius: 3px;
}
.band-slider:disabled { opacity: 0.45; cursor: not-allowed; }
.freq { font-size: 10px; color: var(--text-2, #bbb); margin-top: 5px; }
.band-scale {
  display: flex; flex-direction: column; justify-content: space-between;
  height: 100%; font-size: 9px; color: var(--text-3, #666);
  padding-bottom: 20px;
}
.eq-tip { margin-top: 10px; font-size: 10px; color: var(--text-3, #777); text-align: center; }
</style>
