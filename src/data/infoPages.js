// ---------- about, privacy, terms, FAQ ----------

// Shown as "Contact" in the menu once set; hidden while empty.
export const CONTACT_EMAIL = "";

export const INFO_PAGES = [
  {
    id: "about",
    title: "About",
    paragraphs: [
      "Broen is a Danish learning app for curious people who learn from the world around them. Broen means \"the bridge\" in Danish: a bridge between the Danish around you and the Danish you know.",
      "Behind it is a deck of about 8,000 words and phrases. Browse it by level, topic or word type, with grammar lessons alongside, and shape it with your own cards and the levels you choose. The deck follows established language-learning principles: a known word returns in a new form, so you keep meeting it in context.",
      "Go deeper whenever you're curious: ask questions, understand grammar, and make connections between words.",
      "Your learning emerges from intentionally using the Danish you experience. Photograph or paste text from a sign, a menu or a news article, then use the AI assistant to translate it, analyze the sentence structure and extract key words for future study.",
      "Hear it spoken: tap the speaker on a card to hear the Danish read aloud in your device's Danish voice. The app does not listen to you. It never uses your microphone, so it never asks for it.",
      "What sets it apart: your surroundings become your classroom. There are no streaks, scores or drills, and an assistant is there for the why, whether that's grammar, word origin or any question about Danish.",
    ],
  },
  {
    id: "how",
    title: "How it works",
    legendTitle: "On every card",
    legend: [
      ["star", "Star", "Star a card you want to see more often. It comes up several times in a session until you un-star it."],
      ["check", "Known", "Mark a word as known and it leaves your study cards. A few days later it comes back in another form, such as the past tense or the plural. On that card the check starts empty; tap it if you know this form too, and the word is finished."],
      ["bulb", "Explore", "Get an explanation of the word: where it comes from, how it is used, and related words. Needs an AI option in AI settings."],
      ["question", "Ask", "Ask your own question about the word or phrase on the card, for example why it is spelled that way or how to use it in a sentence. Needs an AI option in AI settings."],
      ["tap", "Tap, swipe, Back and Next", "Tap the card to flip it. Swipe left for the next card and right to go back, or use the Next and Back buttons."],
    ],
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
      ["Is my progress saved?", "Yes, on this device. Use Backup in the top bar to keep a copy or move to another device."],
      ["Do I need the internet?", "Studying and the Library work offline. The AI features need a connection, and the on-device model needs one for its first download."],
      ["What happens when I mark a word as known?", "With Unknown ticked, it leaves your study cards as itself and comes back later in other forms, one level above the word, within the levels you have chosen."],
      ["How are the levels decided?", "By what a word is for. Everyday words and the ones you need for forms, travel, health and ordering food are Basic. More specific, abstract or longer words come later."],
      ["What is the AI, and do I need it?", "The AI is optional. It powers the assistant, the lightbulb and question mark on cards, sentence analysis and reading text from photos. Studying, the Library and your own cards work without it. It is part of the app, but you connect your own AI account (Anthropic's Claude or Google's Gemini) in AI settings, so your questions go straight to that company and we never see your data."],
      ["What is an API key?", "What links the app to your own AI account, so your data goes straight to the AI company and never through us. It takes a couple of taps: sign in on the company's site with the link in AI settings, create a key, and paste it in. Treat it like a password and don't share it."],
      ["How much does the AI cost?", "Broen is free. The AI company charges you directly, only for what you use. With Anthropic, a lightbulb or question costs well under a cent, and reading a photo costs more, roughly a cent or two. You add a few dollars of credit first, and that goes a long way. Google's Gemini has a free tier with daily limits, but Google may use what you send on it to improve its products. Prices are set by the companies and can change."],
      ["Do I need an API key?", "Only if you want AI features through Anthropic or Google. The on-device model in AI settings needs no key, but takes a large download and a recent browser."],
      ["What permissions does the app ask for?", "Camera and photos, only when you tap Take a photo or choose a picture to read. Your phone asks the first time. You can change this any time in your phone's Settings (on iPhone, Settings, then Safari or the app) or in your browser's site settings. The app never uses your microphone or location."],
    ],
  },
];
