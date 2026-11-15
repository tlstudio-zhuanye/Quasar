<script setup>
/**
 * TileGrid.vue — Folia 式磁贴网格（v1.2.3）
 * 方块磁贴展示专辑/歌单：指针拖动、落点自动吸附到网格（磁性）、顺序本地持久化。
 * 拖动位移 < 5px 视为点击（emit open）；否则交换顺序并保存。
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  items: { type: Array, default: () => [] },     // [{id,title,cover,sub}]
  tileKey: { type: String, default: 'default' }, // 持久化命名空间
  cell: { type: Number, default: 150 },          // 磁贴宽
  gap: { type: Number, default: 16 }
})
const emit = defineEmits(['open'])

const box = ref(null)
const order = ref([])          // id 数组（网格顺序）
const cols = ref(4)
const draggingId = ref(null)
const dragPos = ref({ x: 0, y: 0 })
const dragOverId = ref(null)
let start = null
let moved = false

const STORE = `tl-tiles-${props.tileKey}`
const colW = computed(() => props.cell + props.gap)
const rows = computed(() => Math.ceil(order.value.length / cols.value))
const boxStyle = computed(() => ({
  height: (rows.value * colW.value + props.cell * 0.25 - props.gap) + 'px'
}))

const itemMap = computed(() => {
  const m = {}
  for (const it of props.items) m[it.id] = it
  return m
})
const itemsOrdered = computed(() =>
  order.value.map((id) => itemMap.value[id]).filter(Boolean)
)

function load () {
  const ids = props.items.map((i) => i.id)
  if (!ids.length) return
  let saved = []
  try { saved = JSON.parse(localStorage.getItem(STORE) || '[]') } catch (_) {}
  const valid = saved.filter((id) => ids.includes(id))
  const missing = ids.filter((id) => !valid.includes(id))
  order.value = [...valid, ...missing]
}
function save () {
  try { localStorage.setItem(STORE, JSON.stringify(order.value)) } catch (_) {}
}

function recomputeCols () {
  const el = box.value
  if (!el) return
  const w = el.clientWidth
  cols.value = Math.max(2, Math.floor((w + props.gap) / (props.cell + props.gap)))
}

function slotStyle (id) {
  const idx = order.value.indexOf(id)
  const col = idx % cols.value
  const row = Math.floor(idx / cols.value)
  const isDrag = id === draggingId.value
  return {
    width: props.cell + 'px',
    height: props.cell * 1.25 + 'px',
    transform: isDrag
      ? `translate(${dragPos.value.x}px, ${dragPos.value.y}px)`
      : `translate(${col * colW.value}px, ${row * colW.value}px)`,
    zIndex: isDrag ? 50 : 1,
    transition: isDrag ? 'none' : 'transform 0.32s cubic-bezier(.22,.61,.36,1), box-shadow 0.2s'
  }
}

function coverStyle (it) {
  if (it.cover) return { backgroundImage: `url(${it.cover})` }
  const h = Math.floor((it.title || '?').length * 53) % 360
  return { background: `linear-gradient(135deg, hsl(${h} 60% 45%), hsl(${(h + 40) % 360} 60% 35%))` }
}

function onDown (e, id) {
  const el = box.value
  const rect = el.getBoundingClientRect()
  const ir = e.currentTarget.getBoundingClientRect()
  start = {
    px: e.clientX, py: e.clientY,
    ox: ir.left - rect.left, oy: ir.top - rect.top
  }
  draggingId.value = id
  dragPos.value = { x: start.ox, y: start.oy }
  moved = false
  if (e.currentTarget.setPointerCapture) {
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (_) {}
  }
}
function onMove (e) {
  if (!draggingId.value || !start) return
  const dx = e.clientX - start.px
  const dy = e.clientY - start.py
  if (Math.abs(dx) + Math.abs(dy) > 5) moved = true
  dragPos.value = { x: start.ox + dx, y: start.oy + dy }
  // 落点格
  const cx = start.ox + dx + props.cell / 2
  const cy = start.oy + dy + props.cell * 1.25 / 2
  const col = Math.max(0, Math.min(cols.value - 1, Math.round((cx - props.gap / 2) / colW.value)))
  const row = Math.max(0, Math.round((cy - props.gap / 2) / colW.value))
  const targetIdx = Math.min(order.value.length - 1, row * cols.value + col)
  dragOverId.value = order.value[targetIdx]
}
function onUp () {
  if (!draggingId.value || !start) { reset(); return }
  if (moved && dragOverId.value && dragOverId.value !== draggingId.value) {
    const from = order.value.indexOf(draggingId.value)
    const to = order.value.indexOf(dragOverId.value)
    const arr = order.value.slice()
    arr.splice(from, 1)
    arr.splice(to, 0, draggingId.value)
    order.value = arr
    save()
  } else if (!moved) {
    emit('open', itemMap.value[draggingId.value])
  }
  reset()
}
function reset () { draggingId.value = null; dragOverId.value = null; start = null; moved = false }

onMounted(() => { load(); recomputeCols(); window.addEventListener('resize', recomputeCols) })
onUnmounted(() => window.removeEventListener('resize', recomputeCols))
watch(() => props.items.map((i) => i.id).join('|'), () => {
  // items 异步到达时按已保存顺序装载（已装载过则跳过）
  if (!order.value.length) load()
  else {
    const ids = props.items.map((i) => i.id)
    if (!ids.every((id) => order.value.includes(id))) load()
  }
}, { immediate: true })
</script>

<template>
  <div class="tilebox" ref="box" :style="boxStyle">
    <div
      v-for="it in itemsOrdered"
      :key="it.id"
      class="tile"
      :class="{ drag: it.id === draggingId, over: it.id === dragOverId && it.id !== draggingId }"
      :style="slotStyle(it.id)"
      @pointerdown="onDown($event, it.id)"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <div class="cover" :style="coverStyle(it)">
        <span v-if="!it.cover" class="ph">{{ (it.title || '?').slice(0, 1) }}</span>
      </div>
      <div class="t ellipsis">{{ it.title }}</div>
      <div class="s ellipsis" v-if="it.sub">{{ it.sub }}</div>
    </div>
    <div v-if="!itemsOrdered.length" class="tile-empty">暂无磁贴</div>
  </div>
</template>

<style scoped>
.tilebox {
  position: relative;
  width: 100%;
  overflow: hidden;
  margin-bottom: 8px;
}
.tile {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--panel-2, #16181f);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  cursor: grab;
  user-select: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
}
.tile:active { cursor: grabbing; }
.tile.drag {
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.55);
  filter: brightness(1.08);
}
.tile.over {
  outline: 2px dashed var(--brand, #5b8cff);
  outline-offset: -2px;
}
.cover {
  flex: 1;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.cover .ph {
  font-size: 34px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
}
.t {
  padding: 6px 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #eee);
}
.s {
  padding: 2px 8px 8px;
  font-size: 11px;
  color: var(--text-3, rgba(255, 255, 255, 0.45));
}
.tile-empty {
  color: var(--text-3, rgba(255, 255, 255, 0.4));
  font-size: 13px;
  padding: 20px 4px;
}
</style>
