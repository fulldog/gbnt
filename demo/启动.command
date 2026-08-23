#!/bin/bash
# 高标农田专项整治平台 · 栈 B 一键启动（仅静态前端）
cd "$(dirname "$0")"
mkdir -p .logs

PORT=5501
while lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

echo "[HSF] 静态服务端口 $PORT" | tee .logs/frontend.log
python3 -m http.server "$PORT" --bind 127.0.0.1 >> .logs/frontend.log 2>&1 &
PID=$!
echo $PID > .logs/frontend.pid

URL="http://127.0.0.1:${PORT}/index.html"
sleep 0.4
if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
fi

echo "已打开 $URL"
echo "关闭本窗口将结束服务 (pid=$PID)"
trap 'kill $PID 2>/dev/null; exit' INT TERM
wait $PID
