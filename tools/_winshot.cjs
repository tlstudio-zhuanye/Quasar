'use strict'
/* 真实窗口截图：用 PrintWindow 把指定窗口（不管是否被遮挡）按系统渲染结果抓出来
 *   NODE_PATH=<workspace>/node_modules node tools/_winshot.cjs <out.png> [窗口标题]
 * 不动窗口层级、不抢前台，不影响用户正在用的 FL Studio
 */
const fs = require('node:fs')
const koffi = require('koffi')
const { PNG } = require('pngjs')

const out = process.argv[2] || '_winshot.png'
const title = process.argv[3] || 'Quasar'

const user32 = koffi.load('user32.dll')
const gdi32 = koffi.load('gdi32.dll')

const FindWindowW = user32.func('void* FindWindowW(const char16_t* lpClassName, const char16_t* lpWindowName)')
const GetWindowRect = user32.func('bool GetWindowRect(void* hWnd, _Out_ int32_t *lpRect)')
const GetClientRect = user32.func('bool GetClientRect(void* hWnd, _Out_ int32_t *lpRect)')
const IsWindowVisible = user32.func('bool IsWindowVisible(void* hWnd)')
const IsIconic = user32.func('bool IsIconic(void* hWnd)')
const CreateCompatibleDC = gdi32.func('void* CreateCompatibleDC(void* hdc)')
const CreateCompatibleBitmap = gdi32.func('void* CreateCompatibleBitmap(void* hdc, int32_t nWidth, int32_t nHeight)')
const SelectObject = gdi32.func('void* SelectObject(void* hdc, void* h)')
const DeleteObject = gdi32.func('bool DeleteObject(void* ho)')
const DeleteDC = gdi32.func('bool DeleteDC(void* hdc)')
const GetDIBits = gdi32.func('int32_t GetDIBits(void* hdc, void* hbm, uint32_t start, uint32_t cLines, void* lpvBits, void* lpbmi, uint32_t usage)')
const PrintWindow = user32.func('bool PrintWindow(void* hWnd, void* hDC, uint32_t nFlags)')

const hwnd = FindWindowW(null, title)
if (!hwnd) { console.error('WINDOW_NOT_FOUND title=' + title); process.exit(1) }
console.log('hwnd=' + hwnd.toString() + ' visible=' + IsWindowVisible(hwnd) + ' iconic=' + IsIconic(hwnd))

const wr = [0, 0, 0, 0]
GetWindowRect(hwnd, wr)
const w = wr[2] - wr[0]
const h = wr[3] - wr[1]
console.log('windowRect=' + JSON.stringify(wr) + ' size=' + w + 'x' + h)
if (w <= 0 || h <= 0) { console.error('BAD_SIZE'); process.exit(1) }

// BITMAPINFOHEADER(40) + no color table; biHeight positive => bottom-up
const bi = Buffer.alloc(40)
bi.writeUInt32LE(40, 0)          // biSize
bi.writeInt32LE(w, 4)            // biWidth
bi.writeInt32LE(h, 8)            // biHeight
bi.writeUInt16LE(1, 12)          // biPlanes
bi.writeUInt16LE(32, 14)         // biBitCount
bi.writeUInt32LE(0, 16)          // biCompression = BI_RGB
bi.writeUInt32LE(w * h * 4, 20)  // biSizeImage
bi.writeInt32LE(0, 24)           // biXPelsPerMeter
bi.writeInt32LE(0, 28)           // biYPelsPerMeter
bi.writeUInt32LE(0, 32)          // biClrUsed
bi.writeUInt32LE(0, 36)          // biClrImportant

const buf = koffi.alloc('uint8_t', w * h * 4)
const memDC = CreateCompatibleDC(null)
const bmp = CreateCompatibleBitmap(memDC, w, h)
const old = SelectObject(memDC, bmp)

// PW_RENDERFULLCONTENT = 2，失败再退 0
let ok = PrintWindow(hwnd, memDC, 2)
if (!ok) { console.log('PrintWindow(2) failed, retry with 0'); ok = PrintWindow(hwnd, memDC, 0) }
console.log('PrintWindow ok=' + ok)

const lines = GetDIBits(memDC, bmp, 0, h, buf, bi, 0)
console.log('GetDIBits lines=' + lines)
SelectObject(memDC, old)
DeleteObject(bmp)
DeleteDC(memDC)
if (lines !== h) { console.error('GETDIBITS_FAIL lines=' + lines); process.exit(1) }

const px = Buffer.from(koffi.decode(buf, 'uint8_t', w * h * 4))
// BGRA bottom-up -> 统计 + 写 PNG（转成 top-down RGBA）
const png = new PNG({ width: w, height: h })
let sum = 0
let nonBlack = 0
let hist = new Array(8).fill(0)
for (let y = 0; y < h; y++) {
  const srcRow = (h - 1 - y) * w * 4
  for (let x = 0; x < w; x++) {
    const s = srcRow + x * 4
    const d = (y * w + x) * 4
    const b = px[s], g = px[s + 1], r = px[s + 2]
    png.data[d] = r; png.data[d + 1] = g; png.data[d + 2] = b; png.data[d + 3] = 255
    const lum = (r * 299 + g * 587 + b * 114) / 1000
    sum += lum
    if (lum > 24) nonBlack++
    hist[Math.min(7, lum >> 5)]++
  }
}
const total = w * h
console.log('尺寸: ' + w + 'x' + h)
console.log('非黑(>24): ' + (nonBlack / total * 100).toFixed(2) + '%  平均亮度: ' + (sum / total).toFixed(1))
console.log('亮度直方图(8档%): ' + hist.map(v => (v / total * 100).toFixed(1)).join(' '))
fs.writeFileSync(out, PNG.sync.write(png))
console.log('saved ' + out)
