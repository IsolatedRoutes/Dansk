"""Checks the one-box "Add a card" screen.

    python3 tests/addcard_test.py

Run `npm run build` first. Needs Node and Python Playwright. Part 1 checks the
look-up logic on its own. Part 2 adds a card by hand (no AI at all). Part 3 uses a
pretend AI answer: Look up fills in both sides, topic-less word type, level and
level-up forms, and the card is saved with them. Nothing is sent to a real AI.
"""
import os, json, subprocess, threading, http.server, functools, socketserver
from playwright.sync_api import sync_playwright

here = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(here)
r = subprocess.run(["node", os.path.join(here, "addlookup_check.mjs")], capture_output=True, text=True)
print(r.stdout + r.stderr)
failures = [] if r.returncode == 0 else ["look-up logic"]

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
SETKV = """(kv) => new Promise((res) => { const r = indexedDB.open('dansk'); r.onsuccess = () => {
  const t = r.result.transaction('kv', 'readwrite'); for (const k in kv) t.objectStore('kv').put(kv[k], k);
  t.oncomplete = () => res(true); }; })"""

def pick(page, aria, option):
    page.locator('[aria-label="%s"] button' % aria).first.click(); page.wait_for_timeout(200)
    page.get_by_role("button", name=option, exact=True).last.click(); page.wait_for_timeout(200)

def own(page, front):
    cards = json.loads(page.evaluate(GET))
    return next((c for c in cards if c.get("front") == front and not c.get("starter")), None)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 400, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(6000)
    page.get_by_role("button", name="Add").last.click(); page.wait_for_timeout(600)

    body = page.inner_text("body")
    check(page.get_by_placeholder("Type a word or sentence in English or Danish to add to your deck").count() == 1, "one box for either language")
    check("Danish word" not in body, "no separate Word / Sentence tabs")

    # Part 2: by hand, no AI: two boxes, Danish then English
    page.get_by_role("button", name="Input manually").click()
    check(page.get_by_label("Language").count() == 0, "manual form has no language menu")
    page.get_by_placeholder("The Danish").fill("zzyxkat")
    page.get_by_placeholder("The English").fill("zzyx cat")
    page.get_by_role("button", name="Details").click()
    page.get_by_label("Grammar group").select_option("noun")
    page.get_by_label("Level").select_option("2")
    page.get_by_placeholder("Note (optional)").fill("min note")
    page.get_by_role("button", name="Add card").click(); page.wait_for_timeout(1200)
    c = own(page, "zzyxkat")
    check(c is not None and c["back"] == "zzyx cat" and c["type"] == "word", "a hand-typed word is saved as a word")
    check(c and c.get("pos") == "noun" and c.get("level") == 2 and c.get("notes") == "min note", "group, level and note are kept")
    check(c and "upForms" not in c, "a hand-typed card has no level-up forms (no AI was used)")

    # By hand, a long text is a sentence
    page.get_by_role("button", name="Input manually").click()
    page.get_by_placeholder("The Danish").fill("jeg kan rigtig godt lide kaffe")
    page.get_by_placeholder("The English").fill("I really like coffee a lot")
    page.get_by_role("button", name="Add card").click(); page.wait_for_timeout(1200)
    c = own(page, "jeg kan rigtig godt lide kaffe")
    check(c is not None and c["type"] == "sentence" and c["back"].startswith("I really like coffee"), "sentence found without asking")

    # Part 3: pretend AI answer
    page.evaluate(SETKV, {"aiEngine": "gemini", "aiConsent": "1", "geminiApiKey": "fake-key"})
    page.reload(); page.wait_for_timeout(5000)
    reply = {"danish": "en zzyxhund", "english": "a zzyx dog", "category": "", "wordType": "noun", "level": 1,
             "forms": [{"da": "zzyxhunden", "en": "the zzyx dog"}, {"da": "zzyxhunde", "en": "zzyx dogs"}]}
    calls = []
    def fake(route):
        calls.append(1)
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(reply)}]}}]}))
    page.route("**/generativelanguage.googleapis.com/**", fake)
    page.get_by_role("button", name="Add").last.click(); page.wait_for_timeout(600)
    page.get_by_placeholder("Type a word or sentence in English or Danish to add to your deck").fill("zzyx dog")
    page.wait_for_timeout(500)
    check(len(calls) == 0, "typing alone makes no AI call")
    page.get_by_role("button", name="Look up").click(); page.wait_for_timeout(1500)
    check(len(calls) == 1, "Look up makes exactly one AI call")
    vals = page.evaluate("() => Array.from(document.querySelectorAll('input')).map(i => i.value)")
    check("en zzyxhund" in vals and "a zzyx dog" in vals, "both sides are filled in and editable")
    page.get_by_role("button", name="Add card").click(); page.wait_for_timeout(1200)
    c = own(page, "en zzyxhund")
    check(c is not None and c["back"] == "a zzyx dog" and c.get("pos") == "noun" and c.get("level") == 1, "word type and level come from the look-up")
    check(c and len(c.get("upForms") or []) == 2, "level-up forms come from the same call")
    check(len(calls) == 1, "still only one AI call for the whole card")
    check(not errors, "no page errors: %s" % errors)
    browser.close()

print("\nALL PASSED" if not failures else "\nFAILED: %s" % failures)
raise SystemExit(1 if failures else 0)
