<script setup>
/**
 * CommentPanel.vue — 歌曲评论「独立弹窗」
 * 网易云乐评 / QQ 乐评：热评置顶 + 点赞数 + 头像。跟随打开时选中的歌曲。
 * 数据走 window.TL.music.comments → 主进程 → 各平台音源（无需登录即可取热评）。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../stores/player'

const player = usePlayerStore()
const LIMIT = 20

const song = () => player.commentPanel.song

const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const total = ref(0)
const hot = ref([])
const list = ref([])
const offset = ref(0)
const more = ref(false)

const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E" +
  "%3Crect width='64' height='64' fill='%233a3f4b'/%3E%3Ccircle cx='32' cy='24' r='12' fill='%23788096'/%3E" +
  "%3Cpath d='M12 56c0-11 9-18 20-18s20 7 20 18' fill='%23788096'/%3E%3C/svg%3E"

async function fetchComments (isMore) {
  const s = song()
  if (!s) return
  if (isMore) loadingMore.value = true
  else { loading.value = true; error.value = ''; offset.value = 0; hot.value = []; list.value = [] }

  try {
    const r = await window.TL.music.comments({
      platform: s.platform,
      id: s.id,
      mid: s.mid,
      limit: LIMIT,
      offset: offset.value
    })
    if (!r.ok) throw new Error(r.error || '评论加载失败')
    const d = r.data || {}
    if (!isMore) {
      hot.value = d.hotComments || []
      list.value = d.comments || []
    } else {
      list.value = list.value.concat(d.comments || [])
    }
    total.value = d.total || 0
    more.value = !!d.more
    offset.value += LIMIT
  } catch (e) {
    error.value = (e && e.message) || String(e)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function retry () { fetchComments(false) }
function loadMore () { if (!loadingMore.value && more.value) fetchComments(true) }

function onImgError (e) { e.target.src = DEFAULT_AVATAR }

function fmtLike (n) {
  n = Number(n) || 0
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万'
  return String(n)
}
function timeAgo (t) {
  if (!t) return ''
  const s = (Date.now() - t) / 1000
  if (s < 60) return '刚刚'
  if (s < 3600) return Math.floor(s / 60) + '分钟前'
  if (s < 86400) return Math.floor(s / 3600) + '小时前'
  if (s < 86400 * 30) return Math.floor(s / 86400) + '天前'
  if (s < 86400 * 365) return Math.floor(s / (86400 * 30)) + '个月前'
  return Math.floor(s / (86400 * 365)) + '年前'
}

/* 拖拽标题栏：让弹窗可移动 */
const winEl = ref(null)
const pos = ref({ x: 0, y: 0 })
let dragging = false
let startX = 0
let startY = 0
let baseX = 0
let baseY = 0
function startDrag (e) {
  dragging = true
  startX = e.clientX; startY = e.clientY
  baseX = pos.value.x; baseY = pos.value.y
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', endDrag)
}
function onDrag (e) {
  pos.value = { x: baseX + (e.clientX - startX), y: baseY + (e.clientY - startY) }
}
function endDrag () {
  dragging = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', endDrag)
}

onMounted(() => { fetchComments(false) })
onUnmounted(() => endDrag())
</script>

<template>
  <div class="cmt-backdrop" @click.self="player.closeComments()">
    <div
      ref="winEl"
      class="cmt-win"
      :style="{ transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }"
    >
      <!-- 标题栏（可拖拽） -->
      <div class="cmt-hd" @mousedown.prevent="startDrag">
        <div class="hd-song">
          <img v-if="song() && song().cover" class="hd-cover" :src="song().cover" alt="" />
          <span class="hd-title ellipsis">
            {{ song() ? song().name : '未在播放' }}
            <span class="hd-artist" v-if="song()">{{ song().artist }}</span>
          </span>
        </div>
        <span class="hd-total" v-if="total">{{ total }} 条评论</span>
        <button class="hd-close" title="关闭" @click="player.closeComments()">✕</button>
      </div>

      <!-- 内容 -->
      <div class="cmt-body">
        <div v-if="loading" class="cmt-state">
          <span class="spin">◌</span> 评论加载中…
        </div>
        <div v-else-if="error" class="cmt-state err">
          {{ error }}
          <button class="retry" @click="retry">重试</button>
        </div>
        <div v-else-if="!list.length && !hot.length" class="cmt-state">
          这首歌还没有评论
        </div>

        <template v-else>
          <div class="cmt-section" v-if="hot.length">
            <div class="sec-hd">🔥 热评</div>
            <div
              v-for="c in hot"
              :key="'h' + c.id"
              class="cmt"
            >
              <img class="avatar" :src="c.user.avatarUrl || DEFAULT_AVATAR" @error="onImgError" alt="" />
              <div class="cmt-main">
                <div class="cmt-top">
                  <span class="nick">{{ c.user.nickname }}</span>
                  <span class="loc" v-if="c.ip">{{ c.ip }}</span>
                  <span class="like">♥ {{ fmtLike(c.likedCount) }}</span>
                </div>
                <div class="content">{{ c.content }}</div>
                <div class="reply" v-if="c.repliedTo">
                  回复 @{{ c.repliedTo.nickname }}：{{ c.repliedTo.content }}
                </div>
                <div class="cmt-time">{{ timeAgo(c.time) }}</div>
              </div>
            </div>
          </div>

          <div class="cmt-section" v-if="list.length">
            <div class="sec-hd">最新评论</div>
            <div
              v-for="c in list"
              :key="'c' + c.id"
              class="cmt"
            >
              <img class="avatar" :src="c.user.avatarUrl || DEFAULT_AVATAR" @error="onImgError" alt="" />
              <div class="cmt-main">
                <div class="cmt-top">
                  <span class="nick">{{ c.user.nickname }}</span>
                  <span class="loc" v-if="c.ip">{{ c.ip }}</span>
                  <span class="like">♥ {{ fmtLike(c.likedCount) }}</span>
                </div>
                <div class="content">{{ c.content }}</div>
                <div class="reply" v-if="c.repliedTo">
                  回复 @{{ c.repliedTo.nickname }}：{{ c.repliedTo.content }}
                </div>
                <div class="cmt-time">{{ timeAgo(c.time) }}</div>
              </div>
            </div>
          </div>

          <div v-if="more" class="cmt-more">
            <button class="more-btn" :disabled="loadingMore" @click="loadMore">
              {{ loadingMore ? '加载中…' : '加载更多' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cmt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
}
.cmt-win {
  position: absolute;
  left: 50%;
  top: 16%;
  width: 440px;
  max-width: calc(100vw - 32px);
  height: 70vh;
  max-height: 720px;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.cmt-hd {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  cursor: move;
  user-select: none;
  flex: none;
  background: var(--bg);
}
.hd-song { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.hd-cover { width: 30px; height: 30px; border-radius: 6px; object-fit: cover; flex: none; }
.hd-title { font-size: 13px; color: var(--text); display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.hd-artist { font-size: 11px; color: var(--text-3); }
.hd-total { font-size: 11px; color: var(--text-3); flex: none; }
.hd-close { color: var(--text-3); font-size: 15px; flex: none; padding: 2px 6px; border-radius: 6px; }
.hd-close:hover { color: var(--text); background: var(--hover); }

.cmt-body { flex: 1; overflow-y: auto; padding: 8px 4px 16px; }
.cmt-state { text-align: center; color: var(--text-3); padding: 40px 16px; font-size: 13px; }
.cmt-state.err { color: #ff7a7a; }
.cmt-state .retry {
  display: block; margin: 12px auto 0; padding: 5px 16px; border-radius: 8px;
  border: 1px solid var(--border); color: var(--text-2); font-size: 12px;
}
.cmt-state .retry:hover { border-color: var(--brand); color: var(--brand); }
.cmt-state .spin { animation: cmt-spin 1s linear infinite; display: inline-block; }
@keyframes cmt-spin { to { transform: rotate(360deg); } }

.cmt-section { padding: 4px 8px; }
.sec-hd {
  font-size: 12px; color: var(--text-2); font-weight: 600;
  padding: 10px 6px 6px; position: sticky; top: 0; background: var(--panel); z-index: 1;
}
.cmt {
  display: flex; gap: 10px; padding: 10px 6px;
  border-bottom: 1px solid var(--border);
}
.avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex: none; background: var(--hover); }
.cmt-main { flex: 1; min-width: 0; }
.cmt-top { display: flex; align-items: center; gap: 8px; }
.nick { font-size: 12.5px; color: var(--text-2); font-weight: 600; }
.loc { font-size: 11px; color: var(--text-3); }
.like { margin-left: auto; font-size: 11px; color: #ff6b8b; flex: none; }
.content {
  font-size: 13px; color: var(--text); line-height: 1.6; margin-top: 4px;
  white-space: pre-wrap; word-break: break-word;
}
.reply {
  font-size: 11.5px; color: var(--text-2); background: var(--bg);
  border-left: 2px solid var(--border); padding: 6px 8px; margin-top: 6px; border-radius: 4px;
  white-space: pre-wrap; word-break: break-word;
}
.cmt-time { font-size: 11px; color: var(--text-3); margin-top: 5px; }

.cmt-more { text-align: center; padding: 14px; }
.more-btn {
  padding: 7px 22px; border-radius: 18px; border: 1px solid var(--border);
  color: var(--text-2); font-size: 12px;
}
.more-btn:hover:not(:disabled) { border-color: var(--brand); color: var(--brand); }
.more-btn:disabled { opacity: 0.6; }
</style>
