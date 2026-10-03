import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AIErrorNote } from "../components/AIErrorNote";
import { CheckBadgeIcon, Icon, StarIcon } from "../components/icons";
import { renderInlineMarkdown } from "../components/markdown";
import { DEFAULT_NOUN_OPTS, LevelMenu, StudyCategoryMenu } from "../components/menus";
import { CenteredOverlay, EmptyState, inputStyle, smallBtn } from "../components/ui";
import { LEVELS } from "../data/categories";
import { irregularPluralFactsHint, irregularVerbFactsHint } from "../data/irregulars";
import { apiErrorMessage, callAI } from "../lib/ai/index";
import { WORD_INSIGHT_SYSTEM_PROMPT, knownWordsHint } from "../lib/ai/prompts";
import { LEVELUP_NEXT_GAP, levelUpDueAt, levelUpFormsFor } from "../lib/levelUp";
import { speakDanish, speechSupported } from "../lib/speech";
import { storeGet, storeSet } from "../lib/storage";
import { parseJSONLoose } from "../lib/text";
import { cardInCategory, nounGenderFor, phraseWords, tenseDataFor } from "../lib/vocabulary";

// ---------- Study ----------

export function StudyView({ cards, categories, updateCard, onOpenSettings, showToast }) {
  const [catFilter, setCatFilter] = useState("all");
  const [scope, setScope] = useState("all"); // "all" | "mine" (only cards you added)
  const [levels, setLevels] = useState([]); // ticked levels; none = all
  const [nounOpts, setNounOpts] = useState(DEFAULT_NOUN_OPTS);
  // Which verb forms to show, chosen with checkboxes under "Verbs" in the
  // category menu. Applies to verbs wherever they come up (including All
  // categories). "base" = "at spise → to eat"; the others show the verb in
  // that tense ("jeg spiste → I ate"). With several ticked, each verb card
  // picks one of them at random. Remembered on this device.
  const [verbForms, setVerbForms] = useState(["base"]);
  useEffect(() => {
    storeGet("verbForms")
      .then((v) => {
        const list = v ? JSON.parse(v) : null;
        if (Array.isArray(list) && list.length) setVerbForms(list);
      })
      .catch(() => {});
    storeGet("studyLevels")
      .then((v) => {
        const list = v ? JSON.parse(v) : null;
        if (Array.isArray(list)) setLevels(list);
      })
      .catch(() => {});
    storeGet("nounOptions")
      .then((v) => {
        const list = v ? JSON.parse(v) : null;
        if (Array.isArray(list) && (list.includes("en") || list.includes("et"))) setNounOpts(list);
      })
      .catch(() => {});
  }, []);
  function changeLevels(next) {
    setLevels(next);
    storeSet("studyLevels", JSON.stringify(next)).catch(() => {});
  }
  function changeNounOpts(next) {
    setNounOpts(next);
    storeSet("nounOptions", JSON.stringify(next)).catch(() => {});
  }
  function changeVerbForms(next) {
    setVerbForms(next);
    storeSet("verbForms", JSON.stringify(next)).catch(() => {});
  }
  const [poolTenses, setPoolTenses] = useState([]);
  const [poolUps, setPoolUps] = useState([]); // per pool slot: a level-up form index, or null
  // The first card anyone sees is "broen" (the bridge), once.
  const [welcomeReady, setWelcomeReady] = useState(false);
  const welcomeCardId = useRef(null);
  useEffect(() => {
    storeGet("welcomeSeen").then((v) => {
      if (v !== "1") {
        const bridge = cards.find((c) => c.type === "word" && c.starter && c.front === "en bro" && !c.known && !c.ignored);
        welcomeCardId.current = bridge ? bridge.id : null;
      }
      setWelcomeReady(true);
    });
    // Reads the deck once, when the Study screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const levelsKey = levels.join(",");
  const nounOptsKey = nounOpts.join(",");
  const verbFormsKey = verbForms.join(",");
  const tenseActive = verbForms.some((f) => f !== "base");
  // Past and perfect verb forms count as Intermediate at the least, so a
  // Basic-only session shows "at gå" / "jeg går", never "jeg gik". Returns
  // the ticked verb forms this card may be shown in at the chosen levels
  // (for any other card, a one-item list when its level is chosen).
  const levelOn = (lv) => !levels.length || levels.length === LEVELS.length || levels.includes(lv);
  const allowedForms = (c) => {
    if (!tenseActive || !tenseDataFor(c)) return levelOn(c.level) ? ["base"] : [];
    return verbForms.filter((f) => levelOn(f === "past" || f === "perfect" ? Math.max(c.level || 0, 2) : c.level));
  };
  // One rule for both the session pool and the progress count.
  const inScope = (c) => {
    if (c.ignored) return false;
    if (scope === "mine" && c.starter) return false;
    if (!cardInCategory(c, catFilter, scope === "mine")) return false;
    if (catFilter === "g:noun") {
      const g = nounGenderFor(c);
      const wanted = nounOpts.filter((o) => o === "en" || o === "et");
      if (wanted.length < 2 && !wanted.includes(g)) return false;
    }
    if (!allowedForms(c).length) return false;
    if (starredOnly && !c.starred) return false;
    return true;
  };
  // A known word's new forms count as one level above the word itself,
  // so a Basic word's "gik" / "bøger" turn up once Intermediate is chosen.
  const inLevelUpScope = (c) => {
    if (c.ignored || c.type !== "word") return false;
    if (scope === "mine" && c.starter) return false;
    if (!cardInCategory(c, catFilter, scope === "mine")) return false;
    if (catFilter === "g:noun") {
      const g = nounGenderFor(c);
      const wanted = nounOpts.filter((o) => o === "en" || o === "et");
      if (wanted.length < 2 && !wanted.includes(g)) return false;
    }
    if (starredOnly && !c.starred) return false;
    return levelOn(Math.min((c.level || 1) + 1, 4));
  };
  const [starredOnly, setStarredOnly] = useState(false);
  const [unknownOnly, setUnknownOnly] = useState(true);
  const [langDir, setLangDir] = useState("da-first"); // da-first | en-first
  const [flipped, setFlipped] = useState(false);
  const [idx, setIdx] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const [poolIds, setPoolIds] = useState([]);
  const [slideDir, setSlideDir] = useState("next");
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(null); // null | "left" | "right"
  const gesture = useRef({ startX: 0, startY: 0, active: false });

  // The card's two faces are absolutely positioned (required for the 3D
  // flip), which means the container never naturally grows to fit taller
  // content on its own. So instead: measure the CONTENT itself (an inner,
  // normally-flowing wrapper — never absolutely positioned, so its own
  // size is always driven by its own content, not by whatever height the
  // card currently happens to be) and size the card from that measurement
  // plus a fixed clearance. Measuring the outer face box directly doesn't
  // work: scrollHeight on an already-sized box can detect when content
  // needs MORE room (overflow) but can't detect when it needs LESS —
  // if a short card follows a tall one, scrollHeight just reports the
  // leftover box height, not the smaller size the new content actually
  // needs, and the card never shrinks back down.
  //
  // V_CLEARANCE/H_CLEARANCE are each applied identically on both sides
  // (top=bottom, left=right) and the icons sit at the same offset in all
  // four corners — so the content block's center is always exactly the
  // card's center, which by simple rectangle geometry is equidistant
  // from all four corners by construction, not by tuning pixel values.
  const V_CLEARANCE = 56;
  const H_CLEARANCE = 50;
  const frontContentRef = useRef(null);
  const backContentRef = useRef(null);
  const [cardHeight, setCardHeight] = useState(220);
  // Runs after every render: the content can change height at any time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const visible = flipped ? backContentRef.current : frontContentRef.current;
    if (visible) setCardHeight(Math.max(220, visible.scrollHeight + V_CLEARANCE * 2));
  });

  // Word-insight popup — cached per card so revisiting one in the same
  // session doesn't re-spend a request.
  const [insightFor, setInsightFor] = useState(null);
  const [insightCache, setInsightCache] = useState({});
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

  // Ask-about-this-word popup — a free-form follow-up question about
  // whichever card is currently showing.
  const [askFor, setAskFor] = useState(null);
  const [askQuestion, setAskQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState("");
  const [askModification, setAskModification] = useState(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState("");

  // The session's card order is frozen when it starts (or when a filter
  // changes) so marking a card known mid-session doesn't yank it out from
  // under you — it just turns the badge green. Future sessions won't
  // include it.
  useEffect(() => {
    const now = Date.now();
    // Known words whose next new form is due (see levelUpDueAt). They
    // replace the plain card — a known word never comes back as itself —
    // and are kept to a small share of the session, earliest due first.
    const dueUps = cards
      .filter((c) => inLevelUpScope(c))
      .map((c) => ({ c, due: levelUpDueAt(c) }))
      .filter((x) => x.due != null && x.due <= now)
      .sort((x, y) => x.due - y.due)
      .slice(0, 12); // never more than 12 per session, so a long break doesn't flood it
    const dueIds = new Set(dueUps.map((x) => x.c.id));
    const welcomeId = welcomeCardId.current;
    const filtered = cards.filter((c) => inScope(c) && !(unknownOnly && c.known) && !dueIds.has(c.id) && c.id !== welcomeId);
    // Phrases built on a word you already know (at gå → at gå ud fra)
    // come earlier in the session, so the known word helps carry the new one.
    const knownBase = new Set(
      cards.filter((c) => c.known && c.type === "word" && phraseWords(c).length === 1).map((c) => phraseWords(c)[0])
    );
    const buildsOnKnown = (c) => !c.known && c.type === "word" && phraseWords(c).length > 1 && phraseWords(c).some((w) => knownBase.has(w));
    // Starred cards, and cards touched recently (just added, or an
    // attempted duplicate-add signaling "I want to prioritize this"),
    // get extra copies in the pool so they naturally come up more often
    // within a session, rather than at the same rate as everything else.
    // Recency fades after a few days rather than staying elevated forever
    // — it's a temporary nudge, not a permanent priority the way starred
    // is. Take the higher of the two rather than stacking them, so a
    // card that's both doesn't balloon to an extreme repeat count.
    const RECENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
    const entries = [];
    filtered.forEach((c) => {
      const isRecent = c.recentTouch && now - c.recentTouch < RECENT_WINDOW_MS;
      const copies = Math.max(c.starred ? 3 : 1, isRecent ? 3 : 1);
      // A random sort key shuffles the session; phrases of known words
      // get a smaller key, so they land nearer the start.
      for (let i = 0; i < copies; i++) entries.push({ id: c.id, up: null, key: Math.random() * (buildsOnKnown(c) ? 0.5 : 1) });
    });
    entries.sort((x, y) => x.key - y.key);
    // Due new forms are spread through the start of the session, about one
    // card in five. Whatever is left over stays due for next time.
    dueUps.forEach(({ c }, k) => {
      entries.splice(Math.min(3 + k * 5, entries.length), 0, { id: c.id, up: c.upStage || 0 });
    });
    if (welcomeId) entries.unshift({ id: welcomeId, up: 0 });
    const ids = entries.map((e) => e.id);
    setPoolIds(ids);
    setPoolUps(entries.map((e) => e.up));
    const TENSE_INDEX = { base: null, present: 0, past: 1, perfect: 2 };
    setPoolTenses(
      entries.map((e) => {
        if (e.up != null) return null;
        const card = cards.find((c) => c.id === e.id);
        if (!tenseActive || !tenseDataFor(card)) return null;
        const forms = allowedForms(card);
        return TENSE_INDEX[forms[Math.floor(Math.random() * forms.length)]];
      })
    );
    setIdx(0);
    setFlipped(false);
    setDragX(0);
    setExiting(null);
    // The order is built when the session starts or a filter changes, not
    // whenever a card changes, so marking a card known never reshuffles it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catFilter, scope, levelsKey, nounOptsKey, starredOnly, unknownOnly, verbFormsKey, sessionKey, welcomeReady]);

  const current = cards.find((c) => c.id === poolIds[idx]);
  // What the card actually shows: the normal word, or — in a tense
  // session — the verb in the chosen tense in both languages.
  const upIdx = current && poolUps[idx] != null ? poolUps[idx] : null;
  const upForm = upIdx != null ? levelUpFormsFor(current)[upIdx] || null : null;
  const tenseIdx = current && tenseActive && !upForm ? poolTenses[idx] : null;
  const tenseData = tenseIdx != null ? tenseDataFor(current) : null;
  // "Hide en/et": show "hund" instead of "en hund" when Danish comes
  // first, and reveal the full word on the back.
  const hideArticle =
    !tenseData && !upForm && nounOpts.includes("hide") && langDir === "da-first" && current && current.type === "word" && /^(en|et)\s/i.test(current.front);
  const shownFront = upForm ? upForm.da : tenseData ? tenseData.da[tenseIdx] : current ? (hideArticle ? current.front.replace(/^(en|et)\s+/i, "") : current.front) : "";
  const shownBack = upForm ? upForm.en : tenseData ? tenseData.en[tenseIdx] : current ? current.back : "";
  // Scoped to the current filter selection (category, starred, and the
  // same grammar-inclusion rule the pool itself uses) so switching to
  // Grammar Lessons shows progress within that category, not a leftover
  // number from the whole deck. Deliberately NOT scoped to unknownOnly —
  // that filter controls session contents, but progress should still be
  // visible even while looking at the unknown-only view. Computed fresh
  // from live cards every render, so it auto-updates immediately.
  const inProgressScope = inScope;
  const knownWordCount = cards.filter((c) => inProgressScope(c) && c.known).length;
  const scopeTotal = cards.filter(inProgressScope).length;
  // "Card X of Y": Y is every card in this view (known ones included, so
  // it doesn't shrink when "Unknown" is on); X counts distinct cards, since
  // starred cards come up more than once in a session.
  const cardNumber = useMemo(() => new Set(poolIds.slice(0, idx + 1)).size, [poolIds, idx]);
  // Grammar cards store an English name in front, not Danish — speaking
  // that mangles English phonetically instead of pronouncing anything
  // real. Use the first example's genuine Danish sentence instead.
  // Grammar cards are lesson names/explanations, not something meant to
  // be pronounced — no speaker icon for those at all, unlike word/sentence
  // cards where the Danish text is exactly what a speaker button is for.
  const currentSpeakableText = current && current.type !== "grammar" ? shownFront : null;

  // Once a swipe (or a Back/Next tap) commits to leaving, the card
  // animates fully off-screen first, and only once that's visibly
  // finished do we actually advance to the next card underneath.
  useEffect(() => {
    if (!exiting) return;
    const t = setTimeout(() => {
      setSlideDir(exiting === "left" ? "next" : "back");
      setFlipped(false);
      setIdx((i) => {
        if (exiting === "left") return i + 1 < poolIds.length ? i + 1 : poolIds.length;
        return i > 0 ? i - 1 : 0;
      });
      setDragX(0);
      setExiting(null);
    }, 280);
    return () => clearTimeout(t);
  }, [exiting, poolIds.length]);

  function requestNext() {
    if (exiting) return;
    markLevelUpSeen();
    setExiting("left");
  }

  // Moving on from a known word's new form counts it as seen: the next
  // form comes a week later, and after the last one the word is done.
  function markLevelUpSeen() {
    if (current && welcomeCardId.current === current.id) {
      welcomeCardId.current = null;
      storeSet("welcomeSeen", "1").catch(() => {});
    }
    if (!current || upIdx == null || (current.upStage || 0) !== upIdx) return;
    updateCard(current.id, { upStage: upIdx + 1, upDue: Date.now() + LEVELUP_NEXT_GAP });
  }

  function requestBack() {
    if (exiting) return;
    setExiting("right");
  }

  // Left/right arrow keys navigate cards on desktop, matching the Back/Next
  // buttons. Skipped while typing in a text field (e.g. the "ask about
  // this word" box) so arrow keys there move the cursor as expected.
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") requestNext();
      else if (e.key === "ArrowLeft") requestBack();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function onGestureStart(clientX, clientY) {
    if (exiting) return;
    gesture.current = { startX: clientX, startY: clientY, active: true };
    setDragging(true);
  }

  function onGestureMove(clientX, clientY) {
    if (!gesture.current.active) return;
    const dx = clientX - gesture.current.startX;
    const dy = clientY - gesture.current.startY;
    if (Math.abs(dx) > Math.abs(dy)) setDragX(dx);
  }

  function onGestureEnd() {
    if (!gesture.current.active) return;
    gesture.current.active = false;
    setDragging(false);
    const dx = dragX;
    const threshold = 70;
    if (Math.abs(dx) < 6) {
      // Barely moved — a tap, not a swipe. Flip the card.
      setDragX(0);
      setFlipped((f) => !f);
      return;
    }
    if (dx <= -threshold) {
      markLevelUpSeen();
      setExiting("left");
    }
    else if (dx >= threshold) setExiting("right");
    else setDragX(0); // didn't clear the threshold — snap back
  }

  async function openInsight(card) {
    setInsightFor(card.id);
    setInsightError("");
    if (insightCache[card.id]) return; // already fetched this session
    setInsightLoading(true);
    try {
      const reply = await callAI(
        WORD_INSIGHT_SYSTEM_PROMPT,
        'Danish word or phrase: "' + card.front + '"' + (card.back ? " (means: " + card.back + ")" : "") + irregularVerbFactsHint(card.front) + irregularPluralFactsHint(card.front) + knownWordsHint(),
        { maxTokens: 900 }
      );
      const parsed = parseJSONLoose(reply);
      setInsightCache((prev) => ({ ...prev, [card.id]: { forms: parsed.forms || [], explanation: (parsed.explanation || "").trim(), related: Array.isArray(parsed.related) ? parsed.related : [] } }));
    } catch (e) {
      setInsightError(apiErrorMessage(e));
    } finally {
      setInsightLoading(false);
    }
  }

  function openAsk(card) {
    setAskFor(card.id);
    setAskQuestion("");
    setAskAnswer("");
    setAskModification(null);
    setAskError("");
  }

  async function submitAsk() {
    if (!askQuestion.trim()) return;
    const card = cards.find((c) => c.id === askFor);
    if (!card) return;
    setAskLoading(true);
    setAskError("");
    setAskModification(null);
    try {
      const reply = await callAI(
        "You're a Danish tutor helping with a single flashcard a learner is studying. They'll either ask a genuine question about it, or ask you to modify the card itself — e.g. \"give me the present tense\", \"make this plural\", \"change to past tense\", \"fix the translation\" — work out which from their wording. " +
          "For a genuine question: answer directly in the reply field, 1-3 short sentences — never more than that, and never pad the answer with extra context they didn't ask for. Write in plain flowing prose only: no headers, no bullet points, no numbered lists, no markdown formatting. Leave newFront and newBack as empty strings. " +
          "For a modification request: work out the new Danish text and its natural English translation, and put them in newFront and newBack — keep the same conventions the original card used (e.g. keep a noun's en/et article if the original had one, omit it if the original didn't). Leave reply as an empty string, or at most a short one-line confirmation.",
        'The flashcard is: "' +
          card.front +
          '" (means: ' +
          card.back +
          '), type: ' +
          card.type +
          '. Their message: "' +
          askQuestion.trim() +
          '"\n\nRespond ONLY with JSON, no other text: {"reply": "...", "newFront": "...", "newBack": "..."} — use empty strings for whichever don\'t apply.',
        { maxTokens: 300 }
      );
      const parsed = parseJSONLoose(reply);
      setAskAnswer((parsed.reply || "").trim());
      if (parsed.newFront && parsed.newFront.trim()) {
        setAskModification({ front: parsed.newFront.trim(), back: (parsed.newBack || "").trim() });
      }
    } catch (e) {
      setAskError(apiErrorMessage(e));
    } finally {
      setAskLoading(false);
    }
  }

  function applyAskModification() {
    if (!askModification || !askFor) return;
    updateCard(askFor, { front: askModification.front, back: askModification.back });
    setAskModification(null);
    setAskAnswer("");
    setAskFor(null);
    showToast("Card updated");
  }

  function restartWith(mode) {
    const sessionCards = poolIds.map((id) => cards.find((c) => c.id === id)).filter(Boolean);
    let ids;
    if (mode === "unknown") ids = sessionCards.filter((c) => !c.known).map((c) => c.id);
    else if (mode === "starred") ids = sessionCards.filter((c) => c.starred).map((c) => c.id);
    else ids = sessionCards.map((c) => c.id); // "all"
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setPoolIds(ids);
    setPoolUps([]); // a re-review shows plain cards
    setIdx(0);
    setFlipped(false);
    setDragX(0);
    setExiting(null);
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={Icon.GraduationCap}
        title="No cards yet"
        body="Load the starter vocabulary from Library, or add your own from the Add tab or Chat, then come back here to study."
      />
    );
  }

  const sessionCards = poolIds.map((id) => cards.find((c) => c.id === id)).filter(Boolean);
  // Starred cards can appear multiple times in the pool (by design, so
  // they cycle in more often) — de-duplicate before counting so the
  // session-end summary reflects distinct cards, not raw pool entries.
  const uniqueSessionCards = [...new Map(sessionCards.map((c) => [c.id, c])).values()];
  const knownNowCount = uniqueSessionCards.filter((c) => c.known).length;
  const stillUnknownCount = uniqueSessionCards.length - knownNowCount;
  const starredInSessionCount = uniqueSessionCards.filter((c) => c.starred).length;

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <StudyCategoryMenu
              categories={categories}
              value={catFilter}
              onChange={setCatFilter}
              scope={scope}
              onChangeScope={setScope}
              ownCount={cards.filter((c) => !c.starter && !c.ignored).length}
              verbForms={verbForms}
              onChangeVerbForms={changeVerbForms}
              nounOpts={nounOpts}
              onChangeNounOpts={changeNounOpts}
            />
          </div>
          <LevelMenu value={levels} onChange={changeLevels} />
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => setUnknownOnly(!unknownOnly)}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: "1.6px solid " + (unknownOnly ? "#9B87A8" : "#C9C4B6"),
                background: unknownOnly ? "#9B87A8" : "transparent",
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)" }}>Unknown</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => setStarredOnly(!starredOnly)}>
            <StarIcon size={13} filled={starredOnly} color={starredOnly ? "#C9A66B" : "#C9C4B6"} />
            <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)" }}>Starred</span>
          </div>

          <button
            onClick={() => setLangDir(langDir === "da-first" ? "en-first" : "da-first")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              border: "1px solid var(--line)",
              background: "var(--card)",
              borderRadius: 999,
              padding: "6px 13px",
              fontFamily: "var(--sans)",
              fontSize: 13,
              whiteSpace: "nowrap",
              color: "var(--muted)",
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            {langDir === "da-first" ? (
              <>
                <span style={{ color: "var(--terracotta)" }}>Dansk</span> → <span style={{ fontStyle: "italic" }}>English</span>
              </>
            ) : (
              <>
                <span style={{ fontStyle: "italic" }}>English</span> → <span style={{ color: "var(--terracotta)" }}>Dansk</span>
              </>
            )}
            <Icon.RotateCcw size={11} />
          </button>
        </div>
      </div>

      {!current ? (
        <div style={{ textAlign: "center", padding: "40px 10px" }}>
          <Icon.Check size={26} color="var(--fjord)" style={{ marginBottom: 8 }} />
          <div style={{ fontFamily: "var(--sans)", fontSize: 15, fontWeight: 600 }}>
            {poolIds.length === 0 ? "Nothing left to study here" : "Session complete"}
          </div>
          <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            {poolIds.length === 0
              ? scope === "mine" && !cards.some((c) => !c.starter)
                ? "You haven't added any cards of your own yet. Add some from the Add tab, Chat or Photo and they'll show up here."
                : "Everything in this view is marked known, or try a different filter."
              : knownNowCount + " known · " + stillUnknownCount + " still to review"}
          </div>
          {poolIds.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 16 }}>
              {stillUnknownCount > 0 && (
                <button onClick={() => restartWith("unknown")} style={smallBtn("var(--rust)")}>
                  Re-review unknown
                </button>
              )}
              {starredInSessionCount > 0 && (
                <button onClick={() => restartWith("starred")} style={smallBtn("var(--fjord)")}>
                  Re-review starred
                </button>
              )}
              <button onClick={() => restartWith("all")} style={smallBtn("#8A8577")}>
                Re-review all
              </button>
            </div>
          )}
          <button
            onClick={() => setSessionKey((k) => k + 1)}
            style={{
              marginTop: 10,
              border: "none",
              background: "none",
              color: "var(--muted)",
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              margin: "10px auto 0",
            }}
          >
            <Icon.RotateCcw size={12} />
            Start a fresh session
          </button>
        </div>
      ) : (
        <>
          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 8, display: "flex", gap: 16 }}>
            <span>
              Card {Math.min(cardNumber, scopeTotal)} of {scopeTotal}
            </span>
            <span>
              <span style={{ color: "var(--sage)", fontWeight: 700 }}>{knownWordCount}</span> known
            </span>
          </div>
          <div
            key={current.id}
            className={slideDir === "back" ? "card-enter-back" : "card-enter-next"}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              onGestureStart(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => onGestureMove(e.clientX, e.clientY)}
            onPointerUp={onGestureEnd}
            onPointerCancel={onGestureEnd}
            style={{
              position: "relative",
              borderRadius: 14,
              border: "1px solid var(--line)",
              background: "var(--card)",
              height: cardHeight,
              maxHeight: "70vh",
              overflowY: cardHeight > window.innerHeight * 0.7 ? "auto" : "visible",
              touchAction: "pan-y",
              cursor: "pointer",
              userSelect: "none",
              transform:
                "translateX(" + (exiting ? (exiting === "left" ? -420 : 420) : dragX) + "px) rotate(" + dragX / 28 + "deg)",
              opacity: exiting ? 0 : 1 - Math.min(Math.abs(dragX) / 260, 0.45),
              transition: dragging ? "none" : "transform 0.28s ease, opacity 0.28s ease, height 0.2s ease",
            }}
          >
            <CheckBadgeIcon
              size={17}
              filled={!!current.known}
              style={{ position: "absolute", top: 14, right: 14, zIndex: 2, cursor: "pointer" }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                updateCard(current.id, { known: !current.known });
              }}
            />
            <StarIcon
              size={17}
              filled={!!current.starred}
              color={current.starred ? "var(--rust)" : "#C9C4B6"}
              style={{ position: "absolute", top: 14, left: 14, zIndex: 2, cursor: "pointer" }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                updateCard(current.id, { starred: !current.starred });
              }}
            />
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openAsk(current);
              }}
              aria-label="Ask about this word"
              style={{ position: "absolute", bottom: 14, right: 14, zIndex: 2, border: "none", background: "none", color: "#C9C4B6", cursor: "pointer", padding: 0, display: "flex" }}
            >
              <Icon.HelpCircle size={17} />
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openInsight(current);
              }}
              aria-label="Explore related words"
              style={{ position: "absolute", bottom: 14, left: 14, zIndex: 2, border: "none", background: "none", color: "#C9C4B6", cursor: "pointer", padding: 0, display: "flex" }}
            >
              <Icon.Lightbulb size={17} />
            </button>

            <div style={{ perspective: 1200 }}>
              <div
                style={{
                  position: "relative",
                  height: cardHeight,
                  width: "100%",
                  transformStyle: "preserve-3d",
                  transition: "transform 0.5s",
                  transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                {/* Front face — shows Danish or English first depending on the direction toggle.
                    Outer div just centers the inner content block within the full card (both
                    axes) — that's what guarantees the block's center coincides with the card's
                    center, and therefore stays equidistant from all four corner icons. */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backfaceVisibility: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div ref={frontContentRef} style={{ width: "100%", boxSizing: "border-box", padding: "0 " + H_CLEARANCE + "px" }}>
                    {(langDir === "da-first" || current.type === "grammar") ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%" }}>
                      <div style={{ fontFamily: "var(--serif)", fontSize: current.type === "word" ? 30 : 21, lineHeight: 1.35, color: "var(--terracotta)", textAlign: "center" }}>
                        {shownFront}
                      </div>
                      {speechSupported() && currentSpeakableText && (
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            speakDanish(currentSpeakableText);
                          }}
                          aria-label="Pronounce this"
                          style={{ border: "none", background: "none", color: "var(--terracotta)", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
                        >
                          <Icon.Volume2 size={20} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        fontFamily: "var(--sans)",
                        fontStyle: current.type === "grammar" ? "normal" : "italic",
                        fontSize: current.type === "word" ? 26 : current.type === "grammar" ? 15.5 : 18,
                        lineHeight: current.type === "grammar" ? 1.55 : 1.4,
                        color: current.type === "grammar" ? "var(--ink)" : "var(--sage)",
                        width: "100%",
                        textAlign: current.type === "grammar" ? "left" : "center",
                      }}
                    >
                      {shownBack}
                    </div>
                  )}
                  </div>
                </div>

                {/* Back face — the other language, plus notes/examples. Same centering approach. */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    ref={backContentRef}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "0 " + H_CLEARANCE + "px",
                    }}
                  >
                    {(langDir === "da-first" || current.type === "grammar") ? (
                    <>
                    <div
                      style={{
                        fontFamily: "var(--sans)",
                        fontStyle: current.type === "grammar" ? "normal" : "italic",
                        fontSize: current.type === "word" ? 26 : current.type === "grammar" ? 15.5 : 18,
                        lineHeight: current.type === "grammar" ? 1.55 : 1.4,
                        color: current.type === "grammar" ? "var(--ink)" : "var(--sage)",
                        width: "100%",
                        textAlign: current.type === "grammar" ? "left" : "center",
                      }}
                    >
                      {shownBack}
                    </div>
                    {hideArticle && (
                      <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--terracotta)", textAlign: "center", marginTop: 8 }}>
                        {current.front}
                      </div>
                    )}
                    </>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%" }}>
                      <div style={{ fontFamily: "var(--serif)", fontSize: current.type === "word" ? 30 : 21, lineHeight: 1.35, color: "var(--terracotta)", textAlign: "center" }}>
                        {shownFront}
                      </div>
                      {speechSupported() && currentSpeakableText && (
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            speakDanish(currentSpeakableText);
                          }}
                          aria-label="Pronounce this"
                          style={{ border: "none", background: "none", color: "var(--terracotta)", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
                        >
                          <Icon.Volume2 size={20} />
                        </button>
                      )}
                    </div>
                  )}
                    {current.notes && (
                    <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", marginTop: 8, textAlign: current.type === "grammar" ? "left" : "center" }}>{current.notes}</div>
                  )}
                  {current.pattern && (
                    <div style={{ fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.5, color: "var(--terracotta)", marginTop: 12, padding: "8px 10px", background: "var(--paper)", borderRadius: 8 }}>
                      {renderInlineMarkdown(current.pattern)}
                    </div>
                  )}
                  {current.examples && current.examples.length > 0 && (
                    <div style={{ marginTop: 12, width: "100%", textAlign: "left" }}>
                      {current.examples.slice(0, 3).map((ex, i) => (
                        <div key={i} style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5, marginBottom: 6 }}>
                          <span style={{ color: "var(--terracotta)" }}>{renderInlineMarkdown(ex.da)}</span>
                          <span style={{ color: "var(--sage)", fontStyle: "italic" }}> — {ex.en}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "center" }}>
            <button
              onClick={requestBack}
              style={{
                border: "1px solid var(--line)",
                background: "var(--card)",
                color: "var(--ink)",
                borderRadius: 999,
                padding: "11px 30px",
                fontFamily: "var(--sans)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Back
            </button>
            <button
              onClick={requestNext}
              style={{
                border: "1px solid var(--line)",
                background: "var(--card)",
                color: "var(--ink)",
                borderRadius: 999,
                padding: "11px 30px",
                fontFamily: "var(--sans)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Next
            </button>
          </div>
        </>
      )}

      {insightFor && (
        <CenteredOverlay onClose={() => setInsightFor(null)} maxWidth={380}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--terracotta)" }}>
              {cards.find((c) => c.id === insightFor)?.front}
            </div>
            <button onClick={() => setInsightFor(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          {insightLoading ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <Icon.Loader2 className="spin" size={20} color="var(--muted)" />
            </div>
          ) : insightError ? (
            <AIErrorNote message={insightError} onOpenSettings={onOpenSettings} />
          ) : (
            <div style={{ background: "var(--paper)", borderRadius: 8, padding: "12px 14px", fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.6 }}>
              {insightCache[insightFor]?.forms?.length > 0 && (
                <div style={{ marginBottom: insightCache[insightFor]?.explanation ? 12 : 0 }}>
                  {insightCache[insightFor].forms.map((f, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <span style={{ color: "var(--terracotta)" }}>{f.da}</span>
                      <span style={{ color: "var(--sage)", fontStyle: "italic" }}> — {f.en}</span>
                    </div>
                  ))}
                </div>
              )}
              {insightCache[insightFor]?.explanation && <div style={{ whiteSpace: "pre-wrap" }}>{renderInlineMarkdown(insightCache[insightFor].explanation)}</div>}
              {insightCache[insightFor]?.related?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>Related words</div>
                  {insightCache[insightFor].related.map((f, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <span style={{ color: "var(--terracotta)" }}>{f.da}</span>
                      <span style={{ color: "var(--sage)", fontStyle: "italic" }}> — {f.en}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CenteredOverlay>
      )}

      {askFor && (
        <CenteredOverlay onClose={() => setAskFor(null)} maxWidth={380}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--terracotta)" }}>
              Ask about "{cards.find((c) => c.id === askFor)?.front}"
            </div>
            <button onClick={() => setAskFor(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.4 }}>
            Ask anything about this word, or tell me how to modify the card — e.g. "give me the present tense" or "make this plural".
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitAsk()}
              placeholder='e.g. "make this plural"'
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={submitAsk} disabled={askLoading || !askQuestion.trim()} style={smallBtn("var(--fjord)")}>
              {askLoading ? <Icon.Loader2 size={14} className="spin" /> : <Icon.Send size={14} />}
            </button>
          </div>
          {askError && <AIErrorNote message={askError} onOpenSettings={onOpenSettings} />}
          {askAnswer && (
            <div style={{ background: "var(--paper)", borderRadius: 8, padding: "12px 14px", fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: askModification ? 10 : 0 }}>
              {renderInlineMarkdown(askAnswer)}
            </div>
          )}
          {askModification && (
            <div style={{ background: "var(--paper)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>
                Suggested update
              </div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 14, marginBottom: 12 }}>
                <span style={{ color: "var(--terracotta)" }}>{askModification.front}</span>
                {askModification.back && (
                  <>
                    {" "}
                    — <span style={{ color: "var(--sage)", fontStyle: "italic" }}>{askModification.back}</span>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={applyAskModification} style={{ ...smallBtn("var(--rust)"), flex: 1, padding: "8px", fontSize: 13 }}>
                  Update this card
                </button>
                <button onClick={() => setAskModification(null)} style={{ ...smallBtn("#A8A395"), flex: 1, padding: "8px", fontSize: 13 }}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </CenteredOverlay>
      )}
    </div>
  );
}
