"""End to end: edit a card, back up, lose the data, restore, work offline.

    python3 tests/e2e_test.py

Run `npm run build` first. Needs Python Playwright.
"""
import os, sys, tempfile, threading, http.server, functools, socketserver
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
    # A phone-sized touch screen, as on an iPhone or Android phone.
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("dialog", lambda d: d.accept())
    page.goto(URL); page.wait_for_timeout(5500)
    body = lambda: page.inner_text("body")
    # Library groups words by first letter; open the "H" group.
    def open_group():
        page.get_by_text("H", exact=True).first.click(); page.wait_for_timeout(400)
    check("Card 1 of" in body(), "study screen opens")

    # Edit a card in the Library: mark known, star it and add a note.
    page.get_by_role("button", name="Library").last.click(); page.wait_for_timeout(600)
    page.get_by_placeholder("Search your deck").fill("hund"); page.wait_for_timeout(600)
    open_group()
    page.get_by_label("Edit card").first.click(); page.wait_for_timeout(300)
    page.get_by_placeholder("Notes (optional)").fill("my test note")
    page.get_by_role("button", name="Save").first.click(); page.wait_for_timeout(500)
    check("my test note" in body(), "edited note shows in the Library")
    # Known + star on the first row (the two small icons left of the eye).
    page.evaluate("""() => { const s = [...document.querySelectorAll('svg')].filter(e => { const r = e.getBoundingClientRect(); return r.width >= 14 && r.width <= 16 && r.top > 200 && r.top < 330; }).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      const row = s.filter(e => e.querySelector('circle') && e.querySelector('polyline')); if (row.length) row[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); }""")
    page.wait_for_timeout(500)

    # Back up.
    page.get_by_label("Backup and sync").click(); page.wait_for_timeout(400)
    # Use the plain download path (as in Firefox and desktop Safari).
    page.evaluate("() => { delete window.showSaveFilePicker; Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); }")
    with page.expect_download() as dl:
        page.get_by_role("button", name="Export").click()
    path = os.path.join(tempfile.mkdtemp(), "backup.json")
    dl.value.save_as(path)
    check(os.path.getsize(path) > 1000, "backup file is saved")
    page.mouse.click(5, 5); page.wait_for_timeout(300)

    # Lose everything on the device.
    page.evaluate("() => new Promise(r => { const q = indexedDB.deleteDatabase('dansk'); q.onsuccess = q.onerror = q.onblocked = () => r(1); })")
    page.evaluate("() => localStorage.clear()")
    page.goto(URL); page.wait_for_timeout(5500)
    page.get_by_role("button", name="Library").last.click(); page.wait_for_timeout(600)
    page.get_by_placeholder("Search your deck").fill("hund"); page.wait_for_timeout(600)
    open_group()
    check("my test note" not in body(), "a wiped device starts fresh")

    # Restore from the backup file.
    page.evaluate("() => { delete window.showOpenFilePicker; }")
    page.get_by_label("Backup and sync").click(); page.wait_for_timeout(400)
    with page.expect_file_chooser() as fc:
        page.get_by_role("button", name="Import").click()
    fc.value.set_files(path)
    page.wait_for_timeout(2500)
    page.mouse.click(5, 5); page.wait_for_timeout(400)
    page.get_by_role("button", name="Library").last.click(); page.wait_for_timeout(600)
    page.get_by_placeholder("Search your deck").fill("hund"); page.wait_for_timeout(600)
    open_group()
    check("my test note" in body(), "restore brings the note back")

    # Offline: the app still opens from its saved copy.
    page.reload(); page.wait_for_timeout(4000)
    page.evaluate("async () => { await navigator.serviceWorker.ready; }")
    page.wait_for_timeout(1500)
    ctx.set_offline(True)
    page.reload(); page.wait_for_timeout(5500)
    check("Card 1 of" in body() or "Session complete" in body(), "opens with no network")
    page.get_by_role("button", name="Library").last.click(); page.wait_for_timeout(600)
    page.get_by_placeholder("Search your deck").fill("hund"); page.wait_for_timeout(600)
    open_group()
    check("my test note" in body(), "data is intact offline")
    check(not errors, "no page errors " + str(errors))
    browser.close()

print()
if failures:
    print("FAILED:", failures); sys.exit(1)
print("ALL PASSED")
