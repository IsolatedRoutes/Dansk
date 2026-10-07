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
  "sameAsEnglish": "The word order is the same as English.",
  "points": [
    {"title": "handlede om = was about", "literal": "dealt about", "explanation": "English says was about. Danish says handle (deal with) plus om (about). On its own, handle means to act or to trade.", "more": "The same om follows other verbs: tale om (talk about), spørge om (ask about)."},
    {"title": "udlændingepolitik = foreigner + policy", "literal": "", "explanation": "Danish writes the two words as one: udlænding (foreigner) and politik (policy).", "more": ""},
    {"title": "Third idea", "literal": "", "explanation": "Should be cut: two points at most.", "more": ""},
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
    page.get_by_role("button", name="Text", exact=True).first.click(); page.wait_for_timeout(500)
    ta = page.locator("textarea:visible").first
    ta.fill("I går jeg har gået i skole")
    page.get_by_role("button", name="Analyze sentence", exact=True).first.click(); page.wait_for_timeout(1500)
    body = page.inner_text("body")
    check("handlede om = was about" in body, "the first idea is shown with its title")
    check("word for word: dealt about" in body, "the word-for-word line appears when given")
    check("English says was about" in body, "the explanation is open for the first idea")
    check("The same om follows other verbs" not in body, "the extra examples are behind More")
    check("You wrote" in body and body.index("You wrote") < body.index("handlede om"), "a mistake note, when there is one, comes first")
    check("This sentence shows" not in body and "The mistake" not in body and "Ideas worth knowing" not in body, "no headings or fixed opener")
    check("Third idea" not in body, "at most 2 ideas")
    check("The word order is the same as English." in body, "says when it works like English")
    check(any("Basic (A1–A2)" in x for x in sent_prompts), "the chosen Study level is sent to the AI")
    check(any("thinkingBudget" in x for x in sent_prompts), "the quick setting is used")
    page.get_by_role("button", name="More", exact=True).first.click(); page.wait_for_timeout(200)
    check("The same om follows other verbs" in page.inner_text("body"), "More opens the extra examples")
    page.get_by_label("Save udlændingepolitik = foreigner + policy").check()  # tick the second idea without opening it
    page.get_by_role("button", name="Add selected to deck").click(); page.wait_for_timeout(1200)
    cards = json.loads(page.evaluate(GET))
    mine = [c for c in cards if not c.get("starter") and c.get("type") == "grammar" and c.get("front") in ("handlede om = was about", "udlændingepolitik = foreigner + policy", "Third idea")]
    fronts = sorted(c["front"] for c in mine)
    check(fronts == ["handlede om = was about", "udlændingepolitik = foreigner + policy"], "ticked ideas are saved as grammar cards: %s" % fronts)
    # If Gemini refuses the quick setting, it is retried normally and still works.
    refused = []
    def picky(route):
        body = route.request.post_data or ""
        if "thinkingBudget" in body:
            refused.append(1)
            route.fulfill(status=400, content_type="application/json", body=json.dumps({"error": {"message": "thinking not supported"}}))
        else:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(reply)}]}}]}))
    page.unroute("**/generativelanguage.googleapis.com/**"); page.route("**/generativelanguage.googleapis.com/**", picky)
    page.get_by_role("button", name="Analyze sentence", exact=True).first.click(); page.wait_for_timeout(1500)
    check(len(refused) >= 1 and "handlede om = was about" in page.inner_text("body"), "a refused quick setting is retried and still gives an answer")
    page.get_by_label("Close").first.click(); page.wait_for_timeout(300)
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
