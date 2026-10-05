"""Checks the ready-made lightbulb answers.

    python3 tests/lightbulb_test.py

Run `npm run build` first. With no AI key at all, opening the lightbulb on a
built-in word that has a ready-made answer shows it (no AI call is made), and
the answer files are well formed.
"""
import os, subprocess, threading, http.server, functools, socketserver
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
server = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = "http://127.0.0.1:%d/index.html" % server.server_address[1]

failures = []
def check(ok, msg):
    print(("PASS  " if ok else "FAIL  ") + msg)
    if not ok: failures.append(msg)

r = subprocess.run(["node", os.path.join(ROOT, "tests", "lightbulb_check.mjs")], capture_output=True, text=True)
print(r.stdout + r.stderr)
check(r.returncode == 0, "the ready-made answer files are well formed")

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(viewport={"width": 400, "height": 800}).new_page()
    errors, ai_calls = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("request", lambda q: ai_calls.append(q.url) if any(h in q.url for h in ("anthropic", "openai", "googleapis", "openrouter")) else None)
    page.goto(URL); page.wait_for_timeout(6000)
    page.get_by_role("button", name="Library").last.click(); page.wait_for_timeout(800)
    page.get_by_placeholder("Search your deck").fill("bortset fra"); page.wait_for_timeout(800)
    page.get_by_text("B", exact=True).first.click(); page.wait_for_timeout(600)
    page.get_by_role("button", name="Explore related words").first.click(); page.wait_for_timeout(2500)
    body = page.inner_text("body")
    check("apart from" in body and "undtagen" in body, "ready-made answer shows with no AI key")
    check(not ai_calls, "no AI request was made")
    check(not errors, "no page errors: " + "; ".join(errors))
    browser.close()

print("ALL PASSED" if not failures else "FAILED: %d" % len(failures))
raise SystemExit(1 if failures else 0)
