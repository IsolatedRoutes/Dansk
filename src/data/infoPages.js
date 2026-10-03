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
    legendTitle: "On every card",
    legend: [
      ["star", "Star", "Star a card you want to see more often. It comes up several times in a session until you un-star it."],
      ["check", "Known", "Mark a word as known and it leaves your study cards. A few days later it comes back in another form, such as the past tense or the plural. On that card the check starts empty; tap it if you know this form too, and the word is finished."],
      ["bulb", "Explore (lightbulb)", "Get an explanation of the word: where it comes from, how it is used, and related words. Needs AI set up in AI settings."],
      ["question", "Ask (question mark)", "Ask your own question about the word or phrase on the card, for example why it is spelled that way or how to use it in a sentence. Needs AI set up in AI settings."],
      ["tap", "Tap, swipe, Back and Next", "Tap the card to flip it. Swipe left for the next card and right to go back, or use the Next and Back buttons."],
    ],
    sections: [
      ["Learn from your surroundings", "In the Assistant tab, choose Photo to photograph a sign, a menu or a page, or Translate to paste any Danish text. The app reads it, translates it and shows what is in it. Needs AI set up in AI settings."],
      ["Keep what you notice", "Pick the words and phrases worth keeping from a photo or a text and turn them into cards. They go into your own deck and file under a topic."],
      ["Ask the assistant", "In the Assistant tab, choose Chat to go deeper on grammar, find out where a word comes from, or ask anything about a sentence or about Danish. The examples it writes use words you already know, so new things are built on familiar ground."],
      ["Analyze a sentence", "In the Assistant tab, paste a sentence to see it broken down: what each part does, why the word order is what it is, and any mistake worth fixing."],
      ["Study without drills", "The Study tab shows one card at a time, by level and topic, from Basic to Fluent. There are no streaks, scores or timers. Tap the check on a card when you know it, and use the menus at the top to choose the topic and levels you want to see."],
      ["Known words keep growing", "A word you know does not repeat as itself. A few days later it returns in another form, such as the past tense or the plural, one level up, within the levels you have chosen."],
      ["Explore from any card", "Ask about the word on a card, or open related words to see what sits around it."],
      ["Your deck, your cards", "Browse and search everything in the Library tab, edit any card, and add your own in the Add tab. Backup, at the top of the screen, saves a file with your progress so you can restore it later or move to another device."],
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    paragraphs: [
      "Your cards, notes, progress and settings are stored on your device. There is no account, no advertising and no analytics.",
      "The AI features (Assistant, translating, example sentences, reading text from a photo) are optional. When you use one, the text or photo you submit is sent to the provider you chose in AI settings: Anthropic or Google with your own key, a server of your own, or a model that runs on your device. Their privacy policies apply to what you send.",
      "Your API key stays on your device and is sent only to its own provider.",
      "The app asks your device for the camera or photos only when you choose to take or pick a picture to read, and never uses your microphone or location. On Google's free Gemini tier, Google may use what you send to improve its products.",
      "If you choose the on-device model, it downloads its model files once, from Hugging Face and GitHub. Those services can see your IP address, but not your text. After that, your text is processed on your device. Chrome's built-in translator also keeps your text on your device.",
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
      ["What is Broen, and how do I use it?", "Broen is a Danish learning app. In the Study tab you flip through cards of Danish words and phrases, tap the check on the ones you know, and the app brings them back later in new forms. The Library tab lets you browse and search every card, the Add tab lets you make your own, and the Assistant tab uses AI to answer questions and translate text or photos."],
      ["Is it free? Do I need an account?", "Broen is free and has no account or sign-in. Everything you save stays on your device. Only the optional AI features cost anything, and only if you use them (see the AI questions below)."],
      ["What do the options at the top of the Study screen do?", "The first menu picks which cards to study: everything, only the cards you added, or one topic or word type. The second picks your levels, from Basic (everyday words) to Fluent. Unknown, when ticked, hides words you have marked as known. Starred shows only the cards you have starred. The Dansk → English button switches which language you see first on a card."],
      ["What do the icons on a card do?", "Star (top left): see the card more often. Check (top right): you know this word. Lightbulb (bottom left): an AI explanation of the word. Question mark (bottom right): ask the AI your own question about it. The last two need AI set up in AI settings. The speaker next to the word plays it aloud."],
      ["What happens when I mark a word as known?", "Tap the check at the top right of a card. The word leaves your study cards (as long as Unknown is ticked under the menus at the top of the Study screen) and comes back a few days later in another form, such as the past tense or the plural, within the levels you have chosen."],
      ["How are the levels decided?", "By what a word is for. Everyday words and the ones you need for forms, travel, health and ordering food are Basic. More specific, abstract or longer words come later, up to Fluent. You can choose which levels to study in the Study tab."],
      ["How do I add my own words?", "Open the Add tab, choose Word, Sentence or Grammar, type the Danish and the English, and tap Add card. If you have set up AI, Fill in translation can write the English for you. Your cards appear in the Library and in your study cards, and you can edit or delete them there."],
      ["How do I make cards from a photo or a text?", "Open the Assistant tab. Choose Photo to photograph a sign, menu or page, or Translate to paste Danish text. The app picks out the words and sentences, and you choose which ones to turn into cards. This needs AI set up in AI settings."],
      ["Is my progress saved? How do I move it to a new phone?", "Yes, on this device. To keep a copy or move to another device, tap Backup at the top of the screen and choose Export, which saves a file. On the other device, open Backup and choose Import, then pick that file."],
      ["What is the AI, and do I need it?", "The AI is optional. It powers the Assistant tab, the lightbulb and question mark icons on a card, sentence analysis and reading text from photos. Studying, the Library and your own cards work without it. It is part of the app, but you connect your own AI account (Anthropic's Claude or Google's Gemini) in AI settings, so your questions go straight to that company and we never see your data."],
      ["What is an API key, and do I need one?", "An API key is what links the app to your own AI account, so your data goes straight to the AI company and never through us. You only need one for the AI features. It takes a couple of taps: tap AI settings at the top of the screen, follow the link to sign in on the company's site, create a key, and paste it in. Treat it like a password and don't share it. Some versions also offer an option that runs on your device and needs no key, but it takes a large download and a recent browser."],
      ["How much does the AI cost?", "Broen is free. The AI company charges you directly, only for what you use. With Anthropic's Claude, explaining a word or answering a question costs well under a cent, and reading a photo costs more, roughly a cent or two. You add a few dollars of credit first, and that goes a long way. Google's Gemini has a free tier with daily limits, but Google may use what you send on it to improve its products. Prices are set by the companies and can change."],
      ["Do I need the internet?", "Studying and the Library work without internet. The AI features need a connection."],
      ["What permissions does the app ask for?", "Camera and photos, only when you tap Take a photo or choose a picture to read. Your phone asks the first time. You can change this any time in your phone's Settings (on iPhone, Settings, then Safari or the app) or in your browser's site settings. The app never uses your microphone or location."],
    ],
  },
];
