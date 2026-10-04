import { frontKey } from "../lib/text.js";

// "Sentences & phrases" in Study and Library: everything that is more than a
// single word. This is only a way of filtering; cards stay stored as they
// are, so nothing saved changes.
//
//  - a card made as a sentence: always
//  - any other card whose Danish side is more than one word once a leading
//    "en", "et" or "at" is taken off: yes ("ked af", "på grund af", "det går
//    godt", "hvordan går det?")
//  - single words, with or without en / et / at in front: no
//  - verbs that start with "at" and are short ("at gå glip af", "at finde
//    ud af"): no, they are verbs with a small extra word and stay with the
//    verbs; long ones (four or more words after "at", "at tage tyren ved
//    hornene") are expressions and do count
const LONG_AT_PHRASE = 4;

const onlyPunctuation = (t) => /^[/….–,;:!?-]+$/.test(t);

export function isMultiWordCard(card) {
  const front = frontKey(card.front || "");
  const isAt = /^at\s/.test(front);
  const tokens = front.replace(/^(at|en|et)\s+/, "").split(/\s+/).filter((t) => t && !onlyPunctuation(t));
  if (tokens.length <= 1) return false;
  return isAt ? tokens.length >= LONG_AT_PHRASE : true;
}

// A sentence-or-phrase card, as shown under "Sentences & phrases".
export function isSentenceCard(card) {
  if (!card) return false;
  if (card.type === "sentence") return true;
  return card.type === "word" && isMultiWordCard(card);
}

// "word" / "sentence" / "grammar", counting multi-word cards as sentences.
export function cardKind(card) {
  return isSentenceCard(card) ? "sentence" : card.type;
}

export const SENTENCES_LABEL = "Sentences & phrases";
