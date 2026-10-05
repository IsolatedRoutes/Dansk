import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { DanishVoiceNote } from "./components/DanishVoiceNote";
import { InfoSheet } from "./components/InfoSheet";
import { Shell } from "./components/Shell";
import { TabBar } from "./components/TabBar";
import { Icon } from "./components/icons";
import { CenteredOverlay, Toast, smallBtn } from "./components/ui";
import { DEFAULT_CATEGORIES, LEGACY_EMPTY_CATEGORY_IDS, LESSONS_ID, isLessonsCategory } from "./data/categories";
import { getAIEngine } from "./lib/ai/index";
import { setKnownWordsForAI } from "./lib/ai/prompts";
import { backupFingerprint, performBackupExport } from "./lib/backup";
import { LEVELUP_FIRST_GAP } from "./lib/levelUp";
import { CATEGORY_LAYOUT_VERSION, GRAMMAR_VERSION, applyWordMeta, buildStarterAdditions, loadDeletedKeys, migrateConsolidatedCategories, migrateToTopics, migrateStarterTranslations, migrateVocabCorrections, moveStrayCards, purgeRetiredStarters, rememberDeleted, restoreProgress, snapshotProgress, stableStarterId, syncGrammarLessons } from "./lib/migrations";
import { tidyOwnWordCases, tidyWordCase } from "./lib/vocabulary";
import { hideSplash } from "./lib/splash";
import { clearLeftoverSecrets } from "./lib/secrets";
import { askForReview, recordOpenDay, shouldAskForReview } from "./lib/review";
import { persistWithRetry, storeGet, storeGetStrict, storeSet, syncChannel, unpackCards } from "./lib/storage";
import { frontKey, normalizeCardText, uid } from "./lib/text";
import { AISettingsPanel } from "./views/AISettingsPanel";
import { AddCardView } from "./views/AddCardView";
import { SyncOffer } from "./components/SyncOffer";
import { rememberDeletedOwn } from "./lib/icloud";
import { useICloudSync } from "./lib/useICloudSync";
import { BackupPanel } from "./views/BackupPanel";
import { LibraryView } from "./views/LibraryView";
import { StudyView } from "./views/StudyView";
import { ChatView } from "./views/assistant/ChatView";

// ============================================================
// Main app
// ============================================================

export default function DanishFlashcards() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [cards, setCards] = useState([]);
  useEffect(() => setKnownWordsForAI(cards), [cards]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [tab, setTab] = useState("study");
  const degradedWarned = useRef(false);
  const [toast, setToast] = useState(null);
  const [engine, setEngine] = useState(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [infoPage, setInfoPage] = useState(null);
  const [showBackup, setShowBackup] = useState(false);
  const [backupReminder, setBackupReminder] = useState(false);
  const [autoBackupDue, setAutoBackupDue] = useState(false);

  const refreshEngine = useCallback(() => {
    getAIEngine().then((e) => setEngine(e));
  }, []);

  useEffect(() => {
    (async () => {
      const e = await getAIEngine();
      // getAIEngine() already defaults to "api" inside Claude when nothing
      // has been explicitly chosen — an explicit choice (e.g. switching to
      // Gemini) still takes priority over that default.
      setEngine(e);
    })();
  }, []);

  // Two tiers of nudge: when automatic backups are on for this device, a
  // shorter interval and an auto-opening prompt that only needs one tap
  // to complete (real "automatic" here still needs a tap — navigator.share
  // requires a genuine user gesture and can't be triggered silently).
  // When off, the original gentle, dismissible, longer-interval banner.
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      const hasProgress = cards.some((c) => c.known || c.starred || !c.starter);
      if (!hasProgress) return;
      let firstUsedAt = await storeGet("firstUsedAt");
      if (!firstUsedAt) {
        firstUsedAt = Date.now().toString();
        storeSet("firstUsedAt", firstUsedAt).catch(() => {});
      }
      const lastBackupAt = await storeGet("lastBackupAt");
      const autoOn = (await storeGet("autoBackupEnabled")) === "true";
      const now = Date.now();
      const referencePoint = Number(lastBackupAt || firstUsedAt);

      // Nothing changed since the last backup → no reason to make another
      // copy (and another file to clean up).
      const lastFingerprint = await storeGet("lastBackupFingerprint");
      if (lastBackupAt && lastFingerprint && lastFingerprint === backupFingerprint(cards, categories)) return;

      if (autoOn) {
        const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
        if (now - referencePoint > ONE_WEEK) setAutoBackupDue(true);
        return;
      }

      const snoozedUntil = await storeGet("backupReminderSnoozedUntil");
      if (snoozedUntil && now < Number(snoozedUntil)) return;
      const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
      if (now - referencePoint > TWO_WEEKS) setBackupReminder(true);
    })();
    // Runs once when the deck has loaded, not on every later change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Rating request (iPhone app only): remembers the days the app is opened,
  // and asks Apple to show its rating popup right after a word is marked
  // known, once the person has really used the app. Never while a menu or
  // a backup popup is open.
  const knownCount = cards.reduce((n, c) => n + (c.known ? 1 : 0), 0);
  const calmRef = useRef(false);
  calmRef.current = tab === "study" && !showSettings && !infoPage && !showBackup && !backupReminder && !autoBackupDue;
  const calm = tab === "study" && !showSettings && !infoPage && !showBackup && !backupReminder && !autoBackupDue;
  const prevKnownRef = useRef(null);
  useEffect(() => {
    if (loaded) recordOpenDay();
  }, [loaded]);
  useEffect(() => {
    if (!loaded) return undefined;
    const prev = prevKnownRef.current;
    prevKnownRef.current = knownCount;
    if (prev == null || knownCount <= prev) return undefined;
    let cancelled = false;
    shouldAskForReview(knownCount).then((yes) => {
      if (!yes) return;
      setTimeout(() => {
        if (!cancelled && calmRef.current) askForReview();
      }, 1500);
    });
    return () => {
      cancelled = true;
    };
  }, [knownCount, loaded]);

  function dismissBackupReminder() {
    setBackupReminder(false);
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    storeSet("backupReminderSnoozedUntil", (Date.now() + ONE_WEEK).toString()).catch(() => {});
  }

  async function runAutoBackup() {
    setAutoBackupDue(false);
    await performBackupExport(cards, categories, showToast);
  }

  // If the app is open in two tabs, a change saved in one reloads the
  // other, so an older tab can never save its stale copy over newer progress.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === "cards" || e.key === "categories") window.location.reload();
    }
    function onSync(e) {
      if (e.data === "cards" || e.data === "categories") window.location.reload();
    }
    window.addEventListener("storage", onStorage);
    if (syncChannel) syncChannel.addEventListener("message", onSync);
    return () => {
      window.removeEventListener("storage", onStorage);
      if (syncChannel) syncChannel.removeEventListener("message", onSync);
    };
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    (async () => {
      let c = [];
      let cat = DEFAULT_CATEGORIES;
      // If saved data ever can't be read, it's moved aside (never just
      // overwritten) so it can still be recovered.
      // If the deck can't be read right now, nothing is changed or saved:
      // an unreadable deck must never be mistaken for an empty one.
      let rawCards;
      try {
        rawCards = await storeGetStrict("cards");
      } catch {
        setLoadError(true);
        return;
      }
      // iPhone app only: a fresh install clears AI keys an earlier install left in the Keychain.
      await clearLeftoverSecrets();
      if (rawCards) {
        try {
          c = unpackCards(JSON.parse(rawCards));
          if (!Array.isArray(c)) throw new Error("not a list");
        } catch {
          c = [];
          await storeSet("cards_unreadable_" + Date.now(), rawCards);
        }
      }
      try {
        const raw = await storeGet("categories");
        if (raw) cat = JSON.parse(raw);
        if (!Array.isArray(cat)) cat = DEFAULT_CATEGORIES;
      } catch {
        cat = DEFAULT_CATEGORIES;
      }
      // Everything the person has done, captured before any update below
      // touches the data — put back at the end if anything went missing.
      const progressBefore = snapshotProgress(c);
      const deletedKeys = await loadDeletedKeys();

      // One-time cleanup for anyone who already has the old confusing
      // empty default categories saved — safe to drop only if nothing
      // actually uses them, so real cards are never orphaned.
      if (cat.some((cg) => LEGACY_EMPTY_CATEGORY_IDS.includes(cg.id))) {
        const usedIds = new Set(c.map((card) => card.category));
        const cleaned = cat.filter((cg) => !LEGACY_EMPTY_CATEGORY_IDS.includes(cg.id) || usedIds.has(cg.id));
        if (cleaned.length !== cat.length) {
          cat = cleaned;
          await persistWithRetry("categories", JSON.stringify(cat));
        }
      }

      // Give starter cards their deterministic IDs so data from different
      // devices merges cleanly.
      let idsMigrated = false;
      const claimedStableIds = new Set();
      c = c.map((card) => {
        if (card.starter) {
          const stableId = stableStarterId(card.front);
          // Guard against a rare pre-existing accidental duplicate (two
          // starter cards with the same front, from before duplicate
          // detection existed) — only the first claims the stable id,
          // so we never produce two cards sharing one id.
          if (!claimedStableIds.has(stableId)) {
            claimedStableIds.add(stableId);
            if (card.id !== stableId) {
              idsMigrated = true;
              return { ...card, id: stableId };
            }
          }
        }
        return card;
      });

      // Re-point cards in retired category names at the surviving category.
      let consolidationMigrated = false;
      const consolidationResult = migrateConsolidatedCategories(c, cat);
      if (consolidationResult) {
        c = consolidationResult.cards;
        cat = consolidationResult.categories;
        consolidationMigrated = true;
      }

      // Apply VOCAB_CORRECTIONS to saved cards.
      let vocabCorrected = false;
      const correctionResult = migrateVocabCorrections(c);
      if (correctionResult) {
        c = correctionResult;
        vocabCorrected = true;
      }

      // Deck audit: single-meaning translations, retired words removed.
      let deckAudited = false;
      const transResult = migrateStarterTranslations(c);
      if (transResult) { c = transResult; deckAudited = true; }
      const purgeResult = purgeRetiredStarters(c);
      if (purgeResult) { c = purgeResult; deckAudited = true; }

      // One-time re-sort into the topic layout.
      let topicsMigrated = false;
      if ((await storeGet("categoryLayout")) !== CATEGORY_LAYOUT_VERSION) {
        const r = migrateToTopics(c, cat);
        c = r.cards;
        cat = r.categories;
        topicsMigrated = true;
      }

      // Built-in grammar lessons: new consistent wording.
      let grammarSynced = false;
      if ((await storeGet("grammarVersion")) !== GRAMMAR_VERSION) {
        const g = syncGrammarLessons(c);
        if (g) c = g;
        grammarSynced = true;
      }

      // Words and sentences never live in Grammar Lessons.
      let strayMoved = false;
      const strayResult = moveStrayCards(c, cat);
      if (strayResult) {
        c = strayResult;
        strayMoved = true;
      }

      // One-time: lowercase the person's own word cards that were capitalized
      // only because a keyboard or AI started them like a sentence.
      let caseTidied = false;
      const caseDone = (await storeGet("caseTidied")) === "1";
      if (!caseDone) {
        const tidied = tidyOwnWordCases(c);
        if (tidied) {
          c = tidied;
          caseTidied = true;
        }
      }

      // Attach level + verb forms to every word card that's in the list.
      let metaApplied = false;
      const metaResult = applyWordMeta(c);
      if (metaResult) {
        c = metaResult;
        metaApplied = true;
      }

      // Starter vocabulary should always just be complete — no manual
      // button, no visible prompt. This quietly tops up anything missing,
      // whether that's a first-ever launch with nothing yet, or an
      // existing deck from before a later vocabulary expansion.
      // Safety net: re-apply any progress or own cards an update lost.
      let progressRestored = false;
      const restored = restoreProgress(c, progressBefore);
      if (restored) {
        c = restored;
        progressRestored = true;
      }

      const existingFronts = new Set(c.map((card) => frontKey(card.front)));
      const { newCards, combinedCategories } = buildStarterAdditions(cat, existingFronts, deletedKeys);
      let savedOk = true;
      if (newCards.length > 0 || idsMigrated || consolidationMigrated || vocabCorrected || deckAudited || metaApplied || topicsMigrated || grammarSynced || progressRestored || strayMoved || caseTidied) {
        cat = combinedCategories;
        c = [
          ...c,
          ...newCards.map((card) => ({
            id: uid(),
            createdAt: Date.now(),
            notes: "",
            examples: [],
            starred: false,
            known: false,
            ...card,
          })),
        ];
        const catSaved = await persistWithRetry("categories", JSON.stringify(cat));
        const cardsSaved = await persistWithRetry("cards", JSON.stringify(c));
        savedOk = catSaved.ok && cardsSaved.ok;
      }
      // Only mark an update as done once its result is actually saved —
      // otherwise it simply runs again next time.
      if (savedOk && topicsMigrated) await storeSet("categoryLayout", CATEGORY_LAYOUT_VERSION);
      if (savedOk && grammarSynced) await storeSet("grammarVersion", GRAMMAR_VERSION);
      if (savedOk && !caseDone) await storeSet("caseTidied", "1");

      setCards(c);
      setCategories(cat);
      setLoaded(true);
      // Ask the device not to clear saved progress when it runs low on space.
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
    })();
  }, []);

  // Always the latest deck, so two quick taps (mark known, then star)
  // can't each start from an old copy and undo one another.
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const persistCards = useCallback(
    async (next) => {
      next = normalizeCardText(next);
      cardsRef.current = next;
      setCards(next);
      const result = await persistWithRetry("cards", JSON.stringify(next));
      if (!result.ok) showToast("Couldn't save (" + result.error + ")");
      return result;
    },
    [showToast]
  );

  const persistCategories = useCallback(
    async (next) => {
      setCategories(next);
      const result = await persistWithRetry("categories", JSON.stringify(next));
      if (!result.ok) showToast("Couldn't save categories (" + result.error + ")");
      return result;
    },
    [showToast]
  );

  const addCategory = useCallback(
    (name) => {
      const trimmed = (name || "").trim();
      if (!trimmed) return null;
      const existing = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) return existing.id;
      const id = uid();
      persistCategories([...categories, { id, name: trimmed, custom: true }]);
      return id;
    },
    [categories, persistCategories]
  );

  // Wholesale replace, for restoring an exported backup — bypasses the
  // normal incremental add/duplicate-check path since a restore should
  // just put back exactly what was exported.
  // A backup may come from an older version of the app, so after restoring
  // it, the one-time updates are reset and the app restarts — the restored
  // deck then goes through the same safe update path as any old deck.
  const replaceAllData = useCallback(
    async (newCards, newCategories) => {
      const catResult = await persistCategories(newCategories);
      const cardResult = await persistCards(unpackCards(newCards));
      const ok = catResult.ok && cardResult.ok;
      if (ok) {
        await storeSet("categoryLayout", "");
        await storeSet("grammarVersion", "");
        await storeSet("caseTidied", "");
        setTimeout(() => window.location.reload(), 1200);
      }
      return ok;
    },
    [persistCategories, persistCards]
  );

  const sync = useICloudSync({ loaded, cards, categories, cardsRef, categoriesRef, persistCards, persistCategories, replaceAllData });

  const addCards = useCallback(
    async (newCards) => {
      // Central choke point for every card-adding feature (manual, Chat,
      // Sentence, Translate, Photo) — guarding here means a malformed AI
      // response anywhere can never crash the app, just gets silently
      // skipped instead of producing a card with a missing word. Also
      // where duplicates get caught — matched on the Danish side, case-
      // and whitespace-insensitive, against both the existing deck and
      // other cards in this same batch.
      const existingFronts = new Map(cards.map((c) => [frontKey(c.front), c.id]));
      const seenInBatch = new Set();
      const duplicateFronts = [];
      const touchedExistingIds = new Set();
      const stamped = newCards
        .filter((c) => c && c.front != null && c.back != null && String(c.front).trim() && String(c.back).trim())
        .filter((c) => {
          const key = frontKey(String(c.front));
          if (existingFronts.has(key) || seenInBatch.has(key)) {
            duplicateFronts.push(String(c.front).trim());
            // Trying to add a word that's already in the deck is a clear
            // signal the learner wants to prioritize it right now — treat
            // the existing card the same way a freshly-added one is
            // treated below, so it cycles in soon rather than being
            // silently dropped with no other effect.
            const existingId = existingFronts.get(key);
            if (existingId) touchedExistingIds.add(existingId);
            return false;
          }
          seenInBatch.add(key);
          return true;
        })
        .map((c) => ({
          id: uid(),
          createdAt: Date.now(),
          notes: "",
          examples: [],
          starred: false,
          known: false,
          recentTouch: Date.now(),
          ...c,
          ...(c.type === "word" ? tidyWordCase(String(c.front), String(c.back)) : { front: String(c.front).trim(), back: String(c.back).trim() }),
          // Lessons go in Grammar Lessons; everything else never does.
          category:
            c.type === "grammar"
              ? (categories.find(isLessonsCategory) || {}).id || LESSONS_ID
              : isLessonsCategory(categories.find((x) => x.id === c.category)) || c.category === LESSONS_ID
              ? ""
              : c.category || "",
        }));
      if (stamped.length === 0 && touchedExistingIds.size === 0) {
        if (duplicateFronts.length > 0) {
          showToast(
            duplicateFronts.length === 1
              ? '"' + duplicateFronts[0] + '" is already in your deck — can\'t add'
              : duplicateFronts.length + " of these are already in your deck — can't add"
          );
        } else {
          showToast("Couldn't add — missing word or translation");
        }
        return;
      }
      const withTouches = touchedExistingIds.size > 0 ? cards.map((c) => (touchedExistingIds.has(c.id) ? { ...c, recentTouch: Date.now() } : c)) : cards;
      if (stamped.length === 0) {
        // Nothing new to add; save the touched cards and tell the learner
        // their existing card was prioritized.
        const result = await persistCards(withTouches);
        if (result.ok) {
          showToast(
            duplicateFronts.length === 1
              ? '"' + duplicateFronts[0] + '" is already in your deck — moved it up for review'
              : duplicateFronts.length + " already in your deck — moved them up for review"
          );
        }
        return;
      }
      // Confirm only after the save succeeds; persistCards shows its own
      // failure toast.
      const result = await persistCards([...stamped, ...withTouches]);
      if (result.ok) {
        let msg = stamped.length === 1 ? "Card added" : stamped.length + " cards added";
        if (duplicateFronts.length > 0) {
          msg += " (" + duplicateFronts.length + (duplicateFronts.length === 1 ? " already in deck, moved up for review" : " already in deck, moved up for review") + ")";
        }
        if (result.degraded && !degradedWarned.current) {
          degradedWarned.current = true;
          msg += result.memoryOnly
            ? " — but only until you close the app, storage isn't available here"
            : " — to this browser only";
        }
        showToast(msg);
      }
    },
    [cards, categories, persistCards, showToast]
  );

  const updateCard = useCallback(
    (id, patch) => {
      persistCards(
        cardsRef.current.map((c) => {
          if (c.id !== id) return c;
          // Newly marked known: its first new form comes a few days later.
          const extra = patch.known === true && !c.known && !("upDue" in patch) ? { upDue: Date.now() + LEVELUP_FIRST_GAP } : {};
          return { ...c, ...patch, ...extra };
        })
      );
    },
    [persistCards]
  );

  const deleteCard = useCallback(
    async (id) => {
      const gone = cardsRef.current.find((c) => c.id === id);
      await rememberDeleted(gone);
      await rememberDeletedOwn(gone).catch(() => {});
      const result = await persistCards(cardsRef.current.filter((c) => c.id !== id));
      if (result.ok) {
        let msg = "Card deleted";
        if (result.degraded && !degradedWarned.current) {
          degradedWarned.current = true;
          msg += result.memoryOnly
            ? " — but only until you close the app, storage isn't available here"
            : " — to this browser only";
        }
        showToast(msg);
      }
    },
    [persistCards, showToast]
  );

  useEffect(() => {
    if (loaded) hideSplash();
  }, [loaded]);

  if (loadError) {
    return (
      <Shell>
        <div style={{ padding: 32, textAlign: "center", fontFamily: "var(--sans)", fontSize: 14, color: "#5A564B" }}>
          <p style={{ marginBottom: 16 }}>
            Your deck couldn't be opened right now. Nothing has been changed or lost.
          </p>
          <button onClick={() => window.location.reload()} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #2A2823", background: "#2A2823", color: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  if (!loaded) {
    return (
      <Shell>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "#8A8577" }}>
          <Icon.Loader2 className="spin" size={20} style={{ marginRight: 8 }} />
          <span style={{ fontFamily: "var(--sans)", fontSize: 14 }}>Loading your deck…</span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div>
        <Header
          onOpenSettings={() => setShowSettings((s) => !s)}
          onOpenBackup={() => setShowBackup((s) => !s)}
          onOpenInfo={setInfoPage}
          settingsOpen={showSettings}
          backupOpen={showBackup}
        />
        {autoBackupDue && (
          <CenteredOverlay onClose={() => setAutoBackupDue(false)} maxWidth={340}>
            <div style={{ textAlign: "center" }}>
              <Icon.Download size={22} color="var(--fjord)" style={{ marginBottom: 8 }} />
              <div style={{ fontFamily: "var(--serif)", fontSize: 17, marginBottom: 6 }}>Time for your backup</div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>
                Automatic backups are on for this device. One tap saves your current progress.
              </div>
              <button onClick={runAutoBackup} style={{ ...smallBtn("var(--fjord)"), width: "100%", padding: "10px", fontSize: 14 }}>
                Back up now
              </button>
            </div>
          </CenteredOverlay>
        )}
        {backupReminder && (
          <div
            style={{
              margin: "0 18px 14px",
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--card)",
              border: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Icon.Download size={15} color="var(--fjord)" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>
              Haven't backed up in a while — your progress only lives on this device until you do.
            </span>
            <button
              onClick={() => {
                setShowBackup(true);
                setBackupReminder(false);
              }}
              style={{ ...smallBtn("var(--fjord)"), padding: "6px 12px", fontSize: 12, flexShrink: 0 }}
            >
              Back up
            </button>
            <button
              onClick={dismissBackupReminder}
              aria-label="Dismiss"
              style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: 4, flexShrink: 0, display: "flex" }}
            >
              <Icon.X size={14} />
            </button>
          </div>
        )}
        {showSettings && (
          <CenteredOverlay onClose={() => setShowSettings(false)}>
            <AISettingsPanel
              onClose={(chosenEngine) => {
                setShowSettings(false);
                if (chosenEngine) {
                  // Trust what was just chosen in this session rather than
                  // re-reading storage, which can be unreliable in restricted
                  // preview contexts (e.g. iOS Quick Look) even right after a
                  // successful write.
                  setEngine(chosenEngine);
                } else {
                  refreshEngine();
                }
              }}
            />
          </CenteredOverlay>
        )}
        {infoPage && <InfoSheet pageId={infoPage} onClose={() => setInfoPage(null)} />}
        <DanishVoiceNote />
        <SyncOffer loaded={loaded} supported={sync.supported} enabled={sync.enabled} calm={calm} cards={cards} knownCount={knownCount} onTurnOn={sync.enable} />
        {showBackup && (
          <CenteredOverlay onClose={() => setShowBackup(false)}>
            <BackupPanel cards={cards} categories={categories} replaceAllData={replaceAllData} sync={sync} showToast={showToast} onClose={() => setShowBackup(false)} />
          </CenteredOverlay>
        )}
      </div>
      <div style={{ padding: "0 16px calc(96px + env(safe-area-inset-bottom, 0px))" }}>
        {tab === "study" && <StudyView cards={cards} categories={categories} updateCard={updateCard} addCards={addCards} onOpenSettings={() => setShowSettings(true)} showToast={showToast} />}
        {tab === "library" && (
          <LibraryView
            cards={cards}
            categories={categories}
            updateCard={updateCard}
            deleteCard={deleteCard}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
        {tab === "add" && <AddCardView categories={categories} addCategory={addCategory} addCards={addCards} onOpenSettings={() => setShowSettings(true)} />}
        {tab === "chat" && (
          <ChatView
            categories={categories}
            addCategory={addCategory}
            addCards={addCards}
            showToast={showToast}
            engine={engine}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
      </div>
      <TabBar tab={tab} setTab={setTab} />
      {toast && <Toast msg={toast} />}
    </Shell>
  );
}
