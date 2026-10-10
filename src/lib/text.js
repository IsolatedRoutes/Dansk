// Danish letters can arrive as one character (å) or as a plain letter plus
// a combining mark (a + ˚), which look identical but are not equal. Saved
// text is kept in the single-character form so sorting, search and
// duplicate checks agree.
export const nfc = (s) => (typeof s === "string" ? s.normalize("NFC") : s);

export function normalizeCardText(cards) {
  let changed = false;
  const next = cards.map((c) => {
    const front = nfc(c.front);
    const back = nfc(c.back);
    const notes = nfc(c.notes);
    if (front === c.front && back === c.back && notes === c.notes) return c;
    changed = true;
    return { ...c, front, back, notes };
  });
  return changed ? next : cards;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function parseJSONLoose(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const body = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(body);
}

// Defensive cleanup for translation results: even with explicit prompt
// instructions not to, models occasionally echo both languages (e.g.
// "en hest / a horse" when only "a horse" was asked for). If that exact
// pattern shows up, keep just the actual answer after the last slash.
export function cleanTranslation(text) {
  if (!text) return text;
  const parts = text.split(/\s*\/\s*/);
  return parts.length > 1 ? parts[parts.length - 1].trim() : text.trim();
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

// How a card's Danish text is matched and compared. Case is ignored, except
// for the pronoun "I" (you, plural), which is a different word from the
// preposition "i" (in).
export function frontKey(front) {
  const text = (front || "").trim();
  return text === "I" ? text : text.toLowerCase();
}

// A quick local guess, used only if the AI's own language check gives no usable
// answer: true = English, false = Danish. Danish letters or common Danish words
// win; common English words make it English; otherwise it is called Danish
// (and translate tries the other direction if nothing changes).
const EN_WORDS = new Set("the is are was were and to of a an in on you your my me we they he she it this that what how where when why who with for from have has do does not be been will would can could i'm it's don't".split(" "));
const DA_WORDS = new Set("og er jeg det den de du har til med på af for som ikke en et at vi han hun hvad hvor hvordan hvorfor hvem min din dig mig os var kan vil skal blive været der her så men eller om fra".split(" "));
export function guessEnglish(text) {
  const t = String(text || "").toLowerCase();
  if (/[æøå]/.test(t)) return false;
  const words = t.match(/[a-zæøå']+/g) || [];
  let en = 0;
  let da = 0;
  for (const w of words) {
    if (EN_WORDS.has(w)) en++;
    if (DA_WORDS.has(w)) da++;
  }
  return en > da;
}
