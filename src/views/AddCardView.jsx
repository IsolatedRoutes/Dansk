import { useRef, useState } from "react";
import { AIErrorNote } from "../components/AIErrorNote";
import { Icon } from "../components/icons";
import { renderInlineMarkdown } from "../components/markdown";
import { CenteredOverlay, inputStyle } from "../components/ui";
import { ActionRow, BigCard, PickMenu, PickRow, PillButton, Stage, quietLink } from "../components/layout";
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
  const [other, setOther] = useState(""); // the English side ("text" is the Danish side)
  const [forms, setForms] = useState(null); // level-up forms, only from "Fill in with AI"
  const [pos, setPos] = useState("");
  const [level, setLevel] = useState(0);
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [checking, setChecking] = useState(false); // false = typing, true = the finished card is shown
  const [sortOpen, setSortOpen] = useState(false);
  const [kind, setKind] = useState(""); // "", "word" or "sentence": the learner's own choice
  const [newTopic, setNewTopic] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [submitError, setSubmitError] = useState("");
  // Grammar lesson form
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [examples, setExamples] = useState([{ da: "", en: "" }]);
  const [lookingUp, setLookingUp] = useState(false);
  const [grammarPreview, setGrammarPreview] = useState(null);
  // What the learner chose themselves is never overwritten by "Fill in with AI".
  const touched = useRef({ pos: false, level: false, category: false });

  function updateExample(i, field, value) {
    setExamples(examples.map((ex, idx) => (idx === i ? { ...ex, [field]: value } : ex)));
  }

  function addExampleRow() {
    setExamples([...examples, { da: "", en: "" }]);
  }

  // Typing in either box makes any earlier AI answer (level-up forms) stale.
  function changeText(v) {
    setText(v);
    setForms(null);
    setLookupError("");
  }
  function changeOther(v) {
    setOther(v);
    setForms(null);
    setLookupError("");
  }

  // One AI call, only when tapped: fills in whichever side is empty, plus topic,
  // word type, level and level-up forms. Nothing is added until "Add card".
  async function lookup() {
    const src = text.trim() || other.trim();
    if (!src || looking) return;
    setLooking(true);
    setLookupError("");
    try {
      const hint = text.trim() ? "auto" : "en";
      const reply = await callAI(LOOKUP_SYSTEM, lookupUserText(src, hint, topicNamesForAI(categories)), { maxTokens: 500 });
      const r = readLookup(parseJSONLoose(reply));
      setText(r.da);
      setOther(r.en);
      setForms(r.forms);
      setChecking(true);
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

  // The Danish side and English side of the card.
  function sides() {
    if (text.trim() && other.trim()) return { da: text.trim(), en: other.trim() };
    return { error: "Fill in both boxes, or type one and tap Fill in with AI." };
  }

  const ready = mode === "grammar" ? !!(front.trim() && back.trim()) : !!(text.trim() && other.trim());

  function resetCard() {
    setText("");
    setOther("");
    setForms(null);
    setChecking(false);
    setSortOpen(false);
    setKind("");
    setNewTopic("");
    setPos("");
    setLevel(0);
    setCategory("");
    setNotes("");
    setShowNote(false);
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
    const type = kind || cardTypeFor(s.da); // worked out here; the learner can change it in the sort panel
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
        // Level-up forms come with the AI answer; a hand-typed card has none.
        ...(forms ? formsField(type, s.da, forms) : {}),
      },
    ]);
    resetCard();
  }

  const guessType = kind || cardTypeFor(text);
  const groupName = (GRAMMAR_GROUPS.find((g) => g.cls === pos) || {}).name;
  const levelName = (LEVELS.find((l) => l.id === level) || {}).name;
  const catName = (categories.find((c) => c.id === category) || {}).name;
  const tagLine = [guessType === "word" ? "Word" : "Sentence", guessType === "word" && groupName ? groupName.replace(/s$/, "") : "", levelName, catName].filter(Boolean).join(" · ");
  const topics = categories.filter((c) => !isLessonsCategory(c));
  const optPill = (on) => ({ border: "1px solid " + (on ? "var(--fjord)" : "var(--line)"), background: on ? "var(--fjord)" : "#fff", color: on ? "#fff" : "var(--ink)", borderRadius: 999, padding: "7px 13px", fontFamily: "var(--sans)", fontSize: 14, cursor: "pointer" });
  const hasText = !!(text || other || front || back || notes);
  const modeOptions = [
    { id: "card", label: "Word or sentence" },
    { id: "grammar", label: "Grammar lesson" },
  ];
  const fieldLabel = { fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 2 };
  const bareInput = { width: "100%", border: "none", background: "none", outline: "none", textAlign: "center", padding: "2px 0" };

  return (
    <Stage>
      <PickRow>
        <PickMenu
          ariaLabel="What to add"
          value={mode}
          options={modeOptions}
          onChange={(id) => {
            setMode(id);
            setLookupError("");
            setSubmitError("");
          }}
        />
      </PickRow>

      {mode === "card" ? (
        <>
          <BigCard>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 10, padding: "24px 20px 14px", textAlign: "center" }}>
              {checking ? (
                <>
                  <div style={fieldLabel}>Danish</div>
                  <textarea
                    value={text}
                    onChange={(e) => changeText(e.target.value)}
                    autoCapitalize="none"
                    rows={2}
                    aria-label="Danish"
                    className="soft"
                    style={{ ...bareInput, resize: "none", fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1.25, color: "var(--terracotta)", padding: 0, maxHeight: 120, overflowY: "auto" }}
                    placeholder="Danish"
                  />
                  <div style={{ height: 1, width: 60, background: "var(--line)" }} />
                  <div style={fieldLabel}>English</div>
                  <textarea
                    value={other}
                    onChange={(e) => changeOther(e.target.value)}
                    autoCapitalize="none"
                    rows={2}
                    aria-label="English"
                    className="soft"
                    style={{ ...bareInput, resize: "none", fontFamily: "var(--sans)", fontSize: 19, fontStyle: "italic", lineHeight: 1.3, color: "var(--sage)", padding: 0, maxHeight: 120, overflowY: "auto" }}
                    placeholder="English"
                  />
                </>
              ) : (
                <textarea
                  value={text}
                  onChange={(e) => changeText(e.target.value)}
                  autoCapitalize="none"
                  rows={3}
                  aria-label="Word or sentence"
                  className="soft"
                  style={{ ...bareInput, resize: "none", fontFamily: "var(--serif)", fontSize: 23, fontWeight: 400, lineHeight: 1.3, color: "var(--ink)", padding: 0, maxHeight: 160, overflowY: "auto" }}
                  placeholder="Type a word or sentence in English or Danish"
                />
              )}
            </div>
            {checking && (
              <div style={{ display: "flex", justifyContent: "center", paddingBottom: 18 }}>
                <button
                  onClick={() => setSortOpen(true)}
                  aria-label="Sort this card"
                  style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", background: "var(--card)", borderRadius: 999, padding: "7px 14px", cursor: "pointer", fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)" }}
                >
                  <span>{tagLine}</span>
                  <Icon.ChevronDown size={14} />
                </button>
              </div>
            )}
          </BigCard>

          <ActionRow>
            {checking ? (
              <PillButton onClick={submit} disabled={!ready}>Add card</PillButton>
            ) : (
              <>
                <PillButton kind="secondary" onClick={() => { setOther(""); setChecking(true); setLookupError(""); }}>Input manually</PillButton>
                <PillButton onClick={lookup} disabled={looking || !text.trim()}>
                  {looking ? <Icon.Loader2 size={15} className="spin" /> : <Icon.Sparkle size={15} />}
                  {looking ? "Looking up…" : "Look up"}
                </PillButton>
              </>
            )}
          </ActionRow>
          <AIErrorNote message={lookupError} onOpenSettings={onOpenSettings} />
        </>
      ) : (
        <>
          <BigCard>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "22px 22px 12px" }}>
              <input
                value={front}
                onChange={(e) => setFront(e.target.value)}
                aria-label="Grammar point name"
                className="soft"
                style={{ width: "100%", border: "none", background: "none", outline: "none", fontFamily: "var(--serif)", fontSize: 24, color: "var(--terracotta)", padding: "2px 0" }}
                placeholder="Name of the lesson"
              />
              <div style={{ height: 1, background: "var(--line)", margin: "10px 0" }} />
              <textarea
                value={back}
                onChange={(e) => setBack(e.target.value)}
                aria-label="Explanation"
                className="soft"
                rows={4}
                style={{ width: "100%", border: "none", background: "none", outline: "none", resize: "none", fontFamily: "var(--sans)", fontSize: 15, lineHeight: 1.5, color: "var(--ink)", padding: 0 }}
                placeholder="What it means and when to use it"
              />
              {examples.map((ex, i) => (
                <div key={i} style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
                  <input value={ex.da} onChange={(e) => updateExample(i, "da", e.target.value)} placeholder="Danish example" className="soft" style={{ width: "100%", border: "none", background: "none", outline: "none", fontFamily: "var(--serif)", fontSize: 16, color: "var(--terracotta)", padding: "2px 0" }} />
                  <input value={ex.en} onChange={(e) => updateExample(i, "en", e.target.value)} placeholder="English translation" className="soft" style={{ width: "100%", border: "none", background: "none", outline: "none", fontFamily: "var(--sans)", fontSize: 14, fontStyle: "italic", color: "var(--sage)", padding: "2px 0" }} />
                </div>
              ))}
              <div style={{ textAlign: "center", marginTop: 10 }}>
                <button onClick={addExampleRow} style={quietLink}>
                  + Add an example
                </button>
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Note" className="soft" rows={2} style={{ width: "100%", border: "none", borderTop: "1px solid var(--line)", background: "none", outline: "none", resize: "none", fontFamily: "var(--sans)", fontSize: 14, color: "var(--ink)", padding: "10px 0 0", marginTop: 10 }} placeholder="Note (optional)" />
            </div>
          </BigCard>
          <ActionRow>
            <PillButton kind="secondary" onClick={lookupGrammar} disabled={!front.trim() || lookingUp}>
              {lookingUp ? <Icon.Loader2 size={15} className="spin" /> : <Icon.Sparkle size={15} />}
              {lookingUp ? "Asking…" : "Ask AI to explain"}
            </PillButton>
            <PillButton onClick={submit} disabled={!ready}>Add lesson</PillButton>
          </ActionRow>
          <AIErrorNote message={lookupError} onOpenSettings={onOpenSettings} />
        </>
      )}

      {sortOpen && (
        <CenteredOverlay onClose={() => setSortOpen(false)} maxWidth={420}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 20 }}>Sort this card</div>
            <button onClick={() => setSortOpen(false)} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "var(--sans)", fontSize: 14, fontWeight: 600, color: "var(--terracotta)" }}>Done</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={fieldLabel}>What is it</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["word", "Word"], ["sentence", "Phrase or sentence"]].map(([id, label]) => (
                  <button key={id} onClick={() => setKind(id)} style={optPill(guessType === id)}>{label}</button>
                ))}
              </div>
            </div>
            {guessType === "word" && (
              <div>
                <div style={fieldLabel}>Word type</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {GRAMMAR_GROUPS.map((g) => (
                    <button key={g.id} onClick={() => { touched.current.pos = true; setPos(pos === g.cls ? "" : g.cls); }} style={optPill(pos === g.cls)}>{g.name.replace(/s$/, "")}</button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div style={fieldLabel}>Level</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {LEVELS.map((l) => (
                  <button key={l.id} onClick={() => { touched.current.level = true; setLevel(level === l.id ? 0 : l.id); }} style={optPill(level === l.id)}>{l.name}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={fieldLabel}>Topic</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 150, overflowY: "auto" }}>
                {topics.map((c) => (
                  <button key={c.id} onClick={() => { touched.current.category = true; setCategory(category === c.id ? "" : c.id); }} style={optPill(category === c.id)}>{c.name}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  placeholder="New topic"
                  aria-label="New topic"
                  style={{ ...inputStyle, flex: 1, borderRadius: 12, padding: "9px 12px", fontSize: 14 }}
                />
                <button
                  onClick={() => {
                    if (!newTopic.trim()) return;
                    touched.current.category = true;
                    setCategory(addCategory(newTopic.trim()));
                    setNewTopic("");
                  }}
                  style={optPill(false)}
                >
                  Add
                </button>
              </div>
            </div>
            <div>
              {showNote || notes ? (
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Note" style={{ ...inputStyle, minHeight: 54, borderRadius: 12, width: "100%" }} placeholder="Note" />
              ) : (
                <button onClick={() => setShowNote(true)} style={quietLink}>+ Add a note</button>
              )}
            </div>
          </div>
        </CenteredOverlay>
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
          <div style={{ textAlign: "center" }}>
            <PillButton onClick={useGrammarPreview}>Use this</PillButton>
          </div>
        </CenteredOverlay>
      )}

      {submitError && <div style={{ color: "var(--rust)", fontFamily: "var(--sans)", fontSize: 12.5, textAlign: "center" }}>{submitError}</div>}
      <div style={{ textAlign: "center", visibility: hasText ? "visible" : "hidden" }}>
        <button onClick={clearForm} style={quietLink}>
          Clear
        </button>
      </div>
    </Stage>
  );
}
