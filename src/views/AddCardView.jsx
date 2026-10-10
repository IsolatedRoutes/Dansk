import { useRef, useState } from "react";
import { AIErrorNote } from "../components/AIErrorNote";
import { Icon } from "../components/icons";
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
  const [sortOpen, setSortOpen] = useState(false);
  const [kind, setKind] = useState(""); // "", "word" or "sentence": the learner's own choice
  const [newTopic, setNewTopic] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [submitError, setSubmitError] = useState("");
  // Grammar lesson form
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [examples, setExamples] = useState([]); // only the AI writes these; they are saved with the lesson but not shown
  const [lookingUp, setLookingUp] = useState(false);
  // What the learner chose themselves is never overwritten by "Fill in with AI".
  const touched = useRef({ pos: false, level: false, category: false });

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
      // A side the learner already typed stays as typed.
      const keepBoth = !!(text.trim() && other.trim());
      setText(keepBoth ? text : r.da);
      setOther(keepBoth ? other : r.en);
      setForms(r.forms);
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
      const exs = (parsed.examples || []).map((ex) => ({ da: ex.da || "", en: ex.en || "" }));
      setFront(parsed.grammarName || front.trim());
      setBack(parsed.explanation || "");
      setExamples(exs);
    } catch (e) {
      setLookupError(apiErrorMessage(e));
    } finally {
      setLookingUp(false);
    }
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
    setExamples([]);
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
  const topics = categories.filter((c) => !isLessonsCategory(c));
  const optPill = (on) => ({ border: "1px solid " + (on ? "var(--fjord)" : "var(--line)"), background: on ? "var(--fjord)" : "#fff", color: on ? "#fff" : "var(--ink)", borderRadius: 999, padding: "7px 13px", fontFamily: "var(--sans)", fontSize: 14, cursor: "pointer" });
  const hasText = !!(text || other || front || back || notes);
  const modeOptions = [
    { id: "card", label: "Word or sentence" },
    { id: "grammar", label: "Grammar lesson" },
  ];
  const fieldLabel = { fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 2 };
  // Each writing area is a white box with a small pencil, so it is clear you can type there.
  const fieldWrap = { width: "100%", textAlign: "left" };
  const fieldBox = { position: "relative", background: "#fff", border: "1.5px solid var(--line)", borderRadius: 14, padding: "10px 38px 10px 14px", marginTop: 6 };
  const pencil = <Icon.Edit3 size={15} style={{ position: "absolute", right: 13, top: 13, color: "var(--muted)", pointerEvents: "none" }} />;
  const bareInput = { width: "100%", border: "none", background: "none", outline: "none", textAlign: "left", padding: "2px 0" };

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
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 10, padding: "20px 18px 12px", textAlign: "center" }}>
                <div style={fieldWrap}>
                  <div style={fieldLabel}>Dansk</div>
                  <div style={fieldBox}>
                    <textarea
                      value={text}
                      onChange={(e) => changeText(e.target.value)}
                      autoCapitalize="none"
                      rows={2}
                      aria-label="Dansk"
                      className="soft"
                      style={{ ...bareInput, resize: "none", fontFamily: "var(--serif)", fontSize: 26, lineHeight: 1.25, color: "var(--terracotta)", padding: 0, maxHeight: 110, overflowY: "auto" }}
                      placeholder="Type here"
                    />
                    {pencil}
                  </div>
                </div>
                <div style={fieldWrap}>
                  <div style={fieldLabel}>English</div>
                  <div style={fieldBox}>
                    <textarea
                      value={other}
                      onChange={(e) => changeOther(e.target.value)}
                      autoCapitalize="none"
                      rows={2}
                      aria-label="English"
                      className="soft"
                      style={{ ...bareInput, resize: "none", fontFamily: "var(--sans)", fontSize: 18, fontStyle: "italic", lineHeight: 1.3, color: "var(--sage)", padding: 0, maxHeight: 110, overflowY: "auto" }}
                      placeholder="Type here, or tap Look up"
                    />
                    {pencil}
                  </div>
                </div>
            </div>
            {(
              <div style={{ display: "flex", justifyContent: "center", padding: "0 16px 18px" }}>
                <button
                  onClick={() => setSortOpen(true)}
                  aria-label="Sort this card"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, maxWidth: "100%", border: "1px solid var(--line)", background: "var(--card)", borderRadius: 999, padding: "8px 18px", cursor: "pointer", fontFamily: "var(--sans)", fontSize: 13, lineHeight: 1.35, color: "var(--ink)" }}
                >
                  <span>Categorize</span>
                  <Icon.ChevronDown size={14} style={{ flex: "none" }} />
                </button>
              </div>
            )}
          </BigCard>

          <ActionRow>
            {!forms && (
              <PillButton kind="secondary" onClick={lookup} disabled={looking || (!text.trim() && !other.trim())}>
                {looking ? <Icon.Loader2 size={15} className="spin" /> : <Icon.Sparkle size={15} />}
                {looking ? "Looking up…" : "Look up"}
              </PillButton>
            )}
            <PillButton onClick={submit} disabled={!ready}>Add card</PillButton>
          </ActionRow>
          <AIErrorNote message={lookupError} onOpenSettings={onOpenSettings} />
        </>
      ) : (
        <>
          <BigCard>
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 10, padding: "20px 18px 12px", textAlign: "center" }}>
              <div style={fieldWrap}>
                <div style={fieldLabel}>Lesson</div>
                <div style={fieldBox}>
                  <textarea
                    value={front}
                    onChange={(e) => { setFront(e.target.value); setLookupError(""); }}
                    autoCapitalize="none"
                    rows={2}
                    aria-label="Lesson name"
                    className="soft"
                    style={{ ...bareInput, resize: "none", fontFamily: "var(--serif)", fontSize: 26, lineHeight: 1.25, color: "var(--terracotta)", padding: 0, maxHeight: 110, overflowY: "auto" }}
                    placeholder="Lesson name"
                  />
                  {pencil}
                </div>
              </div>
              <div style={fieldWrap}>
                <div style={fieldLabel}>Explanation</div>
                <div style={fieldBox}>
                  <textarea
                    value={back}
                    onChange={(e) => setBack(e.target.value)}
                    rows={3}
                    aria-label="Explanation"
                    className="soft"
                    style={{ ...bareInput, resize: "none", fontFamily: "var(--sans)", fontSize: 16, fontStyle: "italic", lineHeight: 1.35, color: "var(--sage)", padding: 0, maxHeight: 130, overflowY: "auto" }}
                    placeholder="What the rule is"
                  />
                  {pencil}
                </div>
              </div>
              {(showNote || notes) && (
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Note" className="soft" rows={2} style={{ ...bareInput, resize: "none", fontFamily: "var(--sans)", fontSize: 14, color: "var(--ink)", borderTop: "1px solid var(--line)", paddingTop: 8 }} placeholder="Note" />
              )}
            </div>
            {!(showNote || notes) && (
              <div style={{ display: "flex", justifyContent: "center", padding: "0 16px 18px" }}>
                <button
                  onClick={() => setShowNote(true)}
                  style={{ border: "1px solid var(--line)", background: "var(--card)", borderRadius: 999, padding: "8px 18px", cursor: "pointer", fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)" }}
                >
                  + Add a note
                </button>
              </div>
            )}
          </BigCard>
          <ActionRow>
            <PillButton kind="secondary" onClick={lookupGrammar} disabled={!front.trim() || lookingUp}>
              {lookingUp ? <Icon.Loader2 size={15} className="spin" /> : <Icon.Sparkle size={15} />}
              {lookingUp ? "Generating…" : "Generate lesson"}
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

      {submitError && <div style={{ color: "var(--rust)", fontFamily: "var(--sans)", fontSize: 12.5, textAlign: "center" }}>{submitError}</div>}
      <div style={{ textAlign: "center", visibility: hasText ? "visible" : "hidden" }}>
        <button onClick={clearForm} style={quietLink}>
          Clear
        </button>
      </div>
    </Stage>
  );
}
