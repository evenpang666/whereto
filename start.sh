#!/usr/bin/env bash
set -euo pipefail
cd -- "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' '请先安装 Node.js 22 或更新版本：https://nodejs.org/'
  read -r -p '按回车退出…' _unused
  exit 1
fi
node scripts/launch.mjs
