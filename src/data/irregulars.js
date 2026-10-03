// ---------- generic helpers ----------

// Shared between the Study and Library "explore related words" popups.
// A small, carefully-vetted set of common Danish irregular verbs and
// modals with their principal parts (infinitive, present, past, past
// participle). Deliberately conservative — only verbs whose forms I'm
// genuinely confident about, not an exhaustive list. When the word-
// insight feature is asked about one of these, these verified forms are
// handed to the AI as given facts to use rather than left for it to
// recall (and possibly get subtly wrong) on its own each time — the AI's
// job becomes explaining/using them naturally, not inventing them.
const IRREGULAR_VERBS = {
  være: { present: "er", past: "var", participle: "været" },
  have: { present: "har", past: "havde", participle: "haft" },
  gøre: { present: "gør", past: "gjorde", participle: "gjort" },
  gå: { present: "går", past: "gik", participle: "gået" },
  stå: { present: "står", past: "stod", participle: "stået" },
  få: { present: "får", past: "fik", participle: "fået" },
  give: { present: "giver", past: "gav", participle: "givet" },
  tage: { present: "tager", past: "tog", participle: "taget" },
  komme: { present: "kommer", past: "kom", participle: "kommet" },
  se: { present: "ser", past: "så", participle: "set" },
  vide: { present: "ved", past: "vidste", participle: "vidst" },
  sige: { present: "siger", past: "sagde", participle: "sagt" },
  ligge: { present: "ligger", past: "lå", participle: "ligget" },
  sidde: { present: "sidder", past: "sad", participle: "siddet" },
  drikke: { present: "drikker", past: "drak", participle: "drukket" },
  sove: { present: "sover", past: "sov", participle: "sovet" },
  finde: { present: "finder", past: "fandt", participle: "fundet" },
  skrive: { present: "skriver", past: "skrev", participle: "skrevet" },
  bede: { present: "beder", past: "bad", participle: "bedt" },
  blive: { present: "bliver", past: "blev", participle: "blevet" },
  falde: { present: "falder", past: "faldt", participle: "faldet" },
  holde: { present: "holder", past: "holdt", participle: "holdt" },
  løbe: { present: "løber", past: "løb", participle: "løbet" },
  synge: { present: "synger", past: "sang", participle: "sunget" },
  trække: { present: "trækker", past: "trak", participle: "trukket" },
  vinde: { present: "vinder", past: "vandt", participle: "vundet" },
  flyve: { present: "flyver", past: "fløj", participle: "fløjet" },
  slå: { present: "slår", past: "slog", participle: "slået" },
  lade: { present: "lader", past: "lod", participle: "ladet" },
  kunne: { present: "kan", past: "kunne", participle: "kunnet" },
  skulle: { present: "skal", past: "skulle", participle: "skullet" },
  ville: { present: "vil", past: "ville", participle: "villet" },
  måtte: { present: "må", past: "måtte", participle: "måttet" },
};

// A card's front might be a bare infinitive ("gå") or "at "-prefixed
// ("at forklare") depending on when it was added — normalize before
// looking up, and return a ready-to-use fact string for the AI prompt,
// or an empty string when the word isn't in the table.
export function irregularVerbFactsHint(front) {
  if (!front) return "";
  const bare = front.trim().replace(/^at\s+/i, "").toLowerCase();
  const entry = IRREGULAR_VERBS[bare];
  if (!entry) return "";
  return (
    " Verified principal forms for this verb — state these exact forms, do not alter or re-derive them: infinitive \"" +
    bare +
    "\", present \"" +
    entry.present +
    "\", past \"" +
    entry.past +
    "\", past participle \"" +
    entry.participle +
    "\"."
  );
}

// A small, carefully-vetted set of common Danish nouns whose plural form
// doesn't follow the routine -er/-e pattern — deliberately conservative,
// covering only the irregular plurals I'm genuinely confident about,
// mostly family terms and a few common body-part/object nouns. As with
// the verb table above, these are handed to the AI as verified facts
// rather than left for it to derive on its own each time.
const IRREGULAR_PLURALS = {
  barn: { indefPlural: "børn", defPlural: "børnene" },
  mand: { indefPlural: "mænd", defPlural: "mændene" },
  fod: { indefPlural: "fødder", defPlural: "fødderne" },
  rod: { indefPlural: "rødder", defPlural: "rødderne" },
  far: { indefPlural: "fædre", defPlural: "fædrene" },
  mor: { indefPlural: "mødre", defPlural: "mødrene" },
  bror: { indefPlural: "brødre", defPlural: "brødrene" },
  datter: { indefPlural: "døtre", defPlural: "døtrene" },
  søster: { indefPlural: "søstre", defPlural: "søstrene" },
  øje: { indefPlural: "øjne", defPlural: "øjnene" },
  bog: { indefPlural: "bøger", defPlural: "bøgerne" },
  nat: { indefPlural: "nætter", defPlural: "nætterne" },
  hånd: { indefPlural: "hænder", defPlural: "hænderne" },
};

// A card's front might carry a gender article ("en bog") or be bare
// ("bog") depending on how it's stored — normalize before looking up.
export function irregularPluralFactsHint(front) {
  if (!front) return "";
  const bare = front.trim().replace(/^(en|et)\s+/i, "").toLowerCase();
  const entry = IRREGULAR_PLURALS[bare];
  if (!entry) return "";
  return (
    " Verified plural forms for this noun — state these exact forms, do not alter or re-derive them: indefinite plural \"" +
    entry.indefPlural +
    "\", definite plural \"" +
    entry.defPlural +
    "\"."
  );
}
