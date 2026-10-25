'use strict'
/**
 * zip 校验器：EOCD → 中央目录 → 逐条目与源目录比对 CRC32 / 大小 / local header。
 *   node tools/_zip-verify.cjs <zip> <源目录>
 */
const fs = require('node:fs')
const path = require('node:path')

const ZIP = process.argv[2]
const SRC = process.argv[3]
if (!ZIP || !SRC) { console.error('用法: node tools/_zip-verify.cjs <zip> <源目录>'); process.exit(1) }

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

const size = fs.statSync(ZIP).size
const fd = fs.openSync(ZIP, 'r')
const readAt = (buf, off) => { fs.readSync(fd, buf, 0, buf.length, off); return buf }

/* EOCD：末尾最多 64KB 范围内向前找签名 0x06054b50 */
const tail = Buffer.alloc(Math.min(66561, size))
readAt(tail, size - tail.length)
let eocdPos = -1
for (let i = tail.length - 22; i >= 0; i--) {
  if (tail.readUInt32LE(i) === 0x06054b50) { eocdPos = size - tail.length + i; break }
}
if (eocdPos < 0) { console.error('EOCD 没找到'); process.exit(1) }
const eocd = readAt(Buffer.alloc(22), eocdPos)
const count = eocd.readUInt16LE(10)
const cdSize = eocd.readUInt32LE(12)
const cdOff = eocd.readUInt32LE(16)

const cd = readAt(Buffer.alloc(cdSize), cdOff)
let p = 0
let bad = 0
for (let i = 0; i < count; i++) {
  if (cd.readUInt32LE(p) !== 0x02014b50) { console.error(`中央目录第 ${i} 条签名不对`); bad++; break }
  const crcWant = cd.readUInt32LE(p + 16)
  const csize = cd.readUInt32LE(p + 20)
  const usize = cd.readUInt32LE(p + 24)
  const nlen = cd.readUInt16LE(p + 28)
  const elen = cd.readUInt16LE(p + 30)
  const clen = cd.readUInt16LE(p + 32)
  const lho = cd.readUInt32LE(p + 42)
  const name = cd.toString('utf8', p + 46, p + 46 + nlen)
  p += 46 + nlen + elen + clen

  const src = path.join(SRC, name)
  if (!fs.existsSync(src)) { console.error(`缺文件: ${name}`); bad++; continue }
  const raw = fs.readFileSync(src)
  if (raw.length !== usize) { console.error(`大小不符: ${name} zip=${usize} src=${raw.length}`); bad++; continue }
  if (crc32(raw) !== crcWant) { console.error(`CRC 不符: ${name}`); bad++; continue }
  const lh = readAt(Buffer.alloc(30), lho)
  if (lh.readUInt32LE(0) !== 0x04034b50 || lh.readUInt32LE(14) !== crcWant) {
    console.error(`local header 不符: ${name}`); bad++; continue
  }
}
fs.closeSync(fd)
console.log(`entries=${count} checked=${count - bad} bad=${bad} ${bad === 0 ? 'ZIP_VERIFY_OK' : 'ZIP_VERIFY_FAIL'}`)
process.exit(bad === 0 ? 0 : 1)
