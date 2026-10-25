'use strict'
/* JPEG/PNG → PNG 转换 + 网格像素统计（真实截屏分析用）
 *   node tools/_imgstat.cjs <in.jpg|png> <out.png|-> [gridX] [gridY]
 */
const fs = require('node:fs')
const { PNG } = require('D:/AI工作区/2026-10-16-23-25-40/TLMusic/node_modules/pngjs')

const IN = process.argv[2]
const OUT = process.argv[3] || '-'
const GX = Number(process.argv[4] || 16)
const GY = Number(process.argv[5] || 9)

let png
const buf = fs.readFileSync(IN)
if (buf[0] === 0xff && buf[1] === 0xd8) {
  const jpeg = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/jpeg-js')
  const raw = jpeg.decode(buf, { maxMemoryUsageInMB: 1024, formatAsRGBA: true })
  png = new PNG({ width: raw.width, height: raw.height })
  raw.data.copy(png.data)
} else {
  png = PNG.sync.read(buf)
}
if (OUT !== '-') fs.writeFileSync(OUT, PNG.sync.write(png))

const { width: W, height: H, data } = png
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
console.log(`尺寸: ${W}x${H}`)

/* 全图统计 */
let nonBlack = 0, maxL = 0
const hist = new Array(8).fill(0)
for (let i = 0; i < data.length; i += 4) {
  const l = lum(data[i], data[i + 1], data[i + 2])
  if (l > 24) nonBlack++
  if (l > maxL) maxL = l
  hist[Math.min(7, l >> 5)]++
}
const total = W * H
console.log(`非黑(>24): ${(nonBlack / total * 100).toFixed(2)}%  最大亮度: ${maxL.toFixed(0)}`)
console.log('亮度直方图: ' + hist.map((n) => (n / total * 100).toFixed(1) + '%').join(' '))

/* 网格均值 */
console.log('网格均值亮度:')
for (let gy = 0; gy < GY; gy++) {
  const row = []
  for (let gx = 0; gx < GX; gx++) {
    let sum = 0, n = 0
    const x0 = Math.floor(gx * W / GX), x1 = Math.floor((gx + 1) * W / GX)
    const y0 = Math.floor(gy * H / GY), y1 = Math.floor((gy + 1) * H / GY)
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 4
      sum += lum(data[i], data[i + 1], data[i + 2]); n++
    }
    row.push(String(Math.round(sum / n)).padStart(4))
  }
  console.log('  ' + row.join(''))
}

/* 找窗口：扫描亮度 > 60 的连通区域粗略边界（列/行投影） */
const colHas = new Array(W).fill(false), rowHas = new Array(H).fill(false)
for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
  const i = (y * W + x) * 4
  if (lum(data[i], data[i + 1], data[i + 2]) > 70) { colHas[x] = true; rowHas[y] = true }
}
const cs = colHas.map((v, i) => v ? i : -1).filter((i) => i >= 0)
const rs = rowHas.map((v, i) => v ? i : -1).filter((i) => i >= 0)
if (cs.length && rs.length) {
  console.log(`亮像素边界: x[${cs[0]}..${cs[cs.length - 1]}] y[${rs[0]}..${rs[rs.length - 1]}] (亮像素列数=${cs.length} 行数=${rs.length})`)
} else {
  console.log('全图没有 >70 的亮像素')
}
