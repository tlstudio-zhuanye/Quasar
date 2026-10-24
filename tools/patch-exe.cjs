'use strict'
/**
 * 用 resedit（纯 JS 的 PE 资源编辑器）给 exe 换上自定义图标与版本信息。
 * 不依赖 rcedit / electron-builder，离线可用。
 *
 *   node tools/patch-exe.cjs <目标.exe>
 */
const fs = require('node:fs')
const path = require('node:path')
const ResEdit = require('resedit')

const ROOT = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

const exePath = process.argv[2]
const icoPath = process.argv[3] || path.join(ROOT, 'build', 'icon.ico')

if (!exePath || !fs.existsSync(exePath)) {
  console.error('用法: node tools/patch-exe.cjs <目标.exe> [icon.ico]')
  process.exit(1)
}

const LANG = 1033 // en-US
const CODEPAGE = 1200

function main () {
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true })
  const res = ResEdit.NtExecutableResource.from(exe)

  // 1) 图标
  if (fs.existsSync(icoPath)) {
    const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath))
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      1,
      LANG,
      iconFile.icons.map((i) => i.data)
    )
    console.log(`已替换图标（${iconFile.icons.length} 个尺寸）`)
  } else {
    console.warn('没找到 ico，跳过图标替换：' + icoPath)
  }

  // 2) 版本信息 / 字符串
  const vis = ResEdit.Resource.VersionInfo.fromEntries(res.entries)
  const vi = vis && vis[0]
  if (vi) {
    vi.setStringValues(
      { lang: LANG, codepage: CODEPAGE },
      {
        ProductName: pkg.productName,
        FileDescription: pkg.description,
        CompanyName: 'TLSTUDIO',
        LegalCopyright: 'Copyright © 2026 TLSTUDIO',
        OriginalFilename: `${pkg.productName}.exe`,
        InternalName: pkg.productName
      }
    )
    vi.setFileVersion(...pkg.version.split('.').map(Number), LANG, CODEPAGE)
    vi.setProductVersion(...pkg.version.split('.').map(Number), LANG, CODEPAGE)
    vi.outputToResourceEntries(res.entries)
    console.log(`已写入版本信息：${pkg.productName} v${pkg.version}`)
  } else {
    console.warn('原 exe 里没有版本资源，跳过')
  }

  res.outputResource(exe)
  fs.writeFileSync(exePath, Buffer.from(exe.generate()))
  console.log('已写回：' + exePath)
}

main()
