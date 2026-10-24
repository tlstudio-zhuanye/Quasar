<script setup>
import { ref } from 'vue'
import { useModeStore, MODES } from '../stores/mode'
import { useFavStore } from '../stores/favorites'

const props = defineProps({
  nav: { type: String, required: true },
  userPlaylists: { type: Array, default: () => [] },
  loginInfo: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['update:nav', 'login', 'logout'])

const modeStore = useModeStore()
const favStore = useFavStore()

const NAV = [
  { key: 'discover', label: '发现音乐', icon: '♪' },
  { key: 'toplist', label: '排行榜', icon: '≡' },
  { key: 'favorites', label: '我的收藏', icon: '♥' },
  { key: 'history', label: '最近播放', icon: '⏱' }
]

const collapsed = ref(false)
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <nav class="nav">
      <button
        v-for="n in NAV"
        :key="n.key"
        class="item"
        :class="{ on: nav === n.key }"
        @click="emit('update:nav', n.key)"
      >
        <span class="ico">{{ n.icon }}</span>
        <span class="txt">{{ n.label }}</span>
        <span v-if="n.key === 'favorites' && favStore.count" class="cnt">{{ favStore.count }}</span>
      </button>
    </nav>

    <!-- 平台账号 -->
    <div class="section">
      <div class="sec-title">平台账号</div>
      <button
        v-for="m in MODES"
        :key="m.key"
        class="acct"
        :title="loginInfo[m.key] && loginInfo[m.key].logged ? '点击退出登录' : '点击扫码登录'"
        @click="loginInfo[m.key] && loginInfo[m.key].logged ? emit('logout', m.key) : emit('login', m.key)"
      >
        <i class="swatch" :style="{ background: m.color }"></i>
        <template v-if="loginInfo[m.key] && loginInfo[m.key].logged">
          <img v-if="loginInfo[m.key].avatar" class="avatar" :src="loginInfo[m.key].avatar" />
          <span class="ellipsis">{{ loginInfo[m.key].nickname || '已登录' }}</span>
          <span class="quit">退出</span>
        </template>
        <template v-else>
          <span class="txt">登录 {{ m.short }}</span>
        </template>
      </button>
    </div>

    <!-- 我收藏的（跨平台混合歌单） -->
    <div class="section" v-if="favStore.list.length">
      <div class="sec-title">
        混合收藏
        <span class="sub">共 {{ favStore.count }} 首</span>
      </div>
      <div class="plats">
        <span v-for="(n, p) in favStore.byPlatform" :key="p" class="plat-tag" :class="'plat-' + p">
          {{ { netease: '网易云', qq: 'QQ音乐' }[p] || p }} {{ n }}
        </span>
      </div>
    </div>

    <!-- 我的歌单（来自当前模式平台账号） -->
    <div class="section grow" v-if="userPlaylists.length">
      <div class="sec-title">我的歌单 · {{ modeStore.info.short }}</div>
      <div class="plist">
        <button
          v-for="p in userPlaylists"
          :key="p.id"
          class="pl-item ellipsis"
          @click="emit('update:nav', 'playlist:' + p.id)"
        >
          {{ p.name }}
        </button>
      </div>
    </div>

    <button class="collapse" @click="collapsed = !collapsed">
      {{ collapsed ? '»' : '«' }}
    </button>
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 196px;
  flex: none;
  padding: 12px 8px;
  background: var(--sidebar);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  transition: width 0.2s ease;
}
.sidebar.collapsed { width: 56px; }
.sidebar.collapsed .txt,
.sidebar.collapsed .cnt,
.sidebar.collapsed .sec-title,
.sidebar.collapsed .plist,
.sidebar.collapsed .plats { display: none; }

.nav { display: flex; flex-direction: column; gap: 2px; }
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border-radius: 8px;
  color: var(--text-2);
  text-align: left;
  transition: background 0.15s, color 0.15s;
}
.item:hover { background: var(--hover); color: var(--text); }
.item.on { background: var(--brand-soft); color: var(--brand); font-weight: 600; }
.item .ico { width: 16px; text-align: center; font-size: 13px; }
.item .txt { flex: 1; }
.item .cnt {
  font-size: 11px;
  color: var(--text-3);
  background: var(--active);
  padding: 0 6px;
  border-radius: 8px;
}

.section { margin-top: 16px; }
.sec-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 10px 6px;
  font-size: 11px;
  color: var(--text-3);
}
.sec-title .sub { font-size: 10px; }

.acct {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--text-2);
  text-align: left;
}
.acct:hover { background: var(--hover); }
.acct .swatch { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.acct .avatar { width: 18px; height: 18px; border-radius: 50%; flex: none; }
.acct .txt { flex: 1; }
.acct .ellipsis { flex: 1; }
.acct .quit {
  font-size: 10px;
  color: var(--text-3);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.acct:hover .quit { opacity: 1; }

.plats { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 10px; }

.grow { flex: 1; min-height: 0; }
.plist { display: flex; flex-direction: column; gap: 1px; }
.pl-item {
  padding: 6px 10px;
  border-radius: 6px;
  color: var(--text-2);
  text-align: left;
  font-size: 12px;
}
.pl-item:hover { background: var(--hover); color: var(--text); }

.collapse {
  margin-top: auto;
  padding: 6px;
  color: var(--text-3);
  font-size: 12px;
}
.collapse:hover { color: var(--text); }
</style>
