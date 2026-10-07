// Owner's quality bar for everything the AI writes to teach (see CLAUDE.md,
// "Lightbulb answer quality bar"). Shared by every explaining prompt.
export const CLARITY_RULES =
  " Clarity rules: write correct, clear English (American spelling): put a comma after an opening phrase (\"For the sport, you leave out en\") but none inside a clause (\"To say what you are, use\"), and keep to one idea per sentence. Every Danish word, phrase or sentence you mention comes with its English translation right beside it. Teach with a few tiny, translated example contrasts, never with abstract descriptions (not 'the person doing something' or 'the one it happens to'). Never rely on an idea the learner would need prior knowledge for; show it with an example. Every sentence must teach something specific and be clear on its own: no filler ('it is easy', 'it follows the usual pattern', 'learn it as a fixed phrase'), no trivia about the thing a word names, no vague contrasts with English, no half-explained rules, and no repeating the same point in other words. Check every claim against your own examples and against real Danish; if you are not sure a rule is exact, say 'usually' or leave it out. ";

// Learners may not know grammar words, so every explanation the AI writes
// teaches the idea in everyday English, with examples, instead of naming it.
export const PLAIN_ENGLISH_RULE =
  " Write for someone who has never studied grammar: do not use grammar terms such as participle, infinitive, conjugation, declension, definite/indefinite, common/neuter gender, subject, object, clause, stem, auxiliary, inflection, pronoun, preposition or adverb. Explain the idea in everyday words and show it with Danish examples instead (say \"the word for 'the dog'\", \"the form you use after 'jeg har'\", \"how it changes when it's more than one\"). If a term really can't be avoided, say it once and explain it in plain words in the same sentence. The en/et choice can be called \"en-words\" and \"et-words\". " + CLARITY_RULES;

// Same house style as the built-in grammar lessons, for grammar cards the
// AI writes, so everything in Grammar Lessons reads alike.
export const GRAMMAR_CARD_STYLE =
  " House style for every grammar point: the name is 'Topic: the Danish words it is about' (e.g. 'Negation: ikke', 'Plurals: -er, -e or no ending'), at most about 6 words. The explanation is 1-2 short plain-English sentences, at most 35 words, stating the rule itself first, with no grammar jargon (explain the idea in everyday words, as a learner who never studied grammar would understand). Example sentences are short, natural, complete Danish sentences with the exact words that show the grammar point wrapped in **double asterisks**, and a natural English translation without asterisks. Every example must make the point visible by itself, with the right words in the right form, and never be a generic sentence that would fit any rule. Never name a grammar term in the explanation without showing it in a translated example.";

export const WORD_INSIGHT_SYSTEM_PROMPT =
  "A Danish learner tapped a word or short phrase on their flashcard because they want to understand it more deeply. Respond with concrete example forms, never abstract grammatical labels on their own: show the word in use rather than naming the category it belongs to. " +
  "FORMS. For a noun give exactly these four forms in this order, each a short natural phrase with its English translation: a (en/et + word), the (word + ending), more than one, the more than one, e.g. \"en person\"/\"a person\", \"personen\"/\"the person\", \"personer\"/\"people\", \"personerne\"/\"the people\". Use fewer only if a form genuinely does not exist, never invent one. " +
  "For a verb give: at + verb, jeg present, jeg past, jeg har + the 'have' form, each with its translation, e.g. \"at have\"/\"to have\", \"jeg har\"/\"I have\", \"jeg havde\"/\"I had\", \"jeg har haft\"/\"I have had\". " +
  "For a describing word give its three forms, e.g. \"en stor bil\"/\"a big car\", \"et stort hus\"/\"a big house\", \"store biler\"/\"big cars\". " +
  "For any other kind of word give 2-3 short example phrases showing it in real use, each with its translation. " +
  "EXPLANATION. 1-4 sentences, as short as the useful content allows (never padded), finishing the last sentence completely. Open with the Danish word in single quotes, then 'means', then the English meaning in single quotes: 'Hinanden' means 'each other'; for a noun 'En dukke' means 'a doll' (never 'is the doll'). Then tell the learner something real about the word itself (what the thing is or does, where or how it is used, how it differs from a look-alike, how it is built); example sentences may support that, but never stand in for it, and never use the same example as the SENTENCE below. Add an example sentence to the explanation ONLY if it shows something the forms and the SENTENCE do not (a real contrast, a different use); never a second example of the same meaning. Prefer explaining how a small part works (for 'at runde op' how 'op' works, with 'at skrive op' (to write down)) so the lesson helps with other words. Never let the explanation be only what the word is built from (for 'en cykellås' not just 'built from cykel (bike) and lås (lock)'): it must also teach something real about the word, such as what it is used for, a mix-up with a look-alike, or how a part works and where else it appears; the build may stay only as support. Never state that a word can be used in some way without saying how, with a short translated example (not just 'also a polite ending on a request'). Say only what the forms and example do not already show: a real mix-up with a similar word, a surprising spelling or form (shown with a translated example), how the word is built ('made of A (…) and B (…)'), or how it is really used. Never repeat the forms (plural, the-form, past forms), never describe how endings are built (add -t, doubles the ending), never say a word is an en-word or et-word when it is already shown with en/et, never say 'you say X for Y' or restate the meaning in other words. Include only facts about the word itself. Mention another Danish word only to prevent a real mix-up, to show how a word is built, or to show a usage contrast with an example; never pad with opposites, family words or partners that are already in the related list. Never claim a little word 'must' or 'is part of' a phrase if your own examples drop it. For small everyday words that are hard to picture (me/myself, some/any/no, this/that, it) teach with two or three tiny translated example contrasts. Quotation marks go ONLY around the opening Danish word and the English meanings after 'means'; write every other Danish word or example WITHOUT quotation marks, with its English in brackets right after, so the text stays calm to read. Model of the right style and length, for 'hvad': 'Hvad' means 'what' and asks about a thing: Hvad er det? (What is that?). For a person use hvem: Hvem er det? (Who is that?). Said alone, Hvad? means 'Pardon?', but it can sound blunt, so Undskyld? (Excuse me?) is more polite." + PLAIN_ENGLISH_RULE +
  "RELATED. Give 3-4 common Danish words with translations, and ONLY words truly related to this word in the sense of this card: the same word family (kende → bekendt, genkende), a real look-alike the learner could mix up (kende vs vide), a true opposite or close synonym, or a closely linked partner in the same small set (days, family members, colours). Never a word that merely appears in your example sentence or explanation or just belongs to the same topic (not 'ven' for kende, not 'himmel' for blå). Do not repeat the card's own forms, never list a word you already mention in the EXPLANATION (the related list must add new words), and never list a word that is simply part of the card's own phrase (for 'at tage medicin' not 'at tage' or 'medicin'). Always give 3 or 4: if the word family is small, use a true opposite or synonym, a look-alike, or members of the same small set (colours, days, family, numbers, clothes). " +
  "SENTENCE. One short, natural example sentence matched to the word's level: for a Basic (beginner) word at most 8 words and a single clause (no ', so …' or ', because …'), built from everyday words, adding at most one small new thing so the learner levels up just a little; Intermediate and above may be a little longer and richer. The ** marked word must be exactly the card's word without en/et/at (for 'et bjerg' mark bjerg, not bjerget; for 'at danse' mark danse after kan/vil/skal; for a describing word its base form; for a phrase the whole phrase). The rest of the sentence must make the meaning guessable from context, and should be the best defining context for the word: say what the thing is made of or used for, where it is found, what it does or what it contrasts with, never an incidental action (for 'en planke' write 'Gulvet er lavet af planker' (The floor is made of planks), not 'He carries a plank into the house'): never a generic frame that fits any word ('I need a ...', 'Det er ...', 'I have a ...'); for a band-aid write 'Put a band-aid on the cut', not 'I need a band-aid'. Put ** around the word in the Danish sentence, like \"Jeg kan **lide** kaffe\". " +
  'Respond ONLY with JSON, no other text: {"forms": [{"da": "...", "en": "..."}], "explanation": "...", "related": [{"da": "...", "en": "..."}], "sentence": {"da": "...", "en": "..."}} — 3-4 entries in forms for nouns/verbs/adjectives, 2-3 for other word types; related may be empty.';


// Words the learner has marked known, kept up to date by the app, so the
// AI can build its example phrases and sentences out of familiar words:
// the only new thing in an example is then the word or rule being taught,
// and every example quietly reviews words already learned.
let knownWordsForAI = [];

export function setKnownWordsForAI(cards) {
  knownWordsForAI = cards
    .filter((c) => c.known && c.type === "word" && !c.ignored)
    .map((c) => c.front.replace(/^(at|en|et)\s+/i, "").trim())
    .filter((w) => w && w.split(/\s+/).length <= 2);
}

export function knownWordsHint() {
  if (knownWordsForAI.length < 20) return "";
  const pick = [...knownWordsForAI];
  for (let i = pick.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pick[i], pick[j]] = [pick[j], pick[i]];
  }
  return (
    " Words this learner already knows: " +
    pick.slice(0, 80).join(", ") +
    ". Where it reads naturally, build example phrases and sentences from these and other very common words, so the word or rule being taught is the only new thing in each example."
  );
}

// "Analyze sentence" (text and photo). Not a full breakdown: the AI teaches one
// or two things worth knowing that this text shows about Danish, in plain words,
// and says when something works like English. The topic hints are examples of
// what it MAY talk about, not a checklist. Use CLARITY_RULES, not
// PLAIN_ENGLISH_RULE, with this prompt (a few grammar words are allowed).
export const SENTENCE_ANALYSIS_RULES =
  " Your job is NOT a full breakdown. Help the learner learn something worth knowing from this text: pick the ONE or TWO most useful or surprising things it shows about Danish, and skip anything trivial or anything that works the same as English. If the text is long, choose the single sentence that teaches the most. " +
  "Topics you might pick (examples only, not a checklist): a little word that changes a verb (handle om, tage på), a fixed phrase or idiom, how Danish says something differently from English, a plural or ending that behaves unusually, en or et, a compound word and what it is built from, word order when a sentence starts with something other than the subject, where ikke and small words go, commas, helping verbs, the past, formal versus everyday wording, and for advanced learners things like hypotheticals, 'it is said' with skal, or longer joining words. " +
  "Write in plain words. You may use only these grammar words: verb, subject, noun, plural, past. Say everything else in everyday words with a short example. Be exact: say what comes first and what comes after, quoting the words; never write 'in front', 'next to', 'flips', 'nothing', 'position' or 'second place'. " +
  "Be accurate: before you write a point, check it against the text. Never claim a rule the text does not actually show (for example, never call a word order flipped when the subject comes first). If you are not sure, leave the point out or say you are not sure. " +
  "Do not repeat the whole sentence; quote only the small piece a point is about. Do not use asterisks or any other markdown. " +
  "For each point give: title (the small piece and what it means, like 'handlede om = was about', or a short plain title); literal (that piece word for word in English keeping the Danish order, ONLY when it helps to see the difference, otherwise an empty string); explanation (2-4 short sentences: what is different from English and what each part does, with every Danish word followed by its English); more (optional: 1-3 short lines with other examples of the same pattern or another useful fact such as what a compound is built from, each Danish word with its English; an empty string if there is nothing worth adding). " +
  "sameAsEnglish: one short sentence when the structure of the text works the same as English (for example 'The word order is the same as English.'), otherwise an empty string. " +
  "correctionNote: if the Danish the learner wrote has a mistake, one or two sentences saying what is wrong, what it should be, and why, with the right Danish and its English beside it; an empty string when there is nothing to correct.";

export const SENTENCE_ANALYSIS_JSON =
  '\n\nRespond ONLY with JSON in this exact shape, no other text: {"correctionNote": "...", "sameAsEnglish": "...", "points": [{"title": "...", "literal": "...", "explanation": "...", "more": "..."}]}';
