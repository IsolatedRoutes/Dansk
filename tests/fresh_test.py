"""Checks that cards you added yourself come back soon and often.

    python3 tests/fresh_test.py

Run `npm run build` first. Needs Node and Python Playwright. Part 1 checks the
placement rules on their own; part 2 adds a card of "your own" to a real deck,
reopens the app and looks for it among the first cards of a session.
"""
import os, json, subprocess, sys, threading, http.server, functools, socketserver
from playwright.sync_api import sync_playwright

here = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(here)
r = subprocess.run(["node", os.path.join(here, "fresh_check.mjs")], capture_output=True, text=True)
print(r.stdout + r.stderr)
failures = [] if r.returncode == 0 else ["placement rules"]

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

server = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = "http://127.0.0.1:%d/index.html" % server.server_address[1]

def check(ok, msg):
    print(("PASS  " if ok else "FAIL  ") + msg)
    if not ok: failures.append(msg)

GET = """() => new Promise((res) => { const r = indexedDB.open('dansk'); r.onsuccess = () => {
  const g = r.result.transaction('kv').objectStore('kv').get('cards');
  g.onsuccess = () => res(g.result); g.onerror = () => res(null); }; r.onerror = () => res(null); })"""
PUT = """(v) => new Promise((res) => { const r = indexedDB.open('dansk'); r.onsuccess = () => {
  const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'cards');
  t.oncomplete = () => res(true); t.onerror = () => res(false); }; r.onerror = () => res(false); })"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 400, "height": 800})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(6000)
    raw = page.evaluate(GET)
    cards = json.loads(raw)
    template = next(c for c in cards if c.get("type") == "word")
    import time
    now = int(time.time() * 1000)
    mine = dict(template, id="own-fresh-1", front="zzyxord", back="zzyx word", starter=False, known=False,
                starred=False, ignored=False, createdAt=now, recentTouch=now)
    cards.append(mine)
    page.evaluate(PUT, json.dumps(cards))
    page.close()

    seen_runs = 0
    positions = []
    for run in range(3):
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(6000)
        fronts = []
        for i in range(30):
            fronts.append(pg.inner_text("body"))
            pg.get_by_role("button", name="Next", exact=True).click(); pg.wait_for_timeout(450)
        hits = [i for i, t in enumerate(fronts) if "zzyxord" in t]
        positions.append(hits)
        pg.close()
    print("positions of the new card in three sessions:", positions)
    check(all(len(h) >= 2 for h in positions), "new card appears at least twice in the first 30 cards, every session")
    check(all(h and h[0] <= 8 for h in positions), "new card first appears within the first 9 cards, every session")
    check(errors == [], "no page errors %s" % errors)
    browser.close()

server.shutdown()
print("\n" + ("ALL PASSED" if not failures else "FAILED: %s" % failures))
sys.exit(1 if failures else 0)
