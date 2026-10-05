// Ready-made lightbulb answers for built-in words (forms, explanation,
// related words, example sentence). They live in separate files in
// `lightbulb/`, one per first letter, and are fetched only when a lightbulb is
// opened, so the app itself stays light. A word with no ready-made answer
// (your own cards, words not yet written) falls back to the live AI call.
import { frontKey } from "./text.js";

// First letter of the word, ignoring a leading en / et / at. æ ø å spelled out
// so the file names are plain.
export function lightbulbBucket(front) {
  const key = frontKey(front).replace(/^(en|et|at) /, "");
  const ch = key.charAt(0);
  if (ch === "æ") return "ae";
  if (ch === "ø") return "oe";
  if (ch === "å") return "aa";
  return /[a-z]/.test(ch) ? ch : "other";
}

const loaded = new Map(); // bucket -> Promise of { frontKey: entry }

function loadBucket(bucket) {
  if (!loaded.has(bucket)) {
    const p = fetch("lightbulb/" + bucket + ".json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    // A failed fetch must not stick: let the next tap try again.
    p.then((d) => { if (!d || !Object.keys(d).length) loaded.delete(bucket); });
    loaded.set(bucket, p);
  }
  return loaded.get(bucket);
}

// Returns { forms, explanation, related, sentence } or null.
export async function prebuiltInsight(card) {
  if (!card || !card.starter || card.type !== "word") return null;
  const data = await loadBucket(lightbulbBucket(card.front));
  const e = data && data[frontKey(card.front)];
  if (!e || !Array.isArray(e.forms) || !e.explanation) return null;
  return {
    forms: e.forms,
    explanation: e.explanation,
    related: Array.isArray(e.related) ? e.related : [],
    sentence: e.sentence && e.sentence.da && e.sentence.en ? e.sentence : null,
  };
}
