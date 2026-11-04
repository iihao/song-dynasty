#!/usr/bin/env bash
# 一键体检：临时建库 → audit --strict → 静态构建（不污染现有 dist/）
set -euo pipefail
cd "$(dirname "$0")/.."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

python3 db/init_db.py --db "$tmp/song.db"
python3 tools/audit.py --db "$tmp/song.db" --strict
python3 build.py --out "$tmp/dist" --strict

echo "✓ check 通过"
