'use strict'
/**
 * cookie-utils.cjs — 登录 Cookie 公共工具
 * 移植参考 Mineradio（github.com/XxHuberrr/Mineradio）的登录 Cookie 处理链：
 *   - 通用：解析 / 序列化 / 归一化 / 合并
 *   - QQ 专用：uin 归一、播放票据键名候选、值解码（URL / GB18030 / latin1 双重编码）、
 *     昵称与头像兜底 —— 手动粘贴的 QQ cookie 十有八九带编码，不洗一遍根本用不了
 */

/* ══════════ 通用 ══════════ */

/** "k=v; k2=v2" → { k: 'v', k2: 'v2' } */
function parseCookieString (cookieText) {
  const out = {}
  String(cookieText || '')
    .split(';')
    .forEach((part) => {
      const raw = String(part || '').trim()
      if (!raw) return
      const idx = raw.indexOf('=')
      if (idx <= 0) return
      const key = raw.slice(0, idx).trim()
      const value = raw.slice(idx + 1).trim()
      if (key) out[key] = value
    })
  return out
}

/** { k: 'v' } → "k=v; k2=v2"（空值丢掉） */
function serializeCookieObject (obj) {
  return Object.keys(obj || {})
    .filter((k) => obj[k] != null && String(obj[k]) !== '')
    .map((k) => `${k}=${String(obj[k])}`)
    .join('; ')
}

/** 把用户可能粘成 JSON / 换行分隔 / 带引号的cookie整成标准 header 形式 */
function normalizeCookieHeader (cookieText) {
  let text = String(cookieText || '').trim()
  if (!text) return ''
  // 整段被引号包住
  if (/^".*"$/.test(text)) text = text.slice(1, -1)
  // JSON 形态 { "MUSIC_U": "xxx" }
  if (/^\{[\s\S]*\}$/.test(text)) {
    try {
      const obj = JSON.parse(text)
      return serializeCookieObject(obj)
    } catch (_) { /* 不是合法 JSON 就按原文走 */ }
  }
  return serializeCookieObject(parseCookieString(text))
}

/** normalize 失败时的兜底：原样返回（至少把值带进去） */
function rawCookieFallback (cookieText) {
  return String(cookieText || '').trim()
}

/** 旧 cookie 串 + 新 set-cookie 数组 → 合并后的新串 */
function mergeCookie (oldStr, setCookies) {
  const jar = parseCookieString(oldStr)
  for (const sc of setCookies || []) {
    const kv = String(sc).split(';')[0]
    const i = kv.indexOf('=')
    if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim()
  }
  return serializeCookieObject(jar)
}

/* ══════════ QQ 专用 ══════════ */

/** uin 只留数字、去前导零；全 0（游客态）归一为空串 */
function normalizeQQUin (raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits.replace(/^0+/, '')
}

/**
 * QQ 账号标识：微信登录态（wxopenid / login_type=2）看 wxuin，
 * 普通 QQ 登录态依次看 uin / qqmusic_uin / wxuin / p_uin
 */
function qqCookieUin (obj) {
  obj = obj || {}
  const isWechat = !!obj.wxopenid || Number(obj.login_type) === 2
  const raw = isWechat
    ? (obj.wxuin || obj.uin || obj.p_uin)
    : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin)
  return normalizeQQUin(raw)
}

/** 会话级票据（登录态判定用，宽松） */
function qqCookieMusicKey (obj) {
  obj = obj || {}
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.p_skey || obj.skey ||
    obj.psrf_qqaccess_token || obj.psrf_qqrefresh_token || obj.wxrefresh_token ||
    obj.wxskey || ''
}

/** 播放票据（换 vkey 用，严格）：只有这四个键能放歌 */
function qqCookiePlaybackKey (obj) {
  obj = obj || {}
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || ''
}

/**
 * QQ cookie 值经常是编码过的（浏览器复制出来带 URL 编码、旧版站点 GB18030、
 * 还有 latin1→utf8 双重编码的）。多候选解码后按「乱码特征」打分取最优。
 */
function decodeQQCookieValue (value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const candidates = [raw]
  // hex 编码
  if (/^(?:[0-9a-fA-F]{2}){2,}$/.test(raw)) {
    try {
      const decodedHex = Buffer.from(raw, 'hex').toString('utf8').trim()
      if (decodedHex && /[^\x20-\x7e]/.test(decodedHex)) candidates.push(decodedHex)
    } catch (_) {}
  }
  const plusSafe = raw.replace(/\+/g, '%20')
  // URL 编码
  try { candidates.push(decodeURIComponent(plusSafe).trim()) } catch (_) {}
  // 手工百分号解码（ decodeURIComponent 遇非法序列会整段失败）
  const percentBytes = []
  let hasPercentBytes = false
  for (let i = 0; i < plusSafe.length; i += 1) {
    const ch = plusSafe[i]
    const hex = plusSafe.slice(i + 1, i + 3)
    if (ch === '%' && /^[0-9a-fA-F]{2}$/.test(hex)) {
      percentBytes.push(parseInt(hex, 16))
      hasPercentBytes = true
      i += 2
    } else {
      const text = ch === '+' ? ' ' : ch
      for (const byte of Buffer.from(text, 'utf8')) percentBytes.push(byte)
    }
  }
  if (hasPercentBytes && percentBytes.length) {
    const buf = Buffer.from(percentBytes)
    // 注意：本机 Node / Electron 内置 Node 都没编进 GB18030 码表（实测 Buffer 与
    // TextDecoder 均抛 Unknown encoding），这条候选在当前环境是空转；保留是防换环境。
    try { candidates.push(new TextDecoder('gb18030').decode(buf).trim()) } catch (_) {}
    try { candidates.push(buf.toString('utf8').trim()) } catch (_) {}
  }
  // \uXXXX 与 latin1 双重编码
  for (const item of candidates.slice()) {
    if (!item) continue
    if (/\\u[0-9a-fA-F]{4}/.test(item)) {
      try {
        candidates.push(JSON.parse(`"${item.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\\\\u/g, '\\u')}"`).trim())
      } catch (_) {}
    }
    if (/[ÃÂ]|[\u00c0-\u00ff][\u0080-\u00bf]/.test(item)) {
      try { candidates.push(Buffer.from(item, 'latin1').toString('utf8').trim()) } catch (_) {}
    }
  }
  function score (text) {
    text = String(text || '').trim()
    if (!text) return 1e9
    let s = 0
    s += (text.match(/\uFFFD/g) || []).length * 80
    s += (text.match(/%[0-9a-fA-F]{2}/g) || []).length * 10
    s += (text.match(/\\u[0-9a-fA-F]{4}/g) || []).length * 8
    s += (text.match(/[ÃÂ]/g) || []).length * 34
    s += (text.match(/[\u0080-\u009f]/g) || []).length * 42
    s += (text.match(/[\x00-\x08\x0e-\x1f\x7f]/g) || []).length * 50
    s -= (text.match(/[\u4e00-\u9fff]/g) || []).length * 2
    return s + Math.min(text.length, 80) * 0.02
  }
  const best = candidates.filter(Boolean).sort((a, b) => score(a) - score(b))[0]
  return String(best || raw).trim()
}

/** 昵称：ptnick_<uin> / ptnick / nick / nickname / qq_nickname 依次试 */
function qqCookieNickname (obj, uin) {
  obj = obj || {}
  uin = normalizeQQUin(uin || qqCookieUin(obj))
  const padded = uin ? `0${uin}` : ''
  const keys = [
    uin && `ptnick_${uin}`,
    padded && `ptnick_${padded}`,
    'ptnick',
    'nick',
    'nickname',
    'qq_nickname'
  ].filter(Boolean)
  for (const key of keys) {
    if (obj[key]) {
      const nick = decodeQQCookieValue(obj[key])
      if (nick) return nick
    }
  }
  const ptnickKey = Object.keys(obj).find((key) => /^ptnick_/i.test(key) && obj[key])
  return ptnickKey ? decodeQQCookieValue(obj[ptnickKey]) : ''
}

/** 头像：cookie 里的直填字段，没有就用 QQ 官方面具 */
function qqCookieAvatar (obj, uin) {
  obj = obj || {}
  const direct = obj.qqmusic_avatar || obj.avatar || obj.avatarUrl || obj.headpic || ''
  if (direct) return decodeQQCookieValue(direct)
  uin = normalizeQQUin(uin || qqCookieUin(obj))
  return uin ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=100` : ''
}

/**
 * 清洗用户粘贴的 QQ cookie：
 *   - 微信登录态把 wxuin 扶正成 uin
 *   - uin 缺失时用 qqmusic_uin / p_uin 兜底
 *   - uin 去前导零
 */
function normalizeQQCookieInput (cookieText) {
  const obj = parseCookieString(cookieText)
  if ((obj.wxopenid || Number(obj.login_type) === 2) && obj.wxuin) obj.uin = obj.wxuin
  if (!obj.uin && (obj.qqmusic_uin || obj.p_uin)) obj.uin = obj.qqmusic_uin || obj.p_uin
  if (obj.uin) obj.uin = normalizeQQUin(obj.uin)
  return serializeCookieObject(obj)
}

module.exports = {
  parseCookieString,
  serializeCookieObject,
  normalizeCookieHeader,
  rawCookieFallback,
  mergeCookie,
  normalizeQQUin,
  qqCookieUin,
  qqCookieMusicKey,
  qqCookiePlaybackKey,
  decodeQQCookieValue,
  qqCookieNickname,
  qqCookieAvatar,
  normalizeQQCookieInput
}
