import { useEffect, useState } from "react";
import { Icon } from "../components/icons";
import { inputStyle, smallBtn } from "../components/ui";
import { chromeTranslatorAvailability, chromeTranslatorSupported } from "../lib/ai/chrome";
import { apiErrorMessage, callAI } from "../lib/ai/index";
import { LOCAL_MODEL_ID, LOCAL_MODEL_OPTIONS, getLocalEngine, localEnginePromise } from "../lib/ai/local";
import { openLink } from "../lib/openLink";
import { isNativeApp } from "../lib/platform";
import { storeGet, storeSet } from "../lib/storage";
import { secretGet, secretRemove, secretSet } from "../lib/secrets";

// ============================================================
// Chat — the only place this app talks to an AI model. Every
// action here (conversation, sentence analysis, article
// vocabulary, category suggestions, starter vocabulary) is
// triggered by a tap, never automatically. Scanning pasted text
// for candidate vocabulary is done locally with no AI call at all
// — only translating the words you pick uses the AI.
// ============================================================

// Remembers where the learner was in the setup steps while they go and get a
// key (the panel can close and reopen, the page can sleep).
const wizardMemory = { provider: null, step: 0 };

const PROVIDERS = {
  gemini: {
    name: "Gemini",
    by: "Google",
    blurb: "Free, up to a daily limit",
    keyName: "geminiApiKey",
    engine: "gemini",
    link: "https://aistudio.google.com/apikey",
    linkLabel: "Open Google",
    starts: "AIza",
    steps: [
      { text: "Sign in with your Google account.", button: true },
      { text: "Tap “Create API key”." },
      { text: "Tap the copy button next to your key. It looks like AIzaSy…, a long mix of letters and numbers." },
    ],
    help: [
      "An API key is like a password that lets this app use your own free Google AI. It stays on this device.",
      "Free, no credit card, up to a daily limit. On the free tier, Google may use what you send to improve its products.",
      "What you send goes straight to Google, never to us.",
    ],
    agree: "By saving, you agree that the text and photos you use with AI go to Google, and their privacy policy applies. AI answers can be wrong.",
  },
  api: {
    name: "Claude",
    by: "Anthropic",
    blurb: "Best for Danish, small fee",
    keyName: "anthropicApiKey",
    engine: "api",
    link: "https://console.anthropic.com/settings/keys",
    linkLabel: "Open Anthropic",
    starts: "sk-ant-",
    steps: [
      { text: "Make an Anthropic account and add a few dollars of credit.", button: true },
      { text: "Tap “Create Key” and give it any name." },
      { text: "Copy the key. It looks like sk-ant-api03-…, a very long mix of letters and numbers, and it is only shown once." },
    ],
    help: [
      "An API key is like a password that lets this app use your own Anthropic account. It stays on this device.",
      "You pay Anthropic only for what you use: about half a cent for a question, a cent or two for a photo. A few dollars lasts a long time.",
      "What you send goes straight to Anthropic, never to us.",
    ],
    agree: "By saving, you agree that the text and photos you use with AI go to Anthropic, and their privacy policy applies. AI answers can be wrong.",
  },
};

export function AISettingsPanel({ onClose }) {
  const [engine, setEngineState] = useState(null);
  const [savedGeminiKey, setSavedGeminiKey] = useState(null);
  const [savedKey, setSavedKey] = useState(null);
  const [keyInput, setKeyInput] = useState("");
  const [wizard, setWizard] = useState(wizardMemory.provider); // null | "gemini" | "api"
  const [step, setStep] = useState(wizardMemory.step);
  const [saving, setSaving] = useState(false);
  const [loadingModel, setLoadingModel] = useState(false);
  const [modelProgress, setModelProgress] = useState("");
  const [modelReady, setModelReady] = useState(!!localEnginePromise);
  const [showMore, setShowMore] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [consented, setConsented] = useState(true);
  const [error, setError] = useState("");
  const [confirmingModel, setConfirmingModel] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(LOCAL_MODEL_ID);
  const [savedOllamaConfig, setSavedOllamaConfig] = useState(null);
  const [chromeTranslatorEnabled, setChromeTranslatorEnabledState] = useState(false);
  const [confirmingChromeTranslatorDownload, setConfirmingChromeTranslatorDownload] = useState(false);
  const [chromeTranslatorLoading, setChromeTranslatorLoading] = useState(false);
  const [chromeTranslatorDownloadProgress, setChromeTranslatorDownloadProgress] = useState("");
  const [ollamaUrlInput, setOllamaUrlInput] = useState("http://localhost:11434");
  const [ollamaModelInput, setOllamaModelInput] = useState("llama3.2");

  useEffect(() => {
    (async () => {
      const e = await storeGet("aiEngine");
      setEngineState(e);
      setConsented((await storeGet("aiConsent")) === "1");
      setSavedGeminiKey(await secretGet("geminiApiKey"));
      setSavedKey(await secretGet("anthropicApiKey"));
      try {
        const raw = await storeGet("ollamaConfig");
        if (raw) setSavedOllamaConfig(JSON.parse(raw));
      } catch {}
      setChromeTranslatorEnabledState((await storeGet("chromeTranslatorEnabled")) === "true");
      // Gemini (free) is shown first; expand "Use Claude or something else"
      // only when a different engine is in use.
      if (e === "local" || e === "api" || e === "ollama") setShowMore(true);
    })();
  }, []);

  async function agree() {
    await storeSet("aiConsent", "1");
    setConsented(true);
    setError("");
  }

  async function chooseEngine(next, justAgreed) {
    if ((next === "api" || next === "gemini") && !consented && !justAgreed) {
      setError("Please tap \"I agree\" above first.");
      return false;
    }
    setEngineState(next);
    setError("");
    await storeSet("aiEngine", next);
    return true;
  }

  async function saveOllamaConfig() {
    let url = ollamaUrlInput.trim().replace(/\/+$/, "");
    const model = ollamaModelInput.trim();
    if (!url || !model) return;
    // A very plausible mistake — the placeholder shows "http://..." but
    // it's easy to type just "localhost:11434" and skip the protocol,
    // which would silently fail as a relative URL instead of a real request.
    if (!/^https?:\/\//i.test(url)) url = "http://" + url;
    const config = { url, model };
    await storeSet("ollamaConfig", JSON.stringify(config));
    setSavedOllamaConfig(config);
    await chooseEngine("ollama");
    onClose("ollama");
  }

  async function toggleChromeTranslator(next) {
    if (!next) {
      // Turning it off never needs confirmation — nothing to download.
      setChromeTranslatorEnabledState(false);
      await storeSet("chromeTranslatorEnabled", "false");
      return;
    }
    setChromeTranslatorLoading(true);
    setError("");
    try {
      const [daEn, enDa] = await Promise.all([chromeTranslatorAvailability("da", "en"), chromeTranslatorAvailability("en", "da")]);
      const needsDownload = daEn === "downloadable" || daEn === "downloading" || enDa === "downloadable" || enDa === "downloading";
      if (needsDownload && !confirmingChromeTranslatorDownload) {
        // Ask before downloading anything, same as the local model.
        setConfirmingChromeTranslatorDownload(true);
        setChromeTranslatorLoading(false);
        return;
      }
      // Download both directions up front so Translate never triggers a
      // download later.
      await Promise.all([
        Translator.create({
          sourceLanguage: "da",
          targetLanguage: "en",
          monitor(m) {
            m.addEventListener("downloadprogress", (e) => setChromeTranslatorDownloadProgress(Math.round(e.loaded * 100) + "%"));
          },
        }),
        Translator.create({
          sourceLanguage: "en",
          targetLanguage: "da",
          monitor(m) {
            m.addEventListener("downloadprogress", (e) => setChromeTranslatorDownloadProgress(Math.round(e.loaded * 100) + "%"));
          },
        }),
      ]);
      setChromeTranslatorEnabledState(true);
      await storeSet("chromeTranslatorEnabled", "true");
      setConfirmingChromeTranslatorDownload(false);
    } catch {
      setError("Couldn't set up Chrome's translator — it may not be available on this device or browser. Try again, or leave it off.");
    } finally {
      setChromeTranslatorLoading(false);
      setChromeTranslatorDownloadProgress("");
    }
  }

  function go(provider, nextStep) {
    wizardMemory.provider = provider;
    wizardMemory.step = nextStep;
    setWizard(provider);
    setStep(nextStep);
    setError("");
    setKeyInput("");
  }

  async function pasteKey() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setKeyInput(t.trim());
    } catch {
      setError("Couldn't paste automatically. Press and hold in the box, then tap Paste.");
    }
  }

  // Save the key, then one tiny call so a typo shows up now rather than later.
  async function saveKey(provider) {
    const P = PROVIDERS[provider];
    const key = keyInput.trim();
    if (!key || saving) return;
    setSaving(true);
    setError("");
    try {
      await agree();
      const saved = await secretSet(P.keyName, key);
      if (!saved.ok) {
        setError("Couldn't store the key securely on this device. Nothing was saved.");
        return;
      }
      if (provider === "gemini") setSavedGeminiKey(key);
      else setSavedKey(key);
      setKeyInput("");
      await chooseEngine(P.engine, true);
      try {
        await callAI("Reply with the single word OK.", "Say OK", { maxTokens: 10 });
      } catch (e) {
        setError("The key was saved, but it didn't work yet: " + apiErrorMessage(e));
        return;
      }
      wizardMemory.provider = null;
      wizardMemory.step = 0;
      setWizard(null);
      onClose(P.engine);
    } finally {
      setSaving(false);
    }
  }

  async function loadModelNow() {
    setConfirmingModel(false);
    setLoadingModel(true);
    setError("");
    try {
      await getLocalEngine((report) => setModelProgress(report.text || ""), selectedModelId);
      setModelReady(true);
      await chooseEngine("local");
      onClose("local");
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoadingModel(false);
    }
  }


  const hasSaved = !!savedGeminiKey || !!savedKey;
  const hint = { fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 };
  const bigBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--sans)", fontSize: 15, fontWeight: 700, color: "#fff", background: "var(--rust)", border: "none", textDecoration: "none", borderRadius: 999, padding: "12px 26px", cursor: "pointer" };

  // One provider on the "pick" screen: tap to start the steps, or manage a saved key.
  function providerCard(id) {
    const P = PROVIDERS[id];
    const saved = id === "gemini" ? savedGeminiKey : savedKey;
    const active = engine === P.engine;
    const removeKey = async () => {
      await secretRemove(P.keyName);
      if (id === "gemini") setSavedGeminiKey(null);
      else setSavedKey(null);
    };
    return (
      <div key={id} style={{ border: "1.5px solid " + (saved && active ? "var(--fjord)" : "var(--line)"), background: saved && active ? "#EEF2F0" : "#fff", borderRadius: 14, padding: "14px 16px", marginTop: 10 }}>
        {saved ? (
          <>
            <div style={{ fontFamily: "var(--sans)", fontSize: 15, fontWeight: 600 }}>{P.name} <span style={{ ...hint, fontWeight: 400 }}>· {P.by}</span></div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--fjord)", fontWeight: 600 }}>{active ? "Connected" : "Key saved"}</span>
              <div style={{ display: "flex", gap: 8 }}>
                {!active && (
                  <button onClick={() => chooseEngine(P.engine)} style={smallBtn("var(--fjord)")}>
                    Use this
                  </button>
                )}
                <button onClick={() => go(id, 3)} style={smallBtn("#A8A395")}>
                  Change key
                </button>
                <button onClick={removeKey} style={smallBtn("#A8A395")}>
                  Remove
                </button>
              </div>
            </div>
          </>
        ) : (
          <button onClick={() => go(id, 0)} aria-label={P.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", border: "none", background: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
            <span>
              <span style={{ display: "block", fontFamily: "var(--sans)", fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
                {P.name} <span style={{ ...hint, fontWeight: 400 }}>· {P.by}</span>
                {id === "gemini" && <span style={{ color: "var(--sage)", fontSize: 12, fontWeight: 600 }}> · Recommended</span>}
              </span>
              <span style={{ display: "block", ...hint, marginTop: 2 }}>{P.blurb}</span>
            </span>
            <span style={{ color: "var(--muted)", fontSize: 22, lineHeight: 1 }}>›</span>
          </button>
        )}
      </div>
    );
  }

  // The steps, one at a time.
  function wizardView() {
    const P = PROVIDERS[wizard];
    const last = step === P.steps.length; // the paste step
    const s = P.steps[step];
    return (
      <div>
        <div style={{ ...hint, marginBottom: 14 }}>
          {P.name} · step {step + 1} of {P.steps.length + 1}
        </div>
        {!last ? (
          <>
            <div style={{ fontFamily: "var(--serif)", fontSize: 21, lineHeight: 1.35, marginBottom: 20 }}>{s.text}</div>
            {s.button && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <button onClick={() => openLink(P.link)} style={bigBtn}>
                  {P.linkLabel} ↗
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontFamily: "var(--serif)", fontSize: 21, lineHeight: 1.35, marginBottom: 16 }}>Come back here and paste your key.</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder={P.starts + "…"} aria-label="API key" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
              <button onClick={pasteKey} style={smallBtn("#A8A395")}>
                Paste
              </button>
            </div>
            <div style={{ ...hint, fontSize: 12, marginBottom: 12 }}>{P.agree}</div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
              <button onClick={() => saveKey(wizard)} disabled={!keyInput.trim() || saving} style={{ ...bigBtn, opacity: keyInput.trim() ? 1 : 0.45 }}>
                {saving ? "Checking…" : "Save"}
              </button>
            </div>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <button onClick={() => (step === 0 ? go(null, 0) : go(wizard, step - 1))} style={{ border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 13.5, cursor: "pointer", padding: 4 }}>
            Back
          </button>
          <div style={{ display: "flex", gap: 6 }}>
            {[...P.steps, null].map((_, i) => (
              <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === step ? "var(--terracotta)" : "var(--line)" }} />
            ))}
          </div>
          {!last ? (
            <button onClick={() => go(wizard, step + 1)} style={smallBtn("var(--fjord)")}>
              Next
            </button>
          ) : (
            <span style={{ width: 44 }} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontFamily: "var(--sans)", fontSize: 15, fontWeight: 600 }}>{wizard ? "Set up " + PROVIDERS[wizard].name : "Set up your AI"}</div>
        <button aria-label="More info" onClick={() => setHelpOpen((v) => !v)} style={{ border: "none", background: "none", cursor: "pointer", color: helpOpen ? "var(--terracotta)" : "var(--muted)", padding: 4, display: "flex" }}>
          <Icon.HelpCircle size={18} />
        </button>
      </div>
      {!wizard && <div style={{ ...hint, marginBottom: 12 }}>For Look up, the Assistant and photos. Studying never needs it.</div>}

      {helpOpen && (
        <div style={{ ...hint, color: "var(--ink)", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
          {(wizard ? PROVIDERS[wizard].help : [...PROVIDERS.gemini.help.slice(0, 1), "Gemini is free up to a daily limit. Claude is paid, about half a cent per question.", "What you send goes straight to the AI company you choose, never to us."]).map((t, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              {t}
            </div>
          ))}
        </div>
      )}

      {!consented && hasSaved && !wizard && (
        <div style={{ ...hint, color: "var(--ink)", border: "1.5px solid var(--rust)", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ marginBottom: 8 }}>When you use an AI feature, your text or photo goes to the company you chose, and their privacy policy applies. It does not go to us. AI answers can be wrong.</div>
          <button onClick={agree} style={smallBtn("var(--rust)")}>I agree</button>
        </div>
      )}

      {wizard ? wizardView() : (
        <>
          {providerCard("gemini")}
          {providerCard("api")}
        </>
      )}

      {!wizard && !isNativeApp() && !showMore && (
        <button onClick={() => setShowMore(true)} style={{ border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 12, marginTop: 14, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
          More options
        </button>
      )}

      {!wizard && showMore && (
        <>
          {!isNativeApp() && (
          <>
          <div style={{ border: "1.5px solid " + (engine === "local" ? "var(--fjord)" : "var(--line)"), borderRadius: 10, padding: 14, marginTop: 10 }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Local model</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
              Free, no key, and your text stays on your device once the model is installed. Installing needs an internet connection and a one-time download of several hundred MB. Needs WebGPU — recent Chrome/Edge, or Safari 26+
              (iOS 26+ on iPhone). Weaker than Gemini at Danish, and can't do Photo import.
            </div>
            {modelReady && engine === "local" ? (
              <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--fjord)", fontWeight: 600 }}>Connected</span>
            ) : confirmingModel ? (
              <div>
                <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Choose a model:</div>
                <select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 10 }}
                >
                  {LOCAL_MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                  This downloads several hundred MB to this browser from Hugging Face. Continue?
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={loadModelNow} style={smallBtn("var(--rust)")}>
                    Download & use
                  </button>
                  <button onClick={() => setConfirmingModel(false)} style={smallBtn("#A8A395")}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmingModel(true)} disabled={loadingModel} style={smallBtn("var(--rust)")}>
                {loadingModel ? modelProgress || "Loading model…" : "Load local model"}
              </button>
            )}
          </div>

          <div style={{ border: "1.5px solid " + (engine === "ollama" ? "var(--fjord)" : "var(--line)"), borderRadius: 10, padding: 14, marginTop: 10 }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Ollama</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
              Free, private, runs on a computer with Ollama already installed. Ollama itself doesn't run on iPhone —
              but if that computer is on the same Wi-Fi as your phone, you can still use it from here: on the
              computer, run{" "}
              <code style={{ background: "var(--paper)", padding: "1px 4px", borderRadius: 4 }}>
                OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve
              </code>
              , then enter that computer's local network address below (something like{" "}
              <code style={{ background: "var(--paper)", padding: "1px 4px", borderRadius: 4 }}>http://192.168.1.42:11434</code>) instead
              of localhost. On the same computer, plain localhost works fine.
            </div>
            {engine === "ollama" && savedOllamaConfig ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--fjord)", fontWeight: 600 }}>
                  Connected — {savedOllamaConfig.model}
                </span>
                <button onClick={() => setSavedOllamaConfig(null)} style={smallBtn("#A8A395")}>
                  Change
                </button>
              </div>
            ) : (
              <div>
                <input
                  value={ollamaUrlInput}
                  onChange={(e) => setOllamaUrlInput(e.target.value)}
                  placeholder="http://localhost:11434"
                  style={{ ...inputStyle, marginBottom: 8 }}
                />
                <input
                  value={ollamaModelInput}
                  onChange={(e) => setOllamaModelInput(e.target.value)}
                  placeholder="Model name — e.g. llama3.2"
                  style={{ ...inputStyle, marginBottom: 8 }}
                />
                <button onClick={saveOllamaConfig} style={smallBtn("var(--rust)")}>
                  Connect
                </button>
              </div>
            )}
          </div>

          <div style={{ border: "1.5px solid " + (chromeTranslatorEnabled ? "var(--fjord)" : "var(--line)"), borderRadius: 10, padding: 14, marginTop: 10 }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Chrome's built-in translator</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
              Free, and once Chrome has installed its translation files, your text stays on your device — but desktop Chrome only (Chrome 138+). Not available on
              iPhone, Android, Safari, Firefox, or Edge, since it's tied to Chrome's own bundled model. When it's on,
              only the Translate button uses it; everything else still uses your main AI above.
            </div>
            {!chromeTranslatorSupported() ? (
              <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", fontStyle: "italic" }}>
                Not available in this browser.
              </div>
            ) : confirmingChromeTranslatorDownload ? (
              <div>
                <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                  This downloads a small language pack to this browser the first time. Continue?
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => toggleChromeTranslator(true)} disabled={chromeTranslatorLoading} style={smallBtn("var(--rust)")}>
                    {chromeTranslatorLoading ? chromeTranslatorDownloadProgress || "Downloading…" : "Download & use"}
                  </button>
                  <button onClick={() => setConfirmingChromeTranslatorDownload(false)} style={smallBtn("#A8A395")}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: chromeTranslatorLoading ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={chromeTranslatorEnabled}
                  disabled={chromeTranslatorLoading}
                  onChange={(e) => toggleChromeTranslator(e.target.checked)}
                  style={{ accentColor: "var(--fjord)" }}
                />
                <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)" }}>
                  {chromeTranslatorLoading ? chromeTranslatorDownloadProgress || "Setting up…" : "Use it for Translate, when available"}
                </span>
              </label>
            )}
          </div>
          </>
          )}
        </>
      )}

      {error && <div style={{ color: "var(--rust)", fontFamily: "var(--sans)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}

      <button onClick={onClose} style={{ ...smallBtn("#A8A395"), marginTop: 16, width: "100%", padding: "10px" }}>
        Done
      </button>
    </div>
  );
}
