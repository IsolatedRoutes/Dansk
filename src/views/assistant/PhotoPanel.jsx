import { useEffect, useState } from "react";
import { AIErrorNote } from "../../components/AIErrorNote";
import { CategoryOptions } from "../../components/CategoryPicker";
import { Icon } from "../../components/icons";
import { renderInlineMarkdown } from "../../components/markdown";
import { SentenceResult } from "../../components/SentenceResult";
import { analysisLevelHint } from "../../lib/analysisLevel";
import { readSentenceResult, initialSentenceSelection } from "../../lib/sentenceResult";
import { CenteredOverlay, inputStyle, smallBtn } from "../../components/ui";
import { CATEGORY_RULE, aiCategoryName, topicNamesForAI } from "../../data/categories";
import { irregularPluralFactsHint, irregularVerbFactsHint } from "../../data/irregulars";
import { callClaudeImage } from "../../lib/ai/claude";
import { callGeminiImage } from "../../lib/ai/gemini";
import { apiErrorMessage, callAI, getAIEngine } from "../../lib/ai/index";
import { FORMS_RULE, formsField } from "../../lib/ownFormsCore";
import { CLARITY_RULES, SENTENCE_ANALYSIS_JSON, SENTENCE_ANALYSIS_RULES, WORD_INSIGHT_SYSTEM_PROMPT, knownWordsHint } from "../../lib/ai/prompts";
import { speakDanish, speechSupported } from "../../lib/speech";
import { secretGet } from "../../lib/secrets";
import { base64ToFile } from "../../lib/shareInbox";
import { cleanTranslation, fileToBase64, isMobileDevice, parseJSONLoose } from "../../lib/text";

// ---------- Photo import panel (always uses the API — needs vision) ----------

export function PhotoPanel({ categories, addCategory, addCards, onOpenSettings, incomingImage }) {
  const [backend, setBackend] = useState(undefined); // "gemini" | "api" | null
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);

  // Extract text (existing vocabulary-extraction flow)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [grammarNotes, setGrammarNotes] = useState("");
  const [selected, setSelected] = useState({});
  const [itemCategory, setItemCategory] = useState({}); // index -> category id, individually suggested per item

  // Translate — same shape/behavior as the text Translate panel, just
  // reading the Danish (or English) text straight out of the photo.
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupCategory, setLookupCategory] = useState("");

  // Analyze sentence — same grammar-breakdown flow as the text panel.
  const [sentenceLoading, setSentenceLoading] = useState(false);
  const [sentenceError, setSentenceError] = useState("");
  const [sentenceResult, setSentenceResult] = useState(null);
  const [sentenceSelected, setSentenceSelected] = useState({});

  // Word-insight popup for the Translate result, same as elsewhere.
  const [insightFor, setInsightFor] = useState(null);
  const [insightForms, setInsightForms] = useState([]);
  const [insightExplanation, setInsightExplanation] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

  useEffect(() => {
    (async () => {
      const engine = await getAIEngine();
      const geminiKey = await secretGet("geminiApiKey");
      const anthropicKey = await secretGet("anthropicApiKey");
      if (engine === "gemini" && geminiKey) setBackend("gemini");
      else if (engine === "api") setBackend("api"); // works whether via Claude's own auth or an explicit Anthropic key
      else if (anthropicKey) setBackend("api");
      else if (geminiKey) setBackend("gemini");
      else setBackend(null);
    })();
  }, []);

  const [dragActive, setDragActive] = useState(false);

  function handleFile(f) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setItems([]);
    setGrammarNotes("");
    setLookupResult(null);
    setSentenceResult(null);
    setError("");
    setLookupError("");
    setSentenceError("");
  }

  function pickFile(e) {
    handleFile(e.target.files?.[0]);
  }

  // A photo shared to Broen from another app is loaded like a picked one.
  const incomingId = incomingImage ? incomingImage.id : null;
  useEffect(() => {
    if (!incomingImage) return;
    try {
      handleFile(base64ToFile(incomingImage.imageBase64, incomingImage.imageType));
    } catch {
      setError("That photo couldn't be opened. Try picking it with the upload button.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingId]);

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const f = Array.from(e.dataTransfer.files || []).find((f) => f.type.startsWith("image/"));
    if (f) handleFile(f);
  }

  function clearAll() {
    setFile(null);
    setPreview(null);
    setItems([]);
    setGrammarNotes("");
    setSelected({});
    setItemCategory({});
    setError("");
    setLookupResult(null);
    setLookupError("");
    setSentenceResult(null);
    setSentenceSelected({});
    setSentenceError("");
  }

  async function callVision(system, userText) {
    const base64 = await fileToBase64(file);
    const mediaType = file.type || "image/jpeg";
    return backend === "gemini" ? callGeminiImage(system, userText, base64, mediaType) : callClaudeImage(system, userText, base64, mediaType);
  }

  async function openInsight(word, meaning) {
    setInsightFor(word);
    setInsightError("");
    setInsightForms([]);
    setInsightExplanation("");
    setInsightLoading(true);
    try {
      const reply = await callAI(
        WORD_INSIGHT_SYSTEM_PROMPT,
        'Danish word or phrase: "' + word + '"' + (meaning ? " (means: " + meaning + ")" : "") + irregularVerbFactsHint(word) + irregularPluralFactsHint(word) + knownWordsHint(),
        { maxTokens: 700 }
      );
      const parsed = parseJSONLoose(reply);
      setInsightForms(parsed.forms || []);
      setInsightExplanation((parsed.explanation || "").trim());
    } catch (e) {
      setInsightError(apiErrorMessage(e));
    } finally {
      setInsightLoading(false);
    }
  }

  async function translate() {
    if (!file) return;
    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);
    try {
      const reply = await callVision(
        "You translate between Danish and English for a language learner, reading text directly out of a photo (a sign, a book page, an app, packaging). Your first and most important job is to correctly identify which language the text in the image is written in — it will not always be Danish, and treating it as Danish by default is a common mistake to avoid. Then translate it into the other language. If there's more than one distinct piece of text, focus on the single most prominent one. The translation must be ONLY in its target language — never repeat or include the original alongside it. If it's a single Danish noun (on either side), include its grammatical article (en/et) with the Danish form, and match it with a natural English article ('a'/'an') only when the noun is countable that way in English.",
        'Identify the language of the text in this photo, then translate it. Respond ONLY with JSON, no other text: {"detectedLanguage": "da or en", "original": "the text from the photo, in its original language", "translation": "your translation, in the other language", "forms": []}. If the Danish side is a single noun, verb or describing word, ALSO fill "forms" like this:' + FORMS_RULE + ' Otherwise leave it as an empty list.'
      );
      const parsed = parseJSONLoose(reply);
      const isEnglish = String(parsed.detectedLanguage || "").toLowerCase().startsWith("en");
      const original = cleanTranslation(parsed.original);
      const translation = cleanTranslation(parsed.translation);
      const da = isEnglish ? translation : original;
      const en = isEnglish ? original : translation;
      if (da && en && da.trim().toLowerCase() === en.trim().toLowerCase()) {
        throw new Error("TRANSLATION_DIDNT_HAPPEN");
      }
      setLookupResult({ da, en, forms: parsed.forms });
    } catch (e) {
      setLookupError(apiErrorMessage(e));
    } finally {
      setLookupLoading(false);
    }
  }

  function addLookup() {
    if (!lookupResult || !lookupResult.da || !lookupResult.en) {
      setLookupError("Didn't get a usable translation to add — try translating again.");
      return;
    }
    let catId = lookupCategory;
    if (lookupCategory.startsWith("__new__")) catId = addCategory(lookupCategory.replace("__new__", "") || "Quick lookups");
    const type = (lookupResult.da || "").trim().split(/\s+/).length > 3 ? "sentence" : "word";
    addCards([{ type, front: lookupResult.da, back: lookupResult.en, category: catId, ...formsField(type, lookupResult.da, lookupResult.forms) }]);
    setLookupResult(null);
  }

  async function analyzeSentence() {
    if (!file) return;
    setSentenceLoading(true);
    setSentenceError("");
    setSentenceResult(null);
    try {
      const levelHint = await analysisLevelHint();
      const reply = await callVision(
        "You are a patient Danish tutor for a self-taught learner who has foundational grammar gaps, reading text directly out of a photo. " + CLARITY_RULES + "Work from the text visible in the photo." + SENTENCE_ANALYSIS_RULES + levelHint + knownWordsHint() + SENTENCE_ANALYSIS_JSON,
        "Analyze the grammar of the text in this photo."
      );
      const parsed = parseJSONLoose(reply);
      const read = readSentenceResult(parsed);
      const points = read.grammarPoints;
      if (points.length === 0) {
        setSentenceError("Couldn't identify a clear grammar point in that photo — try a clearer shot, or one with more text.");
        return;
      }
      setSentenceResult(read);
      setSentenceSelected(initialSentenceSelection(points));
    } catch (e) {
      setSentenceError(apiErrorMessage(e));
    } finally {
      setSentenceLoading(false);
    }
  }

  function addSentenceSelected() {
    if (!sentenceResult) return;
    const toAdd = [];
    sentenceResult.grammarPoints.forEach((point, i) => {
      const sel = sentenceSelected[i] || {};
      // Lessons go in Grammar Lessons; their example sentences need no category.
      const catId = "";
      if (sel.grammar) {
        toAdd.push({
          type: "grammar",
          front: point.grammarName,
          back: point.cardBack || point.explanation,
          notes: "Example: " + point.mainExample.da + " — " + point.mainExample.en,
          category: catId,
          examples: point.examples,
        });
      }
      if (sel.main) toAdd.push({ type: "sentence", front: point.mainExample.da.replace(/\*\*/g, ""), back: point.mainExample.en.replace(/\*\*/g, ""), category: catId });
      (point.examples || []).forEach((ex, j) => {
        if (sel.examples && sel.examples[j]) toAdd.push({ type: "sentence", front: ex.da.replace(/\*\*/g, ""), back: ex.en.replace(/\*\*/g, ""), category: catId });
      });
    });
    if (toAdd.length === 0) return;
    addCards(toAdd);
    setSentenceResult(null);
  }

  async function extract() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const categoryNames = topicNamesForAI(categories);
      const system =
        "You help an intermediate self-taught Danish learner build flashcards from photos of text (book pages, signs, notes, apps). First, briefly note any grammar or sentence structures worth pointing out in this specific text (2-3 sentences, plain English) — skip this if the image is just a word list with nothing notable. Then extract every distinct Danish word or sentence visible, with a natural English translation for each, and the single best-fitting category for each item individually." + CATEGORY_RULE + " Different items can get different categories, or none. Keep the vocabulary list focused and useful — skip page numbers, headers, or noise. " +
        'Respond ONLY with JSON, no other text: {"grammarNotes": "...", "items": [{"danish": "...", "english": "...", "type": "word", "category": "...", "forms": []}]} where "type" is "word" for single words/short phrases and "sentence" for full sentences. Use an empty string for grammarNotes if there is nothing worth noting.' + FORMS_RULE + ' ' +
        "Existing categories to prefer if one fits: " +
        (categoryNames || "(none yet)");
      const text = await callVision(system, "Extract Danish vocabulary and sentences from this image.");
      const parsed = parseJSONLoose(text);
      const list = parsed.items || [];
      // Resolve each suggested category name to a real id up front (same
      // approach as the text-extract panel) so each row can use a plain
      // dropdown instead of its own "new category" flow.
      const workingCategories = [...categories];
      const sel = {};
      const cats = {};
      list.forEach((it, i) => {
        const name = aiCategoryName(it.category);
        let existing = name ? workingCategories.find((c) => c.name.toLowerCase() === name.toLowerCase()) : null;
        if (name && !existing) {
          const id = addCategory(name);
          existing = { id, name, custom: true };
          workingCategories.push(existing);
        }
        sel[i] = true;
        cats[i] = existing ? existing.id : "";
      });
      setItems(list);
      setGrammarNotes(parsed.grammarNotes || "");
      setSelected(sel);
      setItemCategory(cats);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function addSelected() {
    const toAdd = items
      .map((it, i) => ({ it, i }))
      .filter(({ i }) => selected[i])
      .map(({ it, i }) => {
        const type = it.type === "sentence" ? "sentence" : "word";
        return { type, front: it.danish, back: it.english, category: itemCategory[i] || "", ...formsField(type, it.danish, it.forms) };
      });
    if (toAdd.length === 0) return;
    addCards(toAdd);
    setItems([]);
    setGrammarNotes("");
  }

  if (backend === undefined) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <Icon.Loader2 className="spin" size={18} color="var(--muted)" />
      </div>
    );
  }

  if (backend === null) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}>
        <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>
          Photo import needs a Gemini or Anthropic API key even if you're using the local model elsewhere — reading
          images needs a bigger model than fits in a browser tab. Gemini's key is free.
        </div>
        <button onClick={onOpenSettings} style={smallBtn("var(--rust)")}>
          Open AI settings
        </button>
      </div>
    );
  }

  const lookupIsWordLike = lookupResult && lookupResult.da && lookupResult.da.trim().split(/\s+/).length <= 4;

  return (
    <div>
      {(file || items.length > 0 || lookupResult || sentenceResult) && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button
            onClick={clearAll}
            style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 12, cursor: "pointer", padding: 4 }}
          >
            <Icon.Trash2 size={12} /> Clear
          </button>
        </div>
      )}
      <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Choose or take a photo of Danish text — a book, an app, a sign — then translate it, get the grammar
        explained, or pull out the key vocabulary worth learning from it.
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          border: dragActive ? "2px dashed var(--fjord)" : "1px dashed var(--line)",
          background: dragActive ? "#EEF2F0" : "var(--card)",
          borderRadius: 10,
          padding: preview ? 8 : 28,
          fontFamily: "var(--sans)",
          fontSize: 13.5,
          color: "var(--muted)",
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        <input
          type="file"
          accept="image/*"
          onChange={pickFile}
          style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}
        />
        {preview ? (
          <img src={preview} alt="Selected photo" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 6 }} />
        ) : (
          <>
            <Icon.Upload size={20} style={{ marginBottom: 6 }} />
            <div>Tap to choose a photo or screenshot, or drag one here</div>
          </>
        )}
      </label>

      {!preview && isMobileDevice() && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: "100%",
            border: "1px solid var(--line)",
            background: "var(--card)",
            borderRadius: 10,
            padding: "10px",
            marginTop: 8,
            fontFamily: "var(--sans)",
            fontSize: 13.5,
            color: "var(--muted)",
            cursor: "pointer",
          }}
        >
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={pickFile}
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}
          />
          <Icon.Camera size={15} />
          Take a photo
        </label>
      )}

      {!preview && isMobileDevice() && (
        <div style={{ fontFamily: "var(--sans)", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45, marginTop: 6, textAlign: "center" }}>
          Your phone will ask to use the camera. You can change this any time in Settings.
        </div>
      )}

      {file && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button
            onClick={translate}
            disabled={lookupLoading}
            style={{ ...smallBtn("var(--fjord)"), flex: 1, padding: "9px 4px", fontSize: 12.5, display: "flex", justifyContent: "center", alignItems: "center", gap: 5 }}
          >
            {lookupLoading ? <Icon.Loader2 size={12} className="spin" /> : null}
            {lookupLoading ? "Reading…" : "Translate"}
          </button>
          <button
            onClick={analyzeSentence}
            disabled={sentenceLoading}
            style={{ ...smallBtn("#8C6FA0"), flex: 1, padding: "9px 4px", fontSize: 12.5, display: "flex", justifyContent: "center", alignItems: "center", gap: 5 }}
          >
            {sentenceLoading ? <Icon.Loader2 size={12} className="spin" /> : null}
            {sentenceLoading ? "Reading…" : "Analyze sentence"}
          </button>
          <button
            onClick={extract}
            disabled={loading}
            style={{ ...smallBtn("var(--rust)"), flex: 1, padding: "9px 4px", fontSize: 12.5, display: "flex", justifyContent: "center", alignItems: "center", gap: 5 }}
          >
            {loading ? <Icon.Loader2 size={12} className="spin" /> : null}
            {loading ? "Reading…" : "Extract text"}
          </button>
        </div>
      )}

      <AIErrorNote message={lookupError} onOpenSettings={onOpenSettings} />
      <AIErrorNote message={sentenceError} onOpenSettings={onOpenSettings} />
      <AIErrorNote message={error} onOpenSettings={onOpenSettings} />

      {lookupResult && (
        <div style={{ position: "relative", marginTop: 12, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px" }}>
          {lookupIsWordLike ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--terracotta)" }}>{lookupResult.da}</span>
              {speechSupported() && (
                <button
                  onClick={() => speakDanish(lookupResult.da)}
                  aria-label="Pronounce this"
                  style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
                >
                  <Icon.Volume2 size={17} />
                </button>
              )}
              <button
                onClick={() => openInsight(lookupResult.da, lookupResult.en)}
                aria-label="Explore related words"
                style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
              >
                <Icon.Lightbulb size={17} />
              </button>
            </div>
          ) : (
            speechSupported() && (
              <button
                onClick={() => speakDanish(lookupResult.da)}
                aria-label="Pronounce this"
                style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: "4px 0", fontFamily: "var(--sans)", fontSize: 12, marginBottom: 4 }}
              >
                <Icon.Volume2 size={15} /> Listen to the Danish
              </button>
            )
          )}
          <div style={{ fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.5, marginBottom: 10, color: "var(--sage)", fontStyle: "italic" }}>{lookupResult.en}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
            <select
              value={lookupCategory.startsWith("__new__") ? "" : lookupCategory}
              onChange={(e) => {
                if (e.target.value === "__new__cat") {
                  const name = window.prompt ? window.prompt("New category name") : "";
                  if (name && name.trim()) setLookupCategory("__new__" + name.trim());
                  return;
                }
                setLookupCategory(e.target.value);
              }}
              style={{ ...inputStyle, width: "auto", padding: "6px 8px", fontSize: 12.5 }}
            >
              <CategoryOptions categories={categories} />
              <option value="__new__cat">+ New category…</option>
            </select>
            <button
              onClick={addLookup}
              aria-label="Add word"
              style={{ border: "none", background: "var(--rust)", color: "#FBFAF7", borderRadius: 999, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <Icon.Plus size={16} />
            </button>
          </div>

          {insightFor && (
            <CenteredOverlay onClose={() => setInsightFor(null)} maxWidth={380}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--terracotta)" }}>{insightFor}</div>
                <button aria-label="Close" onClick={() => setInsightFor(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
                  <Icon.X size={16} />
                </button>
              </div>
              {insightLoading ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <Icon.Loader2 className="spin" size={18} color="var(--muted)" />
                </div>
              ) : insightError ? (
                <AIErrorNote message={insightError} onOpenSettings={onOpenSettings} />
              ) : (
                <div style={{ background: "var(--paper)", borderRadius: 8, padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55 }}>
                  {insightForms.length > 0 && (
                    <div style={{ marginBottom: insightExplanation ? 10 : 0 }}>
                      {insightForms.map((f, i) => (
                        <div key={i} style={{ marginBottom: 3 }}>
                          <span style={{ color: "var(--terracotta)" }}>{f.da}</span>
                          <span style={{ color: "var(--sage)", fontStyle: "italic" }}> — {f.en}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {insightExplanation && <div style={{ whiteSpace: "pre-wrap" }}>{renderInlineMarkdown(insightExplanation)}</div>}
                </div>
              )}
            </CenteredOverlay>
          )}
        </div>
      )}

      {sentenceResult && <SentenceResult result={sentenceResult} selected={sentenceSelected} setSelected={setSentenceSelected} onClose={() => setSentenceResult(null)} onAdd={addSentenceSelected} />}

      {items.length > 0 && (
        <CenteredOverlay onClose={() => setItems([])} maxWidth={460}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button aria-label="Close" onClick={() => setItems([])} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          {grammarNotes && (
            <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5, marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
              {renderInlineMarkdown(grammarNotes)}
            </div>
          )}
          <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
            Found {items.length} item{items.length === 1 ? "" : "s"} — uncheck any you don't want, and adjust the category if it's not quite right.
          </div>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={!!selected[i]} onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })} style={{ accentColor: "#8C6FA0" }} />
                <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, minWidth: 0 }}>
                  <span style={{ color: "var(--terracotta)" }}>{it.danish}</span> — <span style={{ color: "var(--sage)", fontStyle: "italic" }}>{it.english}</span>
                </span>
              </label>
              <select
                value={itemCategory[i] || ""}
                onChange={(e) => setItemCategory({ ...itemCategory, [i]: e.target.value })}
                style={{ ...inputStyle, width: "auto", padding: "5px 6px", fontSize: 11.5, flexShrink: 0 }}
              >
                <CategoryOptions categories={categories} />
              </select>
            </div>
          ))}
          <button onClick={addSelected} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "10px", fontSize: 14, marginTop: 6 }}>
            Add selected to deck
          </button>
        </CenteredOverlay>
      )}
    </div>
  );
}
