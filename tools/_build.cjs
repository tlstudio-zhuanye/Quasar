'use strict'
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const ROOT = 'D:/AI工作区/2026-10-16-23-25-40/TLMusic'
;(async () => {
  process.chdir(ROOT)
  const vitePath = require.resolve('vite', { paths: [ROOT] })
  const { build } = await import(pathToFileURL(vitePath).href)
  await build({ root: ROOT, configFile: path.join(ROOT, 'vite.config.mjs') })
  console.log('BUILD_DONE')
})().catch((e) => { console.error('BUILD_FAIL', (e && e.stack) || e); process.exit(1) })
