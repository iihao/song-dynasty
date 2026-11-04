#!/usr/bin/env bash
# 大宋全局志 · 本地开发启动
# 公网部署不要用这个：python3 build.py --base-url https://你的域名 后托管 dist/
set -euo pipefail
cd "$(dirname "$0")"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"

if [ ! -f db/song.db ]; then
  echo "未发现数据库，正在初始化…"
  python3 db/init_db.py
else
  # 旧库可能缺少新列（如 items.body）；启动前做一次无痛升级。
  python3 db/init_db.py --upgrade
fi

# 额外的命令行参数（如 --port 9000）会覆盖上面的默认值
exec python3 server/app.py --host "$HOST" --port "$PORT" "$@"
