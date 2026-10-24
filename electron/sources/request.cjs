'use strict'
/**
 * request.cjs — 统一的 HTTP 请求助手
 * 负责：UA、各平台 Cookie 注入、超时、JSONP 解包、x-www-form-urlencoded 组装
 */
const store = require('../store.cjs')

// 部分音乐 CDN 只给出 IPv6 解析结果，本机 IPv6 不通会直接 fetch failed —— 强制优先 IPv4
try {
  require('node:dns').setDefaultResultOrder('ipv4first')
} catch (_) {}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

function cookieOf (platform) {
  try {
    const jar = store.get('cookies') || {}
    return jar[platform] || ''
  } catch (_) {
    return ''
  }
}

/** 把对象拼成 a=1&b=2（已编码） */
function form (obj) {
  return Object.entries(obj || {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

/** 把对象拼成查询串 */
function qs (obj) {
  const s = form(obj)
  return s ? `?${s}` : ''
}

/**
 * @param {string} url
 * @param {object} opt
 *   platform  注入该平台 Cookie
 *   method    GET / POST
 *   headers   额外请求头
 *   body      字符串或对象（对象自动转表单）
 *   json      true(默认) 解析 JSON；false 返回文本
 *   jsonp     去除 JSONP 包裹
 *   timeout   毫秒
 *   referer   覆盖 Referer
 */
async function request (url, opt = {}) {
  const headers = { 'User-Agent': UA, ...(opt.headers || {}) }

  if (opt.platform) {
    const ck = cookieOf(opt.platform)
    if (ck) headers['Cookie'] = ck
  }
  if (opt.referer) headers['Referer'] = opt.referer

  let body = opt.body
  if (body && typeof body === 'object') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = form(body)
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opt.timeout || 12000)

  let res
  try {
    res = await fetch(url, {
      method: opt.method || (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: ctrl.signal,
      redirect: 'follow'
    })
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') throw new Error(`请求超时: ${url}`)
    throw new Error(`网络请求失败: ${e.message}`)
  }
  clearTimeout(timer)

  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)

  // 需要拿到响应头（例如登录时抓 Set-Cookie）时直接返回原生 Response
  if (opt.raw) return res

  const text = await res.text()
  if (opt.json === false) return text

  let payload = text.trim()
  if (opt.jsonp !== false && /^[\w$.]+\s*\(/.test(payload)) {
    payload = payload.replace(/^[\w$.]+\s*\(/, '').replace(/\)\s*;?\s*$/, '')
  }
  try {
    return JSON.parse(payload)
  } catch (_) {
    throw new Error(`返回内容不是合法 JSON（前 120 字）: ${text.slice(0, 120)}`)
  }
}

module.exports = { request, qs, form, UA }
