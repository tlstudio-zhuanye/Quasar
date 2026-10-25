'use strict'
/**
 * 纯 node 流式 zip 打包（无第三方依赖，离线和）。
 *   node tools/_zip.cjs <目录> <输出.zip>
 * 手写 ZIP 结构：local file header + central directory + EOCD；
 * deflate 用 zlib.deflateRawSync（level 6），压不小就 store；
 * 文件名按 UTF-8（flag 0x0800）。流式写盘，不全量进内存。
 */
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const SRC = process.argv[2]
const OUT = process.argv[3]
if (!SRC || !OUT) { console.error('用法: node tools/_zip.cjs <目录> <输出.zip>'); process.exit(1) }
if (!fs.statSync(SRC).isDirectory()) { console.error('不是目录: ' + SRC); process.exit(1) }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
function crc32 (buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function walk (dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name)
    const rel = base ? base + '/' + e.name : e.name
    if (e.isDirectory()) walk(full, rel, out)
    else if (e.isFile()) out.push({ full, rel })
  }
  return out
}

function dosDT (d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return [time & 0xFFFF, date & 0xFFFF]
}

const files = walk(SRC, '', [])
const fd = fs.openSync(OUT, 'w')
const central = []
let offset = 0
let totalRaw = 0

try {
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const raw = fs.readFileSync(f.full)
    const nameBuf = Buffer.from(f.rel, 'utf8')
    const crc = crc32(raw)
    const def = zlib.deflateRawSync(raw, { level: 6 })
    const useDef = def.length < raw.length
    const data = useDef ? def : raw
    const method = useDef ? 8 : 0
    const [time, date] = dosDT(fs.statSync(f.full).mtime)

    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0x0800, 6)
    lh.writeUInt16LE(method, 8)
    lh.writeUInt16LE(time, 10)
    lh.writeUInt16LE(date, 12)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(data.length, 18)
    lh.writeUInt32LE(raw.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)
    fs.writeSync(fd, lh)
    fs.writeSync(fd, nameBuf)
    fs.writeSync(fd, data)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(method, 10)
    ch.writeUInt16LE(time, 12)
    ch.writeUInt16LE(date, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(data.length, 20)
    ch.writeUInt32LE(raw.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt16LE(0, 30)
    ch.writeUInt16LE(0, 32)
    ch.writeUInt16LE(0, 34)
    ch.writeUInt16LE(0, 36)
    ch.writeUInt32LE(0, 38)
    ch.writeUInt32LE(offset, 42)
    central.push(ch, nameBuf)

    offset += 30 + nameBuf.length + data.length
    totalRaw += raw.length
    if (i % 10 === 0 || raw.length > 50 * 1024 * 1024) {
      console.log(`  [${i + 1}/${files.length}] ${f.rel} ${(raw.length / 1048576).toFixed(1)}MB -> ${(data.length / 1048576).toFixed(1)}MB`)
    }
  }

  const cdBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(cdBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  fs.writeSync(fd, cdBuf)
  fs.writeSync(fd, eocd)
} finally {
  fs.closeSync(fd)
}

console.log(`打包完成: ${OUT}`)
console.log(`entries=${files.length} raw=${(totalRaw / 1048576).toFixed(1)}MB zip=${(fs.statSync(OUT).size / 1048576).toFixed(1)}MB`)
if (!files.length) process.exit(2)
