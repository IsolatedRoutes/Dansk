// "Add a card": one box, either language. One AI call turns what was typed into
// the whole card (both sides, topic, word type, level, level-up forms). Pure
// logic, no screens (tests/addlookup_check.mjs).
import { CATEGORY_RULE, LEVELS, aiCategoryName } from "../data/categories.js";
import { FORMS_RULE, cleanForms } from "./ownFormsCore.js";
import { cleanTranslation } from "./text.js";

export const WORD_TYPES = ["verb", "noun", "adj", "adv", "pron", "prep", "conj"];

// Word or sentence is worked out here, never asked of the learner: anything that
// ends like a sentence, or has 4+ words once a leading en/et/at is dropped.
export function cardTypeFor(danish) {
  const t = String(danish || "").trim();
  if (/[.?!]$/.test(t)) return "sentence";
  const words = t.replace(/^(en|et|at)\s+/i, "").split(/\s+/).filter(Boolean);
  return words.length >= 4 ? "sentence" : "word";
}

export const LOOKUP_SYSTEM =
  "You fill in a Danish learner's flashcard from one word or sentence typed in Danish or English. Work out which language it is written in (the learner may give a hint; the words themselves decide), then give both sides: the Danish and the natural English. " +
  "The English side must be ONLY English and the Danish side ONLY Danish, never both languages in one field. If the typed text might hold a typo, use your single best real-word reading of what was typed, never an unrelated word. " +
  "Be precise about the part of speech so the translation fits (do not confuse a verb with an adverb, or an adjective with a noun). If it is a Danish noun, include its article (en/et) with the Danish form and match it with 'a'/'an' in English only when the noun is countable that way; leave the article off both sides for uncountable nouns (anger, water). Never show an article on only one side. " +
  "Also give the single best category, the word type, and the level: " +
  LEVELS.map((l) => l.id + " = " + l.name + " (" + l.cefr + ")").join(", ") +
  ". Level by what the word or sentence is for and how common it is, not just how long it is. " +
  "wordType is one of verb, noun, adj, adv, pron, prep, conj for a single word, or an empty string for a phrase or sentence." +
  CATEGORY_RULE +
  FORMS_RULE;

export function lookupUserText(text, lang, categoryNames) {
  const hint = lang === "da" ? "The learner says this is Danish." : lang === "en" ? "The learner says this is English." : "The language is not given: detect it.";
  return (
    'Typed text: "' + text.trim() + '"\n' + hint + "\n\nExisting categories to prefer if one genuinely fits: " + (categoryNames || "(none yet)") + "." +
    '\n\nRespond ONLY with JSON, no other text: {"danish": "...", "english": "...", "category": "...", "wordType": "...", "level": 1, "forms": []}'
  );
}

// Turns the AI's JSON into what the form needs, or throws a short error.
export function readLookup(parsed) {
  const da = cleanTranslation(String((parsed && parsed.danish) || "")).trim();
  const en = cleanTranslation(String((parsed && parsed.english) || "")).trim();
  if (!da || !en) throw new Error("LOOKUP_INCOMPLETE");
  if (da.toLowerCase() === en.toLowerCase()) throw new Error("TRANSLATION_DIDNT_HAPPEN");
  const level = Number(parsed.level);
  const wordType = String(parsed.wordType || "").toLowerCase();
  return {
    da,
    en,
    category: aiCategoryName(parsed.category),
    wordType: WORD_TYPES.includes(wordType) ? wordType : "",
    level: Number.isInteger(level) && level >= 1 && level <= 4 ? level : 0,
    forms: cleanForms(parsed.forms, da) || [],
  };
}
