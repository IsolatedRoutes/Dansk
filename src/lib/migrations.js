import { CATEGORY_MERGE_MAP, LESSONS_ID, TOPIC_NAMES, isLessonsCategory } from "../data/categories";
import { STARTER_GRAMMAR } from "../data/grammarLessons";
import { RETIRED_STARTER_FRONTS, STARTER_TRANSLATION_UPDATES } from "../data/translationUpdates";
import { VOCAB_CORRECTIONS, VOCAB_TRANSLATION_CORRECTIONS } from "../data/vocabCorrections";
import { storeGet, storeSet } from "./storage";
import { frontKey, normalizeCardText, uid } from "./text";
import { STARTER_WORDS, wordMetaFor } from "./vocabulary";

// Shared by the auto-seed on first launch and the manual "Add starter
// vocabulary" button in Library — builds only what's not already present.
// Deterministic across every device, forever, as long as the Danish text
// doesn't change — this is what makes "starred this starter word" mergeable
// between devices instead of colliding on random per-device IDs.
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stableStarterId(front) {
  // The pronoun "I" (you, plural) must not share an id with the preposition "i".
  return "starter:" + (front.trim() === "I" ? "I" : slugify(front));
}

// Re-points cards in retired category names at the surviving category and
// drops the emptied ones. Returns null when there is nothing to change.
export function migrateConsolidatedCategories(cards, categories) {
  let changed = false;
  let newCategories = categories;
  let newCards = cards;

  Object.entries(CATEGORY_MERGE_MAP).forEach(([oldName, newName]) => {
    const oldCat = newCategories.find((c) => c.name === oldName);
    if (!oldCat) return; // this user never had that old category
    const survivor = newCategories.find((c) => c.name === newName);
    if (!survivor) {
      // Extremely unlikely (the anchor category should already exist for
      // anyone who has the absorbed one), but handle it defensively by
      // just renaming the old category in place instead of losing it.
      newCategories = newCategories.map((c) => (c.id === oldCat.id ? { ...c, name: newName } : c));
      changed = true;
      return;
    }
    if (newCards.some((c) => c.category === oldCat.id)) {
      newCards = newCards.map((c) => (c.category === oldCat.id ? { ...c, category: survivor.id } : c));
    }
    newCategories = newCategories.filter((c) => c.id !== oldCat.id);
    changed = true;
  });

  return changed ? { cards: newCards, categories: newCategories } : null;
}

// Fixes an already-seeded card in place when its Danish text or
// translation matches one of the corrections above, so a user who
// already has the old (incorrect) version gets it updated rather than
// ending up with both the old and the corrected word side by side.
export function migrateVocabCorrections(original) {
  let changed = false;
  const cards = normalizeCardText(original);
  if (cards !== original) changed = true;
  let newCards = cards.map((card) => {
    if (card.type !== "word") return card;
    const frontFix = VOCAB_CORRECTIONS[card.front];
    const backFix = VOCAB_TRANSLATION_CORRECTIONS[card.front];
    const front = frontFix !== undefined ? frontFix : card.front;
    const back = backFix !== undefined ? backFix : card.back;
    if (front === card.front && back === card.back) return card;
    changed = true;
    return { ...card, front, back };
  });

  // A correction can occasionally land on text that already matches a
  // different existing card (e.g. a corrected word turns out to already
  // exist elsewhere in the deck) — collapse any such duplicates into
  // one, merging known/starred status so neither side loses progress.
  if (changed) {
    const seen = new Map();
    const deduped = [];
    for (const card of newCards) {
      const key = card.type + ":" + frontKey(card.front);
      if (!seen.has(key)) {
        seen.set(key, deduped.length);
        deduped.push(card);
      } else {
        const idx = seen.get(key);
        const existing = deduped[idx];
        deduped[idx] = mergeProgress(existing, card);
      }
    }
    newCards = deduped;
  }

  return changed ? newCards : null;
}


// Gives starter cards their cleaned-up single-meaning translation. A card is
// only touched if its back still matches the old built-in wording, so any
// translation the person edited themselves is left alone.
export function migrateStarterTranslations(cards) {
  let changed = false;
  const next = cards.map((card) => {
    if (card.type !== "word" || !card.starter) return card;
    const upd = STARTER_TRANSLATION_UPDATES[card.front];
    if (!upd || card.back !== upd[0]) return card;
    changed = true;
    return { ...card, back: upd[1] };
  });
  return changed ? next : null;
}

// Quietly drops starter words that were retired from the deck (proper
// names, offensive words) - but only if the person never touched them.
// Anything known, starred, hidden, noted or practised stays exactly as is.
export function purgeRetiredStarters(cards) {
  const retired = new Set(RETIRED_STARTER_FRONTS);
  const next = cards.filter((c) => !(c.type === "word" && c.starter && retired.has(c.front) && !c.known && !c.starred && !c.ignored && !c.upStage && !(c.notes && c.notes.trim())));
  return next.length !== cards.length ? next : null;
}

// ---------- protecting saved progress ----------
// Progress = which cards are known / starred / hidden, any notes, and the
// person's own cards. Every update to the built-in list (renamed words,
// re-sorted topics, reworded lessons) must carry all of it across. The
// helpers below are the safety net the startup code wraps around every
// migration, so even a mistake in a future migration can't quietly lose it.

// Combines two copies of the same card without losing anything either had.
function mergeProgress(a, b) {
  return {
    ...a,
    known: !!(a.known || b.known),
    starred: !!(a.starred || b.starred),
    ignored: !!(a.ignored || b.ignored),
    notes: [a.notes, b.notes].filter((n) => n && n.trim()).filter((n, i, all) => all.indexOf(n) === i).join("\n"),
    recentTouch: Math.max(a.recentTouch || 0, b.recentTouch || 0) || undefined,
    upStage: Math.max(a.upStage || 0, b.upStage || 0),
    upDue: Math.max(a.upDue || 0, b.upDue || 0),
    starter: !!(a.starter && b.starter),
  };
}

// The current spelling of a card's front, following any renames in
// VOCAB_CORRECTIONS (words) or a lesson's earlier names (grammar), so a
// card can be recognised across versions.
export function canonicalKey(type, front) {
  let f = (front || "").trim();
  if (type === "grammar") {
    const point = STARTER_GRAMMAR.find((p) => (p.was || []).some((w) => w.toLowerCase() === f.toLowerCase()));
    if (point) f = point.name;
  } else {
    for (let i = 0; i < 4 && VOCAB_CORRECTIONS[f] !== undefined; i++) f = VOCAB_CORRECTIONS[f];
  }
  return type + ":" + f.toLowerCase();
}

// Taken before any migration runs.
export function snapshotProgress(cards) {
  const progress = new Map();
  const ownCards = [];
  cards.forEach((c) => {
    const key = canonicalKey(c.type, c.front);
    if (c.known || c.starred || c.ignored || c.upStage || (c.notes && c.notes.trim())) {
      const prev = progress.get(key);
      progress.set(key, prev ? mergeProgress(prev, c) : c);
    }
    if (!c.starter) ownCards.push({ key, card: c });
  });
  return { progress, ownCards };
}

// Run after all migrations: puts back any known / starred / hidden mark
// or note that went missing, and any of the person's own cards that
// disappeared. Returns null when nothing was lost (the normal case).
export function restoreProgress(cards, snapshot) {
  let changed = false;
  const byKey = new Map();
  let next = cards.map((c) => {
    const key = canonicalKey(c.type, c.front);
    byKey.set(key, true);
    const before = snapshot.progress.get(key);
    if (!before) return c;
    const merged = mergeProgress(c, before);
    merged.starter = c.starter; // keep the card's own origin
    if (merged.known === !!c.known && merged.starred === !!c.starred && merged.ignored === !!c.ignored && (merged.notes || "") === (c.notes || "") && (merged.upStage || 0) === (c.upStage || 0)) return c;
    changed = true;
    return merged;
  });
  snapshot.ownCards.forEach(({ key, card }) => {
    if (byKey.has(key)) return;
    byKey.set(key, true);
    next = [...next, card];
    changed = true;
  });
  return changed ? next : null;
}

// Built-in cards the person deleted are remembered (by their Danish text)
// so the "top up any missing starter words" step never brings them back.
export async function loadDeletedKeys() {
  try {
    const list = JSON.parse((await storeGet("deletedStarterCards")) || "[]");
    return new Set(list.map((k) => {
      const [type, ...rest] = k.split(":");
      return canonicalKey(type, rest.join(":"));
    }));
  } catch {
    return new Set();
  }
}

export async function rememberDeleted(card) {
  if (!card || !card.starter) return;
  const keys = await loadDeletedKeys();
  keys.add(canonicalKey(card.type, card.front));
  await storeSet("deletedStarterCards", JSON.stringify([...keys]));
}

// Keeps every word card's level / verb forms in sync with the built-in
// list (so a later re-levelling reaches existing decks too). Only touches
// those three fields — known / starred / ignored progress is never
// changed. Returns null when nothing needed updating.
export function applyWordMeta(cards) {
  let changed = false;
  const next = cards.map((card) => {
    if (card.type !== "word") return card;
    const meta = wordMetaFor(card.front);
    if (!meta) return card;
    if (card.level === meta.level && (card.forms || "") === meta.forms && (card.gender || "") === meta.gender) return card;
    changed = true;
    return { ...card, level: meta.level, forms: meta.forms, gender: meta.gender };
  });
  return changed ? next : null;
}

export function buildStarterAdditions(existingCategories, existingFrontsSet, deletedKeys = new Set()) {
  const existingCatNames = new Set(existingCategories.map((c) => c.name.toLowerCase()));
  const newCategories = Object.keys(STARTER_WORDS)
    .filter((name) => name && !existingCatNames.has(name.toLowerCase()))
    .map((name) => ({ id: uid(), name, custom: false }));
  // "Grammar Lessons" should always exist too, even on the rare chance
  // it's somehow missing (categories were reset, imported without it, etc).
  if (!existingCatNames.has("grammar lessons") && !newCategories.some((c) => c.name.toLowerCase() === "grammar lessons")) {
    newCategories.push({ id: "grammar-lessons", name: "Grammar Lessons", custom: false });
  }
  const combinedCategories = [...existingCategories, ...newCategories];
  const nameToId = {};
  combinedCategories.forEach((c) => {
    nameToId[c.name.toLowerCase()] = c.id;
  });

  const seen = new Set(existingFrontsSet);
  const newCards = [];
  Object.entries(STARTER_WORDS).forEach(([catName, list]) => {
    list.forEach(([da, en]) => {
      const key = frontKey(da);
      if (seen.has(key) || deletedKeys.has("word:" + key)) return;
      seen.add(key);
      const meta = wordMetaFor(da) || {};
      newCards.push({
        id: stableStarterId(da),
        type: "word",
        front: da,
        back: en,
        category: catName ? nameToId[catName.toLowerCase()] : "",
        starter: true,
        level: meta.level || 0,
        forms: meta.forms || "",
        gender: meta.gender || "",
      });
    });
  });

  const grammarLessonsId = nameToId["grammar lessons"];
  STARTER_GRAMMAR.forEach((point) => {
    const key = point.name.trim().toLowerCase();
    if (seen.has(key) || deletedKeys.has("grammar:" + key) || (point.was || []).some((w) => seen.has(w.trim().toLowerCase()))) return;
    seen.add(key);
    newCards.push({
      id: stableStarterId(point.name),
      type: "grammar",
      front: point.name,
      back: point.rule,
      pattern: point.pattern,
      level: point.level,
      category: grammarLessonsId,
      examples: point.examples.map(([da, en]) => ({ da, en })),
      starter: true,
    });
  });

  return { newCategories, newCards, combinedCategories };
}

// Files cards under topics. Word types are separate "Grammar" groups, so:
// - topic-style categories are renamed to their topic name;
// - word-type categories are removed; the person's own cards in them keep
//   their word type and simply have no topic;
// - every built-in word is filed under its topic (or none).
// The person's own categories are never touched. Runs once per layout
// version, so a card moved by hand afterwards stays where it was put.
export const CATEGORY_LAYOUT_VERSION = "topics-5";

const OLD_TO_TOPIC = {
  "Common Phrases & Idioms": "Greetings & Everyday Phrases",
  "Numbers & Time": "Time & Calendar",
  "Family & People": "People & Family",
  "Home & Daily Life": "Home & Household",
  "Work & School": "Work & Jobs",
  "Emotions & Personality": "Feelings & Personality",
  "Clothing & Shopping": "Clothes & Shopping",
  "Abstract Concepts & Opinions": "Ideas & Opinions",
  "Society & Culture": "Culture & Holidays",
  "Hobbies & Leisure": "Free Time & Sports",
  "Politics & Law": "Society, Politics & Law",
};

const OLD_WORD_TYPE_CATEGORIES = {
  Verbs: "verb",
  "Common Nouns": "noun",
  Adjectives: "adj",
  "Pronouns & Adverbs": "",
  "Prepositions & Connectors": "",
};

export function migrateToTopics(cards, categories) {
  let cats = categories.map((c) => ({ ...c }));
  let next = cards;
  const byName = (name) => cats.find((c) => c.name.toLowerCase() === name.toLowerCase());

  // 1. Rename (or merge) old topic-style categories.
  Object.entries(OLD_TO_TOPIC).forEach(([oldName, newName]) => {
    const old = cats.find((c) => !c.custom && c.name === oldName);
    if (!old) return;
    const target = byName(newName);
    if (!target) {
      old.name = newName;
      return;
    }
    next = next.map((c) => (c.category === old.id ? { ...c, category: target.id } : c));
    cats = cats.filter((c) => c.id !== old.id);
  });

  // 2. Drop the old word-type categories.
  Object.entries(OLD_WORD_TYPE_CATEGORIES).forEach(([oldName, pos]) => {
    const old = cats.find((c) => !c.custom && c.name === oldName);
    if (!old) return;
    next = next.map((c) => (c.category === old.id ? { ...c, category: "", ...(pos && !c.starter ? { pos } : {}) } : c));
    cats = cats.filter((c) => c.id !== old.id);
  });

  // 3. Make sure every topic exists, then file each built-in word.
  TOPIC_NAMES.forEach((name) => {
    if (!byName(name)) cats.push({ id: uid(), name, custom: false });
  });
  next = next.map((c) => {
    if (!c.starter || c.type !== "word") return c;
    const meta = wordMetaFor(c.front);
    if (!meta) return c;
    const cat = meta.topic ? byName(meta.topic).id : "";
    return c.category === cat ? c : { ...c, category: cat };
  });

  // 4. Tidy order: topics in menu order, then the person's own, then
  //    Grammar Lessons. Empty leftover built-in categories are removed.
  const used = new Set(next.map((c) => c.category));
  const topics = TOPIC_NAMES.map(byName);
  const rest = cats.filter((c) => !topics.includes(c) && c.id !== "grammar-lessons" && c.name !== "Grammar Lessons" && (c.custom || used.has(c.id)));
  const lessons = cats.filter((c) => c.id === "grammar-lessons" || c.name === "Grammar Lessons");
  return { cards: next, categories: [...topics, ...rest, ...lessons] };
}

// Keeps the rule above true for saved data: any word or sentence sitting in
// Grammar Lessons is moved out (built-in words to their topic, the person's
// own cards to "no category"), and any grammar lesson is moved in. Nothing
// is deleted and no progress is touched. Returns null when nothing moved.
export function moveStrayCards(cards, categories) {
  const lessonIds = new Set(categories.filter(isLessonsCategory).map((c) => c.id));
  lessonIds.add(LESSONS_ID);
  const topicId = (name) => (categories.find((c) => c.name === name) || {}).id || "";
  let changed = false;
  const next = cards.map((c) => {
    const inLessons = lessonIds.has(c.category);
    if (c.type === "grammar") {
      if (inLessons) return c;
      changed = true;
      return { ...c, category: LESSONS_ID };
    }
    if (!inLessons) return c;
    changed = true;
    const meta = c.starter && c.type === "word" ? wordMetaFor(c.front) : null;
    return { ...c, category: meta && meta.topic ? topicId(meta.topic) : "" };
  });
  return changed ? next : null;
}

// Brings the built-in grammar lessons someone already has up to date with
// STARTER_GRAMMAR (new names, rules, patterns, examples, level). Only
// touches built-in lessons; runs once per GRAMMAR_VERSION.
export const GRAMMAR_VERSION = "11";

export function syncGrammarLessons(cards) {
  let changed = false;
  const next = cards.map((card) => {
    if (card.type !== "grammar" || !card.starter) return card;
    const key = card.front.trim().toLowerCase();
    const point = STARTER_GRAMMAR.find(
      (p) => p.name.toLowerCase() === key || (p.was || []).some((w) => w.toLowerCase() === key)
    );
    if (!point) return card;
    changed = true;
    return {
      ...card,
      front: point.name,
      back: point.rule,
      pattern: point.pattern,
      level: point.level,
      examples: point.examples.map(([da, en]) => ({ da, en })),
    };
  });
  return changed ? next : null;
}
