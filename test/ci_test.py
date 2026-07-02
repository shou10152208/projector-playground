#!/usr/bin/env python3
"""CI 用のヘッドレス統合テスト（Node/ブラウザは GitHub Actions 上で用意）。

やること:
  1. serve.py を起動
  2. Playwright + ヘッドレス Chromium（フェイクカメラ）で:
     - test/selftest.html を開き window.__selftest.allOk が真か
     - 全ゲームを ?autostart=1&fakecam=1#<id> で起動し pageerror が出ないか
     - リズムの退出後にファイル入力が無効化される（バグ回帰）か
  失敗があれば終了コード 1。

ローカル実行:
    pip install playwright && python -m playwright install --with-deps chromium
    python3 test/ci_test.py
"""
import asyncio
import os
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("CI_PORT", "8000"))
BASE = f"http://localhost:{PORT}"
GAMES = ["bubbles", "stars", "moles", "flowers", "music", "poses", "rhythm"]


def wait_for_server(url, timeout=20):
    for _ in range(int(timeout * 5)):
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.2)
    return False


async def run():
    from playwright.async_api import async_playwright

    failures = []
    exe = os.environ.get("PLAYWRIGHT_CHROMIUM_PATH")  # ローカルで固定パスを使う場合
    launch_kwargs = dict(
        args=[
            "--no-sandbox",
            "--disable-gpu",
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
        ]
    )
    if exe:
        launch_kwargs["executable_path"] = exe

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(**launch_kwargs)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 720})

        # 1) セルフテスト
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(f"{BASE}/test/selftest.html")
        await page.wait_for_function("window.__selftest !== undefined", timeout=60000)
        st = await page.evaluate("window.__selftest")
        print(f"[selftest] {await page.title()}")
        for r in st["results"]:
            print(f"  {'✓' if r['ok'] else '✗'} {r['name']}  {r.get('detail','')}")
        if not st["allOk"]:
            failures.append("selftest FAIL")
        if errs:
            failures.append(f"selftest pageerror: {errs}")
        await page.close()

        # 2) 各ゲームを起動して例外が出ないか
        for game in GAMES:
            page = await ctx.new_page()
            gerrs = []
            page.on("pageerror", lambda e, g=gerrs: g.append(str(e)))
            await page.goto(f"{BASE}/index.html?autostart=1&fakecam=1#{game}")
            await page.wait_for_timeout(3500)
            print(f"[game {game}] errors={len(gerrs)}")
            if gerrs:
                failures.append(f"game {game} pageerror: {gerrs}")
            await page.close()

        # 3) リズム: 退出後にファイル入力が無効化される（バグ回帰テスト）
        page = await ctx.new_page()
        await page.goto(f"{BASE}/index.html?autostart=1&fakecam=1#rhythm")
        await page.wait_for_timeout(1800)
        before = await page.evaluate(
            "getComputedStyle(document.getElementById('rhythm-file-input')).pointerEvents"
        )
        await page.keyboard.press("Escape")  # backToMenu -> dispose()
        await page.wait_for_timeout(300)
        after = await page.evaluate(
            "getComputedStyle(document.getElementById('rhythm-file-input')).pointerEvents"
        )
        print(f"[rhythm] file-input pointerEvents idle={before} after-back={after}")
        if before != "auto":
            failures.append(f"rhythm: idle 中に file input が有効でない ({before})")
        if after != "none":
            failures.append(f"rhythm: メニュー復帰後も file input が有効 ({after})")
        await page.close()

        await browser.close()

    print()
    if failures:
        print("=== FAILURES ===")
        for f in failures:
            print(" -", f)
        return 1
    print("=== ALL PASS ===")
    return 0


def main():
    srv = subprocess.Popen(
        [sys.executable, "serve.py", "--http-port", str(PORT)],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    try:
        if not wait_for_server(f"{BASE}/index.html"):
            print("サーバーが起動しませんでした", file=sys.stderr)
            return 1
        return asyncio.run(run())
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except subprocess.TimeoutExpired:
            srv.kill()


if __name__ == "__main__":
    sys.exit(main())
