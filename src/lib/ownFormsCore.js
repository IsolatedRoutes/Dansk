// Level-up forms for the learner's own word cards (pure logic).
// Built-in words carry their forms in words.tsv. A card made by an AI feature
// (photo, text, translate, Assistant) gets `upForms` ([{da, en}]) from the SAME
// AI answer that made the card, so there is never an extra call. A card typed in
// by hand has none and simply has no level-up.

// Added to the prompts of the features above (single words only).
export const FORMS_RULE =
  ' For each item of type "word" that is a single noun (en/et + word), verb (at + word) or describing word, also give "forms": a noun gets the word with \'the\' on the end (e.g. "hunden" / "the dog") then more than one (e.g. "hunde" / "dogs"); a verb gets the past then the perfect, each with \'jeg\' in front (e.g. "jeg spiste" / "I ate", "jeg har spist" / "I have eaten"); a describing word gets the \'more\' then the \'most\' form (e.g. "større" / "bigger", "størst" / "biggest"). Written as [{"da": "...", "en": "..."}]. Only real Danish forms; for phrases, sentences or words that do not change, use an empty list [].';

const clean = (t) => String(t == null ? "" : t).replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

// Checks one card's forms: at most 3, short, both sides present, none equal to
// the card's own word. Anything doubtful is dropped (no form is better than a wrong one).
export function cleanForms(list, front) {
  if (!Array.isArray(list)) return null;
  const own = clean(front).toLowerCase();
  const out = [];
  for (const f of list.slice(0, 3)) {
    const da = clean(f && f.da);
    const en = clean(f && f.en);
    if (!da || !en || da.length > 40 || en.length > 40) continue;
    if (da.toLowerCase() === own || out.some((o) => o.da.toLowerCase() === da.toLowerCase())) continue;
    if (/[<>{}[\]]/.test(da + en)) continue;
    out.push({ da, en });
  }
  return out;
}

// Spread into a new card: { upForms } for a word the AI gave forms for, else nothing.
export function formsField(type, front, raw) {
  if (type !== "word") return {};
  const forms = cleanForms(raw, front);
  return forms && forms.length ? { upForms: forms } : {};
}
