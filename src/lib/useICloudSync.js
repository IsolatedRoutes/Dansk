// The part of the app that keeps the deck in step with iCloud: turning it on
// and off, syncing when something changes, and the one-time offer.
import { useCallback, useEffect, useRef, useState } from "react";
import { icloudAvailable, icloudSupported, loadPreSyncCopy, onICloudChange, savePreSyncCopy, syncOnce } from "./icloud";
import { storeGet, storeSet } from "./storage";

const MESSAGES = {
  NO_ICLOUD: "iCloud isn't available. Make sure you're signed in to iCloud, and that iCloud is allowed for Broen in Settings.",
  INCOMPLETE: "Your other device's progress is still arriving. This will finish by itself.",
  TOO_BIG: "Your deck is too large for iCloud sync. Nothing was lost; use Export in Backup instead.",
  SAVE_FAILED: "Couldn't save the combined deck. Nothing was lost.",
};
const messageFor = (e) => MESSAGES[e && e.message] || "Sync didn't finish. It will try again.";

export function useICloudSync({ loaded, cards, categories, cardsRef, categoriesRef, persistCards, persistCategories, replaceAllData }) {
  const supported = icloudSupported();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState({ state: "idle", message: "", at: 0 });
  const [earlierAt, setEarlierAt] = useState(0);
  const chain = useRef(Promise.resolve());
  const enabledRef = useRef(false);
  enabledRef.current = enabled;

  const runSync = useCallback(() => {
    // One at a time, in order.
    chain.current = chain.current.then(async () => {
      if (!enabledRef.current) return;
      setStatus((s) => ({ ...s, state: "syncing", message: "" }));
      try {
        const at = await syncOnce({
          getCards: () => cardsRef.current,
          getCategories: () => categoriesRef.current,
          saveCards: persistCards,
          saveCategories: persistCategories,
        });
        setStatus({ state: "ok", message: "", at });
      } catch (e) {
        setStatus((s) => ({ state: "error", message: messageFor(e), at: s.at }));
        if (e && e.message === "INCOMPLETE") setTimeout(() => enabledRef.current && runSync(), 6000);
      }
    });
    return chain.current;
  }, [cardsRef, categoriesRef, persistCards, persistCategories]);

  // Remember the choice across restarts.
  useEffect(() => {
    if (!supported) return;
    (async () => {
      setEnabled((await storeGet("icloudSync")) === "1");
      const last = Number(await storeGet("icloudLastSync")) || 0;
      if (last) setStatus((s) => ({ ...s, at: last }));
      const copy = await loadPreSyncCopy();
      setEarlierAt(copy ? copy.at : 0);
    })();
  }, [supported]);

  // Sync at start, when the app comes back, and when another device saves.
  useEffect(() => {
    if (!supported || !loaded || !enabled) return undefined;
    runSync();
    const stop = onICloudChange(() => runSync());
    const onVisible = () => { if (document.visibilityState === "visible") runSync(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supported, loaded, enabled, runSync]);

  // Share changes made here, a moment after the last one.
  useEffect(() => {
    if (!supported || !loaded || !enabled) return undefined;
    const t = setTimeout(() => runSync(), 4000);
    return () => clearTimeout(t);
  }, [supported, loaded, enabled, cards, categories, runSync]);

  // A changed Study choice is shared a moment later too.
  useEffect(() => {
    if (!supported || !loaded || !enabled) return undefined;
    let t;
    const onStamped = () => { clearTimeout(t); t = setTimeout(() => runSync(), 4000); };
    window.addEventListener("dansk-settings-stamped", onStamped);
    return () => { clearTimeout(t); window.removeEventListener("dansk-settings-stamped", onStamped); };
  }, [supported, loaded, enabled, runSync]);

  const enable = useCallback(async () => {
    if (!(await icloudAvailable())) {
      setStatus((s) => ({ ...s, state: "error", message: MESSAGES.NO_ICLOUD }));
      return false;
    }
    // A copy of the deck as it is right now, so there's always a way back.
    await savePreSyncCopy(cardsRef.current, categoriesRef.current);
    setEarlierAt(Date.now());
    await storeSet("icloudSync", "1");
    enabledRef.current = true;
    setEnabled(true);
    setStatus((s) => ({ ...s, state: "syncing", message: "" }));
    return true;
  }, [cardsRef, categoriesRef]);

  const disable = useCallback(async () => {
    await storeSet("icloudSync", "0");
    enabledRef.current = false;
    setEnabled(false);
    setStatus((s) => ({ ...s, state: "idle", message: "" }));
  }, []);

  // Puts the deck back as it was just before sync was turned on.
  const goBack = useCallback(async () => {
    const copy = await loadPreSyncCopy();
    if (!copy) return false;
    await storeSet("icloudSync", "0");
    enabledRef.current = false;
    setEnabled(false);
    return replaceAllData(copy.cards, copy.categories);
  }, [replaceAllData]);

  return { supported, enabled, status, earlierAt, enable, disable, goBack };
}
