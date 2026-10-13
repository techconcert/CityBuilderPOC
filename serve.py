#!/usr/bin/env python3
"""Serve Ember Isle locally on the first free port and print the URL.

Usage:  python3 serve.py            (opens your browser)
        python3 serve.py --no-open  (just print the URL)
        python3 serve.py --port 9000  (start scanning from 9000)
"""
import argparse
import http.server
import mimetypes
import os
import socket
import socketserver
import sys
import webbrowser

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")

ROOT = os.path.dirname(os.path.abspath(__file__))


def port_is_free(port: int) -> bool:
    # Check both loopback families so we don't collide with an IPv6-only listener.
    for family, addr in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        try:
            s = socket.socket(family, socket.SOCK_STREAM)
        except OSError:
            continue  # family not available on this machine
        try:
            s.bind((addr, port))
        except OSError:
            return False
        finally:
            s.close()
    return True


def find_free_port(start: int, span: int = 200) -> int:
    for p in range(start, start + span):
        if port_is_free(p):
            return p
    raise SystemExit(f"No free port found in {start}-{start + span - 1}")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # always pick up edits
        super().end_headers()

    def log_message(self, fmt, *args):
        if "--quiet" in sys.argv:
            return
        super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=5173, help="first port to try")
    ap.add_argument("--no-open", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    port = find_free_port(args.port)
    url = f"http://localhost:{port}/index.html"
    with Server(("127.0.0.1", port), Handler) as httpd:
        print(f"\n  Ember Isle is running:  {url}\n  (free port found: {port}; Ctrl+C to stop)\n", flush=True)
        if not args.no_open:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
