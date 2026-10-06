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
  "correctionNote": "You wrote *jeg har gået*. For gå (go) use *er*: Jeg er gået (I have gone).",
  "sameAsEnglish": "The rest is built the same way as English.",
  "grammarPoints": [
    {"grammarName": "Wearing something: have ... på", "rule": "This sentence shows the Danish rule where, to say you are wearing something, you say you have it on (har ... på), not 'wear'.", "line": {"da": "Jeg **har** sko **på**", "literal": "I have shoes on", "en": "I am wearing shoes"}, "explanation": "The little word på (on) also appears when you put clothes on: tage tøj på.", "usual": {"da": "Jeg tager jakken på.", "en": "I put the jacket on."}},
    {"grammarName": "Second idea", "rule": "This sentence shows the Danish rule where two.", "line": {"da": "Eksempel to.", "literal": "", "en": "Example two."}, "explanation": "Second explanation.", "usual": {}},
    {"grammarName": "Third idea", "rule": "This sentence shows the Danish rule where three.", "line": {"da": "Eksempel tre.", "literal": "", "en": "Example three."}, "explanation": "Third explanation.", "usual": {}},
    {"grammarName": "Fourth idea", "rule": "Cut.", "line": {"da": "Eksempel fire.", "literal": "", "en": "Example four."}, "explanation": "Should be cut.", "usual": {}},
  ],
}
sent_prompts = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(viewport={"width": 400, "height": 900}).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(6000)
    page.evaluate(SETKV, {"aiEngine": "gemini", "aiConsent": "1", "geminiApiKey": "fake-key", "studySettings": json.dumps({"levels": [1]})})
    page.reload(); page.wait_for_timeout(5000)
    def fake(route):
        sent_prompts.append(route.request.post_data or "")
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(reply)}]}}]}))
    page.route("**/generativelanguage.googleapis.com/**", fake)
    page.get_by_role("button", name="Assistant").last.click(); page.wait_for_timeout(800)
    page.get_by_role("button", name="Translate", exact=True).first.click(); page.wait_for_timeout(500)
    ta = page.locator("textarea:visible").first
    ta.fill("I går jeg har gået i skole")
    page.get_by_role("button", name="Analyze sentence").first.click(); page.wait_for_timeout(1500)
    body = page.inner_text("body")
    check("This sentence shows the Danish rule where" in body, "each idea states the rule")
    check("word for word: I have shoes on" in body, "the Danish is shown word for word")
    check("I am wearing shoes" in body, "and how English says it")
    check("You wrote" in body and body.index("You wrote") < body.index("Wearing something"), "a mistake note, when there is one, comes first")
    check("The mistake" not in body and "Ideas worth knowing" not in body and "How this sentence works" not in body, "no headings")
    check("Third idea" in body and "Fourth idea" not in body, "at most 3 ideas")
    check("Second explanation" not in body, "the other ideas are folded away")
    check("The rest is built the same way as English." in body, "says when it works like English")
    check("Jeg tager jakken på" in body, "the contrast example is shown")
    check(any("Basic (A1–A2)" in x for x in sent_prompts), "the chosen Study level is sent to the AI")
    page.get_by_label("Save Second idea").check()  # tick another idea without opening it
    page.get_by_role("button", name="Add selected to deck").click(); page.wait_for_timeout(1200)
    cards = json.loads(page.evaluate(GET))
    mine = [c for c in cards if not c.get("starter") and c.get("front") in ("Wearing something: have ... på", "Jeg har sko på", "Jeg tager jakken på.", "Second idea", "Eksempel to.", "Third idea", "Eksempel tre.")]
    fronts = sorted(c["front"] for c in mine)
    check(fronts == ["Eksempel to.", "Jeg har sko på", "Second idea", "Wearing something: have ... på"], "ideas ticked (even folded) are saved, others are not: %s" % fronts)
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
