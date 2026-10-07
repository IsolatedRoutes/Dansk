"""Checks "Share to Broen" (iPhone app), using a pretend share folder.

    python3 tests/share_test.py

Run `npm run build` first (or `npx vite build`). Checks: shared text lands in
the Assistant's Translate box (and is added to what is already there); a bare
web link is turned down kindly; a shared photo opens in Photo; a share that
arrives before AI is set up waits and then lands; and the website is untouched.
The native extension itself can only be tried on a real iPhone.
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

# A pretend share folder: whatever is pushed on window.__shared is handed over once.
FAKE = """
(() => {
  window.__shared = [];
  window.__takes = 0;
  const inbox = { take: async () => { window.__takes++; return window.__shared.length ? window.__shared.shift() : {}; } };
  const noop = async () => ({});
  const fake = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    registerPlugin: (name) => name === 'ShareInbox' ? inbox : new Proxy({}, { get: (_, k) => k === 'then' ? undefined : (k === 'addListener' ? async () => ({ remove() {} }) : noop) }),
  };
  const guarded = new Proxy(fake, { set: () => true, defineProperty: () => true, deleteProperty: () => true });
  Object.defineProperty(window, 'Capacitor', { get: () => guarded, set: () => {}, configurable: true });
})();
"""
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
PUT = """([k, v]) => new Promise((res) => { const r = indexedDB.open('dansk'); r.onsuccess = () => {
  const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k);
  t.oncomplete = () => res(true); t.onerror = () => res(false); }; r.onerror = () => res(false); })"""
SHARE = "(item) => { window.__shared.push(item); document.dispatchEvent(new Event('visibilitychange')); }"
BOXES = "() => Array.from(document.querySelectorAll('textarea')).filter((t) => t.offsetParent !== null).map((t) => t.value)"

def new_page(browser, native=True, engine=True):
    ctx = browser.new_context(viewport={"width": 400, "height": 800})
    if native: ctx.add_init_script(FAKE)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(4000)
    page.evaluate(PUT, ["welcomeSeen", "true"])
    if engine: page.evaluate(PUT, ["aiEngine", "api"])
    page.reload(); page.wait_for_timeout(4000)
    return ctx, page, errors

with sync_playwright() as p:
    browser = p.chromium.launch()

    # 1. Shared text lands in Translate; a second one is added below it.
    ctx, page, errors = new_page(browser)
    page.evaluate(SHARE, {"text": "Jeg hedder Anna. Jeg bor i København."})
    page.wait_for_timeout(1500)
    boxes = page.evaluate(BOXES)
    check(any("Jeg hedder Anna" in b for b in boxes), "shared text appears in the Translate box")
    check(page.locator('[aria-label="Assistant mode"] button').first.inner_text().strip() == "Translate", "the Assistant opens by itself, on Translate")
    page.evaluate(SHARE, {"text": "Hvad koster det?"})
    page.wait_for_timeout(1200)
    boxes = page.evaluate(BOXES)
    check(any("Jeg hedder Anna" in b and "Hvad koster det?" in b and b.index("Anna") < b.index("koster") for b in boxes), "a second share is added below the first")
    taken = page.evaluate("window.__takes")
    page.wait_for_timeout(1000)
    check(page.evaluate("window.__shared.length") == 0, "each share is handed over once")

    # 2. A bare link is turned down kindly and nothing is pasted.
    before = page.evaluate(BOXES)
    page.evaluate(SHARE, {"text": "https://example.com/artikel"})
    page.wait_for_timeout(1200)
    check(page.get_by_text("That was a link").is_visible(), "a bare link shows a friendly note")
    check(page.evaluate(BOXES) == before, "the link is not pasted into the box")

    # 3. A shared photo opens in Photo.
    page.evaluate(SHARE, {"imageBase64": PNG, "imageType": "image/png"})
    page.wait_for_timeout(1500)
    shown = page.evaluate("() => Array.from(document.querySelectorAll('img')).some((i) => i.offsetParent !== null && i.src.startsWith('blob:'))")
    check(shown, "a shared photo appears in the Photo panel")
    check(not errors, "no page errors: " + "; ".join(errors))
    ctx.close()

    # 4. A share that arrives before AI is set up waits, then lands.
    ctx, page, errors = new_page(browser, engine=False)
    page.evaluate(SHARE, {"text": "God morgen, hvordan har du det?"})
    page.wait_for_timeout(1500)
    check(page.get_by_text("Set up your AI").is_visible(), "without AI the Assistant asks to set it up")
    page.evaluate(PUT, ["aiEngine", "api"])
    page.evaluate("window.dispatchEvent(new Event('dansk-settings-changed'))")
    page.wait_for_timeout(1500)
    check(any("God morgen" in b for b in page.evaluate(BOXES)), "the waiting share lands once AI is set up")
    check(not errors, "no page errors (waiting share): " + "; ".join(errors))
    ctx.close()

    # 5. The website has no share-in and is untouched.
    ctx, page, errors = new_page(browser, native=False)
    page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_timeout(800)
    check(not errors, "the website runs fine with no sharing: " + "; ".join(errors))
    ctx.close()
    browser.close()

print()
print("ALL PASSED" if not failures else "FAILED: " + "; ".join(failures))
raise SystemExit(1 if failures else 0)
