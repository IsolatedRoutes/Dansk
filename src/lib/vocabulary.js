import { frontKey } from "./text";
import WORD_DATA from "../data/words.tsv?raw";
import { TOPIC_NAMES, WORD_CATEGORY_NAMES, WORD_CLASS_CODES } from "../data/categories";

// Built once at startup from WORD_DATA: the starter deck grouped by
// category (same shape the rest of the app has always used), plus a
// lookup from Danish text to its level / verb forms / hidden gender.
export const STARTER_WORDS = {};

export const WORD_META = {};

TOPIC_NAMES.forEach((name) => (STARTER_WORDS[name] = []));

STARTER_WORDS[""] = []; // words with no topic

WORD_DATA.split("\n").forEach((line) => {
  const [da, en, code, level, forms, gender, tenseDa, tenseEn, cls, upDa, upEn] = line.split("\t");
  if (!da || !en) return;
  const topic = WORD_CATEGORY_NAMES[code] || "";
  STARTER_WORDS[topic].push([da, en]);
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
export function cardInCategory(card, filter, includeLessons = false) {
  if (filter === "all") return includeLessons || card.type !== "grammar";
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
