/**
 * LRC 歌词解析 / 合并
 */
const TIME_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/** 解析 LRC 文本 → [{ time, text }]（按时间升序） */
export function parseLrc (text) {
  const out = []
  const raw = String(text || '')
  for (const line of raw.split('\n')) {
    TIME_RE.lastIndex = 0
    const stamps = [...line.matchAll(TIME_RE)]
    if (!stamps.length) continue
    const content = line.replace(TIME_RE, '').trim()
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

/**
 * 合并原文与译文
 * 同一时间点的翻译会作为 trans 挂在原文行上
 */
export function mergeLrc (origin, trans) {
  if (!origin || !origin.length) return []
  if (!trans || !trans.length) return origin.map((x) => ({ ...x, trans: '' }))

  const transMap = new Map()
  for (const t of trans) {
    const k = Math.round(t.time * 10) / 10
    if (!transMap.has(k)) transMap.set(k, t.text)
  }
  return origin.map((x) => {
    const k = Math.round(x.time * 10) / 10
    return { ...x, trans: transMap.get(k) || '' }
  })
}

/** 根据当前播放秒数找到歌词行号（二分） */
export function indexAt (lyric, sec) {
  if (!lyric || !lyric.length) return -1
  let lo = 0
  let hi = lyric.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lyric[mid].time <= sec + 0.15) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

/** 秒 → mm:ss */
export function fmtTime (sec) {
  if (!sec || !isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
