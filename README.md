# Quasar

TLSTUDIO 出品的双平台聚合音乐播放器 —— **网易云 / QQ音乐** 一键切换，
跨平台混合收藏，外加一个 Windows Media Player 式的紧凑小窗。

> 2026-10-24 起产品名由「TL音乐 / TLMusic」改为 **Quasar**（类星体）。
> 老版本的数据在 `%APPDATA%\TL音乐\`，新版本首次启动会自动搬到 `%APPDATA%\Quasar\`。
>
> **v1.2.1**（2026-10-25）：修复无歌曲时进入全屏歌词舞台显示为黑屏的问题 ——
> 空态改为带引导的明确提示（主题氛围光 + 「还没有在播放的歌曲」+ 返回按钮）。

## 它是什么

同一个程序里塞进两个平台的曲库与歌单：

- **两种模式**：顶部切换「网易云模式 / QQ音乐模式」，
  整站搜索、推荐、排行榜、歌单、主题色（红 / 绿）随之切换。
- **混合收藏**：两个平台的歌可以收进同一个「我的收藏」，
  列表里保留来源标记，点开就是一条统一的播放队列，能连续播放。
- **WMP 式小窗**：仿 Windows Media Player 紧凑模式 —— 竖版窄条、
  封面铺底、底部半透明控制条，置顶浮在桌面上；小窗上的
  播放 / 切歌 / 进度 / 音量都会实时作用到主窗的播放器上。
- **全屏歌词舞台**：双击封面或点播放条上的 ⛶ 进全屏沉浸模式 ——
  封面高斯模糊铺底、按封面取的主题色、三行视口、逐字卡拉 OK。
  网易云的歌走 YRC 逐字时间戳（每个词按毫秒填充），QQ音乐走行级 LRC。
  歌词接口不需要登录，VIP 歌拿不到音源也看得到词。
- **登录**：优先自建扫码框 + Cookie 导入；扫码接口对个别平台不稳定时，
  可以一键切到「官方页面登录」，登完自动把 Cookie 收回本机。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 外壳 | Electron 44（主进程 + preload 隔离） |
| 界面 | Vue 3 + Vite 8 + Pinia |
| 音源 | 主进程内实现的双平台适配器（见 `electron/sources/`） |
| 存储 | 本地 JSON（`userData/quasar-data.json`） |

## 目录

```
electron/
  main.cjs            主进程：窗口、小窗、官方登录窗、防盗链请求头、IPC
  preload.cjs         渲染层唯一入口（contextBridge）
  store.cjs           本地数据：收藏 / 历史 / 设置 / Cookie
  cookie-utils.cjs    登录工具链：cookie 归一 / QQ 票据分级 / 解码
  sources/
    index.cjs         音源调度（按 platform 分发）
    request.cjs       HTTP 助手：UA / Cookie / 超时 / JSONP
    netease.cjs       网易云（weapi AES+RSA 加密、lyric/v1 三格式歌词）
    qq.cjs            QQ音乐（search_for_qq_cp + vkey 播放 + LRC 歌词）
src/
  views/MainWindow.vue    主界面
  views/MiniPlayer.vue    WMP 式小窗
  components/             标题栏 / 侧边栏 / 歌曲表 / 播放条 / 登录框 / 全屏歌词舞台
  stores/                 player / mode / favorites
  utils/lrc.js            LRC 解析与合并
  utils/lyrics.js         统一歌词模型：LRC / JSON-LRC / YRC 逐字 + 译文合并
  utils/bridge.js         跨进程传参前把响应式对象压平（见下方「坑」）
tools/                    音源烟雾测试、歌词单测、诊断、CDP 自检、离屏打包（pack-portable / patch-exe / verify-packed）
```

## 歌词数据源：一套接口，三种格式

`electron/sources/netease.cjs` 的 `lyric()` 走 `api/song/lyric/v1`，一次带回三个字段，
格式各不相同（`src/utils/lyrics.js` 就是为这个写的，37 条单测）：

| 字段 | 格式 | 用途 |
| --- | --- | --- |
| `lrc` | JSON-LRC：`{"t":ms,"c":[{"tx":"文字"}]}` 每行一条 | 正文行级歌词 |
| `tlyric` | 同上，译文 | 译文合并（0.1s 粒度时间匹配 + 4s 就近兜底） |
| `yrc` | **混合**：制作名单行是 JSON-LRC，正文行是 YRC 逐字文本 `[起始ms,时长ms](词起,词时,0)文字` | 逐字卡拉 OK |

QQ 音乐走 `fcg_query_lyric_new.fcg?songmid=X&format=json&nobase64=1&g_tk=5381`，
返回普通 LRC 纯文本（带 `cv=4747474` 桌面端全参反而返空；
`musicu.fcg` 的 GetLyric 报 500003，要设备指纹）。所以 QQ 只有行级歌词。

未登录态：音源（songUrl）对 VIP 全线拿不到 URL，但**歌词接口不需要登录**，
所以 `_loadLyric` 放在 `_load` 的 finally 块里，音源失败也照常出词。

## 一个必须记住的坑：IPC 参数要先压平

`contextBridge` 暴露的接口，在「渲染层 → preload」这一步就会做结构化克隆。
Vue 的响应式对象（`reactive` / 深层 `ref`）带内部标记，克隆会直接抛
`An object could not be cloned.` —— 这时候 preload 里再怎么写兜底都来不及，
因为**异常在进入 preload 之前就已经抛了**。

所以凡是往 `window.TL` 里传对象的调用，都必须先在渲染层
`JSON.parse(JSON.stringify(x))` 压成纯数据，统一用 `src/utils/bridge.js` 的 `plain()`。
最容易踩的地方正好是核心链路：播放状态广播（带 `current` 歌曲对象）、
收藏写入、播放指令下发。

## 开发

```bash
npm install
npm run dev      # Vite 开发服务器（配 electron . 用）
npm run build    # 构建前端到 dist/
npm start        # 直接跑已构建的产物
npm run icon     # 重新生成 build/icon.ico
npm run dist     # 打 Windows 包（需要 electron-builder 完整装好，输出 release/）
```

### 打包（本机可用的离线链路）

`electron-builder` 依赖的 `app-builder-bin` 是几十上百 MB 的二进制，
国内镜像下经常装不下来（`electron-winstaller` 的 postinstall 也会报 code:1）。
装不上时走自写的兜底链路，**完全不联网、不需要 electron-builder**：

```bash
node tools/pack-portable.cjs                       # 拼出 release/Quasar-v1.2.1-portable/
node tools/patch-exe.cjs "release/Quasar-v1.2.1-portable/Quasar-v1.2.1.exe" build/icon.ico
```

- `pack-portable.cjs`：复制 `node_modules/electron/dist` → 把 `electron.exe`
  改名成 `Quasar-v1.2.1.exe` → 把 `dist/` + `electron/` + `package.json`
  放进 `resources/app/` → 附一份「使用说明.txt」。
- `patch-exe.cjs`：用 **resedit**（纯 JS 的 PE 资源编辑器）把图标和版本信息写进 exe，
  替代需要联网下载的 rcedit。
- 前端产物要**先 `npm run build`**（`pack-portable.cjs` 不会自己构建），
  否则打进去的是旧的 `dist/`。

> 打包前记得先结束正在运行的实例，否则 `release/` 目录被占用会报 `EBUSY`。
> 杀进程要**按路径过滤**（别误杀桌面上手工测试的那一份），PowerShell 一把梭：
> `Get-Process | ? { $_.Path -like '*release\Quasar-v1.2.1-portable*' } | Stop-Process -Force`
> （本机 PortableGit 的 bash 里 `taskkill //IM` 传双斜杠会被原样传下去、报"无效参数"，
> 别走那条路。）

产出的成品文件名带版本号，一眼能分清是哪一版：

```
release/Quasar-v1.2.1-portable/Quasar-v1.2.1.exe   # 免安装，双击即用
```

## 三个环境坑（都踩过，别再踩）

### 1. GPU 进程起不来 → 「双击没反应」

受限环境（远程桌面 / 虚拟机 / 沙箱）里独立 GPU 进程拉不起来，
Chromium 的默认行为是**重试几次后直接 FATAL 退出**，用户看到的就是"双击了没反应"。
`main.cjs` 固定加了两个开关把这条路堵死：

- `disable-gpu-process-crash-limit`：取消"失败重试超限就自杀"的上限，进程不会死；
- `in-process-gpu`：GPU 代码跑进主进程，没有独立进程可崩，也就没有重试风暴。

实测对比（同一份产物）：只加 `--disable-gpu` → 仍 FATAL；只加 crash-limit → 进程活着但
GPU 每秒重启 ~40 次烧 CPU；两个都加 → 0 次 FATAL、0 次重启、日志只有 3 行。

### 2. Chromium 沙箱不可用 → 没声音

本机实测 `app.getGPUFeatureStatus()` 一直是 `disabled_software`，
连音频服务都起不来（表现：能开窗口，但播放报"音源已过期"）。
判定方式是**该状态与 `--no-sandbox` 强相关**：加 `--no-sandbox` 后同一首歌
`playing=true`、进度正常走。

因为不想默认牺牲沙箱，做成自愈：启动时若发现 GPU 是软件降级，
就在 `%APPDATA%\Quasar\.no-sandbox` 落一个标记，**下次启动自动带上 `--no-sandbox`**。
启动状态记在 `%APPDATA%\Quasar\startup.log`（一行：版本 / gpu / webgl / noSandbox / softRender），
排查问题先看这个文件。

### 3. Git Bash 里 exe 报 `bad option` / 静默退出

宿主环境（Electron 应用）会带 `ELECTRON_RUN_AS_NODE=1`，
于是 `xxx.exe` 被当成纯 Node 跑 —— 传 `--remote-debugging-port=9222` 就报
`bad option`，不传参就从 stdin 读、立刻退出。**启动 Electron 前必须清掉它**：

```bash
unset ELECTRON_RUN_AS_NODE
unset NODE_OPTIONS
```

## 自检

音源（脱离 Electron 跑，最快验证接口是否还有效）：

```bash
node tools/test-sources.cjs 周杰伦
```

歌词数据层单测（37 条，用真实接口返回的样本）：

```bash
node tools/test-lyrics.mjs
```

界面（应用带 `--remote-debugging-port=9222` 启动时可用）：

```bash
node tools/cdp-at.cjs main "document.title"     # 在某个窗口里执行 JS
node tools/shot.cjs out.png mini                # 截某个窗口
node tools/cdp-watch.cjs main "..."             # 执行并打印渲染层报错
```

打包产物整体自检（节点数 / preload 桥 / 是否加载打包资源 / 渲染层报错 + 截图）：

```bash
node tools/verify-packed.cjs out.png
```

## 已知边界

- **VIP / 独家版权的歌拿不到音源**。这是第三方客户端的共同天花板，
  不绕过会员机制；这类歌在列表里标 `VIP`，播放时会给出明确提示。
- 平台接口随时可能变。改接口只需要动 `electron/sources/<平台>.cjs`，
  其余部分不受影响 —— 上面那条自检命令就是为此准备的。
- 登录全部走官方页面或用户手动提供 Cookie，本程序不接触账号密码，
  只保存服务端下发的 Cookie。
- QQ 的播放票据（`qm_keyst` 等）要进过播放器页面才会下发，
  所以扫码登录后可能提示"播放授权未完成"——进任意播放页点一首歌再登一次即可。
