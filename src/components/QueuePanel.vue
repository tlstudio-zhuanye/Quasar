<script setup>
/**
 * QueuePanel.vue — 播放队列管理（v1.2.9）
 * 显示当前队列，点歌跳转、移除、清空、拖拽排序。纯本地状态，改完立即生效。
 */
import { ref, computed } from 'vue'
import { usePlayerStore } from '../stores/player'

const player = usePlayerStore()

const dragIdx = ref(-1)
const overIdx = ref(-1)

const list = computed(() => player.queue)

function onDragStart (i, e) {
  dragIdx.value = i
  e.dataTransfer.effectAllowed = 'move'
  try { e.dataTransfer.setData('text/plain', String(i)) } catch (_) {}
}
function onDragOver (i, e) {
  e.preventDefault()
  overIdx.value = i
}
function onDrop (i) {
  if (dragIdx.value >= 0) player.move(dragIdx.value, i)
  dragIdx.value = -1
  overIdx.value = -1
}
function onDragEnd () { dragIdx.value = -1; overIdx.value = -1 }

function label (s) {
  return `${s.name || '未知'}${s.artist ? ' — ' + s.artist : ''}${s.platform === 'qq' ? ' [QQ]' : ' [网易]'}`
}
</script>

<template>
  <div class="q-backdrop" @click.self="player.closeQueue()">
    <div class="q-win">
      <div class="q-hd">
        <span class="q-title">播放队列 <small>{{ list.length }} 首</small></span>
        <button class="q-x" title="关闭" @click="player.closeQueue()">✕</button>
      </div>

      <div v-if="!list.length" class="q-empty">队列是空的。去搜索点一首歌开始播放。</div>

      <div v-else class="q-list">
        <div
          v-for="(s, i) in list"
          :key="s.key + '-' + i"
          class="q-row"
          :class="{ on: i === player.index, drag: dragIdx === i, over: overIdx === i }"
          draggable="true"
          @dragstart="onDragStart(i, $event)"
          @dragover="onDragOver(i, $event)"
          @drop="onDrop(i)"
          @dragend="onDragEnd"
          @dblclick="player.playIndex(i)"
        >
          <span class="q-num">⋮⋮</span>
          <span class="q-idx">{{ i + 1 }}</span>
          <span class="q-name ellipsis" :title="label(s)">
            {{ s.name || '未知歌曲' }}
            <span class="q-artist">{{ s.artist || '' }}</span>
          </span>
          <span class="q-plat" :class="'p-' + s.platform">
            {{ s.platform === 'qq' ? 'Q' : '网' }}
          </span>
          <button
            class="q-play"
            :title="i === player.index && player.playing ? '正在播放' : '播放这首'"
            @click="player.playIndex(i)"
          >{{ i === player.index && player.playing ? '♪' : '▶' }}</button>
          <button class="q-del" title="从队列移除" @click="player.removeAt(i)">✕</button>
        </div>
      </div>

      <div v-if="list.length" class="q-foot">
        <span class="q-hint">拖拽排序 · 双击播放</span>
        <button class="q-clear" @click="player.clearQueue()">清空队列</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.q-backdrop {
  position: fixed; inset: 0; z-index: 480;
  background: rgba(0, 0, 0, 0.55);
  display: grid; place-items: center;
}
.q-win {
  width: min(560px, 92vw);
  max-height: 78vh;
  display: flex; flex-direction: column;
  background: var(--panel, #1e2027);
  border: 1px solid var(--border, #333);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.5);
}
.q-hd {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border, #333);
}
.q-title { font-size: 15px; font-weight: 600; color: var(--text, #eee); }
.q-title small { font-size: 11px; color: var(--text-3, #888); font-weight: 400; margin-left: 6px; }
.q-x { color: var(--text-3, #888); font-size: 14px; }
.q-x:hover { color: var(--text, #eee); }

.q-list { flex: 1; overflow-y: auto; padding: 8px 10px; }
.q-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: default;
  transition: background 0.14s;
}
.q-row:hover { background: var(--hover, #2a2d36); }
.q-row.on { background: var(--brand-soft, rgba(90, 140, 255, 0.14)); }
.q-row.drag { opacity: 0.4; }
.q-row.over { box-shadow: inset 0 2px 0 var(--brand, #5a8cff); }
.q-num { color: var(--text-3, #888); font-size: 11px; letter-spacing: -2px; cursor: grab; user-select: none; }
.q-idx { width: 22px; text-align: right; color: var(--text-3, #888); font-size: 11px; }
.q-row.on .q-idx { color: var(--brand, #5a8cff); }
.q-name { flex: 1; min-width: 0; font-size: 13px; color: var(--text, #eee); }
.q-artist { color: var(--text-3, #888); font-size: 11px; margin-left: 6px; }
.q-plat {
  font-size: 10px; padding: 1px 5px; border-radius: 4px; flex: none;
  background: var(--active, #333); color: var(--text-2, #bbb);
}
.q-plat.p-netease { color: #e64848; }
.q-plat.p-qq { color: #4ea1ff; }
.q-play, .q-del {
  width: 26px; height: 26px; flex: none; border-radius: 6px;
  color: var(--text-2, #bbb); font-size: 12px;
}
.q-play:hover { background: var(--brand, #5a8cff); color: #fff; }
.q-del:hover { background: rgba(230, 72, 72, 0.2); color: #e64848; }
.q-row.on .q-play { color: var(--brand, #5a8cff); }

.q-foot {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 18px;
  border-top: 1px solid var(--border, #333);
}
.q-hint { font-size: 11px; color: var(--text-3, #888); }
.q-clear {
  padding: 5px 14px; border-radius: 14px; font-size: 12px;
  border: 1px solid var(--border, #444); color: var(--text-2, #bbb);
}
.q-clear:hover { border-color: #e64848; color: #e64848; }
.q-empty { padding: 50px 20px; text-align: center; color: var(--text-3, #888); font-size: 13px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
