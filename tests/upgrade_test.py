"""Progress-safety test for Dansk. Run before every release:

    python3 tests/upgrade_test.py [OLD_GIT_REF]      (default: origin/main)

It serves the previous release and the new build side by side, makes
progress in the old one (known, starred, hidden, notes, own cards,
settings), opens the new one on the same saved data, and checks that
nothing was lost. Also checks: deleted built-in cards stay deleted,
unreadable saved data is moved aside rather than overwritten, and a
fresh install loads with no errors. Needs Python Playwright.
"""
import os, re, subprocess, sys, tempfile, threading, http.server, functools, socketserver
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
site = tempfile.mkdtemp()
for name in ("old", "new"):
    os.makedirs(os.path.join(site, name))
old_html = subprocess.run(["git", "-C", ROOT, "show", REF + ":index.html"], capture_output=True, check=True).stdout
open(os.path.join(site, "old", "index.html"), "wb").write(old_html)
open(os.path.join(site, "new", "index.html"), "wb").write(open(os.path.join(ROOT, "index.html"), "rb").read())

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=site)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=site)
server = socketserver.TCPServer(("127.0.0.1", 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:%d/" % server.server_address[1]

COUNT = """() => { const c = JSON.parse(localStorage.cards);
  return { known: c.filter(x => x.known).length, starred: c.filter(x => x.starred).length,
           ignored: c.filter(x => x.ignored).length, notes: c.filter(x => x.notes).length,
           fronts: c.map(x => x.front), total: c.length } }"""
failures = []
def check(ok, msg):
    print(("PASS  " if ok else "FAIL  ") + msg)
    if not ok: failures.append(msg)

with sync_playwright() as p:
    browser = p.chromium.launch()

    # 1. upgrade keeps all progress
    ctx = browser.new_context(); page = ctx.new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "old/index.html"); page.wait_for_timeout(6000)
    page.evaluate("""() => {
      const cards = JSON.parse(localStorage.cards); const cats = JSON.parse(localStorage.categories);
      cards.forEach((c, i) => {
        if (i % 37 === 0) c.known = true;
        if (i % 101 === 0) c.starred = true;
        if (i % 401 === 0) c.ignored = true;
        if (i % 997 === 0) c.notes = "my note " + i;
      });
      cats.push({ id: "mine", name: "My Words", custom: true });
      cards.push({ id: "own1", type: "word", front: "springe over", back: "to skip", category: cats[0].id, known: true, createdAt: 1 });
      cards.push({ id: "own2", type: "word", front: "en rugbrødsmad", back: "an open sandwich", category: "mine", starred: true, createdAt: 1 });
      cards.push({ id: "own3", type: "sentence", front: "Jeg elsker Danmark.", back: "I love Denmark.", category: "mine", createdAt: 1 });
      // The old Add tab put new cards in whichever category came first: Grammar Lessons.
      const de = cards.find(c => c.front === "de" && c.starter); if (de) { de.category = "grammar-lessons"; de.known = true; }
      const hendes = cards.find(c => c.front === "hendes" && c.starter); if (hendes) { hendes.category = "grammar-lessons"; hendes.starred = true; }
      cards.push({ id: "own4", type: "word", front: "en tøjrulle", back: "a lint roller", category: "grammar-lessons", known: true, createdAt: 1 });
      cards.push({ id: "own5", type: "sentence", front: "Jeg bor her.", back: "I live here.", category: "grammar-lessons", createdAt: 1 });
      cards.push({ id: "own6", type: "grammar", front: "Min egen regel", back: "My own note.", category: "mine", createdAt: 1 });
      localStorage.cards = JSON.stringify(cards); localStorage.categories = JSON.stringify(cats);
      localStorage.verbForms = JSON.stringify(["present", "past"]);
    }""")
    before = page.evaluate(COUNT)
    page.goto(BASE + "new/index.html"); page.wait_for_timeout(7000)
    after = page.evaluate(COUNT)
    for k in ("known", "starred", "ignored", "notes"):
        check(after[k] >= before[k], "%s kept after upgrade (%d before, %d after)" % (k, before[k], after[k]))
    for f in ("springe over", "en rugbrødsmad", "Jeg elsker Danmark."):
        check(f in after["fronts"], "own card kept: " + f)
    check(page.evaluate("localStorage.verbForms") == '["present","past"]', "settings kept")
    check("My Words" in page.evaluate("localStorage.categories"), "own category kept")
    check(not errors, "no errors on upgrade " + str(errors[:2]))
    stray = page.evaluate("""() => { const cats = JSON.parse(localStorage.categories); const ids = cats.filter(c => c.id === 'grammar-lessons' || c.name === 'Grammar Lessons').map(c => c.id);
      const cards = JSON.parse(localStorage.cards);
      return { notGrammarInLessons: cards.filter(c => ids.includes(c.category) && c.type !== 'grammar').map(c => c.front),
               grammarOutside: cards.filter(c => c.type === 'grammar' && !ids.includes(c.category)).map(c => c.front),
               de: cards.find(c => c.front === 'de'), own4: cards.find(c => c.front === 'en tøjrulle'), own6: cards.find(c => c.front === 'Min egen regel') } }""")
    check(stray["notGrammarInLessons"] == [], "Grammar Lessons holds only lessons " + str(stray["notGrammarInLessons"]))
    check(stray["grammarOutside"] == [], "every lesson is in Grammar Lessons " + str(stray["grammarOutside"]))
    check(bool(stray["de"] and stray["de"].get("known")), "known mark kept on a card moved out of Grammar Lessons")
    check(bool(stray["own4"] and stray["own4"].get("known")) and stray["own4"].get("category") in ("", None), "own word moved out, progress kept")
    check(bool(stray["own6"]) and stray["own6"].get("category") == "grammar-lessons", "own grammar note moved into Grammar Lessons")
    # "My cards" switch: only the person's own cards
    page.get_by_role("button", name=re.compile("^All cards")).click(); page.wait_for_timeout(300)
    page.get_by_role("button", name=re.compile("^My cards")).click(); page.wait_for_timeout(300)
    page.get_by_role("button", name="Any category").click(); page.wait_for_timeout(700)
    mine = page.evaluate("JSON.parse(localStorage.cards).filter(c => !c.starter && !c.ignored).length")
    m = re.search(r"Card \d+ of (\d+)", page.inner_text("body"))
    check(bool(m) and int(m.group(1)) == mine, "My cards shows exactly the %d cards added by the person (%s)" % (mine, m.group(1) if m else "none"))

    # 2. a deleted built-in card stays deleted after reload
    page.evaluate("""() => { const c = JSON.parse(localStorage.cards);
      const victim = c.find(x => x.starter && x.type === 'word' && !x.known);
      window.__victim = victim.front; return victim.front }""")
    victim = page.evaluate("window.__victim")
    page.get_by_role("button", name="Library").first.click(); page.wait_for_timeout(800)
    page.get_by_placeholder("Search your deck").fill(victim); page.wait_for_timeout(600)
    page.get_by_role("button", name=re.compile(r"^[A-ZÆØÅ]$")).first.click(); page.wait_for_timeout(400)
    page.get_by_role("button", name="Delete card").first.click(); page.wait_for_timeout(300)
    page.get_by_role("button", name="Delete", exact=True).click(); page.wait_for_timeout(800)
    gone = set(after["fronts"]) - set(page.evaluate(COUNT)["fronts"])
    check(len(gone) == 1, "one card deleted: " + str(gone))
    victim = next(iter(gone), victim)
    page.reload(); page.wait_for_timeout(6000)
    check(victim not in page.evaluate(COUNT)["fronts"], "deleted built-in card stays deleted: " + victim)
    ctx.close()

    # 3. unreadable saved data is moved aside, not overwritten
    ctx = browser.new_context(); page = ctx.new_page()
    page.goto(BASE + "new/index.html"); page.wait_for_timeout(6000)
    page.evaluate("localStorage.cards = '{broken'")
    page.reload(); page.wait_for_timeout(6000)
    keys = page.evaluate("Object.keys(localStorage)")
    check(any(k.startswith("cards_unreadable_") for k in keys), "unreadable data kept aside")
    ctx.close()

    # 4. fresh install
    ctx = browser.new_context(); page = ctx.new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE + "new/index.html"); page.wait_for_timeout(6000)
    check(page.evaluate(COUNT)["total"] > 7900 and not errors, "fresh install loads (%d cards)" % page.evaluate(COUNT)["total"])
    browser.close()

server.shutdown()
print("\nALL PASSED" if not failures else "\n%d FAILED" % len(failures))
sys.exit(1 if failures else 0)
