import { useRef, useState } from "react";
import { AIErrorNote } from "../components/AIErrorNote";
import { CategoryPicker } from "../components/CategoryPicker";
import { Icon } from "../components/icons";
import { renderInlineMarkdown } from "../components/markdown";
import { CenteredOverlay, Field, Pill, SectionTitle, inputStyle, smallBtn } from "../components/ui";
import { CATEGORY_RULE, GRAMMAR_GROUPS, LESSONS_ID, TYPE_COLOR, TYPE_LABEL, aiCategoryName, isLessonsCategory, topicNamesForAI } from "../data/categories";
import { apiErrorMessage, callAI } from "../lib/ai/index";
import { GRAMMAR_CARD_STYLE, knownWordsHint } from "../lib/ai/prompts";
import { cleanTranslation, parseJSONLoose } from "../lib/text";

// ---------- Add Card ----------

export function AddCardView({ categories, addCategory, addCards, onOpenSettings }) {
  const [type, setType] = useState("word");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [notes, setNotes] = useState("");
  const [examples, setExamples] = useState([{ da: "", en: "" }]);
  const [category, setCategory] = useState("");
  const [pos, setPos] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [autoFilling, setAutoFilling] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [grammarPreview, setGrammarPreview] = useState(null);
  const categoryTouched = useRef(false);

  const copy = {
    word: {
      frontLabel: "Danish word",
      frontPlaceholder: "e.g. hund",
      backLabel: "English",
      backPlaceholder: "e.g. dog",
    },
    sentence: {
      frontLabel: "Danish sentence",
      frontPlaceholder: "e.g. jeg kan godt lide kaffe",
      backLabel: "English",
      backPlaceholder: "e.g. I really like coffee",
    },
    grammar: {
      frontLabel: "Grammar point name",
      frontPlaceholder: "e.g. Conditional with hvis (if/then)",
      backLabel: "Explanation",
      backPlaceholder: "e.g. Use hvis + past tense, then ville + infinitive, to describe a hypothetical.",
    },
  }[type];

  function updateExample(i, field, value) {
    setExamples(examples.map((ex, idx) => (idx === i ? { ...ex, [field]: value } : ex)));
  }

  function addExampleRow() {
    setExamples([...examples, { da: "", en: "" }]);
  }

  // Auto-fills the *other* language field, and the category, from
  // whichever side the learner just finished typing — only when that
  // other field is still empty, so it never overwrites something typed
  // on purpose. Silent on failure: this is a convenience, not something
  // that should block manual entry if the AI call doesn't work.
  async function autoFill(direction, value) {
    const trimmed = value.trim();
    if (!trimmed || (type !== "word" && type !== "sentence")) return;
    setAutoFilling(true);
    try {
      const categoryNames = topicNamesForAI(categories);
      const reply = await callAI(
        "You help fill in a Danish learner's flashcard. Given a single word or short phrase, give its natural translation and the single best-fitting category for it. Be precise about its actual part of speech so the translation fits — don't confuse a verb with an adverb, an adjective with an adverb, or a noun with an adjective. The translation must be ONLY in the target language — never repeat or include the original word/phrase alongside it. If it's a Danish noun, include its grammatical article (en/et) with the Danish form, and match it with a natural English article ('a'/'an') only when the noun is countable that way in English — omit the article on both sides for mass/uncountable nouns (e.g. anger, water). Never show an article on only one side.",
        (direction === "da" ? "Danish" : "English") +
          ' text: "' +
          trimmed +
          '"\n\nExisting categories to prefer if one genuinely fits: ' +
          (categoryNames || "(none yet)") +
          '.' + CATEGORY_RULE +
          '\n\nRespond ONLY with JSON, no other text: {"translation": "...", "category": "..."}',
        { maxTokens: 150 }
      );
      const parsed = parseJSONLoose(reply);
      if (parsed.translation) {
        const clean = cleanTranslation(parsed.translation);
        if (direction === "da") setBack((prev) => (prev.trim() ? prev : clean));
        else setFront((prev) => (prev.trim() ? prev : clean));
      }
      const suggested = aiCategoryName(parsed.category);
      if (suggested && !categoryTouched.current) {
        const existing = categories.find((c) => !isLessonsCategory(c) && c.name.toLowerCase() === suggested.toLowerCase());
        if (existing) setCategory(existing.id);
      }
    } catch {
      // Auto-fill failing just means the learner fills it in themselves.
    } finally {
      setAutoFilling(false);
    }
  }

  // Explicit, tappable version of the same fill — the automatic
  // on-leaving-the-field trigger is a nice bonus, but isn't discoverable
  // on its own, so there needs to be a button that visibly does this.
  function triggerAutoFill() {
    if (front.trim() && !back.trim()) autoFill("da", front);
    else if (back.trim() && !front.trim()) autoFill("en", back);
  }

  async function lookupGrammar() {
    if (!front.trim()) return;
    setLookingUp(true);
    setLookupError("");
    try {
      const reply = await callAI(
        "You are a Danish tutor. Given a grammar point name or short description from an intermediate, self-taught learner — which might be rough, vague, or just a quick note to themselves — come up with a clear, well-phrased short title for it (a few words, suitable as a flashcard heading) as grammarName. Then explain the point and give exactly 3 example sentences (Danish and English) illustrating it." + GRAMMAR_CARD_STYLE + knownWordsHint(),
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

  function submit() {
    if (!front.trim() || !back.trim()) {
      setSubmitError("Fill in both fields before adding.");
      return;
    }
    setSubmitError("");
    let catId = type === "grammar" ? LESSONS_ID : category;
    if (catId.startsWith("__new__")) catId = addCategory(catId.replace("__new__", "") || "New category");
    const cleanExamples = examples.filter((ex) => ex.da.trim() && ex.en.trim());
    addCards([
      {
        type,
        front: front.trim(),
        back: back.trim(),
        notes: notes.trim(),
        category: catId,
        ...(type === "word" && pos ? { pos } : {}),
        ...(type === "grammar" && cleanExamples.length ? { examples: cleanExamples } : {}),
      },
    ]);
    setFront("");
    setBack("");
    setNotes("");
    setExamples([{ da: "", en: "" }]);
    setLookupError("");
    setPos("");
    categoryTouched.current = false;
  }

  function clearForm() {
    setFront("");
    setBack("");
    setNotes("");
    setExamples([{ da: "", en: "" }]);
    setLookupError("");
    setSubmitError("");
    setGrammarPreview(null);
    setPos("");
    categoryTouched.current = false;
  }

  // Switching between Word/Sentence/Grammar changes what these fields
  // actually mean (a Danish word vs. a full sentence vs. a grammar point
  // name) — carrying over text typed under a different type is confusing
  // rather than helpful, so this starts the new type with a clean form.
  function changeType(t) {
    setType(t);
    clearForm();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <SectionTitle>Add a card</SectionTitle>
        {(front || back || notes) && (
          <button
            onClick={clearForm}
            style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 12, cursor: "pointer", padding: 4 }}
          >
            <Icon.Trash2 size={12} /> Clear
          </button>
        )}
      </div>
      <div style={{ height: 14 }} />
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {["word", "sentence", "grammar"].map((t) => (
          <Pill key={t} color={TYPE_COLOR[t]} active={type === t} onClick={() => changeType(t)}>
            {TYPE_LABEL[t]}
          </Pill>
        ))}
      </div>

      <Field label={copy.backLabel}>
        {type === "grammar" ? (
          <textarea value={back} onChange={(e) => setBack(e.target.value)} style={{ ...inputStyle, minHeight: 70 }} placeholder={copy.backPlaceholder} />
        ) : (
          <input
            value={back}
            onChange={(e) => setBack(e.target.value)}
            onBlur={(e) => autoFill("en", e.target.value)}
            style={inputStyle}
            placeholder={copy.backPlaceholder}
          />
        )}
      </Field>
      {(type === "word" || type === "sentence") && (
        <div style={{ display: "flex", justifyContent: "center", margin: "14px 0" }}>
          <button
            onClick={triggerAutoFill}
            disabled={autoFilling || !((front.trim() && !back.trim()) || (back.trim() && !front.trim()))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid " + ((front.trim() && !back.trim()) || (back.trim() && !front.trim()) ? "var(--fjord)" : "#D8D4CB"),
              background: (front.trim() && !back.trim()) || (back.trim() && !front.trim()) ? "#EEF2F0" : "transparent",
              borderRadius: 999,
              padding: "7px 16px",
              color: (front.trim() && !back.trim()) || (back.trim() && !front.trim()) ? "var(--fjord)" : "#B8B3A5",
              fontFamily: "var(--sans)",
              fontSize: 13,
              fontWeight: 700,
              cursor: (front.trim() && !back.trim()) || (back.trim() && !front.trim()) ? "pointer" : "default",
            }}
          >
            {autoFilling ? <Icon.Loader2 size={13} className="spin" /> : <Icon.Wand2 size={13} />}
            {autoFilling ? "Filling in…" : "Fill in translation"}
          </button>
        </div>
      )}

      {type === "grammar" && (
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
      )}

      {grammarPreview && (
        <CenteredOverlay onClose={() => setGrammarPreview(null)} maxWidth={440}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 17, color: "var(--terracotta)" }}>{grammarPreview.grammarName}</div>
            <button onClick={() => setGrammarPreview(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
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

      <Field label={copy.frontLabel}>
        <input
          value={front}
          onChange={(e) => setFront(e.target.value)}
          onBlur={(e) => autoFill("da", e.target.value)}
          style={inputStyle}
          placeholder={copy.frontPlaceholder}
        />
      </Field>

      {type === "grammar" && (
        <Field label="Example sentences (optional)">
          {examples.map((ex, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input value={ex.da} onChange={(e) => updateExample(i, "da", e.target.value)} placeholder="Danish example" style={{ ...inputStyle, flex: 1 }} />
              <input value={ex.en} onChange={(e) => updateExample(i, "en", e.target.value)} placeholder="English translation" style={{ ...inputStyle, flex: 1 }} />
            </div>
          ))}
          <button
            onClick={addExampleRow}
            style={{ border: "none", background: "none", color: "var(--fjord)", fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 }}
          >
            + Add another example
          </button>
        </Field>
      )}

      <Field label="Notes (optional)">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="Anything worth remembering about this" />
      </Field>
      {type === "word" && (
        <Field label="Grammar group (optional)">
          <select value={pos} onChange={(e) => setPos(e.target.value)} style={{ ...inputStyle, appearance: "auto", color: "var(--ink)" }}>
            <option value="">Detect automatically</option>
            {GRAMMAR_GROUPS.map((g) => (
              <option key={g.id} value={g.cls}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {type !== "grammar" && (
        <Field label="Category (optional)">
          <CategoryPicker
            categories={categories}
            value={category}
            onChange={(v) => {
              categoryTouched.current = true;
              setCategory(v);
            }}
            allowNew
            onAddCategory={addCategory}
          />
        </Field>
      )}

      {submitError && <div style={{ color: "var(--rust)", fontFamily: "var(--sans)", fontSize: 12.5, marginBottom: 8 }}>{submitError}</div>}
      <button
        onClick={submit}
        style={{
          ...smallBtn("var(--rust)"),
          width: "100%",
          padding: "11px",
          fontSize: 14,
          marginTop: 4,
          opacity: front.trim() && back.trim() ? 1 : 0.5,
        }}
      >
        Add card
      </button>
    </div>
  );
}
