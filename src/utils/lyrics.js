/**
 * lyrics.js — 统一歌词数据层（v1.2.0 全屏歌词舞台）
 *
 * 原始格式（音源层直出的文本）：
 *  1. LRC 文本    [mm:ss.xx]文字                —— QQ lyric / 旧版网易云
 *  2. JSON-LRC    {"t":ms,"c":[{"tx":"文字"}]}  —— 网易云 lyric/v1 的 lrc / tlyric
 *  3. YRC 逐字    [起始ms,时长ms](词起,词长,0)文字 —— 网易云 lyric/v1 的 yrc 正文
 *  yrc 字段是混合格式：制作名单行是 JSON-LRC，正文行是 YRC 文本，逐行判定。
 *
 * 输出统一模型（与旧 lrc.js 的 time/text/trans 字段保持兼容）：
 *  {
 *    lines: [{ time, text, trans, dur, words }],   // time/dur 单位：秒
 *    wordByWord: bool                              // 是否存在词级时间
 *  }
 *  words: [{ text, start, end }] | null（null = 该行无逐字信息，按行级渲染）
 */

const YRC_LINE_RE = /^\[(\d+),(\d+)\]/
const YRC_WORD_RE = /\((\d+),(\d+)(?:,\d+)?\)/g
const LRC_TIME_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/* ══════════ 格式 1：LRC 文本 ══════════ */

/** [mm:ss.xx]文字 → [{ time, text }]（秒） */
export function parseLrcText (text) {
  const out = []
  for (const line of String(text || '').split('\n')) {
    LRC_TIME_RE.lastIndex = 0
    const stamps = [...line.matchAll(LRC_TIME_RE)]
    if (!stamps.length) continue
    const content = line.replace(LRC_TIME_RE, '').trim()
    if (!content) continue
    for (const t of stamps) {
      const min = parseInt(t[1], 10) || 0
      const sec = parseInt(t[2], 10) || 0
      const frac = t[3] ? parseInt(String(t[3]).padEnd(3, '0').slice(0, 3), 10) : 0
      out.push({ time: min * 60 + sec + frac / 1000, text: content })
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

/* ══════════ 格式 2：JSON-LRC ══════════ */

/** {"t":ms,"c":[{"tx":"文"}]} 每行一条 → [{ time, text }]（秒） */
export function parseJsonLrc (text) {
  const out = []
  for (const line of String(text || '').split('\n')) {
    const s = line.trim()
    if (!s || s[0] !== '{') continue
    let j = null
    try { j = JSON.parse(s) } catch (_) { continue }
    if (!j || typeof j.t !== 'number') continue
    const content = (j.c || []).map((x) => x && x.tx != null ? x.tx : '').join('').trim()
    if (!content) continue
    out.push({ time: j.t / 1000, text: content })
  }
  return out.sort((a, b) => a.time - b.time)
}

/* ══════════ 格式 3：YRC 逐字 ══════════ */

/**
 * 解析单行 YRC：
 *   [22310,4300](22310,2880,0)都 (25190,310,0)是(25500,290,0)勇…
 * → { time, dur, text, words:[{ text, start, end }] }（秒）| null
 */
export function parseYrcLine (line) {
  const s = String(line || '').trim()
  const head = s.match(YRC_LINE_RE)
  if (!head) return null
  const time = parseInt(head[1], 10) / 1000
  const dur = parseInt(head[2], 10) / 1000
  const rest = s.slice(head[0].length)
  YRC_WORD_RE.lastIndex = 0
  const tags = [...rest.matchAll(YRC_WORD_RE)]
  if (!tags.length) return null
  const words = []
  for (let i = 0; i < tags.length; i++) {
    const start = parseInt(tags[i][1], 10) / 1000
    const wdur = parseInt(tags[i][2], 10) / 1000
    const from = tags[i].index + tags[i][0].length
    const to = i + 1 < tags.length ? tags[i + 1].index : rest.length
    const text = rest.slice(from, to).trim()
    if (!text) continue
    words.push({ text, start, end: start + wdur })
  }
  if (!words.length) return null
  return {
    time,
    dur,
    text: words.map((w) => w.text).join(''),
    words
  }
}

/**
 * yrc 字段混合格式解析：制作名单行（JSON-LRC）+ 正文行（YRC）。
 * 返回与 parseLrcText 同构的 [{ time, text }]，逐字行走 words 字段。
 */
export function parseYrc (text) {
  const out = []
  for (const line of String(text || '').split('\n')) {
    const s = line.trim()
    if (!s) continue
    if (s[0] === '{') {
      const j = parseJsonLrc(s)
      if (j.length) out.push(j[0])
    } else if (s[0] === '[') {
      const l = parseYrcLine(s)
      if (l) out.push(l)
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

/* ══════════ 译文合并 ══════════ */

/** 译文按时间就近挂到原文行上（0.1s 粒度匹配，失败就近 4s 内未使用的行） */
export function attachTrans (lines, transLines) {
  if (!lines.length) return []
  if (!transLines || !transLines.length) return lines.map((x) => ({ ...x, trans: '' }))
  const used = new Array(transLines.length).fill(false)
  const key = (t) => Math.round(t * 10) / 10
  const map = new Map()
  transLines.forEach((t, i) => {
    const k = key(t.time)
    if (!map.has(k)) map.set(k, i)
  })
  return lines.map((x) => {
    let i = map.get(key(x.time))
    if (i == null) {
      let best = -1
      let bestD = 4
      transLines.forEach((t, j) => {
        if (used[j]) return
        const d = Math.abs(t.time - x.time)
        if (d < bestD) { bestD = d; best = j }
      })
      i = best
    }
    if (i == null || i < 0) return { ...x, trans: '' }
    used[i] = true
    return { ...x, trans: transLines[i].text }
  })
}

/* ══════════ 总入口 ══════════ */

/**
 * 音源原始歌词 → 统一模型
 * @param {string} platform 'netease' | 'qq'
 * @param {object} raw { lyric, tlyric, yrc }
 *   netease: lyric=JSON-LRC 原文, tlyric=JSON-LRC 译文, yrc=YRC 逐字（混合）
 *   qq:      lyric=LRC 原文,    tlyric=LRC 译文
 * @returns {{ lines: Array, wordByWord: boolean }}
 */
export function parseLyric (platform, raw = {}) {
  const lyric = raw.lyric || ''
  const tlyric = raw.tlyric || ''
  const yrc = raw.yrc || ''

  let lines = []
  let wordByWord = false

  if (platform === 'netease') {
    // 优先逐字 yrc（混合格式：制作名单 JSON-LRC + 正文 YRC）
    if (yrc) {
      lines = parseYrc(yrc)
      wordByWord = lines.some((l) => l.words && l.words.length)
    }
    // 逐字缺失/解析失败 → 退回 JSON-LRC 行级
    if (!lines.length && lyric) lines = parseJsonLrc(lyric)
    // 译文（JSON-LRC）
    const trans = tlyric ? parseJsonLrc(tlyric) : []
    lines = attachTrans(lines, trans)
    // 网易云 JSON-LRC 原文没有逐字歌词时，也补一份纯 LRC 文本尝试（老接口兼容）
    if (!lines.length && lyric && !lyric.trim().startsWith('{')) lines = parseLrcText(lyric)
  } else {
    // QQ 及其他：纯文本 LRC + 译文
    lines = parseLrcText(lyric)
    lines = attachTrans(lines, parseLrcText(tlyric))
  }

  return { lines, wordByWord }
}

/* ══════════ 播放辅助 ══════════ */

/** 当前秒数 → 歌词行号（二分，含 150ms 预点亮）；空歌词返回 -1 */
export function lineIndexAt (lines, sec) {
  if (!lines || !lines.length) return -1
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= sec + 0.15) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

/** 行内当前词索引；该行无逐字返回 -1 */
export function wordIndexAt (line, sec) {
  if (!line || !line.words || !line.words.length) return -1
  let ans = -1
  for (let i = 0; i < line.words.length; i++) {
    if (line.words[i].start <= sec + 0.03) ans = i
    else break
  }
  return ans
}

/**
 * 行内逐字渲染进度：当前词的 0~1 平滑进度
 * 用于卡拉OK宽度动画，返回 { index, progress }
 */
export function wordProgress (line, sec) {
  if (!line || !line.words || !line.words.length) return { index: -1, progress: 0 }
  const i = wordIndexAt(line, sec)
  if (i < 0) return { index: -1, progress: 0 }
  const w = line.words[i]
  if (sec >= w.end) return { index: i, progress: 1 }
  if (sec <= w.start) return { index: i, progress: 0 }
  return { index: i, progress: (sec - w.start) / (w.end - w.start) }
}

/** 秒 → mm:ss */
export function fmtTime (sec) {
  if (!sec || !isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
