#!/usr/bin/env bash
# 本机开发启动脚本（Windows / Git Bash）
# 用法：bash tools/dev-start.sh
set -u

export PATH="/c/Users/Administrator/.workbuddy/binaries/PortableGit/versions/1.2.0/usr/bin:/c/Users/Administrator/.workbuddy/binaries/PortableGit/versions/1.2.0/mingw64/bin:/c/Windows/System32:/c/Windows"
cd "$(dirname "$0")/.." || exit 1

unset NODE_OPTIONS
unset ELECTRON_RUN_AS_NODE
export ELECTRON_DISABLE_SECURITY_WARNINGS=1
# 沙箱 / 远程会话下 GPU 进程会崩，走软件渲染
export TL_NO_GPU=1
# 打印主窗↔小窗中继日志到 _relay.log（排查用，可注释掉）
export TL_RELAY_LOG=1

rm -f _relay.log
exec ./node_modules/electron/dist/electron.exe . \
  --no-sandbox --disable-gpu --remote-debugging-port=9222
