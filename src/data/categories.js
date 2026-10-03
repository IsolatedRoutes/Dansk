// ---------- constants ----------

export const DEFAULT_CATEGORIES = [{ id: "grammar-lessons", name: "Grammar Lessons", custom: false }];

// Grammar Lessons holds grammar lessons and nothing else. Words and
// sentences go in a topic, or in no category at all (they're still found
// through "My cards" and, for words, their grammar group).
export const LESSONS_ID = "grammar-lessons";

export const isLessonsCategory = (c) => !!c && (c.id === LESSONS_ID || c.name === "Grammar Lessons");

// Names the AI sometimes hands back as a "category" that aren't topics:
// word types (those are sorted automatically) or placeholders. Treated as
// "no category".
const NOT_A_TOPIC = new Set([
  "", "uncategorized", "uncategorised", "none", "n/a", "other", "misc", "miscellaneous", "general", "from chat",
  "grammar", "grammar lessons", "verbs", "nouns", "adjectives", "adverbs", "pronouns", "prepositions", "conjunctions",
  "verb", "noun", "adjective", "adverb", "pronoun", "preposition", "conjunction", "common nouns", "basic verbs",
  "pronouns & adverbs", "prepositions & connectors", "phrases", "words", "vocabulary",
]);

export function aiCategoryName(name) {
  const n = (name || "").trim();
  return NOT_A_TOPIC.has(n.toLowerCase()) ? "" : n;
}

// What the AI is shown as "existing categories": topics only.
export function topicNamesForAI(categories) {
  return categories.filter((c) => !isLessonsCategory(c)).map((c) => c.name).join(", ");
}

// The text added to every prompt that picks a category.
export const CATEGORY_RULE =
  " A category is a TOPIC (like Food & Drink or Travel & Transport), never a part of speech — verbs, nouns, adjectives and so on are sorted automatically. Use one of the existing categories if its topic fits; if none does, use an empty string rather than inventing one.";

// Maps retired, overlapping category names (e.g. "More Verbs") to the
// broader category that replaced them, so saved cards can be re-pointed.
export const CATEGORY_MERGE_MAP = {
  // Listed first so the existing category is renamed in place, keeping its
  // cards, before anything else is merged into it.
  "Basic Verbs": "Verbs",
  "More Verbs": "Verbs",
  "Common Actions": "Verbs",
  "People & Roles": "Common Nouns",
  "More Adjectives": "Adjectives",
  "Qualities & States": "Adjectives",
  "Time & Sequencing": "Numbers & Time",
  "Shapes & Measurements": "Numbers & Time",
  "Relationships & Social Life": "Family & People",
  "Cooking & Dining Out": "Food & Drink",
  "Housing & Real Estate": "Home & Daily Life",
  "Household Chores": "Home & Daily Life",
  "Everyday Situations": "Home & Daily Life",
  "Travel Details": "Travel & Transport",
  "Nature & Environment": "Weather & Nature",
  "Weather in Detail": "Weather & Nature",
  "Body Language & Gestures": "Body & Health",
  "Education & Learning": "Work & School",
  "Money & Personal Finance": "Work & School",
  "Emotions in Depth": "Emotions & Personality",
  "Personality Traits": "Emotions & Personality",
  "Idioms & Expressions": "Common Phrases & Idioms",
  "Opinions & Debate Language": "Common Phrases & Idioms",
  "Common Connectors": "Prepositions & Connectors",
  "Technology & Digital Life": "Technology & Media",
  "Media & Entertainment": "Technology & Media",
  "Problems & Solutions": "Abstract Concepts & Opinions",
  "Final Additions": "Abstract Concepts & Opinions",
  "Crime & Safety": "Society & Culture",
  "Science & Research": "Society & Culture",
  "Communication & Language": "Society & Culture",
  "Sports & Fitness": "Hobbies & Leisure",
};

// Ids of empty categories that may exist in older saved decks; they are
// removed when still empty.
export const LEGACY_EMPTY_CATEGORY_IDS = ["verbs", "gender", "structure", "conditional", "prepositions", "phrases", "false-friends"];

export const TYPE_LABEL = { word: "Word", sentence: "Sentence", grammar: "Grammar" };

export const TYPE_COLOR = { word: "#4C6B65", sentence: "#C1653F", grammar: "#8C6FA0" };

// Preloaded starter vocabulary — no AI involved. 8,000 words, chosen
// using a Danish word-frequency list (FrequencyWords by Hermit Dave,
// CC BY-SA 4.0 — used only to decide which words to include; no
// frequency data is shipped) plus common course vocabulary. All English
// translations are our own.
//
// One line per word: Danish, English, category code, level (1 Basic,
// 2 Intermediate, 3 Advanced, 4 Fluent), verb forms (present|past|past
// participle, verbs only), hidden gender for nouns shown without en/et
// (uncountable nouns like "vand", or "pl" for plural-only), and for verbs
// the present / past / perfect as short sentences in both languages
// ("jeg spiser|jeg spiste|jeg har spist" and "I eat|I ate|I have eaten").
//
// Consistency rules: countable nouns always carry en/et ("en hund" → "a
// dog"); uncountable nouns never do ("vand" → "water"); verbs always
// start with "at" ("at spise" → "to eat").
// Topic codes used in WORD_DATA's third column, in menu order. A word
// with no topic (a plain everyday verb or adjective, say) is only found
// through its grammar group and "All".
export const WORD_CATEGORY_NAMES = {
  GR: "Greetings & Everyday Phrases",
  PF: "People & Family",
  FP: "Feelings & Personality",
  BH: "Body & Health",
  FD: "Food & Drink",
  HH: "Home & Household",
  CS: "Clothes & Shopping",
  TC: "Time & Calendar",
  NC: "Numbers",
  CO: "Colors & Shapes",
  WN: "Weather & Nature",
  AN: "Animals",
  TT: "Travel & Transport",
  TS: "Town & Services",
  WJ: "Work & Jobs",
  SL: "School & Learning",
  MB: "Money & Business",
  TM: "Technology & Media",
  FS: "Free Time & Sports",
  CH: "Culture & Holidays",
  CL: "Countries & Languages",
  SP: "Society, Politics & Law",
  IO: "Ideas & Opinions",
};

export const TOPIC_NAMES = Object.values(WORD_CATEGORY_NAMES);

// Grammar groups: a second way into the deck, by word type rather than
// topic. Worked out from the built-in list (last column of WORD_DATA),
// or for the person's own cards from how the word looks ("at …" is a
// verb, "en …"/"et …" a noun).
export const WORD_CLASS_CODES = { v: "verb", n: "noun", a: "adj", d: "adv", p: "pron", r: "prep", c: "conj", f: "phrase", u: "num" };

export const GRAMMAR_GROUPS = [
  { id: "g:verb", cls: "verb", name: "Verbs" },
  { id: "g:noun", cls: "noun", name: "Nouns" },
  { id: "g:adj", cls: "adj", name: "Adjectives" },
  { id: "g:adv", cls: "adv", name: "Adverbs" },
  { id: "g:pron", cls: "pron", name: "Pronouns" },
  { id: "g:prep", cls: "prep", name: "Prepositions" },
  { id: "g:conj", cls: "conj", name: "Conjunctions" },
];

export const LEVELS = [
  { id: 1, name: "Basic", cefr: "A1–A2" },
  { id: 2, name: "Intermediate", cefr: "B1" },
  { id: 3, name: "Advanced", cefr: "B2–C1" },
  { id: 4, name: "Fluent", cefr: "C1–C2" },
];
