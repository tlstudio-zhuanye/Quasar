'use strict'
/** 三平台「排行榜 / 推荐」接口自检 */
const path = require('node:path')
const os = require('node:os')
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

async function main () {
  for (const p of ['netease', 'qq', 'kugou']) {
    console.log(`══════════ ${p} ══════════`)
    try {
      const tops = await sources.toplists({ platform: p })
      console.log(`榜单数：${tops.length}`)
      tops.slice(0, 4).forEach((t) => console.log(`   ${t.id}  ${t.name}`))
      const t0 = tops[0]
      if (t0) {
        const r = await sources.ranking({ platform: p, id: t0.id })
        console.log(`《${t0.name}》返回 ${r.songs.length} 首：`)
        r.songs.slice(0, 3).forEach((s, i) => {
          console.log(`   ${i + 1}. ${s.name} — ${s.artist} ${(s.duration / 1000).toFixed(0)}s${s.vip ? ' [VIP]' : ''}`)
        })
      }
      const rec = await sources.recommend({ platform: p })
      console.log(`推荐：${rec.length} 首${rec[0] ? '，首条 ' + rec[0].name : ''}`)
    } catch (e) {
      console.log(`  ✗ ${e.message}`)
    }
    console.log('')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
