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
(edit, backup, wipe, restore, offline) `python3 tests/secrets_test.py` (AI keys) and `python3 tests/voice_test.py` (spoken-Danish message) `python3 tests/settings_test.py` (Study choices survive a restart) `python3 tests/fresh_test.py` (new own cards come back soon) `python3 tests/sentence_test.py` (lightbulb "In a sentence", Add as card, Sentences & phrases) and `python3 tests/lightbulb_test.py` (ready-made lightbulb answers) and `python3 tests/icloud_test.py` (iCloud sync, with a pretend iCloud); only ship when all print ALL PASSED.

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

## Ready-made lightbulb answers
Built-in words can carry a ready-made lightbulb answer (forms, explanation,
related words, level-matched sentence) so no AI call or key is needed. They are
files `lightbulb/<first letter>.json` (leading en/et/at ignored; æ ø å = ae oe aa),
keyed by `frontKey`, fetched only when a lightbulb opens (`src/lib/lightbulb.js`).
Words with no entry, and the learner's own cards, use the live AI call as before.
`scripts/prepare-www.mjs` copies `lightbulb/` into the iPhone app. Written to the
same quality as the live answer; do not shorten.

## iCloud sync (iPhone app only, opt-in)
Shares progress between the owner's own Apple devices through their own iCloud
key-value store (about 1 MB total, so the snapshot is gzipped and chunked).
- `plugins/icloud-sync/`: tiny local Capacitor plugin (Swift). `package.json`
  depends on it by `file:`; `cap sync` adds it to the iOS project.
  Xcode needs Signing & Capabilities → + Capability → iCloud → tick
  "Key-value storage" (one time, needs the paid developer team).
- `src/lib/sync.js`: pure logic. Snapshot = marks on built-in cards (by
  `canonicalKey`), the learner's own cards, own topics, deleted built-in words,
  deleted own cards (tombstones). Merge only ever ADDS (known/starred/hidden
  OR, notes combined line by line, level-up max), so syncing can't lose
  progress; repeating a merge changes nothing. A card deleted on one device
  is deleted on the others unless made again later.
- `src/lib/icloud.js` (phone bridge, `syncOnce`), `src/lib/useICloudSync.js`
  (on/off, sync at start / on return / when another device saves / 4 s after a
  change), `src/components/SyncOffer.jsx` (offer once after ~15 changes or the
  2nd opening, once more after 25 known words, then never; counters in
  `syncPrompt`), switch + "Go back to an earlier version" in BackupPanel.
  The copy taken when sync is turned on is `preSyncBackup`.
- Study choices (`studySettings`, `verbForms`, `nounOptions`) travel too: newest
  change wins by `settingsChangedAt`, applied via the `dansk-settings-changed`
  event. Not synced: AI keys. The website has no sync (it uses backup files). Restoring a backup while sync is on gets re-merged with
  iCloud.

## Plain English in AI answers
Learners may not know grammar words. `PLAIN_ENGLISH_RULE` (src/lib/ai/prompts.js)
is added to every AI prompt that explains things: no participle / infinitive /
definite / neuter etc.; explain the idea with examples ("en-words", "et-words").
Ready-made lightbulb answers follow the same rule.

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
