import { useRef, useState } from "react";
import { AIErrorNote } from "../components/AIErrorNote";
import { CategoryPicker } from "../components/CategoryPicker";
import { Icon } from "../components/icons";
import { renderInlineMarkdown } from "../components/markdown";
import { CenteredOverlay, Field, SectionTitle, inputStyle, smallBtn } from "../components/ui";
import { LOOKUP_SYSTEM, cardTypeFor, lookupUserText, readLookup } from "../lib/addLookup";
import { formsField } from "../lib/ownFormsCore";
import { GRAMMAR_GROUPS, LEVELS, LESSONS_ID, isLessonsCategory, topicNamesForAI } from "../data/categories";
import { apiErrorMessage, callAI } from "../lib/ai/index";
import { GRAMMAR_CARD_STYLE, knownWordsHint, PLAIN_ENGLISH_RULE } from "../lib/ai/prompts";
import { parseJSONLoose } from "../lib/text";

// ---------- Add Card ----------

export function AddCardView({ categories, addCategory, addCards, onOpenSettings }) {
  // "card" = a word or sentence (one box, either language); "grammar" = a lesson.
  const [mode, setMode] = useState("card");
  const [text, setText] = useState("");
  const [lang, setLang] = useState("auto"); // auto | da | en
  const [other, setOther] = useState(""); // the translation, when typed by hand
  const [showOther, setShowOther] = useState(false);
  const [result, setResult] = useState(null); // what Look up returned (editable)
  const [pos, setPos] = useState("");
  const [level, setLevel] = useState(0);
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [submitError, setSubmitError] = useState("");
  // Grammar lesson form
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [examples, setExamples] = useState([{ da: "", en: "" }]);
  const [lookingUp, setLookingUp] = useState(false);
  const [grammarPreview, setGrammarPreview] = useState(null);
  // What the learner chose themselves is never overwritten by Look up.
  const touched = useRef({ pos: false, level: false, category: false });

  function updateExample(i, field, value) {
    setExamples(examples.map((ex, idx) => (idx === i ? { ...ex, [field]: value } : ex)));
  }

  function addExampleRow() {
    setExamples([...examples, { da: "", en: "" }]);
  }

  function changeText(v) {
    setText(v);
    setResult(null); // a new text needs a new look-up
    setLookupError("");
  }

  // One AI call, only when tapped: both sides, topic, word type, level and
  // level-up forms. Nothing is added until "Add card".
  async function lookup() {
    if (!text.trim() || looking) return;
    setLooking(true);
    setLookupError("");
    try {
      const reply = await callAI(LOOKUP_SYSTEM, lookupUserText(text, lang, topicNamesForAI(categories)), { maxTokens: 500 });
      const r = readLookup(parseJSONLoose(reply));
      setResult(r);
      setShowOther(false);
      if (!touched.current.pos) setPos(r.wordType);
      if (!touched.current.level) setLevel(r.level);
      if (!touched.current.category && r.category) {
        const existing = categories.find((c) => !isLessonsCategory(c) && c.name.toLowerCase() === r.category.toLowerCase());
        if (existing) setCategory(existing.id);
      }
    } catch (e) {
      setLookupError(apiErrorMessage(e));
    } finally {
      setLooking(false);
    }
  }

  async function lookupGrammar() {
    if (!front.trim()) return;
    setLookingUp(true);
    setLookupError("");
    try {
      const reply = await callAI(
        "You are a Danish tutor. Given a grammar point name or short description from an intermediate, self-taught learner — which might be rough, vague, or just a quick note to themselves — come up with a clear, well-phrased short title for it (a few words, suitable as a flashcard heading) as grammarName." + PLAIN_ENGLISH_RULE + " Then explain the point and give exactly 3 example sentences (Danish and English) illustrating it." + GRAMMAR_CARD_STYLE + knownWordsHint(),
        'Grammar point: "' +
          front.trim() +
          '"\n\nRespond ONLY with JSON, no other text: {"grammarName": "...", "explanation": "...", "examples": [{"da": "...", "en": "..."}]}',
        { maxTokens: 700 }
      );
      const parsed = parseJSONLoose(reply);
      setGrammarPreview({
        grammarName: parsed.grammarName || front.trim(),
        explanation: parsed.explanation || "",
        examples: (parsed.examples || []).map((ex) => ({ da: ex.da || "", en: ex.en || "" })),
      });
    } catch (e) {
      setLookupError(apiErrorMessage(e));
    } finally {
      setLookingUp(false);
    }
  }

  function useGrammarPreview() {
    if (!grammarPreview) return;
    setFront(grammarPreview.grammarName);
    setBack(grammarPreview.explanation);
    if (grammarPreview.examples.length) setExamples(grammarPreview.examples);
    setGrammarPreview(null);
  }

  // The Danish side and English side of the card, from the look-up or typed by hand.
  function sides() {
    if (result) return { da: result.da.trim(), en: result.en.trim() };
    if (showOther && text.trim() && other.trim()) {
      if (lang === "en") return { da: other.trim(), en: text.trim() };
      if (lang === "da") return { da: text.trim(), en: other.trim() };
      return { error: "Choose Danish or English above, so the app knows which language you typed." };
    }
    return { error: "Tap Look up, or type the translation yourself." };
  }

  const ready = mode === "grammar" ? !!(front.trim() && back.trim()) : !!result || !!(showOther && text.trim() && other.trim());

  function resetCard() {
    setText("");
    setOther("");
    setShowOther(false);
    setResult(null);
    setPos("");
    setLevel(0);
    setCategory("");
    setNotes("");
    setShowDetails(false);
    setLookupError("");
    setSubmitError("");
    touched.current = { pos: false, level: false, category: false };
  }

  function resetGrammar() {
    setFront("");
    setBack("");
    setExamples([{ da: "", en: "" }]);
    setGrammarPreview(null);
    setLookupError("");
    setSubmitError("");
    setNotes("");
  }

  function clearForm() {
    resetCard();
    resetGrammar();
  }

  function submit() {
    if (mode === "grammar") {
      if (!front.trim() || !back.trim()) {
        setSubmitError("Fill in both fields before adding.");
        return;
      }
      const cleanExamples = examples.filter((ex) => ex.da.trim() && ex.en.trim());
      addCards([{ type: "grammar", front: front.trim(), back: back.trim(), notes: notes.trim(), category: LESSONS_ID, ...(cleanExamples.length ? { examples: cleanExamples } : {}) }]);
      resetGrammar();
      return;
    }
    const s = sides();
    if (s.error) {
      setSubmitError(s.error);
      return;
    }
    setSubmitError("");
    const type = cardTypeFor(s.da); // word or sentence, worked out here, never asked
    let catId = category;
    if (catId.startsWith("__new__")) catId = addCategory(catId.replace("__new__", "") || "New category");
    addCards([
      {
        type,
        front: s.da,
        back: s.en,
        notes: notes.trim(),
        category: catId,
        ...(type === "word" && pos ? { pos } : {}),
        ...(level ? { level } : {}),
        // Level-up forms come with the look-up answer; a hand-typed card has none.
        ...(result ? formsField(type, s.da, result.forms) : {}),
      },
    ]);
    resetCard();
  }

  const guessType = cardTypeFor(result ? result.da : lang === "en" ? other : text);
  const selectStyle = { ...inputStyle, flex: 1, minWidth: 0, borderRadius: 12, padding: "11px 12px", fontSize: 15, appearance: "auto", color: "var(--ink)" };
  // What the details hold, in one quiet line ("Verb · Basic · Food").
  const groupName = (GRAMMAR_GROUPS.find((g) => g.cls === pos) || {}).name;
  const levelName = (LEVELS.find((l) => l.id === level) || {}).name;
  const catName = (categories.find((c) => c.id === category) || {}).name;
  const detailsSummary = [groupName && guessType === "word" ? groupName.replace(/s$/, "") : "", levelName, catName].filter(Boolean).join(" · ");
  const linkBtn = { border: "none", background: "none", color: "var(--fjord)", fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <SectionTitle>{mode === "grammar" ? "Add a grammar lesson" : "Add a card"}</SectionTitle>
        {(text || other || front || back || notes) && (
          <button
            onClick={clearForm}
            style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 12, cursor: "pointer", padding: 4 }}
          >
            <Icon.Trash2 size={12} /> Clear
          </button>
        )}
      </div>
      <div style={{ height: 10 }} />

      {mode === "card" ? (
        <>
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 22,
              background: "#FBFAF7",
              minHeight: "clamp(300px, calc(100dvh - 360px), 460px)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: "24px 20px 18px",
              textAlign: "center",
            }}
          >
            <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
              {result ? (
                <>
                  <input
                    value={result.da}
                    onChange={(e) => setResult({ ...result, da: e.target.value })}
                    aria-label="Danish"
                    style={{ width: "100%", border: "none", background: "none", outline: "none", fontFamily: "var(--serif)", fontSize: 32, color: "var(--terracotta)", textAlign: "center", padding: "2px 0" }}
                  />
                  <input
                    value={result.en}
                    onChange={(e) => setResult({ ...result, en: e.target.value })}
                    aria-label="English"
                    style={{ width: "100%", border: "none", background: "none", outline: "none", fontFamily: "var(--sans)", fontSize: 19, fontStyle: "italic", color: "var(--sage)", textAlign: "center", padding: "2px 0" }}
                  />
                </>
              ) : (
                <>
                  <textarea
                    value={text}
                    onChange={(e) => changeText(e.target.value)}
                    autoCapitalize="none"
                    rows={showOther ? 2 : 3}
                    aria-label="Word or sentence"
                    style={{ width: "100%", border: "none", background: "none", outline: "none", resize: "none", textAlign: "center", fontFamily: "var(--serif)", fontSize: 26, lineHeight: 1.3, color: "var(--ink)", padding: 0 }}
                    placeholder="A word or sentence, in Danish or English"
                  />
                  {showOther && (
                    <>
                      <div style={{ height: 1, background: "var(--line)", margin: "0 20px" }} />
                      <input
                        value={other}
                        onChange={(e) => setOther(e.target.value)}
                        autoCapitalize="none"
                        style={{ width: "100%", border: "none", background: "none", outline: "none", fontFamily: "var(--sans)", fontSize: 19, fontStyle: "italic", color: "var(--sage)", textAlign: "center", padding: "2px 0" }}
                        placeholder={lang === "en" ? "The Danish" : lang === "da" ? "The English" : "The translation (choose Danish or English below)"}
                      />
                    </>
                  )}
                </>
              )}
            </div>
            {result ? (
              <button
                onClick={() => setShowDetails(!showDetails)}
                style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", background: "var(--card, #FBFAF7)", borderRadius: 999, padding: "7px 14px", cursor: "pointer", fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)" }}
              >
                <span>{detailsSummary || "Details"}</span>
                <Icon.ChevronDown size={14} style={{ transform: showDetails ? "rotate(180deg)" : "none" }} />
              </button>
            ) : (
              <div style={{ display: "flex", gap: 16 }}>
                {[["auto", "Detect"], ["da", "Danish"], ["en", "English"]].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setLang(id);
                      setResult(null);
                    }}
                    style={{ border: "none", background: "none", padding: "2px 0", cursor: "pointer", fontFamily: "var(--sans)", fontSize: 14, color: lang === id ? "var(--terracotta)" : "var(--muted)", fontWeight: lang === id ? 700 : 400, borderBottom: "1.5px solid " + (lang === id ? "var(--terracotta)" : "transparent") }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!result && !showOther && (
            <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 4px" }}>
              <button
                onClick={lookup}
                disabled={looking || !text.trim()}
                style={{ display: "flex", alignItems: "center", gap: 8, border: "none", background: "var(--terracotta)", borderRadius: 999, padding: "12px 30px", color: "#fff", fontFamily: "var(--sans)", fontSize: 15, fontWeight: 700, cursor: text.trim() ? "pointer" : "default", opacity: text.trim() ? 1 : 0.45 }}
              >
                {looking ? <Icon.Loader2 size={15} className="spin" /> : <Icon.Wand2 size={15} />}
                {looking ? "Looking up…" : "Look up"}
              </button>
            </div>
          )}
          <AIErrorNote message={lookupError} onOpenSettings={onOpenSettings} />

          {!result && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button
                onClick={() => {
                  setShowOther(!showOther);
                  setOther("");
                }}
                style={{ ...linkBtn, color: "var(--muted)", fontWeight: 400, fontSize: 13 }}
              >
                {showOther ? "Use Look up instead" : "Type the translation yourself"}
              </button>
            </div>
          )}

          {showOther && !result && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer", padding: "14px 2px 6px", margin: "0 auto", fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)" }}
            >
              <span>{detailsSummary || "Details"}</span>
              <Icon.ChevronDown size={14} style={{ transform: showDetails ? "rotate(180deg)" : "none" }} />
            </button>
          )}
          {(result || showOther) && showDetails && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "12px 0 6px" }}>
              <div style={{ display: "flex", gap: 10 }}>
                {guessType === "word" && (
                  <select
                    aria-label="Grammar group"
                    value={pos}
                    onChange={(e) => {
                      touched.current.pos = true;
                      setPos(e.target.value);
                    }}
                    style={selectStyle}
                  >
                    <option value="">Word type</option>
                    {GRAMMAR_GROUPS.map((g) => (
                      <option key={g.id} value={g.cls}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  aria-label="Level"
                  value={level}
                  onChange={(e) => {
                    touched.current.level = true;
                    setLevel(Number(e.target.value));
                  }}
                  style={selectStyle}
                >
                  <option value={0}>Level</option>
                  {LEVELS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <CategoryPicker
                categories={categories}
                value={category}
                onChange={(v) => {
                  touched.current.category = true;
                  setCategory(v);
                }}
                allowNew
                onAddCategory={addCategory}
              />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 54, borderRadius: 12 }} placeholder="Note (optional)" />
            </div>
          )}
        </>
      ) : (
        <>
          <Field label="Grammar point name">
            <input value={front} onChange={(e) => setFront(e.target.value)} style={inputStyle} placeholder="e.g. Conditional with hvis (if/then)" />
          </Field>
          <div style={{ margin: "14px 0" }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={lookupGrammar}
                disabled={!front.trim() || lookingUp}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid " + (front.trim() ? "var(--fjord)" : "#D8D4CB"),
                  background: front.trim() ? "#EEF2F0" : "transparent",
                  borderRadius: 999,
                  padding: "7px 16px",
                  color: front.trim() ? "var(--fjord)" : "#B8B3A5",
                  fontFamily: "var(--sans)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: front.trim() ? "pointer" : "default",
                }}
              >
                {lookingUp ? <Icon.Loader2 size={13} className="spin" /> : <Icon.Wand2 size={13} />}
                {lookingUp ? "Asking…" : "Ask AI to explain this"}
              </button>
            </div>
            <AIErrorNote message={lookupError} onOpenSettings={onOpenSettings} />
          </div>
          <Field label="Explanation">
            <textarea value={back} onChange={(e) => setBack(e.target.value)} style={{ ...inputStyle, minHeight: 70 }} placeholder="e.g. Use hvis + past tense, then ville + infinitive, to describe a hypothetical." />
          </Field>
          <Field label="Example sentences (optional)">
            {examples.map((ex, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input value={ex.da} onChange={(e) => updateExample(i, "da", e.target.value)} placeholder="Danish example" style={{ ...inputStyle, flex: 1 }} />
                <input value={ex.en} onChange={(e) => updateExample(i, "en", e.target.value)} placeholder="English translation" style={{ ...inputStyle, flex: 1 }} />
              </div>
            ))}
            <button onClick={addExampleRow} style={linkBtn}>
              + Add another example
            </button>
          </Field>
          <Field label="Notes (optional)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="Anything worth remembering about this" />
          </Field>
        </>
      )}

      {grammarPreview && (
        <CenteredOverlay onClose={() => setGrammarPreview(null)} maxWidth={440}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 17, color: "var(--terracotta)" }}>{grammarPreview.grammarName}</div>
            <button aria-label="Close" onClick={() => setGrammarPreview(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55, marginBottom: 14 }}>{renderInlineMarkdown(grammarPreview.explanation)}</div>
          {grammarPreview.examples.length > 0 && (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginBottom: 16 }}>
              {grammarPreview.examples.map((ex, i) => (
                <div key={i} style={{ fontFamily: "var(--sans)", fontSize: 13.5, marginBottom: 6 }}>
                  <span style={{ color: "var(--terracotta)" }}>{renderInlineMarkdown(ex.da)}</span> — <span style={{ color: "var(--sage)", fontStyle: "italic" }}>{ex.en}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={useGrammarPreview} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "10px", fontSize: 14 }}>
            Use this
          </button>
        </CenteredOverlay>
      )}

      {submitError && <div style={{ color: "var(--rust)", fontFamily: "var(--sans)", fontSize: 12.5, marginBottom: 8 }}>{submitError}</div>}
      {ready && (
        <button onClick={submit} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "12px", fontSize: 15, marginTop: 14 }}>
          {mode === "grammar" ? "Add lesson" : "Add card"}
        </button>
      )}
      <div style={{ textAlign: "center", marginTop: 18 }}>
        <button
          onClick={() => {
            setMode(mode === "grammar" ? "card" : "grammar");
            setLookupError("");
            setSubmitError("");
          }}
          style={{ ...linkBtn, color: "var(--muted)", fontWeight: 400 }}
        >
          {mode === "grammar" ? "Back to adding a word or sentence" : "Add a grammar lesson instead"}
        </button>
      </div>
    </div>
  );
}
