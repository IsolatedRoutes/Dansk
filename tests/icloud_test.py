"""Checks iCloud sync, using a pretend iCloud (the real one only exists on an iPhone).

    python3 tests/icloud_test.py

Run `npm run build` first. Checks: the sync logic on its own; another device's
progress arriving and being saved back; the switch in Backup; the one-time
offer popup; "go back to an earlier version"; and that nothing here appears on
the website.
"""
import os, json, subprocess, threading, http.server, functools, socketserver
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

r = subprocess.run(["node", os.path.join(ROOT, "tests", "sync_check.mjs")], capture_output=True, text=True)
print(r.stdout + r.stderr)
check(r.returncode == 0, "the sync logic behaves (adds only, repeatable, fits iCloud)")

# A pretend iCloud for the phone app: one shared little store the page can read.
FAKE = """
(() => {
  window.__icloud = JSON.parse(sessionStorage.getItem('__icloud') || '{}');
  const save = () => sessionStorage.setItem('__icloud', JSON.stringify(window.__icloud));
  const noop = async () => ({});
  const icloud = {
    status: async () => ({ available: window.__icloudAvailable !== false }),
    get: async ({ key }) => (key in window.__icloud ? { value: window.__icloud[key] } : {}),
    set: async ({ key, value }) => { window.__icloud[key] = value; save(); },
    remove: async ({ key }) => { delete window.__icloud[key]; save(); },
    addListener: async () => ({ remove() {} }),
  };
  const fake = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    registerPlugin: (name) => name === 'ICloudSync' ? icloud : new Proxy({}, { get: (_, k) => k === 'then' ? undefined : noop }),
  };
  // The app's own Capacitor code would replace a plain global, so this one is fixed in place.
  const guarded = new Proxy(fake, { set: () => true, defineProperty: () => true, deleteProperty: () => true });
  Object.defineProperty(window, 'Capacitor', { get: () => guarded, set: () => {}, configurable: true });
})();
"""

def checksum(text):
    h = 5381
    for ch in text:
        h = ((h * 33) ^ ord(ch)) & 0xFFFFFFFF
    n, out = h, ""
    while True:
        n, d = divmod(n, 36); out = "0123456789abcdefghijklmnopqrstuvwxyz"[d] + out
        if n == 0: break
    return out

def other_device_copy(front_known, own_front, settings=None):
    snap = {"v": 1, "at": 1, "marks": {"word:" + front_known: {"known": True, "starred": False, "ignored": False, "upStage": 0, "upDue": 0, "notes": "", "recentTouch": 0}},
            "own": [{"id": "from-other-phone", "type": "word", "front": own_front, "back": "from my other phone", "starter": False, "known": False, "starred": False, "ignored": False, "createdAt": 5, "category": ""}],
            "categories": [], "deleted": [], "deletedOwn": [], "settings": settings}
    data = json.dumps(snap, separators=(",", ":"), ensure_ascii=False)
    meta = {"v": 1, "enc": "json", "n": 1, "len": len(data), "sum": checksum(data), "at": 1, "by": "other"}
    return {"broen.sync.p0": data, "broen.sync.meta": json.dumps(meta)}

GET = """(k) => new Promise((res) => { const r = indexedDB.open('dansk'); r.onsuccess = () => {
  const g = r.result.transaction('kv').objectStore('kv').get(k);
  g.onsuccess = () => res(g.result === undefined ? null : g.result); g.onerror = () => res(null); }; r.onerror = () => res(null); })"""
PUT = """([k, v]) => new Promise((res) => { const r = indexedDB.open('dansk'); r.onsuccess = () => {
  const t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k);
  t.oncomplete = () => res(true); t.onerror = () => res(false); }; r.onerror = () => res(false); })"""

def first_run(browser, native=True, seed_icloud=None):
    ctx = browser.new_context(viewport={"width": 400, "height": 800})
    if native:
        ctx.add_init_script(FAKE)
        if seed_icloud:
            ctx.add_init_script("if (!sessionStorage.getItem('__icloud')) sessionStorage.setItem('__icloud', %s);" % json.dumps(json.dumps(seed_icloud)))
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(6000)
    return ctx, page, errors

with sync_playwright() as p:
    browser = p.chromium.launch()

    # 1. Another device's progress arrives, and is saved back to iCloud.
    ctx, page, errors = first_run(browser, seed_icloud=other_device_copy("en hund", "min nye sætning"))
    mine = json.loads(page.evaluate(GET, "cards"))
    kat = next(c for c in mine if c.get("starter") and c["front"].lower() == "en kat")
    kat["known"] = True
    page.evaluate(PUT, ["cards", json.dumps(mine)])
    page.evaluate(PUT, ["icloudSync", "1"])
    page.reload(); page.wait_for_timeout(9000)
    cards = json.loads(page.evaluate(GET, "cards"))
    hund = next((c for c in cards if c.get("starter") and c["front"].lower() == "en hund"), None)
    check(hund is not None and hund.get("known") is True, "a word marked known on the other device is known here")
    check(any(c["front"] == "min nye sætning" and not c.get("starter") for c in cards), "an own card from the other device arrives")
    check(len(cards) > 8000, "nothing in the deck was removed (%d cards)" % len(cards))
    meta = page.evaluate("window.__icloud['broen.sync.meta']")
    saved = json.loads(page.evaluate("""async () => {
      const m = JSON.parse(window.__icloud['broen.sync.meta']);
      let data = ''; for (let i = 0; i < m.n; i++) data += window.__icloud['broen.sync.p' + i];
      if (m.enc === 'json') return data;
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const s = new DecompressionStream('gzip'); const w = s.writable.getWriter(); w.write(bytes); w.close();
      return new TextDecoder().decode(await new Response(s.readable).arrayBuffer());
    }""")) if meta else {}
    check(bool(meta) and json.loads(meta).get("by") != "other" and "word:en kat" in saved.get("marks", {}) and "word:en hund" in saved.get("marks", {}), "this device saved the combined progress (both devices' marks) back to iCloud")
    check(not errors, "no page errors: " + "; ".join(errors))
    ctx.close()

    # 1b. Study choices made on the other device (newer) arrive here.
    theirs = {"at": 4102444800000, "values": {"studySettings": json.dumps({"catFilter": "all", "scope": "all", "levels": [1], "starredOnly": False, "unknownOnly": True, "langDir": "en-first"}), "verbForms": json.dumps(["base", "past"])}}
    ctx, page, errors = first_run(browser, seed_icloud=other_device_copy("en hund", "min nye sætning", theirs))
    page.evaluate(PUT, ["icloudSync", "1"])
    page.reload(); page.wait_for_timeout(9000)
    got = json.loads(page.evaluate(GET, "studySettings") or "{}")
    print("got", got)
    check(got.get("langDir") == "en-first" and got.get("levels") == [1], "Study choices from the other device arrive here")
    check(json.loads(page.evaluate(GET, "verbForms") or "[]") == ["base", "past"], "verb-form choices arrive too")
    ctx.close()

    # 2. The switch in Backup, and going back to an earlier version.
    ctx, page, errors = first_run(browser)
    page.get_by_role("button", name="Backup and sync").click(); page.wait_for_timeout(800)
    check(page.get_by_text("Sync with iCloud").count() >= 1, "Backup shows the Sync with iCloud switch")
    page.get_by_role("button", name="Toggle iCloud sync").click(); page.wait_for_timeout(3000)
    check(page.evaluate(GET, "icloudSync") == "1", "turning the switch on is remembered")
    check(page.evaluate(GET, "preSyncBackup") is not None, "a copy of the deck was kept before syncing")
    check(page.get_by_text("Go back to an earlier version").count() == 1, "'Go back to an earlier version' is offered")
    check("Last synced" in page.inner_text("body"), "the last sync time is shown")
    ctx.close()

    # 3. iCloud not available: a clear message, and nothing turned on.
    ctx = browser.new_context(viewport={"width": 400, "height": 800}); ctx.add_init_script(FAKE.replace("window.__icloudAvailable !== false", "false"))
    page = ctx.new_page(); page.goto(URL); page.wait_for_timeout(6000)
    page.get_by_role("button", name="Backup and sync").click(); page.wait_for_timeout(600)
    page.get_by_role("button", name="Toggle iCloud sync").click(); page.wait_for_timeout(1500)
    check("iCloud isn't available" in page.inner_text("body"), "with iCloud off, a clear message appears")
    check(page.evaluate(GET, "icloudSync") in (None, "0"), "sync stays off when iCloud isn't available")
    ctx.close()

    # 4. The one-time offer: appears on the second opening, once.
    ctx, page, errors = first_run(browser)
    page.evaluate(PUT, ["syncPrompt", json.dumps({"opens": 1, "actions": 0, "asks": 0})])
    page.reload(); page.wait_for_timeout(7000)
    check(page.get_by_text("Keep your progress in iCloud?").count() == 1, "the offer appears on the second opening")
    page.get_by_role("button", name="Not now").click(); page.wait_for_timeout(500)
    page.reload(); page.wait_for_timeout(7000)
    check(page.get_by_text("Keep your progress in iCloud?").count() == 0, "after 'Not now' it does not come back straight away")
    page.evaluate(PUT, ["syncPrompt", json.dumps({"opens": 5, "actions": 99, "asks": 2})])
    page.reload(); page.wait_for_timeout(7000)
    check(page.get_by_text("Keep your progress in iCloud?").count() == 0, "after two asks it never appears again")
    page.evaluate(PUT, ["syncPrompt", json.dumps({"opens": 1, "actions": 0, "asks": 0})])
    page.reload(); page.wait_for_timeout(7000)
    page.get_by_role("button", name="Turn on").click(); page.wait_for_timeout(2500)
    check(page.evaluate(GET, "icloudSync") == "1", "'Turn on' in the offer turns sync on")
    ctx.close()

    # 5. The website has none of this.
    ctx, page, errors = first_run(browser, native=False)
    page.get_by_role("button", name="Backup and sync").click(); page.wait_for_timeout(600)
    check(page.get_by_text("Sync with iCloud").count() == 0, "the website does not show iCloud sync")
    page.keyboard.press("Escape")
    check(not errors, "website: no page errors")
    ctx.close()
    browser.close()

print("ALL PASSED" if not failures else "FAILED: %d" % len(failures))
raise SystemExit(1 if failures else 0)
