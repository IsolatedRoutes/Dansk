"""Opens every screen of the built app and fails on any page error.

    python3 tests/smoke_test.py

Run `npm run build` first. Needs Python Playwright.
"""
import os, sys, threading, http.server, functools, socketserver
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

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 400, "height": 800})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.goto(URL); page.wait_for_timeout(6000)
    body = lambda: page.inner_text("body")

    check("Card 1 of" in body(), "study screen shows a card")
    page.get_by_role("button", name="Next", exact=True).click(); page.wait_for_timeout(500)
    page.get_by_role("button", name="Back", exact=True).click(); page.wait_for_timeout(500)

    page.get_by_role("button", name="Library").last.click(); page.wait_for_timeout(700)
    check(page.get_by_placeholder("Search your deck").count() == 1, "Library screen opens")
    page.get_by_role("button", name="Add").last.click(); page.wait_for_timeout(700)
    check("Add" in body(), "Add screen opens")
    # Choose an AI option so the Assistant shows its modes (no AI call is made).
    page.evaluate("""() => new Promise((res) => { const r = indexedDB.open('dansk', 1);
      r.onsuccess = () => { const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put('api', 'aiEngine'); t.oncomplete = () => res(true); }; })""")
    page.reload(); page.wait_for_timeout(5000)
    page.get_by_role("button", name="Assistant").last.click(); page.wait_for_timeout(700)
    for mode in ("Text", "Photo", "Ask"):
        page.get_by_role("button", name=mode, exact=True).first.click(); page.wait_for_timeout(400)
        check(page.get_by_role("button", name=mode, exact=True).count() >= 1, "Assistant mode opens: " + mode)
    page.get_by_role("button", name="Text", exact=True).first.click(); page.wait_for_timeout(300)
    for b in ("Translate", "Analyze sentence", "Extract text"):
        check(page.get_by_role("button", name=b, exact=True).count() >= 1, "Text mode has the button: " + b)
    page.get_by_role("button", name="Study").last.click(); page.wait_for_timeout(500)

    page.get_by_role("button", name="AI settings").click(); page.wait_for_timeout(500)
    check("Anthropic" in body(), "AI settings opens")
    page.keyboard.press("Escape"); page.mouse.click(5, 5); page.wait_for_timeout(300)
    page.get_by_label("Backup and sync").click(); page.wait_for_timeout(500)
    check("xport" in body(), "Backup opens")
    page.mouse.click(5, 5); page.wait_for_timeout(300)

    for name in ("About", "How it works", "Privacy", "Terms", "FAQ"):
        page.get_by_label("Menu").click(); page.wait_for_timeout(200)
        page.get_by_role("button", name=name, exact=True).click(); page.wait_for_timeout(300)
        check(name.lower() in body().lower(), "menu page: " + name)
        page.mouse.click(5, 5); page.wait_for_timeout(300)

    check(not errors, "no page errors " + str(errors[:3]))
    browser.close()

server.shutdown()
print("\nALL PASSED" if not failures else "\n%d FAILED" % len(failures))
sys.exit(1 if failures else 0)
