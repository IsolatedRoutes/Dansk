"""AI keys: kept in the Keychain in the iPhone app, never in ordinary storage.

    python3 tests/secrets_test.py

Run `npm run build` first. The iPhone's Keychain is imitated by a Python dict
that survives page reloads, the way the real Keychain survives app restarts.
"""
import os, threading, http.server, functools, socketserver
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

KEY = "sk-ant-TESTKEY-1234567890"
keychain = {}

def native_call(plugin, method, options):
    if plugin != "SecureStoragePlugin": raise Exception("unexpected plugin " + plugin)
    k = (options or {}).get("key")
    if method == "set": keychain[k] = options["value"]; return {"value": True}
    if method == "get":
        if k not in keychain: raise Exception("Item with given key does not exist")
        return {"value": keychain[k]}
    if method == "remove": keychain.pop(k, None); return {"value": True}
    raise Exception("unexpected method " + method)

NATIVE_INIT = """
window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", PluginHeaders: [{ name: "SecureStoragePlugin", methods: ["get","set","remove","clear","keys"].map(n => ({ name: n, rtype: "promise" })) }], nativePromise: (plugin, method, options) => window.__kc(plugin, method, options || {}).then(r => r.error ? Promise.reject(new Error(r.error)) : r.ok) };
"""

def run_page(browser, native):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    if native:
        def bridge(plugin, method, options):
            try: return {"ok": native_call(plugin, method, options)}
            except Exception as e: return {"error": str(e)}
        ctx.expose_function("__kc", bridge)
        ctx.add_init_script(NATIVE_INIT)
    return ctx

def open_ai_settings(page):
    page.wait_for_timeout(5500)
    page.get_by_role("button", name="AI settings").first.click(); page.wait_for_timeout(500)

def stored_anywhere(page):
    return page.evaluate("""async () => {
      const hit = (v) => typeof v === 'string' && v.includes('TESTKEY');
      for (let i = 0; i < localStorage.length; i++) if (hit(localStorage.getItem(localStorage.key(i)))) return true;
      const db = await new Promise((res, rej) => { const r = indexedDB.open('dansk'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const all = await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').getAll(); r.onsuccess = () => res(r.result); });
      return all.some(hit);
    }""")

def save_key(page):
    # Claude card -> three steps -> paste step (the guided setup).
    page.get_by_role("button", name="Claude").first.click(); page.wait_for_timeout(300)
    for _ in range(3):
        page.get_by_role("button", name="Next", exact=True).first.click(); page.wait_for_timeout(150)
    page.get_by_placeholder("sk-ant-…").fill(KEY)
    page.get_by_role("button", name="Save", exact=True).click()
    page.wait_for_timeout(1500)

with sync_playwright() as p:
    browser = p.chromium.launch()

    # 1. iPhone app: key goes to the Keychain only.
    ctx = run_page(browser, True); page = ctx.new_page()
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); open_ai_settings(page)
    check("installMarker" not in keychain, "first launch with an empty Keychain starts clean")
    save_key(page)
    check(keychain.get("anthropicApiKey") == KEY, "app: key is saved in the Keychain")
    check(not stored_anywhere(page), "app: key is NOT in browser storage")
    page.reload(); open_ai_settings(page)
    check(page.get_by_text("Key saved").count() + page.get_by_text("Connected").count() > 0, "app: saved key is found again after restart")
    page.get_by_role("button", name="Remove").first.click(); page.wait_for_timeout(500)
    check("anthropicApiKey" not in keychain, "app: Remove deletes the key from the Keychain")
    check(not errors, "app: no page errors " + str(errors))

    # 2. Delete and reinstall: Keychain survives, app storage does not.
    keychain["anthropicApiKey"] = KEY
    ctx2 = run_page(browser, True); page2 = ctx2.new_page()
    page2.goto(URL); page2.wait_for_timeout(6000)
    check("anthropicApiKey" not in keychain, "app: key left behind by a deleted copy is cleared on a fresh install")
    keychain["anthropicApiKey"] = KEY
    page2.reload(); page2.wait_for_timeout(6000)
    check(keychain.get("anthropicApiKey") == KEY, "app: a normal restart keeps the key")

    # 3. Key from an older version (ordinary storage) moves into the Keychain.
    keychain.clear()
    ctx3 = run_page(browser, True); page3 = ctx3.new_page()
    page3.goto(URL); page3.wait_for_timeout(6000)
    page3.evaluate("""async () => { const db = await new Promise((res) => { const r = indexedDB.open('dansk'); r.onsuccess = () => res(r.result); });
      await new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put('%s', 'anthropicApiKey'); tx.oncomplete = res; }); }""" % KEY)
    page3.reload(); open_ai_settings(page3)
    check(keychain.get("anthropicApiKey") == KEY, "app: an older stored key is moved into the Keychain")
    check(not stored_anywhere(page3), "app: and the old copy is erased")

    # 4. Website: unchanged, key stays in the site's own storage.
    ctx4 = run_page(browser, False); page4 = ctx4.new_page()
    page4.goto(URL); open_ai_settings(page4); save_key(page4)
    check(stored_anywhere(page4), "web: key is saved in the site's own storage")
    page4.reload(); open_ai_settings(page4)
    check(page4.get_by_text("Key saved").count() + page4.get_by_text("Connected").count() > 0, "web: saved key is found again")
    browser.close()

print("\nALL PASSED" if not failures else "\nFAILED: %d" % len(failures))
raise SystemExit(1 if failures else 0)
