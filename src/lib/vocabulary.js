import { frontKey } from "./text";
import { isSentenceCard } from "../data/sentenceCards";
import WORD_DATA from "../data/words.tsv?raw";
import { TOPIC_NAMES, WORD_CATEGORY_NAMES, WORD_CLASS_CODES } from "../data/categories";

// Built once at startup from WORD_DATA: the starter deck grouped by
// category (same shape the rest of the app has always used), plus a
// lookup from Danish text to its level / verb forms / hidden gender.
export const STARTER_WORDS = {};

export const WORD_META = {};

// Words the built-in deck spells with a capital (countries, acronyms,
// "Copenhagen"), so they keep it when someone adds the same word.
const CAPITAL_WORDS = new Set();
const ARTICLE = /^(en|et|at|a|an|the|to)\s+/i;
const noArticle = (text) => text.replace(ARTICLE, "");

TOPIC_NAMES.forEach((name) => (STARTER_WORDS[name] = []));

STARTER_WORDS[""] = []; // words with no topic

WORD_DATA.split("\n").forEach((line) => {
  const [da, en, code, level, forms, gender, tenseDa, tenseEn, cls, upDa, upEn] = line.split("\t");
  if (!da || !en) return;
  const topic = WORD_CATEGORY_NAMES[code] || "";
  STARTER_WORDS[topic].push([da, en]);
  for (const side of [da, en]) {
    const core = noArticle(side);
    if (/^[A-ZÆØÅ]/.test(core)) CAPITAL_WORDS.add(core.toLowerCase());
  }
  WORD_META[frontKey(da)] = {
    level: Number(level) || 0,
    forms: forms || "",
    gender: gender || "",
    topic,
    cls: WORD_CLASS_CODES[cls] || "",
    // Full example forms for the tense option, e.g. "jeg spiste" / "I ate".
    tenseDa: tenseDa ? tenseDa.split("|") : null,
    tenseEn: tenseEn ? tenseEn.split("|") : null,
    // Other forms of a noun (the book, books) or adjective (bigger,
    // biggest), shown once each after the word is known.
    upDa: upDa ? upDa.split("|") : null,
    upEn: upEn ? upEn.split("|") : null,
  };
});

// Word type for a card: from the built-in list when it's there, then any
// type remembered on the card itself, then a guess from its shape.
export function wordClassFor(card) {
  if (!card || card.type !== "word") return "";
  const meta = WORD_META[frontKey(card.front)];
  if (meta && meta.cls) return meta.cls;
  if (card.pos) return card.pos;
  const f = frontKey(card.front);
  if (f.startsWith("at ")) return "verb";
  if (f.startsWith("en ") || f.startsWith("et ")) return "noun";
  return "";
}

// "en" / "et" (or "" when unknown / plural-only) for a noun card.
export function nounGenderFor(card) {
  const f = frontKey(card.front);
  if (f.startsWith("en ")) return "en";
  if (f.startsWith("et ")) return "et";
  const g = card.gender || (WORD_META[f] || {}).gender || "";
  return g === "en" || g === "et" ? g : "";
}

// Whether a card belongs to what's picked in a category menu: "all", a
// category id, or a grammar group ("g:verb" …). Grammar lesson cards
// only show when their own category is picked.
export const SENTENCES_FILTER = "t:sentences";

export function cardInCategory(card, filter, includeLessons = false) {
  if (filter === "all") return includeLessons || card.type !== "grammar";
  // "Sentences": every sentence card (made from the lightbulb, the Assistant,
  // a photo or typed in), wherever its topic is.
  if (filter === SENTENCES_FILTER) return isSentenceCard(card);
  if (filter.startsWith("g:")) return wordClassFor(card) === filter.slice(2);
  return card.category === filter;
}

// Tense sentences for a verb card ({ da: [present, past, perfect], en: [...] }),
// or null when the card isn't a verb from the built-in list.
export function tenseDataFor(card) {
  if (!card || card.type !== "word") return null;
  const meta = WORD_META[frontKey(card.front)];
  return meta && meta.tenseDa && meta.tenseEn ? { da: meta.tenseDa, en: meta.tenseEn } : null;
}

// Base words (gå, tid, god …) inside a phrase card, for putting phrases
// of words you know near the front of a session.
export function phraseWords(card) {
  return (card.front || "")
    .toLowerCase()
    .replace(/^(at|en|et)\s+/, "")
    .split(/[\s.…?!/,]+/)
    .filter(Boolean);
}

// Looks up level / verb forms for any word card whose Danish text is in
// the built-in list — including a card the person added themselves that
// happens to match — so filters and the verb drill work for those too.
export function wordMetaFor(front) {
  return WORD_META[frontKey(front)] || null;
}

// Words and phrases are written in lowercase, apart from names, acronyms and
// the English "I". A leading capital that is only there because a keyboard
// or an AI started the text like a sentence ("Hund", "A dog") is lowered.
function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

function lowerSide(text, other) {
  const t = (text || "").trim();
  if (!t) return t;
  const m = t.match(/^(en|et|at|a|an|the|to)\s+/i);
  const article = m ? m[0].toLowerCase() : "";
  const core = m ? t.slice(m[0].length) : t;
  if (!/^[A-ZÆØÅ]/.test(core)) return article + core;
  if (/^I(\b|')/.test(core)) return t; // the English pronoun
  if (core === core.toUpperCase() || /\d/.test(core)) return t; // acronyms
  if (/[A-ZÆØÅ]/.test(core.slice(1))) return t; // names like "New York"
  const lower = core.toLowerCase();
  if (CAPITAL_WORDS.has(lower)) return t;
  // The same name, or nearly, on both sides (Odense / Odense, Danmark / Denmark).
  const otherCore = noArticle((other || "").trim()).toLowerCase();
  if (/^[A-ZÆØÅ]/.test(noArticle((other || "").trim())) && (otherCore === lower || (lower.length >= 5 && editDistance(lower, otherCore) <= 2))) return t;
  return article + lower[0] + core.slice(1);
}

export function tidyWordCase(front, back) {
  return { front: lowerSide(front, back), back: lowerSide(back, front) };
}

// One-time cleanup of the person's own word cards. Returns null when nothing changed.
export function tidyOwnWordCases(cards) {
  let changed = false;
  const next = cards.map((c) => {
    if (c.type !== "word" || c.starter) return c;
    const { front, back } = tidyWordCase(c.front, c.back);
    if (front === c.front && back === c.back) return c;
    changed = true;
    return { ...c, front, back };
  });
  return changed ? next : null;
}
