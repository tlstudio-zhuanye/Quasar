<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import TitleBar from '../components/TitleBar.vue'
import Sidebar from '../components/Sidebar.vue'
import SongTable from '../components/SongTable.vue'
import PlayerBar from '../components/PlayerBar.vue'
import LoginDialog from '../components/LoginDialog.vue'
import LyricStage from '../components/LyricStage.vue'
import { useModeStore, MODES } from '../stores/mode'
import { usePlayerStore } from '../stores/player'
import { useFavStore } from '../stores/favorites'
import { fmtTime } from '../utils/lrc'

const modeStore = useModeStore()
const player = usePlayerStore()
const favStore = useFavStore()

const nav = ref('discover')
const keyword = ref('')
const searchPlatform = ref('all')
const songs = ref([])
const title = ref('发现音乐')
const loading = ref(false)

const toplists = ref([])
const userPlaylists = ref([])
const loginInfo = ref({})
const showLogin = ref(false)
const loginPlatform = ref('netease')
const showLyric = ref(false)
const showStage = ref(false)
const toast = ref('')

const lyricBox = ref(null)
let toastTimer = null
function tip (msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 3000)
}

const lyricLines = computed(() => player.lyric)

/** 逐字词的演唱状态：'' 未唱 / sung 已唱 / cur 正在唱 */
function wordCls (wd, sec) {
  if (sec >= wd.end) return 'sung'
  if (sec >= wd.start) return 'cur'
  return ''
}

watch(() => player.lyricIndex, async () => {
  await nextTick()
  const el = lyricBox.value
  const line = el && el.querySelector('.line.on')
  if (line) {
    el.scrollTo({ top: line.offsetTop - el.clientHeight / 2 + line.clientHeight / 2, behavior: 'smooth' })
  }
})

/* ═══════════ 初始化 ═══════════ */
onMounted(async () => {
  await modeStore.init()
  await player.init()
  await favStore.load()
  refreshLogin()
  loadDiscover()
})

watch(() => modeStore.mode, () => {
  loadDiscover()
  refreshLogin()
})

/* ═══════════ 账号 ═══════════ */
async function refreshLogin () {
  const r = await window.TL.music.loginState()
  if (!r.ok) return
  loginInfo.value = r.data || {}
  const cur = loginInfo.value[modeStore.mode]
  if (cur && cur.logged) loadUserPlaylists()
  else userPlaylists.value = []
}

async function loadUserPlaylists () {
  const r = await window.TL.music.userPlaylists({ platform: modeStore.mode })
  userPlaylists.value = r.ok ? r.data : []
}

function openLogin (p) {
  loginPlatform.value = p || modeStore.mode
  showLogin.value = true
}

async function onLoginOk () {
  showLogin.value = false
  tip('登录成功')
  await refreshLogin()
}

/* ═══════════ 数据加载 ═══════════ */
async function loadDiscover () {
  nav.value = 'discover'
  title.value = '发现音乐'
  loading.value = true
  try {
    const [rec, tops] = await Promise.all([
      window.TL.music.recommend({ platform: modeStore.mode }),
      window.TL.music.toplists({ platform: modeStore.mode })
    ])
    songs.value = rec.ok ? rec.data : []
    toplists.value = tops.ok ? tops.data : []

    // 未登录时「每日推荐」拿不到内容，退化成展示该平台首个榜单
    if (!songs.value.length && toplists.value.length) {
      const r = await window.TL.music.ranking({
        platform: modeStore.mode,
        id: toplists.value[0].id,
        limit: 50
      })
      if (r.ok && r.data.songs && r.data.songs.length) {
        songs.value = r.data.songs
        title.value = `发现音乐 · ${r.data.name || '热门'}`
      }
    }
    if (!rec.ok && rec.error && songs.value.length === 0) tip(rec.error)
  } finally {
    loading.value = false
  }
}

async function onNav (key) {
  if (key === 'discover') return loadDiscover()

  if (key === 'favorites') {
    nav.value = 'favorites'
    title.value = '我的收藏（跨平台混合）'
    songs.value = favStore.list.slice()
    return
  }

  if (key === 'history') {
    nav.value = 'history'
    title.value = '最近播放'
    songs.value = (await window.TL.db.history()) || []
    return
  }

  if (key === 'toplist') {
    nav.value = 'toplist'
    title.value = '排行榜'
    songs.value = []
    if (!toplists.value.length) {
      const r = await window.TL.music.toplists({ platform: modeStore.mode })
      toplists.value = r.ok ? r.data : []
    }
    return
  }

  if (key.startsWith('playlist:')) {
    const id = key.slice('playlist:'.length)
    nav.value = 'playlist'
    title.value = '歌单加载中…'
    loading.value = true
    try {
      const r = await window.TL.music.playlist({ platform: modeStore.mode, id })
      if (r.ok) {
        title.value = r.data.name || '歌单'
        songs.value = r.data.songs || []
      } else {
        title.value = '歌单加载失败'
        tip(r.error)
      }
    } finally {
      loading.value = false
    }
  }
}

async function openRanking (t) {
  nav.value = 'toplist'
  title.value = t.name
  loading.value = true
  try {
    const r = await window.TL.music.ranking({ platform: modeStore.mode, id: t.id })
    if (r.ok) songs.value = r.data.songs || []
    else { songs.value = []; tip(r.error) }
  } finally {
    loading.value = false
  }
}

async function doSearch () {
  const kw = keyword.value.trim()
  if (!kw) return
  nav.value = 'search'
  title.value = `搜索「${kw}」`
  loading.value = true
  try {
    const r = await window.TL.music.search({
      platform: searchPlatform.value,
      keyword: kw,
      limit: 30
    })
    songs.value = r.ok ? r.data : []
    if (!r.ok) tip(r.error)
  } finally {
    loading.value = false
  }
}

/* 在小窗 / 主窗之间同步当前模式 */
function isCurMode (m) { return modeStore.mode === m }
</script>

<template>
  <div class="app">
    <TitleBar />

    <div class="main">
      <Sidebar
        :nav="nav"
        :user-playlists="userPlaylists"
        :login-info="loginInfo"
        @update:nav="onNav"
        @login="openLogin"
        @logout="onLogout"
      />

      <section class="content">
        <!-- 工具条 -->
        <div class="toolbar">
          <div class="searchbox">
            <select v-model="searchPlatform" class="plat-select" title="搜索范围">
              <option value="all">全部平台</option>
              <option v-for="m in MODES" :key="m.key" :value="m.key">{{ m.short }}</option>
            </select>
            <input
              v-model="keyword"
              class="search-input"
              placeholder="搜索歌曲 / 歌手 / 专辑，回车确认"
              @keyup.enter="doSearch"
            />
            <button class="search-btn" @click="doSearch">搜索</button>
          </div>

          <div class="tools">
            <span class="cur-mode" :style="{ color: modeStore.info.color }">
              ● {{ modeStore.info.name }}
            </span>
            <button class="tool-btn" :class="{ on: showLyric }" @click="showLyric = !showLyric">歌词</button>
          </div>
        </div>

        <!-- 内容 -->
        <div class="scroll">
          <h2 class="page-title">
            {{ title }}
            <span v-if="loading" class="loading">加载中…</span>
            <span v-else-if="songs.length" class="count">{{ songs.length }} 首</span>
          </h2>

          <!-- 排行榜卡片 -->
          <div v-if="toplists.length && (nav === 'discover' || nav === 'toplist')" class="cards">
            <button
              v-for="t in toplists.slice(0, 12)"
              :key="t.id"
              class="card"
              :class="{ active: title === t.name }"
              @click="openRanking(t)"
            >
              <span class="c-name ellipsis">{{ t.name }}</span>
              <span class="c-sub">当前模式榜单</span>
            </button>
          </div>

          <SongTable
            v-if="songs.length"
            :songs="songs"
            :show-platform="nav !== 'favorites' || true"
          />
          <SongTable
            v-else-if="!loading && !toplists.length"
            :songs="[]"
            :empty-text="nav === 'favorites' ? '还没有收藏，去歌曲列表点 ♥ 试试（两个平台的歌可以混在一起）' : '暂无内容'"
          />
        </div>
      </section>

      <!-- 歌词面板 -->
      <aside v-if="showLyric" class="lyric-panel">
        <div class="lyric-hd">
          <span class="ellipsis">{{ player.current ? player.current.name : '未在播放' }}</span>
          <button title="全屏歌词舞台" @click="showStage = true">⛶</button>
          <button @click="showLyric = false">✕</button>
        </div>
        <div ref="lyricBox" class="lyric-body">
          <div v-if="!lyricLines.length" class="lyric-empty">暂无歌词</div>
          <div
            v-for="(l, i) in lyricLines"
            :key="i"
            class="line"
            :class="{ on: i === player.lyricIndex }"
            @click="player.seek(l.time)"
          >
            <div class="t">
              <!-- 当前行且有逐字信息 → 词级高亮 -->
              <template v-if="i === player.lyricIndex && l.words && l.words.length">
                <span
                  v-for="(wd, wi) in l.words"
                  :key="wi"
                  class="w"
                  :class="wordCls(wd, player.progress)"
                >{{ wd.text }}</span>
              </template>
              <template v-else>{{ l.text }}</template>
            </div>
            <div v-if="l.trans" class="tr">{{ l.trans }}</div>
          </div>
        </div>
      </aside>
    </div>

    <PlayerBar
      :show-lyric="showLyric"
      :show-stage="showStage"
      @toggle-lyric="showLyric = !showLyric"
      @toggle-stage="showStage = !showStage"
    />

    <!-- 全屏歌词舞台 -->
    <LyricStage v-if="showStage" @close="showStage = false" />

    <LoginDialog
      v-if="showLogin"
      :platform="loginPlatform"
      @close="showLogin = false"
      @success="onLoginOk"
    />

    <transition name="fade">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; height: 100vh; }
.main { flex: 1; display: flex; min-height: 0; }

.content { flex: 1; display: flex; flex-direction: column; min-width: 0; background: var(--panel); }

/* 工具条 */
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.searchbox {
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 520px;
  height: 34px;
  padding: 0 4px 0 10px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--bg);
  transition: border-color 0.18s;
}
.searchbox:focus-within { border-color: var(--brand); }
.plat-select {
  border: none;
  background: transparent;
  color: var(--text-2);
  font-size: 12px;
  outline: none;
  cursor: pointer;
  padding-right: 6px;
  border-right: 1px solid var(--border);
  margin-right: 8px;
}
.plat-select option { color: #111; }
.search-input { flex: 1; font-size: 13px; }
.search-input::placeholder { color: var(--text-3); }
.search-btn {
  padding: 5px 16px;
  border-radius: 14px;
  background: var(--brand);
  color: #fff;
  font-size: 12px;
}
.search-btn:hover { background: var(--brand-dark); }

.tools { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.cur-mode { font-size: 12px; }
.tool-btn {
  padding: 5px 12px;
  border-radius: 14px;
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
}
.tool-btn:hover { border-color: var(--brand); color: var(--brand); }
.tool-btn.on { background: var(--brand-soft); border-color: var(--brand); color: var(--brand); }

/* 内容区 */
.scroll { flex: 1; overflow-y: auto; padding: 16px 18px 24px; }
.page-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 4px 0 14px;
  font-size: 16px;
  font-weight: 600;
}
.page-title .loading { font-size: 12px; color: var(--text-3); font-weight: 400; }
.page-title .count { font-size: 12px; color: var(--text-3); font-weight: 400; }

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 20px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  text-align: left;
  transition: all 0.16s;
}
.card:hover { border-color: var(--brand); background: var(--brand-soft); transform: translateY(-1px); }
.card.active { border-color: var(--brand); background: var(--brand-soft); }
.card .c-name { font-size: 13px; color: var(--text); }
.card .c-sub { font-size: 11px; color: var(--text-3); }

/* 歌词面板 */
.lyric-panel {
  width: 300px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  background: var(--bg);
}
.lyric-hd {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  font-size: 12px;
  color: var(--text-2);
  border-bottom: 1px solid var(--border);
}
.lyric-hd span { flex: 1; }
.lyric-hd button { color: var(--text-3); }
.lyric-hd button:hover { color: var(--text); }

.lyric-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 16px 40vh;
  scroll-behavior: smooth;
}
.lyric-empty { text-align: center; color: var(--text-3); padding-top: 40px; font-size: 12px; }
.line {
  padding: 6px 2px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.2s, transform 0.2s;
}
.line:hover { color: var(--text-2); }
.line.on { color: var(--brand); font-weight: 600; transform: scale(1.03); transform-origin: left; }
.line .tr { font-size: 11px; opacity: 0.72; margin-top: 2px; }
/* 逐字高亮（仅当前行） */
.line .w { margin-right: 0.08em; transition: opacity 0.12s; }
.line.on .w { opacity: 0.45; }
.line.on .w.sung { opacity: 1; }
.line.on .w.cur { opacity: 1; }

/* toast */
.toast {
  position: fixed;
  left: 50%;
  bottom: 96px;
  transform: translateX(-50%);
  padding: 9px 18px;
  border-radius: 8px;
  background: rgba(24, 26, 32, 0.92);
  color: #fff;
  font-size: 12px;
  z-index: 200;
  max-width: 62vw;
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
