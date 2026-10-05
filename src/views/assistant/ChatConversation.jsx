import { useEffect, useRef, useState } from "react";
import { CategoryOptions } from "../../components/CategoryPicker";
import { Icon } from "../../components/icons";
import { renderInlineMarkdown } from "../../components/markdown";
import { CenteredOverlay, EmptyState, inputStyle, smallBtn } from "../../components/ui";
import { CATEGORY_RULE, LESSONS_ID, aiCategoryName, isLessonsCategory, topicNamesForAI } from "../../data/categories";
import { apiErrorMessage, callAI, isSwitchableAIError } from "../../lib/ai/index";
import { GRAMMAR_CARD_STYLE, knownWordsHint, PLAIN_ENGLISH_RULE } from "../../lib/ai/prompts";
import { persistWithRetry, storeGet } from "../../lib/storage";
import { parseJSONLoose } from "../../lib/text";

export function loadingCopy(engine) {
  return engine === "local" ? "Thinking (local model can take a bit)…" : "Thinking…";
}

// ---------- Chat conversation ----------

export function ChatConversation({ engine, categories, addCategory, addCards, showToast, onOpenSettings }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [savingIdx, setSavingIdx] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await storeGet("chatHistory");
        if (raw) setMessages(JSON.parse(raw));
      } catch {}
      setReady(true);
    };
    load();
    // A newer chat can arrive from another device through iCloud sync.
    window.addEventListener("dansk-settings-changed", load);
    return () => window.removeEventListener("dansk-settings-changed", load);
  }, []);

  useEffect(() => {
    if (scrollRef.current && scrollRef.current.scrollIntoView) scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function persist(next) {
    setMessages(next);
    await persistWithRetry("chatHistory", JSON.stringify(next.slice(-40)));
  }

  const [reviewingIdx, setReviewingIdx] = useState(null);
  const [reviewSelected, setReviewSelected] = useState({});
  const [reviewCategory, setReviewCategory] = useState({});

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: "user", content: text }];
    persist(next);
    setInput("");
    setSending(true);
    try {
      const categoryNames = topicNamesForAI(categories);
      const history = next.slice(-20).map((m) => ({ role: m.role, content: m.content }));
      const reply = await callAI(
        "You are a knowledgeable Danish language reference for an intermediate, self-taught learner who has some foundational grammar gaps despite a decent vocabulary. " + PLAIN_ENGLISH_RULE + "For a plain question, answer directly and concisely in the reply field (1-3 sentences typically), then stop — don't pad with extra context they didn't ask for, and never end with a follow-up question or an invitation to continue (no \"let me know if...\", no \"would you like...\"). Use Danish examples with English translations whenever they help. " +
          "Separately: if the learner is asking you to CREATE one or more flashcards — a new topic (\"give me 10 words for the doctor\"), a single word or phrase (\"make a flashcard for hyggelig\"), or something from earlier in this conversation (\"make a flashcard from that\", \"save the last one\", \"turn that into a card\") — put those in the flashcards array. Use the conversation history to work out what \"that\" or \"it\" refers to when needed. Leave reply empty, or at most a short one-line confirmation, when the request was purely for flashcards. " +
          "For each flashcard: type is \"word\" (a single word or short phrase), \"sentence\" (a full sentence), or \"grammar\" (a rule or pattern that needs explaining rather than just translating — include up to 3 short example sentences for grammar only). Don't overuse \"grammar\" — most vocabulary requests are \"word\" or \"sentence\". For word/sentence, the back field must be ONE clean, natural translation only — never a list of synonyms or alternatives, and never a parenthetical part-of-speech note like \"(adj.)\"; deeper detail like that belongs behind the lightbulb feature once the card exists, not crammed into the card itself. Pick the single best-fitting category for word/sentence cards (skip category for grammar)." + CATEGORY_RULE + " " +
          "Include Danish grammatical articles (en/et) matched with a natural English article, omitting both for mass/uncountable nouns. " +
          "If nothing was asked to be saved, leave flashcards as an empty array.\n\nExisting categories to prefer if one fits: " +
          (categoryNames || "(none yet)"),
        text +
          '\n\nRespond ONLY with JSON, no other text: {"reply": "...", "flashcards": [{"type": "word", "front": "...", "back": "...", "category": "...", "examples": [{"da":"...","en":"..."}]}]} — omit category for grammar type; omit examples unless type is grammar; both reply and flashcards can be empty/[] as appropriate.',
        { maxTokens: 1800, history: history.slice(0, -1) }
      );
      const parsed = parseJSONLoose(reply);
      const replyText = (parsed.reply || "").trim();
      const rawFlashcards = Array.isArray(parsed.flashcards) ? parsed.flashcards : [];
      // Resolve each suggested category name to a real id up front, same
      // approach as everywhere else that generates a batch — so the
      // review popup can use a plain dropdown per item.
      const workingCategories = [...categories];
      const flashcards = rawFlashcards.map((fc) => {
        if (fc.type === "grammar") return { ...fc, categoryId: "grammar-lessons" };
        const name = aiCategoryName(fc.category);
        if (!name) return { ...fc, categoryId: "" };
        let existingCat = workingCategories.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (!existingCat) {
          const id = addCategory(name);
          existingCat = { id, name, custom: true };
          workingCategories.push(existingCat);
        }
        return { ...fc, categoryId: existingCat.id };
      });
      persist([...next, { role: "assistant", content: replyText, flashcards }]);
    } catch (e) {
      persist([...next, { role: "assistant", content: apiErrorMessage(e), isError: true }]);
    } finally {
      setSending(false);
    }
  }

  function openReview(idx) {
    const msg = messages[idx];
    if (!msg || !msg.flashcards || msg.flashcards.length === 0) return;
    const sel = {};
    const cat = {};
    msg.flashcards.forEach((fc, i) => {
      sel[i] = true;
      cat[i] = fc.categoryId || "";
    });
    setReviewingIdx(idx);
    setReviewSelected(sel);
    setReviewCategory(cat);
  }

  function addReviewSelected() {
    const msg = messages[reviewingIdx];
    if (!msg) return;
    const toAdd = [];
    msg.flashcards.forEach((fc, i) => {
      if (!reviewSelected[i]) return;
      const catId = fc.type === "grammar" ? "grammar-lessons" : reviewCategory[i] || "";
      toAdd.push({ type: fc.type, front: fc.front, back: fc.back, category: catId, ...(fc.type === "grammar" ? { examples: fc.examples || [] } : {}) });
      if (fc.type === "grammar" && fc.examples) {
        fc.examples.slice(0, 3).forEach((ex) => toAdd.push({ type: "sentence", front: ex.da.replace(/\*\*/g, ""), back: ex.en.replace(/\*\*/g, ""), category: catId }));
      }
    });
    if (toAdd.length === 0) return;
    addCards(toAdd);
    setReviewingIdx(null);
  }

  async function saveAsCard(idx) {
    const assistantMsg = messages[idx];
    if (!assistantMsg) return;
    let userMsg = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userMsg = messages[i];
        break;
      }
    }
    setSavingIdx(idx);
    try {
      const categoryNames = topicNamesForAI(categories);
      const reply = await callAI(
        "You turn a Danish-tutor question and answer into the single most useful flashcard for the learner to review later. Choose whichever type genuinely fits best: " +
          "'word' if this was really just about one word or a short bit of vocabulary (front = the Danish word, back = ONE clean English translation only — never a list of synonyms or a parenthetical part-of-speech note); " +
          "'sentence' if this was about how to say or understand one specific sentence (front = the Danish sentence, back = the English translation); " +
          "'grammar' if this was about a rule, pattern, or structure that's more useful explained than just translated (front = a short name for the grammar point, back = a concise plain-English explanation, plus exactly 3 short example sentences)." + GRAMMAR_CARD_STYLE + knownWordsHint() + " " +
          "Don't overuse 'grammar' — most simple vocabulary questions should be 'word' or 'sentence'. " +
          "For 'word' or 'sentence' types, also pick the single best-fitting category." + CATEGORY_RULE + " " +
          "If the front is a Danish noun, include its grammatical article (en/et), and match it with a natural English article ('a'/'an') only when the noun is countable that way in English — omit the article on both sides for mass/uncountable nouns (e.g. anger, water). Never show an article on only one side.",
        "Question: " +
          (userMsg ? userMsg.content : "(none)") +
          "\nAnswer: " +
          assistantMsg.content +
          "\n\nExisting categories to prefer if one fits (for word/sentence types): " +
          (categoryNames || "(none yet)") +
          '\n\nRespond ONLY with JSON, no other text: {"type": "word", "front": "...", "back": "...", "category": "...", "examples": [{"da": "...", "en": "..."}]} — omit "category" if type is "grammar"; omit "examples" unless type is "grammar".',
        { maxTokens: 700 }
      );
      const parsed = parseJSONLoose(reply);
      const type = ["word", "sentence", "grammar"].includes(parsed.type) ? parsed.type : "word";
      const catName = type === "grammar" ? "" : aiCategoryName(parsed.category);
      const existing = catName ? categories.find((c) => !isLessonsCategory(c) && c.name.toLowerCase() === catName.toLowerCase()) : null;
      const catId = type === "grammar" ? LESSONS_ID : !catName ? "" : existing ? existing.id : addCategory(catName);
      const examples = parsed.examples || [];
      const toAdd = [{ type, front: parsed.front, back: parsed.back, category: catId, ...(type === "grammar" ? { examples } : {}) }];
      if (type === "grammar") {
        examples.slice(0, 3).forEach((ex) => {
          toAdd.push({ type: "sentence", front: ex.da.replace(/\*\*/g, ""), back: ex.en.replace(/\*\*/g, ""), category: catId });
        });
      }
      addCards(toAdd);
    } catch (e) {
      showToast(apiErrorMessage(e));
    } finally {
      setSavingIdx(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {messages.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button
            onClick={() => persist([])}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              border: "none",
              background: "none",
              color: "var(--muted)",
              fontFamily: "var(--sans)",
              fontSize: 12,
              cursor: "pointer",
              padding: 4,
            }}
          >
            <Icon.Trash2 size={12} /> Clear chat
          </button>
        </div>
      )}
      <div style={{ marginBottom: 10 }}>
        {ready && messages.length === 0 && (
          <EmptyState
            icon={Icon.MessageCircle}
            title="Ask anything about Danish"
            body={
              <>
                <div style={{ margin: "6px 0" }}>or</div>
                <div>tell me to make cards, for example "make 10 cards with vocabulary about travel"</div>
              </>
            }
          />
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
            {(m.role === "user" || m.content) && (
              <div
                className={m.role === "assistant" && !m.isError ? "popover" : undefined}
                style={{
                  maxWidth: "82%",
                  background: m.role === "user" ? "var(--fjord)" : "var(--card)",
                  color: m.role === "user" ? "#FBFAF7" : "var(--ink)",
                  border: m.role === "user" ? "none" : "1px solid var(--line)",
                  borderRadius: 16,
                  padding: "11px 14px",
                  fontFamily: "var(--sans)",
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.role === "user" ? m.content : renderInlineMarkdown(m.content)}
              </div>
            )}
            {m.role === "assistant" && !m.isError && m.flashcards && m.flashcards.length > 0 && (
              <button
                onClick={() => openReview(i)}
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--fjord)",
                  fontFamily: "var(--sans)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  marginTop: 3,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Icon.Plus size={11} />
                Review {m.flashcards.length} flashcard{m.flashcards.length === 1 ? "" : "s"}
              </button>
            )}
            {m.role === "assistant" && !m.isError && (!m.flashcards || m.flashcards.length === 0) && (
              <button
                onClick={() => saveAsCard(i)}
                disabled={savingIdx === i}
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--fjord)",
                  fontFamily: "var(--sans)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  marginTop: 3,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {savingIdx === i ? <Icon.Loader2 size={11} className="spin" /> : <Icon.Plus size={11} />}
                Save as flashcard
              </button>
            )}
            {m.isError && onOpenSettings && isSwitchableAIError(m.content) && (
              <button
                onClick={onOpenSettings}
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--fjord)",
                  fontFamily: "var(--sans)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  marginTop: 3,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Icon.Key size={11} /> Choose another AI option
              </button>
            )}
          </div>
        ))}
        {sending && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "9px 12px", fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon.Loader2 size={14} className="spin" />
              {loadingCopy(engine)}
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Ask a question, or make a flashcard…"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={send}
          aria-label="Send"
          disabled={sending || !input.trim()}
          style={{
            border: "none",
            background: "var(--rust)",
            color: "#FBFAF7",
            borderRadius: 9,
            width: 42,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            opacity: sending || !input.trim() ? 0.5 : 1,
          }}
        >
          <Icon.Send size={16} />
        </button>
      </div>

      {reviewingIdx !== null && messages[reviewingIdx] && (
        <CenteredOverlay onClose={() => setReviewingIdx(null)} maxWidth={460}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button aria-label="Close" onClick={() => setReviewingIdx(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
            Uncheck any you don't want, and adjust the category if it's not quite right.
          </div>
          {messages[reviewingIdx].flashcards.map((fc, i) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < messages[reviewingIdx].flashcards.length - 1 ? "1px solid var(--line)" : "none" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={!!reviewSelected[i]}
                  onChange={(e) => setReviewSelected({ ...reviewSelected, [i]: e.target.checked })}
                  style={{ marginTop: 3, accentColor: "#8C6FA0" }}
                />
                <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, minWidth: 0 }}>
                  {fc.type === "grammar" ? (
                    <>
                      <b>{fc.front}</b> — {fc.back}
                    </>
                  ) : (
                    <>
                      <span style={{ color: "var(--terracotta)" }}>{fc.front}</span> — <span style={{ color: "var(--sage)", fontStyle: "italic" }}>{fc.back}</span>
                    </>
                  )}
                </span>
              </label>
              {fc.type !== "grammar" && (
                <select
                  value={reviewCategory[i] || ""}
                  onChange={(e) => setReviewCategory({ ...reviewCategory, [i]: e.target.value })}
                  style={{ ...inputStyle, width: "auto", padding: "5px 6px", fontSize: 11.5, marginLeft: 24 }}
                >
                  <CategoryOptions categories={categories} />
                </select>
              )}
            </div>
          ))}
          <button onClick={addReviewSelected} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "10px", fontSize: 14, marginTop: 6 }}>
            Add selected to deck
          </button>
        </CenteredOverlay>
      )}
    </div>
  );
}
