import { useEffect, useState } from "react";
import { inputStyle, smallBtn } from "../components/ui";
import { chromeTranslatorAvailability, chromeTranslatorSupported } from "../lib/ai/chrome";
import { apiErrorMessage } from "../lib/ai/index";
import { LOCAL_MODEL_ID, LOCAL_MODEL_OPTIONS, getLocalEngine, localEnginePromise } from "../lib/ai/local";
import { storeGet, storeSet } from "../lib/storage";

// ============================================================
// Chat — the only place this app talks to an AI model. Every
// action here (conversation, sentence analysis, article
// vocabulary, category suggestions, starter vocabulary) is
// triggered by a tap, never automatically. Scanning pasted text
// for candidate vocabulary is done locally with no AI call at all
// — only translating the words you pick uses the AI.
// ============================================================

export function AISettingsPanel({ onClose }) {
  const [engine, setEngineState] = useState(null);
  const [savedGeminiKey, setSavedGeminiKey] = useState(null);
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [savedKey, setSavedKey] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [loadingModel, setLoadingModel] = useState(false);
  const [modelProgress, setModelProgress] = useState("");
  const [modelReady, setModelReady] = useState(!!localEnginePromise);
  const [showMore, setShowMore] = useState(false);
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
      setSavedGeminiKey(await storeGet("geminiApiKey"));
      setSavedKey(await storeGet("anthropicApiKey"));
      try {
        const raw = await storeGet("ollamaConfig");
        if (raw) setSavedOllamaConfig(JSON.parse(raw));
      } catch {}
      setChromeTranslatorEnabledState((await storeGet("chromeTranslatorEnabled")) === "true");
      // Anthropic is the default; expand "Use something else instead" only
      // when a different engine is in use.
      if (e === "local" || e === "gemini" || e === "ollama") setShowMore(true);
    })();
  }, []);

  async function chooseEngine(next) {
    setEngineState(next);
    setError("");
    await storeSet("aiEngine", next);
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

  async function saveGeminiKey() {
    if (!geminiKeyInput.trim()) return;
    await storeSet("geminiApiKey", geminiKeyInput.trim());
    setSavedGeminiKey(geminiKeyInput.trim());
    setGeminiKeyInput("");
    await chooseEngine("gemini");
    onClose("gemini");
  }

  async function saveKey() {
    if (!apiKeyInput.trim()) return;
    await storeSet("anthropicApiKey", apiKeyInput.trim());
    setSavedKey(apiKeyInput.trim());
    setApiKeyInput("");
    await chooseEngine("api");
    onClose("api");
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

  const apiActive = engine === "api";

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Connect an AI</div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 14 }}>
        Powers the assistant, the lightbulb and question-mark on cards, sentence explanations, and reading text from photos. Studying cards never needs it.
      </div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, lineHeight: 1.55, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>New to AI? Start here</div>
        <div style={{ marginBottom: 6 }}>The AI is not built into this app. It is a separate service run by a company such as Anthropic (Claude) or Google (Gemini). To use one, you need an <b>API key</b>: a long password that lets this app ask that service questions for you.</div>
        <div style={{ marginBottom: 6 }}><b>To get one:</b> make a free account with the company, then tap "Get a key" below. Copy the key and paste it here. Anthropic needs a few dollars of credit added first. Google's free tier needs no payment.</div>
        <div style={{ marginBottom: 6 }}><b>What it costs:</b> you pay the company directly, only for what you use. A lightbulb or question is well under a cent. Reading a photo costs more, roughly a cent or two. Prices are set by the companies and can change.</div>
        <div><b>Your key</b> stays on this device and is sent only to the company that issued it. Don't share it with anyone.</div>
      </div>

      <div
        style={{
          border: "1.5px solid " + (apiActive ? "var(--fjord)" : "var(--line)"),
          borderRadius: 10,
          padding: 14,
          background: apiActive ? "#EEF2F0" : "transparent",
        }}
      >
        <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Anthropic key</div>
        <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
          Best quality for Danish. You pay per use: about half a cent for a question, a cent or two for a photo.
        </div>
        {!savedKey && (
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--rust)",
              textDecoration: "none",
              marginBottom: 10,
            }}
          >
            Get a key at console.anthropic.com ↗
          </a>
        )}
        {savedKey ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--fjord)", fontWeight: 600 }}>
              {apiActive ? "Connected" : "Key saved"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {!apiActive && (
                <button onClick={() => chooseEngine("api")} style={smallBtn("var(--fjord)")}>
                  Use this
                </button>
              )}
              <button onClick={() => setSavedKey(null)} style={smallBtn("#A8A395")}>
                Change key
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <input type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="sk-ant-…" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={saveKey} style={smallBtn("var(--rust)")}>
              Save
            </button>
          </div>
        )}
      </div>

      {!showMore && (
        <button
          onClick={() => setShowMore(true)}
          style={{ border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 12, marginTop: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }}
        >
          Use something else instead
        </button>
      )}

      {showMore && (
        <>
          <div
            style={{
              border: "1.5px solid " + (engine === "gemini" ? "var(--fjord)" : "var(--line)"),
              borderRadius: 10,
              padding: 14,
              marginTop: 12,
              background: engine === "gemini" ? "#EEF2F0" : "transparent",
            }}
          >
            <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Google Gemini</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>
              Free, no credit card, with daily limits. On the free tier Google may use what you send to improve its products. Also reads photos. Good quality for everyday
              use, a step behind Claude on tricky grammar.
            </div>

            {savedGeminiKey ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--fjord)", fontWeight: 600 }}>
                  {engine === "gemini" ? "Connected" : "Key saved"}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  {engine !== "gemini" && (
                    <button onClick={() => chooseEngine("gemini")} style={smallBtn("var(--fjord)")}>
                      Use this
                    </button>
                  )}
                  <button onClick={() => setSavedGeminiKey(null)} style={smallBtn("#A8A395")}>
                    Change key
                  </button>
                </div>
              </div>
            ) : (
              <>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: "var(--sans)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "var(--rust)",
                    textDecoration: "none",
                    marginBottom: 10,
                  }}
                >
                  Get a free key at aistudio.google.com ↗
                </a>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="password"
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    placeholder="Paste your key — AIza…"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={saveGeminiKey} style={smallBtn("var(--rust)")}>
                    Save
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ border: "1.5px solid " + (engine === "local" ? "var(--fjord)" : "var(--line)"), borderRadius: 10, padding: 14, marginTop: 10 }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Local model</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
              Free, no key, and your text stays on your device. Needs a one-time download of several hundred MB. Needs WebGPU — recent Chrome/Edge, or Safari 26+
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
              Free, and your text never leaves your device — but desktop Chrome only (Chrome 138+). Not available on
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

      {error && <div style={{ color: "var(--rust)", fontFamily: "var(--sans)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}

      <button onClick={onClose} style={{ ...smallBtn("#A8A395"), marginTop: 16, width: "100%", padding: "10px" }}>
        Done
      </button>
    </div>
  );
}
