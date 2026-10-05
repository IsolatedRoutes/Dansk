// Learners may not know grammar words, so every explanation the AI writes
// teaches the idea in everyday English, with examples, instead of naming it.
export const PLAIN_ENGLISH_RULE =
  " Write for someone who has never studied grammar: do not use grammar terms such as participle, infinitive, conjugation, declension, definite/indefinite, common/neuter gender, subject, object, clause, stem, auxiliary or inflection. Explain the idea in everyday words and show it with Danish examples instead (say \"the word for 'the dog'\", \"the form you use after 'jeg har'\", \"how it changes when it's more than one\"). If a term really can't be avoided, say it once and explain it in plain words in the same sentence. The en/et choice can be called \"en-words\" and \"et-words\". ";

// Same house style as the built-in grammar lessons, for grammar cards the
// AI writes, so everything in Grammar Lessons reads alike.
export const GRAMMAR_CARD_STYLE =
  " House style for every grammar point: the name is 'Topic: the Danish words it is about' (e.g. 'Negation: ikke', 'Plurals: -er, -e or no ending'), at most about 6 words. The explanation is 1-2 short plain-English sentences, at most 35 words, stating the rule itself first, with no grammar jargon (explain the idea in everyday words, as a learner who never studied grammar would understand). Example sentences are short, natural, complete Danish sentences with the exact words that show the grammar point wrapped in **double asterisks**, and a natural English translation without asterisks.";

export const WORD_INSIGHT_SYSTEM_PROMPT =
  "A Danish learner tapped a word or short phrase on their flashcard because they want to understand it more deeply. Respond with concrete example forms, never abstract grammatical labels on their own — show the word in use rather than naming the category it belongs to. " +
  "For a noun: give exactly these four forms in this order, each a short natural phrase with its English translation: indefinite singular, definite singular, indefinite plural, definite plural — e.g. \"en person\"/\"a person\", \"personen\"/\"the person\", \"personer\"/\"people\", \"personerne\"/\"the people\". If it has no natural plural, still give four forms where sensible, or fewer if a form genuinely doesn't exist — never invent one, and say so plainly in the explanation instead. " +
  "For a verb: give infinitive, present tense, past tense, and (when it reads naturally) present perfect, each as a short subject+verb example with its translation — e.g. \"at have\"/\"to have\", \"jeg har\"/\"I have\", \"jeg havde\"/\"I had\", \"jeg har haft\"/\"I have had\". " +
  "For an adjective: give its three agreement forms (common gender, neuter, plural/definite), each in a short phrase — e.g. \"en stor bil\"/\"a big car\", \"et stort hus\"/\"a big house\", \"store biler\"/\"big cars\". " +
  "For a preposition, adverb, or other word that doesn't inflect: instead give 2-3 short example phrases showing it in real use, each with its translation. " +
  "Then write a short explanation in plain English, 2-4 sentences, covering anything genuinely useful the forms alone don't already show — irregularities, usage notes, common mixups with a similar word. If the forms already say everything worth saying, keep the explanation to one brief sentence rather than padding it. Always finish the last sentence completely — never trail off. Never say that a word is an en-word or an et-word when the word is already shown with en or et in front — the learner can see that; mention it only for words shown without en/et. Never explain endings like -r, -de or -t as a bare rule (e.g. 'just add -r'): the forms are already listed, so say only what is surprising or irregular. Open the explanation with the Danish word in single quotes, then 'means', then the English meaning in single quotes (e.g. 'Hinanden' means 'each other'; for a noun e.g. 'En dukke' means 'a doll', never 'is the doll'). Every other Danish word or phrase you mention must be translated right where it appears. Do not repeat anything already shown in the forms list (plural, the-form, past forms). Include only facts about the word itself, no trivia about the thing it names. Never write usage fluff such as 'useful in text messages' or 'used for flavor in many dishes'; never restate the meaning in other words or say 'you say X for Y'; never contrast with English vaguely ('not like English eighty'); never describe how endings are built (add -t, doubles the ending). Any ending or form you do mention needs a concrete example with translation for every form. Never rely on an idea the learner would need prior knowledge for; show it with an example and its translation instead. Write clear, natural sentences. Every sentence must teach something specific; never write filler like 'it follows the usual pattern' or 'it is easy'." + PLAIN_ENGLISH_RULE +
  "Finally, related words: if the word has a genuinely useful word family — common Danish words built from it or sharing its root that a learner will meet, e.g. for \"tale\": \"en samtale\"/\"a conversation\", \"en aftale\"/\"an agreement\" — give 2-4 of them with translations. Only real, common words; leave the list empty rather than stretch. " +
  "Also give one short, natural example sentence, simple enough for a beginner and built mostly from everyday words. The marked word must be exactly the card's word without en/et/at (for 'et bjerg' mark bjerg, not bjerget; for 'at danse' mark danse after kan/vil/skal; for an adjective mark its base form; for a phrase mark the whole phrase). The rest of the sentence must make the meaning of the word guessable from context: never a generic frame that fits any word, like 'I need a ...', 'Det er ...' or 'I have a ...'; for a band-aid write 'Put a band-aid on the cut', not 'I need a band-aid'. Put ** around the word in the Danish sentence, like \"Jeg kan **lide** kaffe\". " +
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
