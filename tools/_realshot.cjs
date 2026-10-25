'use strict'
/* 真实全屏截图（不是 CDP 的渲染器截图，是操作系统层面的桌面画面）
 *   NODE_PATH=<workspace>/node_modules node tools/_realshot.cjs <out.png> [等待毫秒]
 */
const fs = require('node:fs')
const out = process.argv[2]
const wait = Number(process.argv[3] || 0)
const t0 = Date.now()

function shot () {
  const screenshot = require('screenshot-desktop')
  screenshot()
    .then((img) => {
      fs.writeFileSync(out, img)
      console.log(`saved ${out} ${img.length}B waited=${((Date.now() - t0) / 1000).toFixed(1)}s`)
    })
    .catch((e) => { console.error('CAPTURE_FAIL ' + e.message); process.exit(1) })
}
if (wait > 0) setTimeout(shot, wait)
else shot()
