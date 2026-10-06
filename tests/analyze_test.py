"""Checks "Analyze sentence" (text) with a pretend AI answer, and the shorter Backup screen.

    python3 tests/analyze_test.py

Run `npm run build` first. The answer shows how the sentence works first, then the
mistake note, then at most 3 ideas (first open, the rest folded away). Only the
first idea is ticked to save. Nothing is sent to a real AI.
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

SETKV = """(kv) => new Promise((res) => { const r = indexedDB.open('dansk'); r.onsuccess = () => {
  const t = r.result.transaction('kv', 'readwrite'); for (const k in kv) t.objectStore('kv').put(kv[k], k);
  t.oncomplete = () => res(true); }; })"""
GET = """() => new Promise((res) => { const r = indexedDB.open('dansk'); r.onsuccess = () => {
  const g = r.result.transaction('kv').objectStore('kv').get('cards');
  g.onsuccess = () => res(g.result); g.onerror = () => res(null); }; r.onerror = () => res(null); })"""

reply = {
  "sentenceExplanation": "The sentence starts with **I går** (yesterday), so **har** (have) comes next and **jeg** (I) moves behind it: I går har jeg spist (Yesterday I have eaten).",
  "correctionNote": "You wrote *jeg har gået*. For gå (go) use *er*: Jeg er gået (I have gone).",
  "grammarPoints": [
    {"grammarName": "Starting with a time word", "explanation": "When a time word comes first, the action word comes straight after it.", "mainExample": {"da": "**I går** har jeg spist.", "en": "Yesterday I have eaten."}, "examples": [{"da": "**I dag** er jeg træt.", "en": "Today I am tired."}]},
    {"grammarName": "Second idea", "explanation": "Second explanation.", "mainExample": {"da": "Eksempel to.", "en": "Example two."}, "examples": []},
    {"grammarName": "Third idea", "explanation": "Third explanation.", "mainExample": {"da": "Eksempel tre.", "en": "Example three."}, "examples": []},
    {"grammarName": "Fourth idea", "explanation": "Should be cut.", "mainExample": {"da": "Eksempel fire.", "en": "Example four."}, "examples": []},
  ],
}
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(viewport={"width": 400, "height": 900}).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(6000)
    page.evaluate(SETKV, {"aiEngine": "gemini", "aiConsent": "1", "geminiApiKey": "fake-key"})
    page.reload(); page.wait_for_timeout(5000)
    page.route("**/generativelanguage.googleapis.com/**", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(reply)}]}}]})))
    page.get_by_role("button", name="Assistant").last.click(); page.wait_for_timeout(800)
    page.get_by_role("button", name="Translate", exact=True).first.click(); page.wait_for_timeout(500)
    ta = page.locator("textarea:visible").first
    ta.fill("I går jeg har gået i skole")
    page.get_by_role("button", name="Analyze sentence").first.click(); page.wait_for_timeout(1500)
    body = page.inner_text("body")
    check("The sentence starts with" in body and "How this sentence works" not in body, "the sentence explanation comes first, with no heading")
    check(body.index("The sentence starts with") < body.index("Starting with a time word"), "explanation is above the ideas")
    check("You wrote" in body and body.index("You wrote") < body.index("Starting with a time word"), "a mistake, if any, sits with the explanation, above the ideas")
    check("The mistake" not in body and "Ideas worth knowing" not in body, "no headings")
    check("Starting with a time word" in body and "Third idea" in body, "ideas are listed")
    check("Fourth idea" not in body, "at most 3 ideas")
    check("When a time word comes first" in body, "the first idea is open")
    check("Second explanation" not in body, "the other ideas are folded away")
    check("I dag er jeg træt" not in body, "the extra example is behind a tap")
    page.get_by_label("Save Second idea").check()  # tick another idea without opening it
    page.get_by_role("button", name="Add selected to deck").click(); page.wait_for_timeout(1200)
    cards = json.loads(page.evaluate(GET))
    mine = [c for c in cards if not c.get("starter") and c.get("front") in ("Starting with a time word", "I går har jeg spist.", "Second idea", "Eksempel to.", "Third idea", "Eksempel tre.")]
    fronts = sorted(c["front"] for c in mine)
    check(fronts == ["Eksempel to.", "I går har jeg spist.", "Second idea", "Starting with a time word"], "ideas ticked (even folded) are saved, others are not: %s" % fronts)
    page.get_by_label("Backup and sync").click(); page.wait_for_timeout(500)
    b = page.inner_text("body")
    check("Weekly reminder" in b and "Export" in b and "Import" in b, "Backup shows two buttons and a switch")
    check("Websites can't overwrite" not in b, "the long Backup explanation is hidden until ? is tapped")
    page.get_by_label("More info").first.click(); page.wait_for_timeout(300)
    check("dansk-backup.json" in page.inner_text("body"), "the ? shows the details")
    check(not errors, "no page errors: %s" % errors)
    browser.close()
print("\nALL PASSED" if not failures else "\nFAILED: %s" % failures)
raise SystemExit(1 if failures else 0)
