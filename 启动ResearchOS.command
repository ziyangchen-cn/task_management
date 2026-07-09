#!/bin/bash
cd "$(dirname "$0")"
PORT=8000

if curl -s -o /dev/null "http://localhost:$PORT"; then
  echo "检测到本地服务器已经在跑了，直接打开浏览器。"
  open "http://localhost:$PORT"
else
  echo "正在启动 Research OS 本地服务器..."
  python3 -m http.server $PORT &
  SERVER_PID=$!
  sleep 1
  open "http://localhost:$PORT"
  echo ""
  echo "已在浏览器打开 http://localhost:$PORT"
  echo "这个窗口不要关——关掉这个窗口服务器就会停掉。"
  echo "用完之后直接关这个窗口，或者按 Ctrl+C 停止。"
  wait $SERVER_PID
fi
