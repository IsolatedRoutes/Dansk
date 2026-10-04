"""Checks the "spoken Danish isn't turned on" message.

    python3 tests/voice_test.py

Run `npm run build` first. Needs Python Playwright. A fake speech engine lists
either only English voices (message must appear, nothing is spoken) or a
Danish voice too (nothing appears, the text is spoken in that voice).
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

def fake_speech(voices):
    # Records what would be spoken instead of making sound.
    return """
    window.__spoken = [];
    const voices = %s;
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => voices, cancel: () => {}, speak: (u) => window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, lang: u.lang }),
      addEventListener: () => {}, removeEventListener: () => {} } });
    """ % voices

def run(voices, expect_message):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 400, "height": 800})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.add_init_script(fake_speech(voices))
        page.goto(URL); page.wait_for_timeout(6000)
        speaker = page.get_by_role("button", name="Pronounce this").first
        if speaker.count() == 0:
            # Cards open English-first sometimes; flip to Danish side.
            page.mouse.click(200, 400); page.wait_for_timeout(600)
        page.get_by_role("button", name="Pronounce this").first.click(); page.wait_for_timeout(500)
        body = page.inner_text("body")
        spoken = page.evaluate("window.__spoken")
        shown = "Spoken Danish isn't turned on" in body
        if expect_message:
            check(shown, "no Danish voice: message is shown")
            check(len(spoken) == 0, "no Danish voice: nothing is spoken in the wrong voice")
            page.get_by_role("button", name="OK", exact=True).click(); page.wait_for_timeout(300)
            check("Spoken Danish isn't turned on" not in page.inner_text("body"), "message closes with OK")
        else:
            check(not shown, "Danish voice present: no message")
            check(len(spoken) == 1 and spoken[0]["voice"] == "Sara", "Danish voice present: spoken with the Danish voice")
        check(errors == [], "no page errors %s" % errors)
        browser.close()

run("[{name:'Samantha', lang:'en-US'}, {name:'Daniel', lang:'en-GB'}]", True)
run("[]", True)
run("[{name:'Samantha', lang:'en-US'}, {name:'Sara', lang:'da-DK'}]", False)

server.shutdown()
print("\n" + ("ALL PASSED" if not failures else "FAILED: %d" % len(failures)))
raise SystemExit(1 if failures else 0)
