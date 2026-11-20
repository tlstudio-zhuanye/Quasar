<script setup>
/**
 * StatsPanel.vue — 听歌报告（v1.2.9，差异化功能）
 * 基于本地播放事件流 window.TL.db.plays() 统计，纯本地、不上传、不联网。
 * 「网易云年度听歌报告」那种，但数据只在你自己电脑里。
 */
import { ref, computed, onMounted } from 'vue'

const visible = defineModel({ type: Boolean, default: false })

const loading = ref(true)
const plays = ref([])
const tab = ref('overview')

onMounted(async () => {
  try {
    plays.value = (await window.TL.db.plays()) || []
  } catch (_) {
    plays.value = []
  } finally {
    loading.value = false
  }
})

const totalPlays = computed(() => plays.value.length)
const uniqueSongs = computed(() => new Set(plays.value.map((p) => p.key)).size)
const totalMinutes = computed(() =>
  Math.round(plays.value.reduce((s, p) => s + (Number(p.duration) || 0), 0) / 60000)
)

const topArtists = computed(() => {
  const m = new Map()
  for (const p of plays.value) {
    const a = p.artist || '未知歌手'
    m.set(a, (m.get(a) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name, count }))
})

const topSongs = computed(() => {
  const m = new Map()
  for (const p of plays.value) {
    const cur = m.get(p.key) || { key: p.key, name: p.name, artist: p.artist, count: 0 }
    cur.count++
    m.set(p.key, cur)
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 10)
})

const platformStats = computed(() => {
  const m = { netease: 0, qq: 0, other: 0 }
  for (const p of plays.value) {
    if (p.platform === 'netease') m.netease++
    else if (p.platform === 'qq') m.qq++
    else m.other++
  }
  const total = totalPlays.value || 1
  return [
    { key: 'netease', label: '网易云', n: m.netease, pct: Math.round(m.netease / total * 100) },
    { key: 'qq', label: 'QQ 音乐', n: m.qq, pct: Math.round(m.qq / total * 100) },
    { key: 'other', label: '其他', n: m.other, pct: Math.round(m.other / total * 100) }
  ].filter((x) => x.n > 0)
})

const hourStats = computed(() => {
  const h = new Array(24).fill(0)
  for (const p of plays.value) {
    const d = new Date(p.playedAt)
    if (!isNaN(d.getTime())) h[d.getHours()]++
  }
  const max = Math.max(1, ...h)
  return h.map((n, i) => ({ hour: i, n, pct: Math.round(n / max * 100) }))
})

const peakHour = computed(() => {
  let best = -1, bestN = -1
  hourStats.value.forEach((h) => { if (h.n > bestN) { bestN = h.n; best = h.hour } })
  return bestN > 0 ? best : null
})

const dayStats = computed(() => {
  const days = new Array(30).fill(0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (const p of plays.value) {
    const d = new Date(p.playedAt)
    if (isNaN(d.getTime())) continue
    const diff = Math.floor((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000)
    if (diff >= 0 && diff < 30) days[29 - diff]++
  }
  const max = Math.max(1, ...days)
  return days.map((n) => ({ n, pct: Math.round(n / max * 100) }))
})

const firstPlay = computed(() => {
  if (!plays.value.length) return ''
  const t = Math.min(...plays.value.map((p) => p.playedAt))
  return new Date(t).toLocaleDateString('zh-CN')
})

async function clearAll () {
  if (!window.confirm('确定清空全部听歌记录？收藏和播放历史不受影响，此操作不可撤销。')) return
  await window.TL.db.clearPlays()
  plays.value = []
}
</script>

<template>
  <div v-if="visible" class="st-backdrop" @click.self="visible = false">
    <div class="st-win">
      <div class="st-hd">
        <div>
          <span class="st-title">听歌报告</span>
          <span class="st-sub">数据只存在你本机 · 不联网不上传</span>
        </div>
        <button class="st-x" title="关闭" @click="visible = false">✕</button>
      </div>

      <div v-if="loading" class="st-loading">正在整理你的听歌记录…</div>

      <template v-else-if="totalPlays">
        <div class="st-tabs">
          <button :class="{ on: tab === 'overview' }" @click="tab = 'overview'">总览</button>
          <button :class="{ on: tab === 'artists' }" @click="tab = 'artists'">歌手</button>
          <button :class="{ on: tab === 'songs' }" @click="tab = 'songs'">单曲</button>
          <button :class="{ on: tab === 'habits' }" @click="tab = 'habits'">习惯</button>
        </div>

        <div class="st-body">
          <!-- 总览 -->
          <div v-if="tab === 'overview'" class="tab-pane">
            <div class="kpi-grid">
              <div class="kpi">
                <div class="kpi-n">{{ totalPlays }}</div>
                <div class="kpi-l">累计播放次数</div>
              </div>
              <div class="kpi">
                <div class="kpi-n">{{ uniqueSongs }}</div>
                <div class="kpi-l">听过的不同歌曲</div>
              </div>
              <div class="kpi">
                <div class="kpi-n">{{ totalMinutes }}<small>分</small></div>
                <div class="kpi-l">累计时长（约）</div>
              </div>
              <div class="kpi">
                <div class="kpi-n">{{ peakHour !== null ? peakHour + ':00' : '—' }}</div>
                <div class="kpi-l">最活跃时段</div>
              </div>
            </div>

            <div class="block">
              <div class="block-t">平台分布</div>
              <div v-for="p in platformStats" :key="p.key" class="bar-row">
                <span class="bar-l">{{ p.label }}</span>
                <div class="bar-track"><div class="bar-fill" :class="'pf-' + p.key" :style="{ width: p.pct + '%' }"></div></div>
                <span class="bar-r">{{ p.n }} 次 · {{ p.pct }}%</span>
              </div>
            </div>

            <div class="block">
              <div class="block-t">最近 30 天</div>
              <div class="heat">
                <div
                  v-for="(d, i) in dayStats"
                  :key="i"
                  class="heat-cell"
                  :style="{ opacity: d.n ? 0.25 + d.pct / 100 * 0.75 : 0.12 }"
                  :title="d.n + ' 次'"
                ></div>
              </div>
              <div class="heat-legend"><span>30 天前</span><span>今天</span></div>
            </div>

            <div class="st-note">记录始于 {{ firstPlay }} · 已留存最近 5000 条播放事件</div>
          </div>

          <!-- 歌手 -->
          <div v-else-if="tab === 'artists'" class="tab-pane">
            <div v-for="(a, i) in topArtists" :key="a.name" class="rank-row">
              <span class="rank-n" :class="{ top: i < 3 }">{{ i + 1 }}</span>
              <div class="rank-bar" :style="{ width: (a.count / topArtists[0].count * 100) + '%' }"></div>
              <span class="rank-name">{{ a.name }}</span>
              <span class="rank-c">{{ a.count }} 次</span>
            </div>
          </div>

          <!-- 单曲 -->
          <div v-else-if="tab === 'songs'" class="tab-pane">
            <div v-for="(s, i) in topSongs" :key="s.key" class="rank-row">
              <span class="rank-n" :class="{ top: i < 3 }">{{ i + 1 }}</span>
              <span class="rank-name ellipsis">{{ s.name }} <small>{{ s.artist }}</small></span>
              <span class="rank-c">{{ s.count }} 次</span>
            </div>
          </div>

          <!-- 习惯 -->
          <div v-else class="tab-pane">
            <div class="block-t">24 小时播放分布</div>
            <div class="hour-chart">
              <div v-for="h in hourStats" :key="h.hour" class="hour-col" :title="h.hour + ':00 · ' + h.n + ' 次'">
                <div class="hour-fill" :style="{ height: Math.max(2, h.pct) + '%' }"></div>
                <span class="hour-l">{{ h.hour % 6 === 0 ? h.hour : '' }}</span>
              </div>
            </div>
            <div class="st-note">peak 在 {{ peakHour !== null ? peakHour + ':00' : '—' }}。数据来自每一次真实播放，不去重。</div>
          </div>
        </div>

        <div class="st-foot">
          <button class="st-clear" @click="clearAll">清空听歌记录</button>
        </div>
      </template>

      <div v-else class="st-empty">
        <div class="st-empty-ico">♪</div>
        <div>还没有听歌记录</div>
        <div class="st-empty-sub">播放几首歌后，这里就会长出你的听歌画像。</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.st-backdrop {
  position: fixed; inset: 0; z-index: 490;
  background: rgba(0, 0, 0, 0.6);
  display: grid; place-items: center;
}
.st-win {
  width: min(660px, 94vw); max-height: 84vh;
  display: flex; flex-direction: column;
  background: var(--panel, #1e2027);
  border: 1px solid var(--border, #333);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 70px rgba(0, 0, 0, 0.55);
}
.st-hd {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border, #333);
}
.st-title { font-size: 17px; font-weight: 700; color: var(--text, #eee); display: block; }
.st-sub { font-size: 11px; color: var(--text-3, #888); }
.st-x { color: var(--text-3, #888); font-size: 15px; }
.st-x:hover { color: var(--text, #eee); }

.st-tabs { display: flex; gap: 6px; padding: 12px 22px 0; }
.st-tabs button {
  padding: 6px 14px; border-radius: 14px; font-size: 12px;
  color: var(--text-2, #bbb); border: 1px solid transparent;
}
.st-tabs button:hover { background: var(--hover, #2a2d36); }
.st-tabs button.on { background: var(--brand-soft, rgba(90,140,255,0.14)); color: var(--brand, #5a8cff); border-color: var(--brand, #5a8cff); }

.st-body { flex: 1; overflow-y: auto; padding: 18px 22px; }
.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
.kpi {
  padding: 14px 10px; border-radius: 10px;
  background: var(--bg, #171920); border: 1px solid var(--border, #333);
  text-align: center;
}
.kpi-n { font-size: 22px; font-weight: 700; color: var(--brand, #5a8cff); line-height: 1.2; }
.kpi-n small { font-size: 11px; margin-left: 2px; }
.kpi-l { font-size: 10px; color: var(--text-3, #888); margin-top: 6px; }

.block { margin-bottom: 22px; }
.block-t { font-size: 13px; font-weight: 600; color: var(--text, #eee); margin-bottom: 12px; }
.bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.bar-l { width: 58px; font-size: 11px; color: var(--text-2, #bbb); flex: none; }
.bar-track { flex: 1; height: 8px; border-radius: 4px; background: var(--active, #333); overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; background: var(--brand, #5a8cff); }
.bar-fill.pf-netease { background: #e64848; }
.bar-fill.pf-qq { background: #4ea1ff; }
.bar-r { width: 96px; text-align: right; font-size: 10px; color: var(--text-3, #888); flex: none; }

.heat { display: grid; grid-template-columns: repeat(30, 1fr); gap: 3px; }
.heat-cell { aspect-ratio: 1; border-radius: 3px; background: var(--brand, #5a8cff); }
.heat-legend { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-3, #777); margin-top: 6px; }

.rank-row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 4px; border-bottom: 1px solid var(--border, #2a2d36);
  position: relative; min-height: 38px;
}
.rank-n { width: 22px; text-align: center; font-size: 12px; color: var(--text-3, #888); flex: none; z-index: 1; }
.rank-n.top { color: var(--brand, #5a8cff); font-weight: 700; }
.rank-bar {
  position: absolute; left: 26px; top: 6px; bottom: 6px;
  background: var(--brand-soft, rgba(90,140,255,0.12)); border-radius: 6px;
}
.rank-name { flex: 1; font-size: 12px; color: var(--text, #eee); z-index: 1; }
.rank-name small { color: var(--text-3, #888); margin-left: 6px; }
.rank-c { font-size: 11px; color: var(--text-3, #888); flex: none; z-index: 1; }

.hour-chart { display: flex; align-items: flex-end; gap: 3px; height: 200px; padding-top: 10px; }
.hour-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.hour-fill { width: 100%; max-width: 16px; background: var(--brand, #5a8cff); border-radius: 3px 3px 0 0; min-height: 2px; }
.hour-l { font-size: 9px; color: var(--text-3, #777); margin-top: 4px; }

.st-note { font-size: 11px; color: var(--text-3, #777); margin-top: 14px; line-height: 1.5; }
.st-foot { padding: 12px 22px; border-top: 1px solid var(--border, #333); display: flex; justify-content: flex-end; }
.st-clear { font-size: 11px; color: var(--text-3, #888); }
.st-clear:hover { color: #e64848; }

.st-loading, .st-empty { padding: 60px 20px; text-align: center; color: var(--text-3, #888); font-size: 13px; }
.st-empty-ico { font-size: 40px; color: var(--brand, #5a8cff); opacity: 0.4; margin-bottom: 12px; }
.st-empty-sub { font-size: 11px; margin-top: 8px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
