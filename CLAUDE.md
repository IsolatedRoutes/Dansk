# Dansk — notes for Claude

Danish learning web app, live at https://isolatedroutes.github.io/Dansk.
Owner is not a coder: explain things in short, plain English.

## Release workflow (owner's standing instructions)
1. Make and test the change.
2. Send the owner the updated project (zip, without `node_modules`) to
   download first, so they have it even when away from their computer.
3. Ask whether to push. Push to GitHub **only** when the owner says so.
4. After pushing, remind them `git pull` keeps their computer's folder in sync.

## Never lose saved progress
Progress = known / starred / hidden marks, notes, the owner's own cards and
categories, and study settings (verbForms, nounOptions, studySettings: the
Study screen's category, levels, Unknown / Starred filters and direction). Every
update — and any future App Store or desktop version — must keep it.

- Never delete or overwrite a saved card in a migration. Renaming a built-in
  word goes through `VOCAB_CORRECTIONS` / `VOCAB_TRANSLATION_CORRECTIONS`
  (old text → new), which merges progress; a renamed grammar lesson lists its
  old name in `was`.
- Words dropped from the built-in list are left in place on devices that
  already have them, except retired starter cards the person never touched
  (not known/starred/hidden/noted/practised), which are purged quietly
  (`purgeRetiredStarters`). Translation changes to starter cards apply only
  if the person hasn't edited the back (`migrateStarterTranslations`).
- One-time migrations are guarded by a version key in storage
  (`categoryLayout`, `grammarVersion`) that is only written after the
  migrated data saved successfully. Bump the version to re-run one.
- `snapshotProgress` / `restoreProgress` wrap all startup migrations and put
  back any mark, note or own card a migration loses. Keep them last in the
  pipeline.
- Built-in cards the owner deletes are remembered in `deletedStarterCards`
  so they aren't re-added.
- Unreadable saved data is moved to `cards_unreadable_<time>`, never
  overwritten.
- Saved data lives in IndexedDB (database `dansk`, store `kv`). On first
  run everything in localStorage is copied over, read back and compared;
  only then is `__legacyCopied` set. The localStorage copy is left in place
  as a backup. If IndexedDB is unavailable, saves fall back to
  localStorage, then memory. A failed IndexedDB write is reported, never
  redirected elsewhere. The deck is read with `storeGetStrict` at startup:
  if it can't be read, the app shows "couldn't be opened" and changes
  nothing. A native wrapper should store data in the
  platform's persistent storage behind `storeGet` / `storeSet`.
- Saves are queued in order; a change saved in another tab reloads this one
  (BroadcastChannel).
- Backups include settings; restoring an old backup resets the migration
  keys and restarts, so it is upgraded like any old deck.
- A native app wrapper (App Store / desktop) has its own storage: carry data
  over with the backup file (or read the old storage on first launch), and
  use the platform's persistent storage, not a plain WebView localStorage.

**Before every release run** `python3 tests/upgrade_test.py` (compares
against `origin/main`) and `python3 tests/smoke_test.py`, `python3 tests/e2e_test.py`
(edit, backup, wipe, restore, offline) `python3 tests/secrets_test.py` (AI keys) and `python3 tests/voice_test.py` (spoken-Danish message) `python3 tests/settings_test.py` (Study choices survive a restart) `python3 tests/fresh_test.py` (new own cards come back soon) `python3 tests/sentence_test.py` (lightbulb "In a sentence", Add as card, Sentences & phrases) and `python3 tests/lightbulb_test.py` (ready-made lightbulb answers) and `python3 tests/icloud_test.py` (iCloud sync, with a pretend iCloud) and `python3 tests/share_test.py` (Share to Broen, with a pretend share folder) and `node tests/srs_check.mjs` and `node tests/sync_check.mjs` (smart review, word order, sync); only ship when all print ALL PASSED.

## Smart learning (level-up)
Owner wants smart learning without new features, buttons or gamification.
- A word marked known never comes back as itself. It returns once in each
  other form, one level above the word: verbs past + perfect (from the
  tense columns), nouns "the …" + plural, adjectives comparative +
  superlative (WORD_DATA columns 10–11, `upDa` / `upEn`, forms checked
  against the Stavekontrolden dictionary). 3 days after known, then 7.
  Seeing a form counts; nothing takes "known" away. Card fields: `upStage`,
  `upDue`. At most 12 per session, about 1 card in 5, placed early.
- Phrases built on a known word come earlier in a session.
- Cards the owner adds (typed, from a photo, or from the Assistant) come back
  soon and often while new (`src/lib/fresh.js`): the 10 newest from the last
  3 days are placed 3 times in the first ~30 cards, spaced out; cards from the
  last 2 weeks are twice as likely; then ordinary. Known cards still never
  return as themselves.
- AI examples are built from the learner's known words (`knownWordsHint`).
- The lightbulb popup starts with "In a sentence": the AI's example (part of the
  word-insight reply) or the card's first saved example (works offline), with
  "Add as card" making it the learner's own sentence card. Phrases, sentences
  and lessons don't get one. The AI is told the word's level so the sentence
  is as simple as the word. Sentence cards are found in Study's and Library's
  "Sentences & phrases" entry (`SENTENCES_FILTER`, a filter, not a stored
  category) and also stay in their topic. Rule (`src/data/sentenceCards.js`):
  every card of type "sentence", plus any word card of more than one word
  after dropping a leading en/et/at. Short "at + verb" phrases ("at gå glip
  af") stay with the verbs; "at" phrases with 4+ words after it (idioms) count.
  Nothing saved changes.

## Smart review (no buttons, one endless stream)
There are no sessions. In Unknown mode Study is one stream that carries on after
the app closes. Nothing to press: what the learner does decides when a card returns.
- Card fields (`src/lib/srs.js`): `srsN` looks, `srsLvl` step on the ladder (20 min,
  1, 3, 7, 16, 35, 80, 180 days), `srsDue`, `srsAt`, `srsSkips`.
- Signals: swipe past without flipping = skipped (back in 1 to 7 days, more each time);
  flip within 2.5 s = easy (jumps two steps); 2.5 to 8 s = normal (one step);
  8 to 30 s = effort (same step; if new, back in the stream a few cards later);
  lightbulb or Ask = wants it (two steps back, soon). Over 30 s is ignored. Starred
  cards come back sooner. Known cards leave the stream (level-up forms as before).
  Going Back to a card and level-up/welcome/lesson cards are not recorded.
- `planBatch`: about 1 card in 3 is a new word, always; reviews fill the rest (most
  overdue first; a big backlog is capped at half). After 3+ days away: at most 8
  reviews, starting with two new words. The stream extends itself when 6 cards are left.
- Order of new words (`src/lib/learningOrderCore.js`, wired in `learningOrder.js`):
  Basic first with the next level mixing in; topics interleaved; hej / ja / tak etc.
  held back; the learner's own cards first; a compound moves up when the learner
  knows either part (`COMPOUND_PARTS`, detected from the word list); phrases built on
  a known word move up. The compound card just shows its translation.
- Marks are saved in small batches (`updateCards` in App.jsx, no `progressAt`), and on
  leaving the app. They travel in iCloud sync (`s` array; the newest look wins) and
  survive migrations (`mergeProgress`). With Unknown off, Study keeps the old shuffle.
- Tests: `node tests/srs_check.mjs`.

## Ready-made lightbulb answers
Built-in words can carry a ready-made lightbulb answer (forms, explanation,
related words, level-matched sentence) so no AI call or key is needed. They are
files `lightbulb/<first letter>.json` (leading en/et/at ignored; æ ø å = ae oe aa),
keyed by `frontKey`, fetched only when a lightbulb opens (`src/lib/lightbulb.js`).
Words with no entry, and the learner's own cards, use the live AI call as before.
`scripts/prepare-www.mjs` copies `lightbulb/` into the iPhone app. Written to the
same quality as the live answer; do not shorten. Covered: all words at every level (Basic, Intermediate, Advanced, Expert; 8,002 entries), each written then independently reviewed (about 4 in 10 cards were corrected by the reviewer) and all following the quality bar below; only the learner's own cards and words with no entry use the live AI call. Checked by
`tests/lightbulb_check.mjs` (keys, files, shape).

### Lightbulb answer quality bar (owner's rules; the model card is "hvad")
Gold standard: `lightbulb/h.json` → "hvad". Every example makes sense and adds
something; nothing is repeated; right length. New and live-AI answers must match it:
- Correct, clear English: comma after an opening phrase ("For the sport, you leave out en"), none inside a clause ("To say what you are, use…"); American spelling; one idea per sentence.
- Opens `"X" means "meaning".` (en/et kept: `"En dukke" means "a doll"`).
- Every other Danish word/phrase has its English right beside it.
- Quotation marks only around the opening word and the English meanings after "means"; other Danish examples are unquoted with the English in (brackets) beside them. Too many quotes made cards busy.
- Teaches with short translated example contrasts ("hvad" vs "hvem"), never abstract descriptions.
- Only facts about the word itself: no trivia, no usage fluff, no "learn it as…", no vague
  contrasts with English, no ending mechanics (-t/-e/doubling), no grammar jargon.
- Nothing already in the forms list or the related list is repeated; other words are mentioned
  only to prevent a real mix-up, show how a word is built, or show a usage contrast.
- Related words must be truly related: same word family, a real look-alike/mix-up, a true opposite or synonym, or a linked partner in a small set. Never a word that only appears in the sentence or shares a topic, and never a piece of the card's own phrase (not 'at tage' or 'medicin' on 'at tage medicin'); the test enforces this. A related word must also not already appear in the explanation (the list must add new words; test enforced). Always 3 or 4 items (the test enforces it): if the word family is small, use a true opposite/synonym, a look-alike, or members of the same small set. All Basic and Intermediate lists follow this rule (test enforced).
- Every claim agrees with the card's own forms/related/sentence; uncertain rules are softened or left out.
- The explanation must tell something real about the word (what it is or does, where it is used, a mix-up, how it is built); example sentences only support that and never replace it. The "In a sentence" box holds the best defining context (what it is made of or used for, where found, what it contrasts with), never an incidental action: "Hvert stykke i gulvet er en planke" (Each piece in the floor is a plank), not "carrying a plank into the house". A defining example never sits in the explanation and the box at once. All Basic and Intermediate cards were audited against this; new and live-AI answers must follow it (`WORD_INSIGHT_SYSTEM_PROMPT`).
- No second example sentence in the explanation unless it adds something new that the forms list and the "In a sentence" box do not show (a real contrast, a different use, a surprise). A repeat of the same meaning ("I forgot my bike lock") is cut. Better: explain how a small part works so it helps with other words (for "at runde op", how op works, with at skrive op / at ringe op), or say nothing more. Short explanations are fine.
- Saying only what a word is built from is not enough ("En cykellås" means "a bike lock". It is built from cykel and lås.). The explanation must also teach something real: what it is used for, a mix-up with a look-alike, how a part works and where else it appears, a nuance with a short example. The composition may stay only as support. No filler.
- Never leave a usage claim unexplained. "It is also a polite ending on a request" must come with how and an example (Kan du sende filen? Tak på forhånd! = Can you send the file? Thanks in advance!), or be removed. Same for "formal", "informal", "also means".
- Example sentence length follows the word's level: Basic = at most 8 words and one clause (no ", så …" / ", for …"), everyday words, adding at most ONE small new thing so the learner levels up a little. Intermediate = at most 12 words, up to one clause (og/men/fordi/når), one or two small new things; checker limit 14 words for levels 2-4.
- Example sentence: the marked word is exactly the card's word (no en/et/at, no "the"/plural form),
  and the rest of the sentence makes its meaning guessable (not "I need a ___").
`tests/lightbulb_check.mjs` enforces the form rule; the rest is enforced by the AI prompt
(`WORD_INSIGHT_SYSTEM_PROMPT`, src/lib/ai/prompts.js) and review.

## iCloud sync (iPhone app only, opt-in)
Shares progress between the owner's own Apple devices through their own iCloud
key-value store (about 1 MB total, so the snapshot is gzipped and chunked).
- `plugins/icloud-sync/`: tiny local Capacitor plugin (Swift). `package.json`
  depends on it by `file:`; `cap sync` adds it to the iOS project.
  Xcode needs Signing & Capabilities → + Capability → iCloud → tick
  "Key-value storage" (one time, needs the paid developer team).
- `src/lib/sync.js`: pure logic. Everything except the AI key travels; when
  the same thing changed on two devices the NEWEST change wins.
  Snapshot = per built-in card: marks, notes, level-up, plus content if edited
  (keyed by stable id, `k` = canonicalKey fallback); every added card whole;
  own topics; deleted built-in words and deleted own cards (tombstones);
  `keys` = settings and chat.
  Cards carry `progressAt` (known/starred/hidden/notes changed) and `editedAt`
  (front/back/topic/examples/pattern changed), stamped ONLY in `updateCard`
  (App.jsx), so migrations never count as changes. Newer stamp wins per group;
  with no stamps (older cards) marks are combined (OR, notes by line) so
  nothing is lost. Level-up (`upStage`, `upDue`) takes the larger. Un-marking
  a card on the newer device reaches the others. Repeating a merge changes
  nothing. Deleting an added card deletes it everywhere unless made again.
- Settings: `SYNCED_KEYS` in `src/lib/storage.js` (studySettings, verbForms,
  nounOptions, aiEngine, aiConsent, autoBackupEnabled, welcomeSeen,
  chatHistory). `storeSet` stamps the time (`keyStamps`) when the value really
  changes; the very first save of a key is not stamped (usually a default), so a
  new device never overrules real choices. `storeSetFromSync` stores what
  arrives and fires `dansk-settings-changed` (Study, AI choice and chat reload).
  The chat is the first thing left out if iCloud's ~1 MB runs short.
  NOT synced: AI keys (secrets.js / Keychain), web-only options
  (ollamaConfig, chromeTranslatorEnabled), per-device facts (backup times,
  review prompt, deviceId, install marker, sync's own counters).
- `src/lib/icloud.js` (phone bridge, `syncOnce`), `src/lib/useICloudSync.js`
  (on/off, sync at start / on return / when another device saves / 4 s after a
  change), `src/components/SyncOffer.jsx` (offer once after ~15 changes or the
  2nd opening, once more after 25 known words, then never; counters in
  `syncPrompt`), switch + "Go back to an earlier version" in BackupPanel.
  The copy taken when sync is turned on is `preSyncBackup`.
- The website has no sync (it uses backup files). Restoring a backup while
  sync is on gets re-merged with iCloud.

## Share to Broen (iPhone app only)
Text or a photo shared from other apps lands in the Assistant: text in the Translate box (added below what is there), a photo in Photo; a bare web link is turned down with a note (select the text instead).
- `ios/ShareExtension/`: the Share extension source (`ShareViewController.swift`, `Info.plist`, entitlements). It is NOT in the Xcode project until the owner adds the target (steps in CAPACITOR.md; needs the paid team for the App Group `group.com.isolatedroutes.broen`). It saves the item in the App Group folder `share-inbox` and tries to open `broen://share` (URL scheme added in the app's Info.plist).
- `plugins/share-inbox/` (Swift, like icloud-sync): `take()` hands the saved item to the page once and deletes it; with no App Group it reports nothing, so the app is unaffected.
- `src/lib/shareInbox.js` (`watchShared` at start, on focus and when the app returns to the front), `App.jsx` (`incoming`, opens the Assistant), `ChatView` (picks Translate or Photo; waits until AI is set up), panels take `incomingText` / `incomingImage`.
- The native code could not be compiled or run where it was written; only the page side is tested (`share_test.py`). Try it on a real iPhone.

## Plain English in AI answers
Learners may not know grammar words. `PLAIN_ENGLISH_RULE` (src/lib/ai/prompts.js)
is added to every AI prompt that explains things: no participle / infinitive /
definite / neuter etc.; explain the idea with examples ("en-words", "et-words").
Ready-made lightbulb answers follow the same rule.
`CLARITY_RULES` (same file) is part of `PLAIN_ENGLISH_RULE`, so every prompt that explains or writes a card (lightbulb, chat, photo, text extract, Add a grammar card) carries the owner's quality rules. Any new explaining prompt must include `PLAIN_ENGLISH_RULE`. All 1,438 Basic lightbulb cards were audited twice by independent reviewers against these rules; `tests/lightbulb_check.mjs` also bans filler wording and jargon.

## Word levels
Level by what the word is *for*, not just how common or how compound it is.
Words needed for forms (fornavn, efternavn, telefonnummer), travel (kuffert),
health (apotek, medicin), shopping and ordering food stay Basic. Simple
everyday words (banan, gaffel, ske, sok, hat, kok) stay Basic. Specific
items and long compounds of simpler words (håndklæde, tandbørste) go to
Intermediate. Level changes reach saved cards automatically and never touch
known / starred marks.

## App Store
- Study and Library work with no network; only AI features need one.
- The in-app About / Privacy / FAQ text is `INFO_PAGES` in `src/data/infoPages.js`;
  `privacy.html` mirrors the privacy text. Keep them in step.
- The opening screen is the `#splash` block in `src/index.html`.

## Contact
`CONTACT_EMAIL` in `src/data/infoPages.js` adds a Contact item to the menu; empty hides it. The privacy policy URL for the App Store needs a contact too.

## Naming
The app is called Dansk. "Broen" ("the bridge") appears only on the opening
screen and in About. Keep the storage names (`dansk` database,
`dansk-sync` channel) as they are: renaming them would orphan every saved
deck. Icons live in `icons/`; `icon-1024.png` is the App Store icon (full
square, no transparency, no baked-in rounded corners).

## Code layout and building
Source is in `src/` (Vite + React 18):
- `App.jsx` root component: startup pipeline, state, layout. `main.jsx` entry.
- `data/` built-in content (categories, words.tsv, grammar, corrections).
- `lib/` logic with no UI: storage, vocabulary, migrations, level-up,
  backup, speech, `ai/` providers.
- `components/` shared UI pieces; `views/` the screens (Study, Library,
  Add, Assistant, settings panels).

Commands: `npm install` once, then `npm run lint`, `npm run build`,
`npm test`. `npx vite build` writes the single self-contained `index.html`
at the repo root, which GitHub Pages serves — commit it with every release.
Static root files: `sw.js`, `manifest.webmanifest`, `privacy.html`, `icons/`.
The on-device model's software is built into `vendor/web-llm.js` (`npm run build:webllm`, only after upgrading `@mlc-ai/web-llm`) and loaded from the app's own site, never from a third-party CDN; commit it. The model files themselves download once from Hugging Face / GitHub.
Bump `CACHE_NAME` in `sw.js` when shell files change.

## iPhone app
See CAPACITOR.md. `npm run cap:sync` builds and copies into the Capacitor project. `isNativeApp()` (src/lib/platform.js) hides web-only AI options. AI calls are blocked until `aiConsent` is set in AI settings (requireConsent in src/lib/ai/http.js).

## AI keys
Every read or write of an AI key goes through `src/lib/secrets.js`
(`secretGet` / `secretSet` / `secretRemove`), never `storeGet` / `storeSet`.
In the iPhone app keys live in the iOS Keychain (`capacitor-secure-storage-plugin`);
a failed Keychain write is reported and never redirected to ordinary storage.
On the website they stay in the site's own storage. Keys are never in backups
or URLs (they travel in request headers). Do not return the plugin object from
a Promise (Capacitor plugins look like Promises and hang); `secrets.js` wraps it.
`clearLeftoverSecrets` removes Keychain keys left by a deleted install.
