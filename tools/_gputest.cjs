'use strict'
/* GPU 开关矩阵测试夹具：杀旧实例 → 带额外开关启动 → 等 N 秒 → 置顶真实截屏 → 还原
 *   node tools/_gputest.cjs <标签> <额外开关(空格分隔)> [等待秒]
 */
const { execSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const koffi = require('koffi')
const { PNG } = require('pngjs')

const tag = process.argv[2] || 't'
const extra = process.argv[3] ? process.argv[3].split(/\s+/).filter(Boolean) : []
const waitSec = Number(process.argv[4] || 8)

const EXE = process.env.GPU_TEST_EXE || 'D:\\AI工作区\\2026-10-16-23-25-40\\TLMusic\\release\\Quasar-v1.2.1-portable\\Quasar-v1.2.1.exe'

// 1) 按路径杀旧实例（只杀 build 输出目录里的，不碰桌面那份）
try {
  execSync(`taskkill /FI "PATH eq ${EXE}" /T /F`, { stdio: 'pipe' })
  console.log('[kill] old instances killed')
} catch (e) { console.log('[kill] none running') }

// 2) 启动（追加 remote-debugging-port 供 chrome://gpu 检查）
const args = [...extra, '--remote-debugging-port=9333']
console.log('[launch] ' + tag + ' args=' + args.join(' '))
const child = spawn(EXE, args, {
  detached: true,
  stdio: 'ignore',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, NODE_OPTIONS: undefined }
})
child.unref()

// 3) 等启动
setTimeout(() => {
  const user32 = koffi.load('user32.dll')
  const FindWindowW = user32.func('void* FindWindowW(const char16_t* lpClassName, const char16_t* lpWindowName)')
  const GetWindowRect = user32.func('bool GetWindowRect(void* hWnd, _Out_ int32_t *lpRect)')
  const SetWindowPos = user32.func('bool SetWindowPos(void* hWnd, void* hWndInsertAfter, int32_t X, int32_t Y, int32_t cx, int32_t cy, uint32_t uFlags)')
  const HWND_TOPMOST = -1, HWND_NOTOPMOST = -2
  const SWP = 0x0001 | 0x0002 | 0x0010 | 0x0040

  const hwnd = FindWindowW(null, 'Quasar')
  if (!hwnd) { console.error('WINDOW_NOT_FOUND after ' + waitSec + 's'); process.exit(2) }
  const r = [0, 0, 0, 0]
  GetWindowRect(hwnd, r)
  console.log('[window] rect=' + JSON.stringify(r))

  SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP)
  const screenshot = require('screenshot-desktop')
  screenshot().then((img) => {
    SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP)
    const jpeg = require('jpeg-js')
    const raw = jpeg.decode(img, { maxMemoryUsageInMB: 1024, formatAsRGBA: true })
    const W = raw.width, H = raw.height
    const x0 = Math.max(0, r[0]), y0 = Math.max(0, r[1])
    const x1 = Math.min(W, r[2]), y1 = Math.min(H, r[3])
    const w = x1 - x0, h = y1 - y0
    const png = new PNG({ width: w, height: h })
    let sum = 0, nonBlack = 0
    const hist = new Array(8).fill(0)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = ((y0 + y) * W + (x0 + x)) * 4
      const d = (y * w + x) * 4
      const R = raw.data[s], G = raw.data[s + 1], B = raw.data[s + 2]
      png.data[d] = R; png.data[d + 1] = G; png.data[d + 2] = B; png.data[d + 3] = 255
      const lum = (R * 299 + G * 587 + B * 114) / 1000
      sum += lum; if (lum > 24) nonBlack++
      hist[Math.min(7, lum >> 5)]++
    }
    const total = w * h
    const file = `_gpu-${tag}.png`
    fs.writeFileSync(file, PNG.sync.write(png))
    console.log('[result] ' + tag + ' ' + w + 'x' + h + ' 非黑=' + (nonBlack / total * 100).toFixed(2) + '% 均亮=' + (sum / total).toFixed(1) + ' 直方图=' + hist.map(v => (v / total * 100).toFixed(1)).join(' '))
    console.log('[saved] ' + file)
    process.exit(0)
  }).catch((e) => {
    SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP)
    console.error('CAPTURE_FAIL ' + e.message); process.exit(3)
  })
}, waitSec * 1000)
