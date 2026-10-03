import { frontKey } from "./text";
import { WORD_META, tenseDataFor } from "./vocabulary";

// ---------- Level-up: known words come back in a new form ----------
// A word marked known never comes back as itself. Instead it returns,
// a few days later, once in each of its other forms: a verb in the past
// and the perfect (jeg gik, jeg er gået), a noun as "the …" and in the
// plural (bogen, bøger), an adjective compared (større, størst). Each
// form is shown once; then the word is done. Seeing it counts — there
// is no right/wrong, and nothing ever takes "known" away.
const DAY_MS = 24 * 60 * 60 * 1000;

export const LEVELUP_FIRST_GAP = 3 * DAY_MS; // known → first new form

export const LEVELUP_NEXT_GAP = 7 * DAY_MS; // first form → second form

// Known cards with no start date begin on this date, staggered over three
// weeks so their forms don't all arrive at once.
const LEVELUP_START = Date.UTC(2026, 9, 2);

export function levelUpFormsFor(card) {
  if (!card || card.type !== "word") return [];
  const t = tenseDataFor(card);
  if (t) return [1, 2].filter((i) => t.da[i] && t.en[i]).map((i) => ({ da: t.da[i], en: t.en[i] }));
  const meta = WORD_META[frontKey(card.front)];
  if (!meta || !meta.upDa || !meta.upEn) return [];
  return meta.upDa.map((da, i) => ({ da, en: meta.upEn[i] })).filter((f) => f.da && f.en);
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// When this known card's next new form is due (ms), or null when it has
// nothing left to show.
export function levelUpDueAt(card) {
  if (!card.known || card.ignored) return null;
  const stage = card.upStage || 0;
  if (stage >= levelUpFormsFor(card).length) return null;
  if (card.upDue) return card.upDue;
  return LEVELUP_START + (hashString(card.id || card.front || "") % 21) * DAY_MS;
}
