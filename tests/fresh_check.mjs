import { freshness, pickFresh, placeFresh, FRESH_LIMIT } from "../src/lib/fresh.js";

const DAY = 86400000;
const now = Date.now();
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "PASS  " : "FAIL  ") + msg); if (!ok) failed++; };

const own = (id, ageDays) => ({ id, starter: false, createdAt: now - ageDays * DAY });
const starter = (id) => ({ id, starter: true, createdAt: now - 400 * DAY });

check(freshness(own("a", 1), now) === "fresh", "own card added yesterday is fresh");
check(freshness(own("a", 7), now) === "mid", "own card added a week ago is mid");
check(freshness(own("a", 30), now) === "none", "own card added a month ago is ordinary");
check(freshness(starter("s"), now) === "none", "built-in card is ordinary");
check(freshness({ ...starter("s"), recentTouch: now - DAY }, now) === "fresh", "built-in card you tried to add again is fresh");

// A session of 500 shuffled cards; 3 brand-new own cards.
const base = Array.from({ length: 500 }, (_, i) => ({ id: "c" + i, up: null, key: i }));
const freshIds = pickFresh([own("n1", 0.1), own("n2", 0.2), own("n3", 0.3), own("old", 40), starter("s")], now);
check(freshIds.length === 3 && !freshIds.includes("old"), "only recently added cards are picked");
const placed = placeFresh(base.slice(), freshIds);
const first30 = placed.slice(0, 30).map((e) => e.id);
for (const id of freshIds) {
  const spots = first30.map((x, i) => (x === id ? i : -1)).filter((i) => i >= 0);
  check(spots.length === 3, id + " appears 3 times in the first 30 cards (" + spots + ")");
  check(spots.every((v, i) => i === 0 || v - spots[i - 1] >= 5), id + " repeats are spaced out");
}
check(placed.length === base.length + 9, "nothing else was removed from the session");

// One brand-new card: not stacked together.
const one = placeFresh(base.slice(), ["n1"]).slice(0, 30).map((e) => e.id);
const at = one.map((x, i) => (x === "n1" ? i : -1)).filter((i) => i >= 0);
check(at.length === 3 && at[1] - at[0] >= 8 && at[2] - at[1] >= 8, "a single new card comes back spread across the start (" + at + ")");

// A big batch (40 cards from a photo) cannot take over the session.
const batch = Array.from({ length: 40 }, (_, i) => own("b" + i, i / 100));
const picked = pickFresh(batch, now);
check(picked.length === FRESH_LIMIT, "a big batch only boosts the newest " + FRESH_LIMIT);
const big = placeFresh(base.slice(), picked).slice(0, 40).filter((e) => e.id.startsWith("b")).length;
check(big < 40, "ordinary cards still appear among a big batch");

console.log("\n" + (failed ? "FAILED: " + failed : "ALL PASSED"));
process.exit(failed ? 1 : 0);
