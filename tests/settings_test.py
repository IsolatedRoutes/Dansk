"""Checks that Study screen choices survive closing and reopening the app.

    python3 tests/settings_test.py

Run `npm run build` first. Needs Python Playwright.
"""
import os, json, threading, http.server, functools, socketserver
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

READ = """() => new Promise((res) => { const r = indexedDB.open('dansk'); r.onsuccess = () => {
  const g = r.result.transaction('kv').objectStore('kv').get('studySettings');
  g.onsuccess = () => res(g.result === undefined ? null : g.result); g.onerror = () => res(null); }; r.onerror = () => res(null); })"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 400, "height": 800})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(6000)

    # Change two things: direction, and show known cards too.
    page.get_by_text("English", exact=False).first.click()  # direction pill
    page.wait_for_timeout(300)
    page.get_by_text("Unknown", exact=True).first.click()
    page.wait_for_timeout(800)
    saved = page.evaluate(READ)
    data = json.loads(saved) if saved else {}
    check(data.get("langDir") == "en-first", "direction change is saved")
    check(data.get("unknownOnly") is False, "Unknown-only change is saved")

    # Pick one level (Basic) and keep it.
    page.get_by_text("All levels", exact=True).first.click(); page.wait_for_timeout(300)
    page.get_by_text("Basic (A1–A2)").first.click(); page.wait_for_timeout(800)
    saved = json.loads(page.evaluate(READ) or "{}")
    check(saved.get("levels") == [1], "chosen level is saved (%r)" % saved.get("levels"))
    page.keyboard.press("Escape")

    # Close and reopen the app (same storage).
    page.close()
    page2 = ctx.new_page()
    page2.on("pageerror", lambda e: errors.append(str(e)))
    page2.goto(URL); page2.wait_for_timeout(6000)
    pill = page2.get_by_role("button").filter(has_text="English").first.inner_text()
    check(pill.strip().lower().startswith("english"), "after reopening, direction pill still reads English first (%r)" % pill)
    saved2 = json.loads(page2.evaluate(READ) or "{}")
    check(saved2.get("langDir") == "en-first" and saved2.get("unknownOnly") is False,
          "after reopening, saved settings were not reset to defaults")
    check(saved2.get("levels") == [1], "after reopening, the chosen level is still saved")
    check("Basic" in page2.inner_text("body") and "All levels" not in page2.inner_text("body"), "after reopening, the Study screen still shows Basic, not All levels")
    check(errors == [], "no page errors %s" % errors)
    browser.close()

server.shutdown()
print("\n" + ("ALL PASSED" if not failures else "FAILED: %d" % len(failures)))
raise SystemExit(1 if failures else 0)
