#!/bin/bash
cd "$(dirname "$0")"
PORT=8000

# A curl check isn't reliable here: a stale/zombie server can hold the port
# without answering requests, which made curl fail and then a fresh server
# tried (and failed) to bind the same port. Instead, always free the port
# first, then start clean every time.
EXISTING_PID=$(lsof -ti tcp:$PORT)
if [ -n "$EXISTING_PID" ]; then
  echo "端口 $PORT 被占用，先关掉旧的服务器进程..."
  kill -9 $EXISTING_PID
  sleep 1
fi

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
