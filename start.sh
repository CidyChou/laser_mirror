#!/bin/bash
set -e
cd "$(dirname "$0")"

PORT=8347
while lsof -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT+1)); done

if ! command -v node >/dev/null 2>&1; then
  echo "需要 Node.js 20+。请先安装 Node.js 后重新运行。"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "首次运行：正在安装依赖..."
  npm install
fi

URL="http://127.0.0.1:${PORT}"
echo "Laser Mirror v7.6: ${URL}"
(npm run dev -- --port "${PORT}" --strictPort) &
PID=$!
trap 'kill $PID >/dev/null 2>&1 || true' EXIT INT TERM

for i in {1..50}; do
  if curl -s "$URL" >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 || true; break; fi
  sleep 0.1
done
wait $PID
