'use strict'
/* 一锤定音测试：把应用窗口短暂置顶（不抢焦点），用真实屏幕合成像素抓一张，然后立刻还原
 *   NODE_PATH=<workspace>/node_modules node tools/_flash.cjs <out.png> [标题]
 * 全程约 1 秒；SWP_NOACTIVATE 保证 FL Studio 保持前台焦点
 */
const fs = require('node:fs')
const koffi = require('koffi')
const { PNG } = require('pngjs')

const out = process.argv[2] || '_real-flash.png'
const title = process.argv[3] || 'Quasar'

const user32 = koffi.load('user32.dll')
const FindWindowW = user32.func('void* FindWindowW(const char16_t* lpClassName, const char16_t* lpWindowName)')
const GetWindowRect = user32.func('bool GetWindowRect(void* hWnd, _Out_ int32_t *lpRect)')
const SetWindowPos = user32.func('bool SetWindowPos(void* hWnd, void* hWndInsertAfter, int32_t X, int32_t Y, int32_t cx, int32_t cy, uint32_t uFlags)')
const GetLastError = koffi.load('kernel32.dll').func('uint32_t GetLastError()')

const HWND_TOPMOST = -1
const HWND_NOTOPMOST = -2
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010
const SWP_SHOWWINDOW = 0x0040

const hwnd = FindWindowW(null, title)
if (!hwnd) { console.error('WINDOW_NOT_FOUND ' + title); process.exit(1) }
const r = [0, 0, 0, 0]
GetWindowRect(hwnd, r)
console.log('hwnd=' + hwnd.toString() + ' rect=' + JSON.stringify(r))

const t0 = Date.now()
// 1) 置顶（不移动不改大小不抢焦点）
let ok = SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW)
console.log('topmost=' + ok + ' err=' + GetLastError())

// 2) 真实截屏（操作系统合成后的画面）
const screenshot = require('screenshot-desktop')
screenshot()
  .then((img) => {
    const jpeg = require('jpeg-js')
    const raw = jpeg.decode(img, { maxMemoryUsageInMB: 1024, formatAsRGBA: true })
    const W = raw.width, H = raw.height
    // 3) 立刻还原
    const ok2 = SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
    console.log('restore=' + ok2 + ' elapsed=' + (Date.now() - t0) + 'ms')
    console.log('screen=' + W + 'x' + H)

    // 4) 裁出窗口区域 + 统计
    const x0 = Math.max(0, r[0]), y0 = Math.max(0, r[1])
    const x1 = Math.min(W, r[2]), y1 = Math.min(H, r[3])
    const w = x1 - x0, h = y1 - y0
    const png = new PNG({ width: w, height: h })
    let sum = 0, nonBlack = 0
    const hist = new Array(8).fill(0)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = ((y0 + y) * W + (x0 + x)) * 4
        const d = (y * w + x) * 4
        const R = raw.data[s], G = raw.data[s + 1], B = raw.data[s + 2]
        png.data[d] = R; png.data[d + 1] = G; png.data[d + 2] = B; png.data[d + 3] = 255
        const lum = (R * 299 + G * 587 + B * 114) / 1000
        sum += lum
        if (lum > 24) nonBlack++
        hist[Math.min(7, lum >> 5)]++
      }
    }
    const total = w * h
    console.log('窗口区域: ' + w + 'x' + h)
    console.log('非黑(>24): ' + (nonBlack / total * 100).toFixed(2) + '%  平均亮度: ' + (sum / total).toFixed(1))
    console.log('亮度直方图(8档%): ' + hist.map(v => (v / total * 100).toFixed(1)).join(' '))
    // 也存一份全屏
    const full = new PNG({ width: W, height: H })
    for (let i = 0; i < W * H; i++) {
      full.data[i * 4] = raw.data[i * 4]
      full.data[i * 4 + 1] = raw.data[i * 4 + 1]
      full.data[i * 4 + 2] = raw.data[i * 4 + 2]
      full.data[i * 4 + 3] = 255
    }
    fs.writeFileSync(out.replace(/\.png$/, '') + '-full.png', PNG.sync.write(full))
    fs.writeFileSync(out, PNG.sync.write(png))
    console.log('saved ' + out + ' + -full.png')
  })
  .catch((e) => {
    // 出错也要还原
    SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
    console.error('CAPTURE_FAIL ' + e.message)
    process.exit(1)
  })
