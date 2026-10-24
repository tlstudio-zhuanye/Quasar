<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  platform: { type: String, required: true }
})
const emit = defineEmits(['close', 'success'])

const PLAT_NAME = { netease: '网易云音乐', qq: 'QQ音乐' }
const color = { netease: '#ec4141', qq: '#31c27c' }[props.platform]

/* Cookie 导入通道的分平台指引（对齐 Mineradio 的双模式设计） */
const COOKIE_GUIDE = {
  netease: {
    placeholder: 'MUSIC_U=xxxxxxxx; __csrf=xxxxxxxx',
    steps: '浏览器打开并登录 music.163.com → F12 → 应用/应用程序 → Cookie → 整包复制',
    note: '缺少 MUSIC_U 会保存失败；扫码不好使时用这条通道最稳'
  },
  qq: {
    placeholder: 'uin=123456789; qm_keyst=xxxxxxxx; qqmusic_key=xxxxxxxx',
    steps: '浏览器打开并登录 y.qq.com → 随便点开一首歌进入播放页 → F12 → Cookie → 整包复制',
    note: '务必在播放器页面里复制：qm_keyst 播放票据只有进了播放页才会生成'
  }
}
const guide = computed(() => COOKIE_GUIDE[props.platform] || COOKIE_GUIDE.netease)

const status = ref('loading') // loading | waiting | scanned | done | error
const statusText = ref('正在获取二维码…')
const qrImage = ref('')
const errMsg = ref('')

/* 登录模式：qr 扫码 / cookie 手动导入 */
const tab = ref('qr')
const cookieText = ref('')
const cookieBusy = ref(false)

let key = ''
let timer = null

/** 优先本地生成二维码，装不上就退回在线生成 */
async function makeQr (content) {
  try {
    const mod = await import('qrcode')
    const QRCode = mod.default || mod
    return await QRCode.toDataURL(content, { width: 216, margin: 1, color: { dark: '#111', light: '#fff' } })
  } catch (_) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=216x216&data=${encodeURIComponent(content)}`
  }
}

function stop () {
  if (timer) { clearInterval(timer); timer = null }
}

async function start () {
  stop()
  status.value = 'loading'
  statusText.value = '正在获取二维码…'
  qrImage.value = ''
  errMsg.value = ''
  try {
    const r = await window.TL.music.loginQr({ platform: props.platform })
    if (!r.ok) throw new Error(r.error)
    const d = r.data
    key = d.key
    qrImage.value = d.imageDataUrl || (await makeQr(d.content || d.key))
    status.value = 'waiting'
    statusText.value = '请用手机 App 扫码登录'
    timer = setInterval(poll, 2200)
  } catch (e) {
    status.value = 'error'
    errMsg.value = e.message || String(e)
    statusText.value = '获取二维码失败'
  }
}

async function poll () {
  if (!key) return
  try {
    const r = await window.TL.music.loginCheck({ platform: props.platform, key })
    if (!r.ok) return
    const d = r.data
    if (d && d.logged) {
      stop()
      status.value = 'done'
      // 803 已确认但资料接口还没返回（pendingProfile）：先放行，下一次刷新会补资料
      statusText.value = d.pendingProfile ? '登录成功，正在同步账号资料…' : '登录成功'
      setTimeout(() => emit('success', { profile: d.profile, message: d.message || '' }), 500)
      return
    }
    // 网易云: 800 过期 801 待扫 802 待确认 803 成功
    if (d && (d.code === 800 || d.code === 0)) {
      stop()
      status.value = 'error'
      errMsg.value = '二维码已过期'
      statusText.value = '二维码已过期，请刷新'
    } else if (d && d.code === 802) {
      statusText.value = '已扫码，请在手机上确认'
    }
  } catch (_) {}
}

/** 手动导入 Cookie */
async function saveCookie () {
  const text = cookieText.value.trim()
  if (!text) {
    status.value = 'error'
    statusText.value = '先粘贴 Cookie'
    errMsg.value = ''
    return
  }
  cookieBusy.value = true
  status.value = 'loading'
  statusText.value = '正在保存登录态…'
  errMsg.value = ''
  try {
    const r = await window.TL.music.loginCookie({ platform: props.platform, cookie: text })
    if (!r.ok) throw new Error(r.error)
    const d = r.data || {}
    if (!d.logged) throw new Error('会话不可用，请检查 Cookie 是否完整')
    status.value = 'done'
    statusText.value = d.pendingProfile ? '登录成功，正在同步账号资料…' : '登录成功'
    setTimeout(() => emit('success', { profile: d, message: '' }), 400)
  } catch (e) {
    status.value = 'error'
    statusText.value = 'Cookie 保存失败'
    errMsg.value = e.message || String(e)
  } finally {
    cookieBusy.value = false
  }
}

onMounted(() => {
  // QQ 扫码经常只带回 uin 拿不到播放票据，默认停在扫码页也行，
  // 但把「Cookie 导入」放在显眼处，用户一次找不到后面也能自己切过来
  start()
})
onUnmounted(stop)

/* 兜底通道：扫码接口不好使时，直接开官方登录页 */
const usingWindow = ref(false)
async function byOfficialWindow () {
  stop()
  usingWindow.value = true
  status.value = 'waiting'
  statusText.value = '已打开官方登录页，请在新窗口完成登录…'
  qrImage.value = ''
  errMsg.value = ''
  try {
    const r = await window.TL.music.loginWindow({ platform: props.platform })
    if (!r.ok) throw new Error(r.error)
    const d = r.data || {}
    if (d.cancelled) {
      status.value = 'error'
      statusText.value = '已取消登录'
      errMsg.value = ''
      return
    }
    if (d.logged) {
      status.value = 'done'
      statusText.value = d.partial ? '账号已同步，播放授权未完成' : '登录成功'
      setTimeout(() => emit('success', { profile: d.profile, message: d.message || '' }), 400)
    }
  } catch (e) {
    status.value = 'error'
    statusText.value = '官方页面登录失败'
    errMsg.value = e.message || String(e)
  } finally {
    usingWindow.value = false
  }
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="dialog">
      <header class="hd">
        <span class="dot" :style="{ background: color }"></span>
        <b>登录 {{ PLAT_NAME[platform] }}</b>
        <button class="x" @click="emit('close')">✕</button>
      </header>

      <div class="tabs">
        <button :class="{ on: tab === 'qr' }" @click="tab = 'qr'; start()">扫码登录</button>
        <button :class="{ on: tab === 'cookie' }" @click="tab = 'cookie'; stop(); status = 'loading'; statusText = '粘贴 Cookie 后保存'; errMsg = ''">Cookie 导入</button>
      </div>

      <div class="bd">
        <!-- ═══ 扫码模式 ═══ -->
        <template v-if="tab === 'qr'">
          <div class="qr" :style="{ borderColor: color }">
            <img v-if="qrImage" :src="qrImage" alt="二维码" />
            <div v-else class="ph">{{ status === 'error' ? '!' : '…' }}</div>
          </div>

          <p class="tip" :style="{ color: status === 'error' ? '#e05252' : 'var(--text-2)' }">
            {{ statusText }}
          </p>
          <p v-if="errMsg" class="err">{{ errMsg }}</p>

          <button v-if="status === 'error'" class="retry" :style="{ background: color }" @click="start">
            重新获取二维码
          </button>

          <button v-if="status !== 'done'" class="official" :disabled="usingWindow" @click="byOfficialWindow">
            {{ usingWindow ? '等待登录中…' : '改用官方页面登录' }}
          </button>
        </template>

        <!-- ═══ Cookie 导入模式 ═══ -->
        <template v-else>
          <textarea
            v-model="cookieText"
            class="ck"
            :placeholder="guide.placeholder"
            spellcheck="false"
            rows="3"
          ></textarea>

          <p class="tip">{{ guide.steps }}</p>
          <p v-if="errMsg" class="err">{{ errMsg }}</p>

          <button class="retry" :style="{ background: color }" :disabled="cookieBusy" @click="saveCookie">
            {{ cookieBusy ? '保存中…' : '保存并登录' }}
          </button>

          <p class="note">⚠ {{ guide.note }}</p>
        </template>

        <p class="note" v-if="tab === 'qr'">
          登录态仅保存在本机，用于访问你自己账号的歌单与音源。<br>
          扫码拿不到完整权限时，可切到「Cookie 导入」。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}
.dialog {
  width: 300px;
  background: var(--bg-elev);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.32);
  overflow: hidden;
}
.hd {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.hd .dot { width: 8px; height: 8px; border-radius: 50%; }
.hd b { flex: 1; }
.x { color: var(--text-3); font-size: 13px; }
.x:hover { color: var(--text); }

.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}
.tabs button {
  flex: 1;
  padding: 9px 0;
  font-size: 12px;
  color: var(--text-3);
  border-bottom: 2px solid transparent;
}
.tabs button.on {
  color: var(--brand);
  border-bottom-color: var(--brand);
  font-weight: 600;
}

.bd { padding: 20px 20px 16px; text-align: center; }
.qr {
  width: 216px;
  height: 216px;
  margin: 0 auto;
  border: 2px solid var(--brand);
  border-radius: 10px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #fff;
}
.qr img { width: 100%; height: 100%; }
.qr .ph { font-size: 32px; color: #bbb; }

.tip { margin: 14px 0 0; font-size: 12px; line-height: 1.6; }
.err { margin: 6px 0 0; font-size: 11px; color: #d05252; word-break: break-all; }

.ck {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 11px;
  font-family: Consolas, monospace;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  text-align: left;
}
.ck:focus { border-color: var(--brand); }

.retry {
  margin-top: 12px;
  padding: 7px 20px;
  border-radius: 8px;
  color: #fff;
  font-size: 12px;
}
.retry:disabled { opacity: 0.55; cursor: default; }

.official {
  margin-top: 10px;
  padding: 7px 18px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elev);
  color: var(--text-2);
  font-size: 12px;
}
.official:hover:not(:disabled) { border-color: var(--brand); color: var(--brand); }
.official:disabled { opacity: 0.55; cursor: default; }

.note {
  margin: 16px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-3);
}
</style>
