// ---------- about, privacy, terms, FAQ ----------

// Shown as "Contact" in the menu once set; hidden while empty.
export const CONTACT_EMAIL = "";

export const INFO_PAGES = [
  {
    id: "about",
    title: "About",
    paragraphs: [
      "Broen\u2014meaning \u201cThe Bridge\u201d\u2014is a Danish learning app for curious people who learn best by tapping into the world around them.",
      "It\u2019s built on a deck of about 8,000 words and phrases that you can add to by uploading photos and text from the real Danish you encounter in your daily life.",
      "Go deeper whenever you\u2019re curious: The AI companion enables you to ask questions, deep dive on grammar, and make connections between words. Each card allows you to hear the Danish read aloud.",
      "You can upload a photo or paste Danish text and the AI assistant will translate it, analyze the sentence structure, and pick out key words that you can turn into cards you keep and review.",
      "Broen organizes your learning based on your level and area of grammatical focus. It uses smart repetition, based on established language-learning principles.",
    ],
  },
  {
    id: "how",
    title: "How it works",
    sections: [
      [
        "The deck: Danish words and phrases",
        "Broen comes with about 8,000 Danish words and phrases. The Study tab shows them one card at a time, with the Danish on the front. Tap a card to flip it and see the English. Tap Next, or swipe the card left, for the next card. Tap Back, or swipe right, to return to the one before. Each card has a few icons:",
        [
          ["tap", "Flip", "Tap anywhere on the card to turn it over."],
          ["speaker", "Speaker", "Hear the Danish read aloud."],
          ["star", "Star (top left)", "Star a card you want to see more often. It comes up several times in a session until you un-star it."],
          ["check", "Check (top right)", "Tap it when you know the word. It leaves your study cards, then returns a few days later in another form. See Known words come back in new forms."],
          ["bulb", "Lightbulb (bottom left)", "Get an explanation of the word: where it comes from, how it is used, and related words. Needs your AI to be set up. See Set up your AI."],
          ["question", "Question mark (bottom right)", "Ask your own question about the word, for example why it is spelled that way or how to use it in a sentence. Needs your AI to be set up."],
        ],
      ],
      ["Choose what to study", "The menus at the top of the Study tab decide which cards you see. The first menu picks all cards, only the cards you added, a topic such as Food & Drink, a word type such as verbs or nouns, or a grammar lesson. Under verbs and nouns you can also choose which forms to show, such as past tense or en/et. The second menu picks your levels: Basic, Intermediate, Advanced and Fluent. With none ticked you see every level, and the app opens on all levels each time. Unknown, when ticked, hides words you have marked as known. Starred shows only your starred cards. The Dansk → English button switches which language is on the front of the card."],
      ["Known words come back in new forms", "A word you mark as known does not repeat as itself. A few days later it returns in another form, such as the past tense of a verb or the plural of a noun, and about a week after that in its next form. On those cards the check starts empty. Tap it if you know that form too. Once a word has shown all its forms, it is finished. There are no streaks, scores or timers."],
      ["Browse and search the Library", "The Library tab lists every card, grouped by letter from A to Å. Type in the search box to find a word. Filters narrow the list by Known or Unknown, by topic, and by whether the card is yours or part of the starter deck. On each card you can star it, hide it from Study (Ignore), hear it, explore related words, edit it, or delete it."],
      ["Add your own cards", "The Add tab lets you make cards of your own: a word, a sentence, or a grammar note. Type the Danish and the English, choose a topic if you like, and tap Add card. With your AI set up, Fill in translation writes the English for you. Your cards join the deck, and Filters in the Library can show just My cards."],
      ["Learn from your surroundings", "In the Assistant tab, choose Photo to photograph a sign, a menu or a page of text, or Translate to paste Danish text. You can then tap Translate for a full translation, Analyze sentence for a breakdown of its grammar, or Extract text to find the words worth learning. Pick the ones you want and they become cards in your own deck, filed under a topic. Needs your AI to be set up."],
      ["Ask the assistant", "In the Assistant tab, choose Chat and ask anything about Danish: grammar, where a word comes from, or what a phrase means. You can also tell it to make cards for you, for example “make 10 cards with vocabulary about travel”. Needs your AI to be set up."],
      ["Set up your AI", "The AI features are part of Broen, but they run through your own account with an AI company, so your questions and photos go straight to that company and never through us. Tap AI settings at the top of the screen and tap I agree. Then follow the link for Claude (Anthropic) or Gemini (Google), create an account and a key on their site, copy the key, and paste it in. You pay the company only for what you use: a question costs well under a cent and a photo roughly a cent or two. Studying and the Library never need AI."],
      ["Back up your progress", "Your cards and progress are stored on your device. Tap Backup at the top of the screen and choose Export to save a file, or Import to bring one back. This is also how you move to a new phone. Turn on automatic backups to get a one-tap reminder once a week when something has changed."],
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    sections: [
      ["What stays on your device", "Your cards, notes, progress and settings are stored on your device. There is no account, no advertising and no analytics. We do not collect your data."],
      ["What leaves your device", "Only the AI features send anything out, and only when you tap them. The text or photo you submit goes to the provider you chose in AI settings: Anthropic (Claude), Google (Gemini), or a server of your own. Their privacy policies apply to what you send. Broen asks you to agree before the first use. If you use Google’s free Gemini tier, Google may use what you send to improve its products."],
      ["Your API key", "Your API key is stored on your device and is sent only to the company that issued it."],
      ["On-device options", "In the web version, you can choose an AI model that runs on your device. It downloads its model files once, from Hugging Face and GitHub, which can see your IP address but not your text. After that, your text is processed on your device. Chrome’s built-in translator also keeps your text on your device."],
      ["Camera and photos", "The app asks your device for the camera or photos only when you choose to take or pick a picture to read. It never uses your microphone or location."],
      ["Backups and deleting", "Backups are files you save yourself. Removing the app deletes everything it stores."],
    ],
  },
  {
    id: "terms",
    title: "Terms",
    sections: [
      ["A learning aid", "Broen is a learning aid, provided as it is. The word list, translations and grammar have been checked with care, but they can contain mistakes. For anything important, check with a native speaker or a dictionary."],
      ["AI features", "AI answers can be wrong. AI features run through the provider you choose, under that provider’s own terms. If you use your own API key, any charges are between you and the provider."],
      ["Your data", "Your data lives on your device. Keep a backup if your progress matters to you."],
      ["Credits", "Word frequency data comes from FrequencyWords by Hermit Dave (CC BY-SA 4.0), based on OpenSubtitles."],
    ],
  },
  {
    id: "faq",
    title: "FAQ",
    questions: [
      ["What is Broen?", "Broen (Danish for “the bridge”) is an app for learning Danish. It comes with about 8,000 Danish words and phrases, each on its own flashcard. You flip through the cards to learn them, and you can add your own, including words from photos and text you come across in everyday life."],
      ["How do I study?", "Open the Study tab at the bottom of the screen. You see one card at a time with a Danish word or phrase on the front. Tap the card to flip it and see the English. Tap Next, or swipe left, to move on, and tap Back, or swipe right, to return. There are no streaks, scores or timers, so you can go at your own pace."],
      ["Is it free? Do I need an account?", "Broen is free and has no account or sign-in. Your cards and progress stay on your device. Only the optional AI features cost anything, and only if you choose to use them."],
      ["What do the icons on a card mean?", "Star (top left): see this card more often. Check (top right): you know this word, so it leaves your study cards. Lightbulb (bottom left): an AI explanation of the word. Question mark (bottom right): ask the AI your own question about the word. Speaker (next to the word): hear the Danish read aloud. The lightbulb and question mark need your AI to be set up."],
      ["What do the options at the top of the Study screen do?", "The first menu chooses which cards you study: all cards, only your own, a topic, a word type or a grammar lesson. The second menu chooses your levels, from Basic to Fluent. With none ticked you see every level, and the app opens on all levels each time. Unknown, when ticked, hides words you have marked as known. Starred shows only the cards you have starred. The Dansk → English button switches which language is on the front."],
      ["What happens when I mark a word as known?", "Tap the check in the top right corner of the card. The word leaves your study cards, as long as Unknown is ticked. A few days later it returns in another form, such as a past tense or a plural, so you keep meeting it. On that card the check starts empty. Tap it if you know this form too."],
      ["How are the levels decided?", "By what a word is for. Everyday words, and the ones you need for forms, travel, health and ordering food, are Basic. More specific, abstract or longer words are Intermediate, Advanced and Fluent."],
      ["Can I hide a card I don’t want to study?", "Yes. In the Library tab, tap the hide (Ignore) icon on the card and it stops appearing in Study. You can bring it back the same way. You can also delete a card, or edit it to correct it."],
      ["How do I add my own words?", "Open the Add tab, choose Word, Sentence or Grammar, type the Danish and the English, and tap Add card. If your AI is set up, Fill in translation writes the English for you. Your cards appear in the deck and in the Library under My cards."],
      ["How do I make cards from a photo or some text?", "Open the Assistant tab. Choose Photo to photograph a sign, a menu or a page, or Translate to paste Danish text. Then tap Extract text to find the words worth learning, choose the ones you want, and they become cards. This needs your AI to be set up."],
      ["Can I hear how a word is pronounced?", "Yes. Tap the speaker icon next to a Danish word and your device reads it aloud in Danish. The voice comes from your phone or computer, so how natural it sounds depends on the device. It works without internet."],
      ["Does it work without internet?", "Yes. Studying, the Library and adding cards all work offline. Only the AI features need a connection."],
      ["What is the AI, and do I need it?", "The AI is an optional helper. It powers the Assistant tab (ask questions, translate text or photos, analyze a sentence, make cards) and the lightbulb and question mark on each card. You do not need it to study, use the Library or add your own cards. It is part of Broen, but it runs through your own account with an AI company, Anthropic (Claude) or Google (Gemini), so your questions go straight to that company and never through us."],
      ["What is an API key, and how do I get one?", "An API key is a long password that connects Broen to your own AI account. Tap AI settings at the top of the screen, tap I agree, then follow the link for the company you want. Create an account on their site, create a key there, copy it, and paste it into AI settings. Anthropic asks you to add a few dollars of credit first. Google’s Gemini has a free tier. Treat the key like a password. It is stored on your device and sent only to the company that issued it."],
      ["How much does the AI cost?", "Broen itself is free. The AI company charges you directly, only for what you use. With Anthropic’s Claude, explaining a word or answering a question costs well under a cent, and reading a photo costs more, roughly a cent or two. Google’s Gemini has a free tier with daily limits, but Google may use what you send on that tier to improve its products. Prices are set by the companies and can change."],
      ["Is my information private?", "Your cards, notes, progress and settings are stored only on your device. There is no account, no advertising and no tracking. The only time anything leaves your device is when you use an AI feature. The text or photo you send then goes to the AI company you chose, under their privacy policy. We never see it."],
      ["How do I back up or move my progress?", "Tap Backup at the top of the screen and choose Export, which saves a file. On another device, open Backup, choose Import and pick that file. Removing the app deletes what it stores, so export a backup first if your progress matters to you."],
      ["What permissions does the app ask for?", "Camera and photos, and only when you tap Take a photo or choose a picture to read. Your phone asks the first time, and you can change your answer at any time in your phone’s Settings or your browser’s site settings. The app never uses your microphone or your location."],
      ["What if a word or translation looks wrong?", "The deck has been checked with care, but it can still contain mistakes, and AI answers can be wrong too. For anything important, check with a native speaker or a dictionary. In the Library tab you can edit any card to correct it."],
    ],
  },
];
