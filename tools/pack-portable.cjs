'use strict'
/**
 * 兜底打包：不依赖 electron-builder，直接拼一个免安装目录版。
 *
 *   node tools/pack-portable.cjs
 *
 * 产出：release/Quasar-v<版本>-portable/
 *        ├─ Quasar-v<版本>.exe  ← 双击就能用（Electron 运行时改名而来）
 *        ├─ resources/app/    ← 我们的代码（dist + electron + package.json）
 *        └─ ...
 * 如果本机装了 rcedit（electron-builder 会带），顺便把 exe 图标/版本信息替换掉。
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const VER = pkg.version

const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist')
const RELEASE = path.join(ROOT, 'release')
const OUT = path.join(RELEASE, `Quasar-v${VER}-portable`)
const APP_OUT = path.join(OUT, 'resources', 'app')

function rmrf (p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

function copyDir (from, to, filter) {
  fs.mkdirSync(to, { recursive: true })
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name)
    const dst = path.join(to, e.name)
    if (filter && !filter(src, e)) continue
    if (e.isDirectory()) copyDir(src, dst, filter)
    else fs.copyFileSync(src, dst)
  }
}

function findRcedit () {
  const guesses = [
    path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe'),
    path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit.exe'),
    path.join(ROOT, 'node_modules', 'app-builder-bin', 'win', 'x64', 'rcedit-x64.exe')
  ]
  return guesses.find((p) => fs.existsSync(p)) || null
}

function main () {
  if (!fs.existsSync(ELECTRON_DIST)) {
    console.error('找不到 Electron 运行时：' + ELECTRON_DIST)
    process.exit(1)
  }

  console.log(`打包 Quasar v${VER} → ${OUT}`)
  rmrf(OUT)
  fs.mkdirSync(OUT, { recursive: true })

  // 1) Electron 运行时
  copyDir(ELECTRON_DIST, OUT)

  // 2) 把 electron.exe 改名成「产品名-v版本.exe」（文件名一眼看出是哪一版）
  const exeSrc = path.join(OUT, 'electron.exe')
  const exeName = `${pkg.productName}-v${VER}.exe`
  const exeDst = path.join(OUT, exeName)
  if (fs.existsSync(exeSrc)) fs.renameSync(exeSrc, exeDst)

  // 3) 我们的代码
  copyDir(path.join(ROOT, 'dist'), path.join(APP_OUT, 'dist'))
  copyDir(path.join(ROOT, 'electron'), path.join(APP_OUT, 'electron'))
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(APP_OUT, 'package.json'))

  // 4) 顺手塞一份说明
  fs.writeFileSync(path.join(OUT, '使用说明.txt'), [
    `Quasar v${VER} —— TLSTUDIO`,
    '',
    `免安装：双击本目录下的「${exeName}」即可运行。`,
    '整个目录可以拷到 U 盘 / 别的电脑上直接用（不要只拷 exe，同级文件都要带上）。',
    '',
    '登录态与收藏保存在：%APPDATA%\\Quasar\\quasar-data.json',
    '删掉它 = 清空本地收藏与登录信息。',
    '',
    '—— 如果双击没反应 / 没声音 ——',
    '程序会在 %APPDATA%\\Quasar\\startup.log 记一行启动状态，先看那个文件。',
    '若日志里 gpu=disabled_software，说明这台机器的 Chromium 沙箱拉不起 GPU / 音频服务，',
    '程序会自动在 %APPDATA%\\Quasar\\.no-sandbox 留一个标记，下一次启动就带上兼容参数',
    '（即：再双击一次即可，不必手动做任何事）。',
    '想恢复安全默认（重新启用沙箱）：删掉 .no-sandbox 这个文件。'
  ].join('\r\n'), 'utf8')

  // 5) 有 rcedit 就换图标 + 版本信息
  const rcedit = findRcedit()
  if (rcedit) {
    try {
      execFileSync(rcedit, [
        exeDst,
        '--set-icon', path.join(ROOT, 'build', 'icon.ico'),
        '--set-version-string', 'ProductName', pkg.productName,
        '--set-version-string', 'FileDescription', pkg.description,
        '--set-version-string', 'CompanyName', 'TLSTUDIO',
        '--set-file-version', VER,
        '--set-product-version', VER
      ], { stdio: 'inherit' })
      console.log('已替换 exe 图标与版本信息')
    } catch (e) {
      console.warn('rcedit 执行失败，保留默认图标：' + e.message)
    }
  } else {
    console.warn('没找到 rcedit，exe 将保留 Electron 默认图标')
  }

  // 6) 统计
  let bytes = 0
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else bytes += fs.statSync(p).size
    }
  }
  walk(OUT)
  console.log(`完成：${OUT}`)
  console.log(`体积：${(bytes / 1024 / 1024).toFixed(1)} MB`)
}

main()
