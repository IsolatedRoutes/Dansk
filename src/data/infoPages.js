// ---------- about, privacy, terms, FAQ ----------

// Shown as "Contact" in the menu once set; hidden while empty.
export const CONTACT_EMAIL = "";

export const INFO_PAGES = [
  {
    id: "about",
    title: "About",
    paragraphs: [
      "Dansk is a Danish learning app for curious people who learn from the world around them.",
      "Behind it is a deck of about 8,000 words and phrases. Browse it by level, topic or word type, with grammar lessons alongside, and shape it with your own cards and the levels you choose. The deck follows established language-learning principles: a known word returns in a new form, so you keep meeting it in context.",
      "Go deeper whenever you're curious: ask questions, understand grammar, and make connections between words.",
      "Your learning emerges from intentionally using the Danish you experience. Photograph or paste text from a sign, a menu or a news article, then use the AI assistant to translate it, analyze the sentence structure and extract key words for future study.",
      "What sets it apart: your surroundings become your classroom. There are no streaks, scores or drills, and an assistant is there for the why, whether that's grammar, word origin or any question about Danish.",
    ],
  },
  {
    id: "how",
    title: "How it works",
    sections: [
      ["Learn from your surroundings", "Photograph a sign, a menu or a page, or paste any Danish text. The app reads it, translates it and shows what is in it."],
      ["Keep what you notice", "Pick the words and phrases worth keeping from a photo or a text and turn them into cards. They go into your own deck and file under a topic."],
      ["Ask the assistant", "Go deeper on grammar, find out where a word comes from, or ask anything about a sentence or about Danish. The examples it writes use words you already know, so new things are built on familiar ground."],
      ["Analyze a sentence", "Paste a sentence to see it broken down: what each part does, why the word order is what it is, and any mistake worth fixing."],
      ["Study without drills", "Cards come by level and topic, from Basic to Fluent. There are no streaks, scores or timers. Mark a card as known when it is, and choose the levels you want to see."],
      ["Known words keep growing", "A word you know does not repeat as itself. A few days later it returns in another form, such as the past tense or the plural, one level up, within the levels you have chosen."],
      ["Explore from any card", "Ask about the word on a card, or open related words to see what sits around it."],
      ["Your deck, your cards", "Browse and search everything in the Library, edit any card, and add your own. Backup keeps a copy of your progress."],
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    paragraphs: [
      "Your cards, notes, progress and settings are stored on your device. There is no account, no advertising and no analytics.",
      "The AI features (Assistant, translating, example sentences, reading text from a photo) are optional. When you use one, the text or photo you submit is sent to the provider you chose in AI settings: Anthropic or Google with your own key, a server of your own, or a model that runs on your device. Their privacy policies apply to what you send.",
      "Your API key stays on your device and is sent only to its own provider.",
      "If you choose the on-device model, its software loads from the jsDelivr network (esm.run) and its model files from Hugging Face. Those services can see your IP address, but not your text. Chrome's built-in translator keeps your text on your device.",
      "Backups are files you save yourself. Removing the app deletes everything it stores.",
    ],
  },
  {
    id: "terms",
    title: "Terms",
    paragraphs: [
      "Dansk is a learning aid, provided as it is. The word list, translations and grammar have been checked with care, but they can contain mistakes, and AI answers can be wrong. For anything important, check with a native speaker or a dictionary.",
      "AI features run through the provider you choose, under that provider's own terms. If you use your own API key, any charges are between you and the provider.",
      "Your data lives on your device. Keep a backup if your progress matters to you.",
      "Word frequency data comes from FrequencyWords by Hermit Dave (CC BY-SA 4.0), based on OpenSubtitles.",
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    questions: [
      ["Is my progress saved?", "Yes, on this device. Use Backup in the top bar to keep a copy or move to another device."],
      ["Do I need the internet?", "Studying and the Library work offline. The AI features need a connection, and so does loading the on-device model."],
      ["What happens when I mark a word as known?", "With Unknown ticked, it leaves your study cards as itself and comes back later in other forms, one level above the word, within the levels you have chosen."],
      ["How are the levels decided?", "By what a word is for. Everyday words and the ones you need for forms, travel, health and ordering food are Basic. More specific, abstract or longer words come later."],
      ["Do I need an API key?", "Only if you want AI features through Anthropic or Google. The on-device model in AI settings needs no key, but takes a large download and a recent browser."],
    ],
  },
];
