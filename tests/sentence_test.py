"""Checks the "In a sentence" section of the lightbulb popup.

    python3 tests/sentence_test.py

Run `npm run build` first. Needs Python Playwright. A card with a saved example
sentence shows it with no AI key at all, and "Add as card" turns it into the
learner's own sentence card.
"""
import os, json, time, threading, http.server, functools, socketserver
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
    cards = json.loads(page.evaluate(GET))
    template = next(c for c in cards if c.get("type") == "word")
    now = int(time.time() * 1000)
    cards.append(dict(template, id="own-sent-1", front="zzyxord", back="zzyx word", starter=False, known=False,
                      starred=False, ignored=False, createdAt=now, recentTouch=now,
                      examples=[{"da": "Jeg kan lide **zzyxord** hver dag", "en": "I like zzyx word every day"}]))
    page.evaluate(PUT, json.dumps(cards))
    page.close()

    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(6000)
    found = False
    for i in range(12):
        if "zzyxord" in pg.inner_text("body"):
            found = True; break
        pg.get_by_role("button", name="Next", exact=True).click(); pg.wait_for_timeout(450)
    check(found, "the test card comes up early in the session")
    pg.get_by_role("button", name="Explore related words").click(); pg.wait_for_timeout(1500)
    body = pg.inner_text("body")
    check("in a sentence" in body.lower(), "popup shows an 'In a sentence' section")
    check("Jeg kan lide zzyxord hver dag" in body and "I like zzyx word every day" in body, "saved example sentence is shown, with the ** markers removed")
    pg.get_by_role("button", name="Add as card").click(); pg.wait_for_timeout(1200)
    check("Added as a card" in pg.inner_text("body"), "button changes to 'Added as a card'")
    after = json.loads(pg.evaluate(GET))
    new = [c for c in after if c.get("front") == "Jeg kan lide zzyxord hver dag"]
    check(len(new) == 1 and new[0].get("type") == "sentence" and not new[0].get("starter") and new[0].get("back") == "I like zzyx word every day",
          "a new own sentence card was saved")
    check(len(after) == len(cards) + 1, "exactly one card was added")
    check(errors == [], "no page errors %s" % errors)
    browser.close()

server.shutdown()
print("\n" + ("ALL PASSED" if not failures else "FAILED: %s" % failures))
raise SystemExit(1 if failures else 0)
