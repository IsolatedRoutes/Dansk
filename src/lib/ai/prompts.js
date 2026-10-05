// Owner's quality bar for everything the AI writes to teach (see CLAUDE.md,
// "Lightbulb answer quality bar"). Shared by every explaining prompt.
export const CLARITY_RULES =
  " Clarity rules: every Danish word, phrase or sentence you mention comes with its English translation right beside it. Teach with a few tiny, translated example contrasts, never with abstract descriptions (not 'the person doing something' or 'the one it happens to'). Never rely on an idea the learner would need prior knowledge for; show it with an example. Every sentence must teach something specific and be clear on its own: no filler ('it is easy', 'it follows the usual pattern', 'learn it as a fixed phrase'), no trivia about the thing a word names, no vague contrasts with English, no half-explained rules, and no repeating the same point in other words. Check every claim against your own examples and against real Danish; if you are not sure a rule is exact, say 'usually' or leave it out. ";

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
  "EXPLANATION. 1-4 sentences, as short as the useful content allows (never padded), finishing the last sentence completely. Open with the Danish word in single quotes, then 'means', then the English meaning in single quotes: 'Hinanden' means 'each other'; for a noun 'En dukke' means 'a doll' (never 'is the doll'). Then say only what the forms and example do not already show: a real mix-up with a similar word, a surprising spelling or form (shown with a translated example), how the word is built ('made of A (…) and B (…)'), or how it is really used. Never repeat the forms (plural, the-form, past forms), never describe how endings are built (add -t, doubles the ending), never say a word is an en-word or et-word when it is already shown with en/et, never say 'you say X for Y' or restate the meaning in other words. Include only facts about the word itself. Mention another Danish word only to prevent a real mix-up, to show how a word is built, or to show a usage contrast with an example; never pad with opposites, family words or partners that are already in the related list. Never claim a little word 'must' or 'is part of' a phrase if your own examples drop it. For small everyday words that are hard to picture (me/myself, some/any/no, this/that, it) teach with two or three tiny translated example contrasts. Model of the right style and length, for 'hvad': 'Hvad' means 'what' and asks about a thing: 'Hvad er det?' (What is that?). For a person use 'hvem': 'Hvem er det?' (Who is that?). Said alone, 'Hvad?' means 'Pardon?', but it can sound blunt, so 'Undskyld?' (Excuse me?) is more polite." + PLAIN_ENGLISH_RULE +
  "RELATED. If the word has a genuinely useful word family, or a real look-alike, give 2-4 common Danish words with translations. Only real, common words; leave the list empty rather than stretch. " +
  "SENTENCE. One short, natural example sentence, simple enough for a beginner, built mostly from everyday words. The ** marked word must be exactly the card's word without en/et/at (for 'et bjerg' mark bjerg, not bjerget; for 'at danse' mark danse after kan/vil/skal; for a describing word its base form; for a phrase the whole phrase). The rest of the sentence must make the meaning guessable from context: never a generic frame that fits any word ('I need a ...', 'Det er ...', 'I have a ...'); for a band-aid write 'Put a band-aid on the cut', not 'I need a band-aid'. Put ** around the word in the Danish sentence, like \"Jeg kan **lide** kaffe\". " +
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
