<script setup>
import { useModeStore, MODES } from '../stores/mode'

const modeStore = useModeStore()
const win = window.TL.win
</script>

<template>
  <header class="titlebar drag">
    <div class="brand nodrag">
      <span class="mark">♪</span>
      <b>Quasar</b>
    </div>

    <!-- 三模式切换 -->
    <div class="modes nodrag">
      <button
        v-for="m in MODES"
        :key="m.key"
        class="mode-btn"
        :class="{ on: modeStore.mode === m.key }"
        :style="modeStore.mode === m.key
          ? { background: m.color, borderColor: m.color, color: '#fff' }
          : { color: m.color, borderColor: 'transparent' }"
        @click="modeStore.set(m.key)"
      >
        {{ m.short }}
      </button>
    </div>

    <div class="spacer"></div>

    <div class="wbtns nodrag">
      <button class="wb" title="小窗播放" @click="win.enterMini()">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
          <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" />
          <rect x="7.5" y="8.5" width="6" height="5" rx="1" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <button class="wb" title="最小化" @click="win.minimize()">
        <svg width="12" height="12" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.4">
          <line x1="3" y1="8" x2="13" y2="8" />
        </svg>
      </button>
      <button class="wb" title="最大化 / 还原" @click="win.toggleMaximize()">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
          <rect x="3" y="3" width="10" height="10" rx="1.5" />
        </svg>
      </button>
      <button class="wb close" title="退出程序" @click="win.close()">
        <svg width="12" height="12" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5">
          <line x1="4" y1="4" x2="12" y2="12" />
          <line x1="12" y1="4" x2="4" y2="12" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 48px;
  padding: 0 0 0 16px;
  background: var(--bg-elev);
  border-bottom: 1px solid var(--border);
  flex: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  letter-spacing: 0.5px;
}
.brand .mark {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--brand);
  color: #fff;
  font-size: 13px;
  transition: background 0.25s;
}

.modes {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--hover);
  border-radius: 8px;
}
.mode-btn {
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-2);
  transition: all 0.18s;
}
.mode-btn:hover { background: var(--bg-elev); }
.mode-btn.on { font-weight: 600; }

.spacer { flex: 1; }

.wbtns { display: flex; align-items: center; }
.wb {
  display: grid;
  place-items: center;
  width: 44px;
  height: 48px;
  color: var(--text-2);
  transition: background 0.15s, color 0.15s;
}
.wb:hover { background: var(--hover); color: var(--text); }
.wb.close:hover { background: #e81123; color: #fff; }
</style>
