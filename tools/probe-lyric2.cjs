'use strict'
/**
 * 逐字歌词接口探测 第二轮（一次性工具）
 *   node tools/probe-lyric2.cjs
 * 目的：
 *   1. QQ：完整桌面端参数的 fcg_query_lyric_new.fcg 是否返回 QRC
 *   2. 网易云：weapi /song/lyric 带 yv 参数是否返回 yrc 逐字字段
 */
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const Module = require('node:module')

const FAKE = 'mock-electron'
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'electron') return FAKE
  return origResolve.call(this, request, parent, ...rest)
}
require.cache[FAKE] = {
  id: FAKE, filename: FAKE, loaded: true,
  exports: { app: { getPath: () => path.join(os.tmpdir(), 'quasar-test') } }
}

const sources = require(path.join(__dirname, '..', 'electron', 'sources', 'index.cjs'))

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

/* ══════════ 网易云 weapi 加密（从 netease.cjs 拷贝） ══════════ */
const PRESET_KEY = '0CoJUm6Qyw8W8jud'
const IV = '0102030405060708'
const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const PUB_KEY = '010001'
const MODULUS =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec' +
  '4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d8' +
  '13cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7'

function aesEncrypt (text, key) {
  const c = crypto.createCipheriv('aes-128-cbc', key, IV)
  return c.update(text, 'utf8', 'base64') + c.final('base64')
}
function modPow (base, exp, mod) {
  let r = 1n
  base %= mod
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod
    exp >>= 1n
    base = (base * base) % mod
  }
  return r
}
function rsaEncrypt (text) {
  const reversed = text.split('').reverse().join('')
  const hex = Buffer.from(reversed, 'utf8').toString('hex')
  const enc = modPow(BigInt('0x' + hex), BigInt('0x' + PUB_KEY), BigInt('0x' + MODULUS))
  return enc.toString(16).padStart(256, '0')
}
function weapiBody (obj) {
  const sk = Array.from({ length: 16 }, () =>
    BASE62[Math.floor(Math.random() * BASE62.length)]).join('')
  const params = aesEncrypt(aesEncrypt(JSON.stringify(obj), PRESET_KEY), sk)
  return new URLSearchParams({ params, encSecKey: rsaEncrypt(sk), csrf_token: '' }).toString()
}

const QRC_HEAD = /^\[\d+,\d+\]/
const WORD_TAG = /\(\d+,\d+[,)]/

function verdict (raw) {
  const t = (raw || '').trim()
  const line = t.split('\n').find((l) => QRC_HEAD.test(l.trim())) || ''
  return {
    isQrc: QRC_HEAD.test(t) || (!!line && WORD_TAG.test(line)),
    sample: line.slice(0, 160)
  }
}

async function jget (url, referer) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer || '' } })
  return r.text()
}

async function probeQQ () {
  console.log('══════════ QQ 逐字歌词（参数对比） ══════════')
  const list = await sources.search({ platform: 'qq', keyword: '周杰伦 稻香', limit: 3 })
  for (const s of list.slice(0, 2)) {
    console.log('\n样本：' + s.name + ' — ' + s.artist + ' mid=' + s.mid)
    const ts = Date.now()
    const variants = [
      ['A-精简(现状)', `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${s.mid}&format=json&nobase64=1&g_tk=5381`],
      ['B-桌面端全参', `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?_=${ts}&cv=4747474&ct=9&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=1&uin=0&g_tk=5381&songmid=${s.mid}`],
      ['C-音乐馆', `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${s.mid}&nobase64=1&platform=yqq.json&needNewCode=1&format=json&g_tk=5381`]
    ]
    for (const [name, url] of variants) {
      try {
        const txt = await jget(url, 'https://y.qq.com/portal/player.html')
        const j = JSON.parse(txt)
        const v = verdict(j.lyric)
        console.log(`  [${name}] keys=${Object.keys(j).join(',')} QRC判定=${v.isQrc}`)
        if (v.sample) console.log('    样本行：' + v.sample)
      } catch (e) { console.log(`  [${name}] 失败：` + e.message.slice(0, 100)) }
    }
  }
}

async function probeNetease () {
  console.log('\n══════════ 网易云逐字（weapi yv 参数） ══════════')
  const list = await sources.search({ platform: 'netease', keyword: '周杰伦 稻香', limit: 8 })
  const s = list.find((x) => x.artist === '周杰伦') || list[0]
  console.log('样本：' + s.name + ' — ' + s.artist + ' id=' + s.id)

  const paramSets = [
    ['现状 lv/kv/tv=-1', { id: String(s.id), lv: -1, kv: -1, tv: -1 }],
    ['加 yv=-1', { id: String(s.id), lv: -1, kv: -1, tv: -1, yv: -1 }],
    ['加 yv=1', { id: String(s.id), lv: -1, kv: -1, tv: -1, yv: 1 }]
  ]
  for (const [name, obj] of paramSets) {
    try {
      const r = await fetch('https://music.163.com/weapi/song/lyric?csrf_token=', {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: 'https://music.163.com/',
          Origin: 'https://music.163.com'
        },
        body: weapiBody(obj)
      })
      const j = await r.json()
      console.log(`  [${name}] 顶层字段：${Object.keys(j).join(',')}`)
      if (j.yrc) {
        const v = verdict(j.yrc.lyric)
        console.log(`    yrc.code=${j.yrc.code} ver=${j.yrc.version} QRC判定=${v.isQrc}`)
        if (v.sample) console.log('    yrc 样本行：' + v.sample)
      }
      if (j.sgc !== undefined) console.log(`    sgc=${j.sgc}`)
      if (j.lrc && j.lrc.lyric) console.log('    lrc 前 60 字：' + String(j.lrc.lyric).slice(0, 60).replace(/\n/g, '⏎'))
    } catch (e) { console.log(`  [${name}] 失败：` + e.message.slice(0, 100)) }
  }

  /* 附：官方 lyric/v1 原曲 */
  try {
    const txt = await jget(
      `https://music.163.com/api/song/lyric/v1?os=pc&appver=8.10.90&id=${s.id}&tv=-1&lv=-1&kv=-1&yv=-1`,
      'https://music.163.com/')
    const j = JSON.parse(txt)
    const d = j.data || j
    console.log(`\n  [lyric/v1 原曲] 字段：${Object.keys(d).join(',')}`)
    if (d.yrc && d.yrc.lyric) {
      const v = verdict(d.yrc.lyric)
      console.log(`    yrc QRC判定=${v.isQrc}`)
      if (v.sample) console.log('    yrc 样本行：' + v.sample)
    }
  } catch (e) { console.log('  [lyric/v1] 失败：' + e.message.slice(0, 100)) }
}

async function main () {
  try { await probeQQ() } catch (e) { console.log('QQ 探测失败：' + e.message) }
  try { await probeNetease() } catch (e) { console.log('网易云探测失败：' + e.message) }
}
main()
