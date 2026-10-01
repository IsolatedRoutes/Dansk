# Dansk — notes for Claude

Danish flashcard web app, live at https://isolatedroutes.github.io/Dansk.
Owner is not a coder: explain things in short, plain English.

## Release workflow (owner's standing instructions)
1. Make and test the change.
2. Send the owner the updated files to download first (`index-NEW.html`,
   `danish-flashcards-NEW.jsx`, plus `sw-NEW.js` if it changed), with the
   Terminal `mv` steps, so they have them even when away from their computer.
3. Ask whether to push. Push to GitHub **only** when the owner says so.
4. After pushing, remind them `git pull` keeps their computer's folder in sync.

## Never lose saved progress
Progress = known / starred / hidden marks, notes, the owner's own cards and
categories, and study settings (verbForms, studyLevels, nounOptions). Every
update — and any future App Store or desktop version — must keep it.

- Never delete or overwrite a saved card in a migration. Renaming a built-in
  word goes through `VOCAB_CORRECTIONS` / `VOCAB_TRANSLATION_CORRECTIONS`
  (old text → new), which merges progress; a renamed grammar lesson lists its
  old name in `was`.
- Words dropped from the built-in list are simply left in place on devices
  that already have them.
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
- Saves are queued in order; a change saved in another tab reloads this one.
- Backups include settings; restoring an old backup resets the migration
  keys and restarts, so it is upgraded like any old deck.
- A native app wrapper (App Store / desktop) has its own storage: carry data
  over with the backup file (or read the old storage on first launch), and
  use the platform's persistent storage, not a plain WebView localStorage.

**Before every release run** `python3 tests/upgrade_test.py` (compares
against `origin/main`) and only ship when it prints ALL PASSED.

## Smart learning (level-up)
Owner wants smart learning without new features, buttons or gamification.
- A word marked known never comes back as itself. It returns once in each
  other form, one level above the word: verbs past + perfect (from the
  tense columns), nouns "the …" + plural, adjectives comparative +
  superlative (WORD_DATA columns 10–11, `upDa` / `upEn`, forms checked
  against the Stavekontrolden dictionary). 3 days after known, then 7.
  Seeing a form counts; nothing takes "known" away. Card fields: `upStage`,
  `upDue`. At most ~1 in 4 session cards.
- Phrases built on a known word come earlier in a session.
- AI examples are built from the learner's known words (`knownWordsHint`).

## Building
`danish-flashcards.jsx` is the source; `index.html` contains the bundled
build (esbuild, React 18). Bump `CACHE_NAME` in `sw.js` when shell files change.
