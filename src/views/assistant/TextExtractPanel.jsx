import { useEffect, useRef, useState } from "react";
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
import { chromeTranslatorSupported, translateWithChromeTranslator } from "../../lib/ai/chrome";
import { apiErrorMessage, callAI } from "../../lib/ai/index";
import { FORMS_RULE, formsField } from "../../lib/ownFormsCore";
import { CLARITY_RULES, SENTENCE_ANALYSIS_JSON, SENTENCE_ANALYSIS_RULES, WORD_INSIGHT_SYSTEM_PROMPT, knownWordsHint } from "../../lib/ai/prompts";
import { speakDanish, speechSupported } from "../../lib/speech";
import { storeGet } from "../../lib/storage";
import { cleanTranslation, parseJSONLoose } from "../../lib/text";
import { loadingCopy } from "./ChatConversation";

// ---------- Sentence analysis panel ----------


// ---------- Article vocabulary panel ----------

export function TextExtractPanel({ engine, categories, addCategory, addCards, onOpenSettings, incomingText }) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  // Text shared to Broen from another app lands in the box (added below
  // anything already there).
  const incomingId = incomingText ? incomingText.id : null;
  useEffect(() => {
    if (!incomingText) return;
    const t = (incomingText.text || "").trim();
    if (!t) return;
    setText((prev) => (prev.trim() ? prev.replace(/\s+$/, "") + "\n\n" + t : t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingId]);

  // Translate (quick lookup)
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupCategory, setLookupCategory] = useState("");

  // Analyze sentence: grammar breakdown, sharing one text box with
  // Translate and Extract text.
  const [sentenceLoading, setSentenceLoading] = useState(false);
  const [sentenceError, setSentenceError] = useState("");
  const [sentenceResult, setSentenceResult] = useState(null);
  const [sentenceSelected, setSentenceSelected] = useState({});

  // Extract text — pulls out vocabulary worth learning from a passage.
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [selected, setSelected] = useState({});
  const [itemCategory, setItemCategory] = useState({}); // da word -> category id, individually suggested per word
  const [error, setError] = useState("");

  // Word-insight popup — same deep-dive (forms, related words) as the
  // lightbulb on a study card. Only makes sense once the translated
  // result looks like a single word or short phrase, not a passage.
  const [insightFor, setInsightFor] = useState(null);
  const [insightForms, setInsightForms] = useState([]);
  const [insightExplanation, setInsightExplanation] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

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
    if (!text.trim()) return;
    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);
    try {
      // When Chrome's on-device translator is enabled and available, try
      // it first — free, instant, no network call. Any failure here is
      // never a hard error, just a signal to fall through to the
      // configured cloud AI below like normal.
      if (chromeTranslatorSupported()) {
        try {
          const enabled = (await storeGet("chromeTranslatorEnabled")) === "true";
          if (enabled) {
            const result = await translateWithChromeTranslator(text.trim());
            if (result && result.da && result.en && result.da.trim().toLowerCase() !== result.en.trim().toLowerCase()) {
              setLookupResult(result);
              return;
            }
          }
        } catch {
          // fall through
        }
      }
      const inputText = text.trim();
      // Split into two focused calls rather than one that both detects
      // and translates — a dedicated detection step is more reliable
      // than asking the model to identify the language while also
      // composing the translation, where the direction can quietly
      // default to Danish under the weight of the larger task.
      const detectionReply = await callAI(
        "You detect whether a piece of text is written in Danish or English, based only on the actual words used. If it's a genuine mix of both languages, default to \"da\" — this is a Danish-learning app, so mixed text should be treated as Danish needing translation rather than English. Respond with ONLY the two letters \"da\" or \"en\" — nothing else, no punctuation, no explanation.",
        'Text: "' + inputText + '"',
        { maxTokens: 10 }
      );
      const isEnglish = detectionReply.trim().toLowerCase().replace(/[^a-z]/g, "").startsWith("en");
      const wantForms = inputText.split(/\s+/).length <= 2;
      const reply = await callAI(
        "You translate " +
          (isEnglish ? "English text into natural, fluent Danish" : "Danish text into natural, fluent English") +
          " for a language learner. Never invent or substitute a different word that merely looks similar to the input — if the input might contain a typo, translate your single best real-word interpretation of what was actually typed, not some other unrelated word. Respond with ONLY the translation itself — no original text alongside it, no notes, no quotation marks. If it's a single Danish noun (on either side), include its grammatical article (en/et) with the Danish form, and match it with a natural English article ('a'/'an') only when the noun is countable that way in English — omit the article on both sides for mass/uncountable nouns (e.g. anger, water)." +
          (wantForms
            ? ' Because this is a single word, respond instead with ONLY JSON: {"translation": "...", "forms": []} where "translation" is the translation itself (no notes) and "forms" is filled for the Danish word like this:' + FORMS_RULE + ' Use [] when it has no forms.'
            : ""),
        inputText,
        { maxTokens: 1500 }
      );
      // For single words the answer is JSON with the forms; if it is not, it is just the translation.
      let translation;
      let forms;
      try {
        const j = wantForms ? parseJSONLoose(reply) : null;
        translation = j && j.translation ? cleanTranslation(String(j.translation)) : cleanTranslation(reply);
        forms = j ? j.forms : undefined;
      } catch {
        translation = cleanTranslation(reply);
      }
      const da = isEnglish ? translation : inputText;
      const en = isEnglish ? inputText : translation;
      // If both sides came back the same, the model didn't actually
      // translate. Treat that as a failure rather than silently showing
      // a broken result.
      if (da && en && da.trim().toLowerCase() === en.trim().toLowerCase()) {
        throw new Error("TRANSLATION_DIDNT_HAPPEN");
      }
      setLookupResult({ da, en, forms });
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
    if (!text.trim()) return;
    setSentenceLoading(true);
    setSentenceError("");
    setSentenceResult(null);
    try {
      const levelHint = await analysisLevelHint();
      const reply = await callAI(
        "You are a patient Danish tutor for a self-taught learner who has foundational grammar gaps. " + CLARITY_RULES + "The user will give you text in English or Danish, from a single sentence to a longer passage, that they are trying to understand or say correctly." + SENTENCE_ANALYSIS_RULES + levelHint + knownWordsHint() + SENTENCE_ANALYSIS_JSON,
        text.trim(),
        { maxTokens: 1500 }
      );
      const parsed = parseJSONLoose(reply);
      const read = readSentenceResult(parsed);
      const points = read.grammarPoints;
      if (points.length === 0) {
        setSentenceError("Couldn't identify a clear grammar point in that — try rephrasing, or adding a bit more context.");
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

  async function analyzeText() {
    if (!text.trim()) return;
    setAnalyzing(true);
    setError("");
    setAnalysis(null);
    try {
      const categoryNames = topicNamesForAI(categories);
      const reply = await callAI(
        "You help an intermediate, self-taught Danish learner understand a piece of Danish text. First, give a natural, fluent English translation of the full passage. Then briefly explain the notable grammar and sentence structures used in this specific passage — reference actual phrases from the text, 2-4 sentences, plain English, no jargon overload. Then suggest the key vocabulary genuinely worth learning from it (not every word), with a natural English translation for each, and the single best-fitting category for each word individually." + CATEGORY_RULE + " Different words can get different categories, or none.",
        "Text:\n" +
          text.slice(0, 3000) +
          "\n\nExisting categories to prefer if one fits: " +
          (categoryNames || "(none yet)") +
          '\n\nRespond ONLY with JSON, no other text: {"fullTranslation": "...", "grammarNotes": "...", "vocabulary": [{"da": "...", "en": "...", "category": "...", "forms": []}]}' + FORMS_RULE.replace('type "word" ', ''),
        { maxTokens: 2500 }
      );
      const parsed = parseJSONLoose(reply);
      const vocab = parsed.vocabulary || [];
      // Resolve each suggested category name to a real id up front (creating
      // new ones as needed) so each row below can use a plain dropdown
      // rather than its own "new category" flow. Tracked locally so two
      // words suggesting the same new category name share one category
      // instead of creating duplicates.
      const workingCategories = [...categories];
      const sel = {};
      const cats = {};
      vocab.forEach((v) => {
        const name = aiCategoryName(v.category);
        let existing = name ? workingCategories.find((c) => c.name.toLowerCase() === name.toLowerCase()) : null;
        if (name && !existing) {
          const id = addCategory(name);
          existing = { id, name, custom: true };
          workingCategories.push(existing);
        }
        sel[v.da] = true;
        cats[v.da] = existing ? existing.id : "";
      });
      setAnalysis(parsed);
      setSelected(sel);
      setItemCategory(cats);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setAnalyzing(false);
    }
  }

  function addSelectedVocab() {
    if (!analysis) return;
    const toAdd = (analysis.vocabulary || [])
      .filter((v) => selected[v.da])
      .map((v) => ({ type: "word", front: v.da, back: v.en, category: itemCategory[v.da] || "", ...formsField("word", v.da, v.forms) }));
    if (toAdd.length === 0) return;
    addCards(toAdd);
    setAnalysis(null);
    setSelected({});
    setItemCategory({});
  }

  function clearAll() {
    setText("");
    setLookupResult(null);
    setLookupError("");
    setSentenceResult(null);
    setSentenceSelected({});
    setSentenceError("");
    setAnalysis(null);
    setSelected({});
    setItemCategory({});
    setError("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  const lookupIsWordLike = lookupResult && lookupResult.da && lookupResult.da.trim().split(/\s+/).length <= 4;

  return (
    <div>
      {(text || lookupResult || sentenceResult || analysis) && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button
            onClick={clearAll}
            style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 12, cursor: "pointer", padding: 4 }}
          >
            <Icon.Trash2 size={12} /> Clear
          </button>
        </div>
      )}
      <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 }}>
        Type or paste anything — a word, a sentence, or a longer passage — then translate it, get the grammar
        explained, or pull out the key vocabulary worth learning from it.
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = e.target.scrollHeight + "px";
        }}
        placeholder='e.g. "hyggelig", "hvis jeg kunne, ville jeg", or a longer passage…'
        style={{ ...inputStyle, minHeight: 100, overflow: "hidden", resize: "none" }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button
          onClick={translate}
          disabled={!text.trim() || lookupLoading}
          style={{ ...smallBtn("var(--fjord)"), flex: 1, padding: "9px 4px", fontSize: 12.5, display: "flex", justifyContent: "center", alignItems: "center", gap: 5, opacity: text.trim() ? 1 : 0.5 }}
        >
          {lookupLoading ? <Icon.Loader2 size={12} className="spin" /> : null}
          {lookupLoading ? loadingCopy(engine) : "Translate"}
        </button>
        <button
          onClick={analyzeSentence}
          disabled={!text.trim() || sentenceLoading}
          style={{ ...smallBtn("#8C6FA0"), flex: 1, padding: "9px 4px", fontSize: 12.5, display: "flex", justifyContent: "center", alignItems: "center", gap: 5, opacity: text.trim() ? 1 : 0.5 }}
        >
          {sentenceLoading ? <Icon.Loader2 size={12} className="spin" /> : null}
          {sentenceLoading ? loadingCopy(engine) : "Analyze sentence"}
        </button>
        <button
          onClick={analyzeText}
          disabled={!text.trim() || analyzing}
          style={{ ...smallBtn("var(--rust)"), flex: 1, padding: "9px 4px", fontSize: 12.5, display: "flex", justifyContent: "center", alignItems: "center", gap: 5, opacity: text.trim() ? 1 : 0.5 }}
        >
          {analyzing ? <Icon.Loader2 size={12} className="spin" /> : null}
          {analyzing ? loadingCopy(engine) : "Extract text"}
        </button>
      </div>

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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                style={{
                  border: "none",
                  background: "var(--rust)",
                  color: "#FBFAF7",
                  borderRadius: 999,
                  width: 30,
                  height: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Icon.Plus size={16} />
              </button>
            </div>
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

      {analysis && (
        <CenteredOverlay onClose={() => setAnalysis(null)} maxWidth={460}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button aria-label="Close" onClick={() => setAnalysis(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          {analysis.fullTranslation && !lookupResult && (
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Translation</div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55, fontStyle: "italic", color: "var(--sage)" }}>{renderInlineMarkdown(analysis.fullTranslation)}</div>
            </div>
          )}
          <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>{renderInlineMarkdown(analysis.grammarNotes)}</div>

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
              Suggested vocabulary — uncheck any you don't want, and adjust the category if it's not quite right.
            </div>
            {(analysis.vocabulary || []).map((v, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <input type="checkbox" checked={!!selected[v.da]} onChange={(e) => setSelected({ ...selected, [v.da]: e.target.checked })} style={{ accentColor: "#8C6FA0" }} />
                  <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, minWidth: 0 }}>
                    <span style={{ color: "var(--terracotta)" }}>{v.da}</span> —{" "}
                    <span style={{ color: "var(--sage)", fontStyle: "italic" }}>{v.en}</span>
                  </span>
                </label>
                <select
                  value={itemCategory[v.da] || ""}
                  onChange={(e) => setItemCategory({ ...itemCategory, [v.da]: e.target.value })}
                  style={{ ...inputStyle, width: "auto", padding: "5px 6px", fontSize: 11.5, flexShrink: 0 }}
                >
                  <CategoryOptions categories={categories} />
                </select>
              </div>
            ))}
          </div>

          <button onClick={addSelectedVocab} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "10px", fontSize: 14, marginTop: 12 }}>
            Add selected to deck
          </button>
        </CenteredOverlay>
      )}
    </div>
  );
}
