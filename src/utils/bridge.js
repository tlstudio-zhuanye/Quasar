/**
 * bridge.js — 渲染层 → preload 的参数压平
 *
 * 背景：contextBridge 暴露的接口在「主世界 → 隔离世界」这一步就会做结构化克隆，
 * Vue 的响应式 Proxy（reactive / ref 深层对象）带内部标记，克隆会直接抛
 * "An object could not be cloned."，此时 preload 里的兜底根本来不及执行。
 * 所以凡是把「响应式对象」往 window.TL 里传的地方，都必须先在渲染层压成纯数据。
 */
export function plain (v) {
  if (v === undefined || v === null) return v
  const t = typeof v
  if (t === 'string' || t === 'number' || t === 'boolean') return v
  if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined
  try {
    return JSON.parse(JSON.stringify(v))
  } catch (_) {
    return undefined
  }
}
