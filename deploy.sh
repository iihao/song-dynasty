#!/usr/bin/env bash
# 构建并发布到 GitHub Pages（推送到 gh-pages 分支，单提交、强制覆盖，不膨胀历史）
#
#   ./deploy.sh                                   # 自动推导 https://<owner>.github.io/<repo>
#   BASE_URL=https://song.example.com ./deploy.sh # 自有域名
#
# 首次使用需要把仓库 Pages 源设为 gh-pages 分支（本脚本末尾会提示命令）。
set -euo pipefail
cd "$(dirname "$0")"

REMOTE="${REMOTE:-origin}"
REPO_URL="$(git remote get-url "$REMOTE")"

if [ -z "${BASE_URL:-}" ]; then
  slug="$(printf '%s' "$REPO_URL" | sed -E 's#.*github\.com[:/]([^/]+)/([^/.]+)(\.git)?$#\1/\2#')"
  owner="${slug%%/*}"
  repo="${slug##*/}"
  BASE_URL="https://${owner}.github.io/${repo}"
fi

echo "→ 构建（base-url = ${BASE_URL}）"
python3 build.py --strict --base-url "$BASE_URL"

echo "→ 发布 dist/ 到 gh-pages"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -R dist/. "$tmp/"
cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push -q --force "$REPO_URL" gh-pages

echo "✓ 已推送。若站点仍 404，确认 Pages 源："
echo "  gh api -X PUT repos/<owner>/<repo>/pages --input - <<< '{\"build_type\":\"legacy\",\"source\":{\"branch\":\"gh-pages\",\"path\":\"/\"}}'"
echo "  站点：${BASE_URL}/"
