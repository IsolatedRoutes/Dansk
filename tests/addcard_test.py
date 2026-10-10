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
    box = page.get_by_label("Word or sentence", exact=True)
    check(box.count() == 1, "one box to type in")
    check("Details" not in body and "Input manually" not in body and "Fill in with AI" not in body, "no extra toggles or fields")
    check(page.get_by_role("button", name="Continue").count() == 1 and page.locator("select").count() == 0, "one Continue button, no dropdown menus")
    clear = page.locator("button:visible", has_text="Clear")
    check(clear.count() == 0, "Clear is hidden while empty")

    # Part 2: by hand, no AI set up
    box.fill("zzyxkat")
    check(clear.count() == 1, "Clear shows once there is text")
    page.get_by_role("button", name="Continue").click(); page.wait_for_timeout(1500)
    page.get_by_role("button", name="Type the English yourself instead").click(); page.wait_for_timeout(300)
    page.get_by_label("English", exact=True).fill("zzyx cat")
    page.get_by_role("button", name="Sort this card").click(); page.wait_for_timeout(300)
    page.get_by_role("button", name="Noun", exact=True).click()
    page.get_by_role("button", name="Intermediate", exact=True).click()
    page.get_by_text("+ Add a note").click()
    page.get_by_placeholder("Note").fill("min note")
    page.get_by_role("button", name="Done").click(); page.wait_for_timeout(300)
    page.get_by_role("button", name="Add card").click(); page.wait_for_timeout(1200)
    c = own(page, "zzyxkat")
    check(c is not None and c["back"] == "zzyx cat" and c["type"] == "word", "a hand-typed word is saved as a word")
    check(c and c.get("pos") == "noun" and c.get("level") == 2 and c.get("notes") == "min note", "group, level and note are kept")
    check(c and "upForms" not in c, "a hand-typed card has no level-up forms (no AI was used)")

    # By hand, a long text is a sentence
    box.fill("jeg kan rigtig godt lide kaffe")
    page.get_by_role("button", name="Continue").click(); page.wait_for_timeout(1500)
    page.get_by_role("button", name="Type the English yourself instead").click(); page.wait_for_timeout(300)
    page.get_by_label("English", exact=True).fill("I really like coffee a lot")
    page.get_by_role("button", name="Add card").click(); page.wait_for_timeout(1200)
    c = own(page, "jeg kan rigtig godt lide kaffe")
    check(c is not None and c["type"] == "sentence" and c["back"].startswith("I really like coffee"), "sentence found without asking")

    # Clear empties the card
    box.fill("noget")
    clear.click(); page.wait_for_timeout(300)
    check(box.input_value() == "", "Clear empties the box")

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
    page.get_by_label("Word or sentence", exact=True).fill("zzyx dog")
    page.wait_for_timeout(500)
    check(len(calls) == 0, "typing alone makes no AI call")
    page.get_by_role("button", name="Continue").click(); page.wait_for_timeout(1500)
    check(len(calls) == 1, "Continue makes exactly one AI call")
    vals = page.evaluate("() => Array.from(document.querySelectorAll('input,textarea')).map(i => i.value)")
    check("en zzyxhund" in vals and "a zzyx dog" in vals, "both sides are filled in and editable")
    check("Noun" in page.get_by_role("button", name="Sort this card").inner_text(), "the tag line shows what the AI chose")
    page.get_by_role("button", name="Add card").click(); page.wait_for_timeout(1200)
    c = own(page, "en zzyxhund")
    check(c is not None and c["back"] == "a zzyx dog" and c.get("pos") == "noun" and c.get("level") == 1, "word type and level come from the look-up")
    check(c and len(c.get("upForms") or []) == 2, "level-up forms come from the same call")
    check(len(calls) == 1, "still only one AI call for the whole card")
    check(not errors, "no page errors: %s" % errors)
    browser.close()

print("\nALL PASSED" if not failures else "\nFAILED: %s" % failures)
raise SystemExit(1 if failures else 0)
