#!/usr/bin/env bash
# 自動テスト: セルフテスト(ゲームロジック/動き検出) + 実アプリ統合テスト(フェイクカメラ)。
# WSL から Windows の Chrome をヘッドレスで起動して検証する。
set -u
cd "$(dirname "$0")/.."
ROOT_WIN='C:\Users\shou1\Workspace\shou10152208\projector-playground'
CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
[ -x "$CHROME" ] || CHROME="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PROFILE="$ROOT_WIN\\test\\chrome-profile"
PORT=8000
FAIL=0

python3 serve.py --http-port $PORT >/tmp/serve.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 20); do
  curl -s -o /dev/null "http://localhost:$PORT/index.html" && break
  sleep 0.3
done

run_chrome() { "$CHROME" --headless=new --disable-gpu --no-sandbox \
  --use-fake-ui-for-media-stream --use-fake-device-for-media-stream \
  --autoplay-policy=no-user-gesture-required --force-device-scale-factor=1 \
  --hide-scrollbars --user-data-dir="$PROFILE" "$@" 2>/dev/null; }

echo "================ 1) セルフテスト ================"
run_chrome --virtual-time-budget=20000 --dump-dom \
  "http://localhost:$PORT/test/selftest.html" > /tmp/dom.html
python3 - <<'PY'
import re,html,sys
t=open('/tmp/dom.html',encoding='utf-8',errors='ignore').read()
m=re.search(r'<pre id="results">(.*?)</pre>',t,re.S)
print(html.unescape(m.group(1)) if m else "[no results]")
title=re.search(r'<h1[^>]*>(.*?)</h1>',t,re.S)
title=html.unescape(title.group(1)) if title else "?"
print("\n=>",title)
sys.exit(0 if "PASS" in title else 1)
PY
[ $? -ne 0 ] && FAIL=1

echo
echo "================ 2) 実アプリ統合テスト ================"
# 合成カメラ(?fakecam=1)で実際にアプリを走らせて撮影する
# メニュー画面(横:プロジェクター向け)
run_chrome --window-size=1280,720 --virtual-time-budget=6000 \
  --screenshot="$ROOT_WIN\\test\\shot-menu.png" \
  "http://localhost:$PORT/index.html?autostart=1&fakecam=1" >/dev/null
# しゃぼんだまを開始した状態
run_chrome --window-size=1280,720 --virtual-time-budget=9000 \
  --screenshot="$ROOT_WIN\\test\\shot-game.png" \
  "http://localhost:$PORT/index.html?autostart=1&fakecam=1#bubbles" >/dev/null
# ほしキャッチ
run_chrome --window-size=1280,720 --virtual-time-budget=9000 \
  --screenshot="$ROOT_WIN\\test\\shot-stars.png" \
  "http://localhost:$PORT/index.html?autostart=1&fakecam=1#stars" >/dev/null
# おはなばたけ
run_chrome --window-size=1280,720 --virtual-time-budget=12000 \
  --screenshot="$ROOT_WIN\\test\\shot-flowers.png" \
  "http://localhost:$PORT/index.html?autostart=1&fakecam=1#flowers" >/dev/null
# スマホ縦画面の見え方(スタート画面)。
# ヘッドレスは layout 幅を 478px 未満にしないため、撮影幅も 480 にして切れを防ぐ。
run_chrome --window-size=480,860 --virtual-time-budget=3000 \
  --screenshot="$ROOT_WIN\\test\\shot-phone.png" \
  "http://localhost:$PORT/index.html" >/dev/null

for f in shot-menu shot-game shot-stars shot-flowers shot-phone; do
  if [ -s "test/$f.png" ]; then
    sz=$(stat -c%s "test/$f.png")
    echo "  ✓ test/$f.png ($sz bytes)"
  else
    echo "  ✗ test/$f.png が生成されませんでした"; FAIL=1
  fi
done

echo
if [ $FAIL -eq 0 ]; then echo "===> すべて成功 ✅"; else echo "===> 失敗あり ❌ (/tmp/serve.log も確認)"; fi
exit $FAIL
