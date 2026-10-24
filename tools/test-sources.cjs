'use strict'
/**
 * 音源层烟雾测试（脱离 Electron 运行）
 *   node tools/test-sources.cjs 周杰伦
 */
const path = require('node:path')
const os = require('node:os')
const Module = require('node:module')

/* ---- 把 electron 模块 mock 掉，让 store/sources 能在纯 Node 下跑 ---- */
const FAKE = 'mock-electron'
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'electron') return FAKE
  return origResolve.call(this, request, parent, ...rest)
}
require.cache[FAKE] = {
  id: FAKE,
  filename: FAKE,
  loaded: true,
  exports: {
    app: { getPath: () => path.join(os.tmpdir(), 'quasar-test') }
  }
}

const sources = require(path.join(__dirname, '..', 'electron', 'sources', 'index.cjs'))

const short = (s, n = 88) => String(s || '').slice(0, n)

async function main () {
  const kw = process.argv[2] || '周杰伦'
  console.log(`关键词：${kw}\n`)

  for (const p of ['netease', 'qq']) {
    console.log(`══════════ ${p} ══════════`)
    try {
      const t0 = Date.now()
      const list = await sources.search({ platform: p, keyword: kw, limit: 5 })
      console.log(`搜索：命中 ${list.length} 条（${Date.now() - t0}ms）`)
      list.slice(0, 3).forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.name} — ${s.artist} 《${s.album}》 ${(s.duration / 1000).toFixed(0)}s vip=${s.vip}`)
      })
      const first = list[0]
      if (first) {
        try {
          const u = await sources.songUrl({ platform: p, ...first })
          console.log(`  播放地址：OK  ${short(u.url, 80)}`)
        } catch (e) {
          console.log(`  播放地址：✗  ${e.message}`)
        }
        try {
          const l = await sources.lyric({ platform: p, ...first })
          console.log(`  歌词：${l.lyric.length} 字符`)
        } catch (e) {
          console.log(`  歌词：✗  ${e.message}`)
        }
      }
    } catch (e) {
      console.log(`  ✗ 搜索失败：${e.message}`)
    }
    console.log('')
  }
}

main().catch((e) => {
  console.error('测试异常：', e)
  process.exit(1)
})
