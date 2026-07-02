#!/usr/bin/env python3
"""からだで あそぼ！ 開発用サーバー。

- HTTP を localhost 用に、HTTPS を スマホ(iPhone など)用に同時に立ち上げる。
- iOS Safari は localhost 以外では HTTPS でないとカメラを使えないため、
  自己署名証明書を自動生成して HTTPS を提供する。

使い方:
    python3 serve.py            # HTTP:8000 と HTTPS:8443 を起動
    python3 serve.py --http-port 8000 --https-port 8443
"""
import argparse
import http.server
import socket
import ssl
import subprocess
import sys
import threading
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CERT_DIR = ROOT / "certs"
CERT_FILE = CERT_DIR / "cert.pem"
KEY_FILE = CERT_DIR / "key.pem"


def local_ips():
    """このマシンが持つ IPv4 アドレスを集める(ループバック以外)。"""
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    ips.discard("127.0.0.1")
    return sorted(ips)


def ensure_cert():
    """自己署名証明書がなければ openssl で作る。"""
    if CERT_FILE.exists() and KEY_FILE.exists():
        return True
    CERT_DIR.mkdir(exist_ok=True)
    sans = ["DNS:localhost", "IP:127.0.0.1"]
    for ip in local_ips():
        sans.append(f"IP:{ip}")
    san_line = ",".join(sans)
    print(f"[setup] 自己署名証明書を作成します (SAN: {san_line})")
    cmd = [
        "openssl", "req", "-x509", "-newkey", "rsa:2048",
        "-keyout", str(KEY_FILE), "-out", str(CERT_FILE),
        "-days", "825", "-nodes",
        "-subj", "/CN=karada-de-asobo.local",
        "-addext", f"subjectAltName={san_line}",
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return True
    except FileNotFoundError:
        print("[warn] openssl が見つかりません。HTTPS は無効になります。", file=sys.stderr)
    except subprocess.CalledProcessError as e:
        print(f"[warn] 証明書の作成に失敗しました: {e.stderr.decode(errors='ignore')}", file=sys.stderr)
    return False


class Handler(http.server.SimpleHTTPRequestHandler):
    # MediaPipe(vendor/) のモジュール/WASM/モデルを正しく配信するための MIME
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".task": "application/octet-stream",
    }

    # ES モジュールのキャッシュで古い JS を掴まないようにする
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        # crossOriginIsolated にして WASM スレッド（人体認識の高速化）を有効にする
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 静かに(エラーだけ出す)
        if not str(args[1] if len(args) > 1 else "").startswith("2"):
            super().log_message(fmt, *args)


def make_server(port, use_tls):
    handler = partial(Handler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    if use_tls:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile=str(CERT_FILE), keyfile=str(KEY_FILE))
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    return httpd


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--http-port", type=int, default=8000)
    ap.add_argument("--https-port", type=int, default=8443)
    args = ap.parse_args()

    has_tls = ensure_cert()
    servers = []

    http_srv = make_server(args.http_port, use_tls=False)
    servers.append(http_srv)
    threading.Thread(target=http_srv.serve_forever, daemon=True).start()

    if has_tls:
        try:
            https_srv = make_server(args.https_port, use_tls=True)
            servers.append(https_srv)
            threading.Thread(target=https_srv.serve_forever, daemon=True).start()
        except OSError as e:
            print(f"[warn] HTTPS を起動できませんでした: {e}", file=sys.stderr)
            has_tls = False

    ips = local_ips()
    print("\n  からだで あそぼ！ サーバー起動中\n")
    print("  このPCで遊ぶ (どちらでもOK):")
    print(f"    http://localhost:{args.http_port}")
    if has_tls:
        print(f"    https://localhost:{args.https_port}")
    if has_tls and ips:
        print("\n  スマホ・タブレットで遊ぶ (同じWi-Fi / 要 https):")
        for ip in ips:
            print(f"    https://{ip}:{args.https_port}")
        print("\n  ※ 自己署名証明書のため、初回は「安全でない」警告が出ます。")
        print("     『詳細を表示』→『このまま開く』で進んでください。")
        print("  ※ WSLをお使いの場合、スマホから上記IPに届かないときは")
        print("     README の『iPhone から遊ぶ』を参照してください。")
    print("\n  Ctrl+C で終了\n")

    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        print("\n終了します。")
        for s in servers:
            s.shutdown()


if __name__ == "__main__":
    main()
