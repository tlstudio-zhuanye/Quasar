'use strict'
/**
 * 生成 60 秒静音 wav（一次性工具）——用于无登录态下端到端验证播放/歌词链路
 *   node tools/make-silence.cjs
 */
const fs = require('node:fs')
const path = require('node:path')

const DURATION = 60
const RATE = 16000
const CH = 1
const BITS = 16
const bytesPerSample = BITS / 8
const dataSize = DURATION * RATE * CH * bytesPerSample

const buf = Buffer.alloc(44 + dataSize)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + dataSize, 4)
buf.write('WAVE', 8)
buf.write('fmt ', 12)
buf.writeUInt32LE(16, 16) // fmt chunk size
buf.writeUInt16LE(1, 20) // PCM
buf.writeUInt16LE(CH, 22)
buf.writeUInt32LE(RATE, 24)
buf.writeUInt32LE(RATE * CH * bytesPerSample, 28) // byte rate
buf.writeUInt16LE(CH * bytesPerSample, 32) // block align
buf.writeUInt16LE(BITS, 34)
buf.write('data', 36)
buf.writeUInt32LE(dataSize, 40)
// 数据区全 0 = 静音

const out = path.join(__dirname, 'silence.wav')
fs.writeFileSync(out, buf)
console.log('已生成：' + out + '（' + (buf.length / 1024).toFixed(0) + ' KB，' + DURATION + 's 静音）')
