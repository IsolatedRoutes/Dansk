// ---------- Smart review (spaced repetition without buttons) ----------
// There are no sessions: the deck is one endless stream. Each card carries a
// "due" time. What you do with a card (how long you look before flipping,
// whether you open the lightbulb or ask about it, whether you swipe past
// without flipping) tells the app how it went, and that decides how long the
// card waits before coming back. Plain logic, no screens (StudyView uses it;
// tests/srs_check.mjs tests it).
//
// Fields saved on a card (all optional; a card with none is simply "new"):
//   srsN      how many times it has been looked at
//   srsLvl    its step on the ladder below (0 = soon, 7 = about six months)
//   srsDue    when it should come back (ms)
//   srsAt     when it was last looked at (ms)
//   srsSkips  swipes past it without flipping, in a row
// A card marked known leaves the stream (it returns only through level-up).

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// How long a card waits at each step.
export const LADDER = [20 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY, 80 * DAY, 180 * DAY];
export const MAX_LVL = LADDER.length - 1;

// Looking time before the flip.
export const QUICK_MS = 2500; // under this: knew it, or didn't try
export const EFFORT_MS = 8000; // up to AWAY_MS: really trying to recall
export const AWAY_MS = 30000; // longer than this: probably looked away, so ignored

export const SRS_FIELDS = ["srsN", "srsLvl", "srsDue", "srsAt", "srsSkips"];

export const srsSeen = (c) => (c.srsN || 0) > 0;

// "help" = lightbulb or ask, "skip" = swiped past without flipping,
// "effort" = long think, "quick" = instant, "ok" = in between.
export function classifyView({ flipDelay, help }) {
  if (help) return "help";
  if (flipDelay == null) return "skip";
  if (flipDelay > AWAY_MS) return "ok";
  if (flipDelay >= EFFORT_MS) return "effort";
  if (flipDelay < QUICK_MS) return "quick";
  return "ok";
}

// The fields to save after a card has been looked at.
// `rng` is only for a little spread so cards don't all come due together.
export function nextState(card, view, now = Date.now(), rng = Math.random) {
  const kind = classifyView(view);
  const n = card.srsN || 0;
  const lvl = Math.min(card.srsLvl || 0, MAX_LVL);
  const skips = card.srsSkips || 0;
  const late = card.srsDue && card.srsLvl != null ? now - card.srsDue > 3 * LADDER[lvl] : false;
  let nextLvl = lvl;
  let nextSkips = 0;
  let due;
  if (kind === "skip") {
    // Swiped past: not now. Each repeat pushes it back a day more (up to a
    // week), but it never disappears for good.
    nextSkips = skips + 1;
    due = now + Math.min(nextSkips, 7) * DAY;
  } else {
    if (kind === "help") nextLvl = n > 0 ? Math.max(0, lvl - 2) : 0;
    else if (kind === "effort") nextLvl = n > 0 ? lvl : 0;
    else if (kind === "quick") nextLvl = n > 0 ? lvl + (late ? 1 : 2) : 1;
    else nextLvl = n > 0 ? lvl + (late ? 0 : 1) : 1;
    nextLvl = Math.max(0, Math.min(MAX_LVL, nextLvl));
    due = now + LADDER[nextLvl];
  }
  if (card.starred) due = now + (due - now) * 0.6;
  due = now + Math.round((due - now) * (0.92 + rng() * 0.16));
  return { srsN: n + 1, srsLvl: nextLvl, srsDue: due, srsAt: now, srsSkips: nextSkips };
}

// True when the card should be shown again a few cards later in the same
// stream, rather than waiting (a struggle, or a first look that was hard).
export const comesBackSoon = (state) => state.srsLvl === 0 && state.srsSkips === 0;

// ---------- choosing what comes next ----------

// Overdue cards, the most forgotten (late compared with their own wait) first.
export function dueCards(cards, now) {
  return cards
    .filter((c) => srsSeen(c) && (c.srsDue || 0) <= now)
    .map((c) => ({ c, late: (now - (c.srsDue || 0)) / LADDER[Math.min(c.srsLvl || 0, MAX_LVL)] }))
    .sort((a, b) => b.late - a.late)
    .map((x) => x.c);
}

// The newest time anything was looked at (0 when nothing has been).
export function lastActivity(cards) {
  let t = 0;
  for (const c of cards) if ((c.srsAt || 0) > t) t = c.srsAt;
  return t;
}

// Picks up to `size` cards: reviews that are due mixed with new words (about
// one card in three is new, and always at least some, so it stays interesting).
//   cards    candidates already filtered by the person's choices (not known)
//   rankOf   (card) => number, lower = introduced sooner (learningOrder.js)
//   exclude  Set of ids not to pick (already queued)
//   away     true right after a long break: reviews are kept to a handful
// Returns an array of ids in the order to show them.
export function planBatch(cards, { now = Date.now(), size = 30, rankOf = () => 0, exclude = new Set(), away = false, rng = Math.random } = {}) {
  const pool = cards.filter((c) => !exclude.has(c.id));
  const due = dueCards(pool, now);
  const fresh = pool
    .filter((c) => !srsSeen(c))
    .map((c) => ({ c, r: rankOf(c) }))
    .sort((a, b) => a.r - b.r);
  const backlog = due.length;
  let newWanted = Math.round(size / 3);
  let dueCap = size - newWanted;
  if (backlog > 40) dueCap = Math.floor(size / 2); // a big backlog never takes over
  if (away) dueCap = Math.min(dueCap, 8); // ease back in
  const dueUse = due.slice(0, dueCap);
  newWanted = Math.max(newWanted, size - dueUse.length);
  // Take the next few in the planned order but not rigidly: a random pick
  // from the front of the line, shown in line order.
  const window = fresh.slice(0, Math.max(newWanted * 3, newWanted));
  const picked = [];
  const left = window.slice();
  while (picked.length < newWanted && left.length) {
    // Earlier in the line is more likely.
    const i = Math.min(left.length - 1, Math.floor(Math.pow(rng(), 1.7) * left.length));
    picked.push(left.splice(i, 1)[0]);
  }
  picked.sort((a, b) => a.r - b.r);
  const newUse = picked.map((x) => x.c);
  // Blend: every third slot is a new word (after a break, start with two).
  const out = [];
  let di = 0;
  let ni = 0;
  const total = dueUse.length + newUse.length;
  for (let i = 0; i < total; i++) {
    const wantNew = away ? i < 2 || i % 3 === 2 : i % 3 === 2;
    if ((wantNew && ni < newUse.length) || di >= dueUse.length) out.push(newUse[ni++].id);
    else out.push(dueUse[di++].id);
  }
  return out;
}
