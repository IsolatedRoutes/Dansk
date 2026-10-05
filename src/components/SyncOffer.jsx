import { useEffect, useRef, useState } from "react";
import { icloudAvailable } from "../lib/icloud";
import { storeGet, storeSet } from "../lib/storage";
import { Icon } from "./icons";
import { CenteredOverlay, smallBtn } from "./ui";

// Offers iCloud sync once, early on (after about 15 changes or the second
// time the app is opened), and gently one more time after about 25 known
// words. Never again after that. Only in the iPhone app, only when the
// person has not already turned sync on, and never over another popup.
const FIRST_AFTER_ACTIONS = 15;
const SECOND_AFTER_KNOWN = 25;

export function SyncOffer({ loaded, supported, enabled, calm, cards, knownCount, onTurnOn }) {
  const [open, setOpen] = useState(false);
  const state = useRef(null); // { opens, actions, asks }
  const firstCards = useRef(null);

  function save() {
    storeSet("syncPrompt", JSON.stringify(state.current)).catch(() => {});
  }

  // Load the counters and count this opening of the app.
  useEffect(() => {
    if (!supported || !loaded) return;
    (async () => {
      let s = { opens: 0, actions: 0, asks: 0 };
      try {
        const saved = JSON.parse((await storeGet("syncPrompt")) || "null");
        if (saved && typeof saved === "object") s = { ...s, ...saved };
      } catch { /* start fresh */ }
      s.opens += 1;
      state.current = s;
      save();
      check();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, loaded]);

  // Every change to the deck after opening counts as one action.
  useEffect(() => {
    if (!state.current) return;
    if (firstCards.current === null) { firstCards.current = cards; return; }
    if (cards === firstCards.current) return;
    firstCards.current = cards;
    state.current.actions += 1;
    if (state.current.actions % 3 === 0) save();
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { check(); }, [calm, knownCount, enabled]);

  async function check() {
    const s = state.current;
    if (!s || open || enabled || !calm || s.asks >= 2) return;
    const due = s.asks === 0 ? s.opens >= 2 || s.actions >= FIRST_AFTER_ACTIONS : s.opens >= 3 && knownCount >= SECOND_AFTER_KNOWN;
    if (!due) return;
    if (!(await icloudAvailable())) return; // no point offering what can't work
    setOpen(true);
  }

  function answer(turnOn) {
    state.current.asks += 1;
    save();
    setOpen(false);
    if (turnOn) onTurnOn();
  }

  if (!open) return null;
  return (
    <CenteredOverlay onClose={() => answer(false)} maxWidth={340}>
      <div style={{ textAlign: "center" }}>
        <Icon.Cloud size={22} color="var(--fjord)" style={{ marginBottom: 8 }} />
        <div style={{ fontFamily: "var(--serif)", fontSize: 17, marginBottom: 6 }}>Keep your progress in iCloud?</div>
        <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>
          Your progress is shared between your own devices through your own iCloud. It never goes to us or anyone else. You can turn it off anytime in Backup.
        </div>
        <button onClick={() => answer(true)} style={{ ...smallBtn("var(--fjord)"), width: "100%", padding: "10px", fontSize: 14, marginBottom: 8 }}>
          Turn on
        </button>
        <button onClick={() => answer(false)} style={{ ...smallBtn("#A8A395"), width: "100%", padding: "10px", fontSize: 14 }}>
          Not now
        </button>
      </div>
    </CenteredOverlay>
  );
}
