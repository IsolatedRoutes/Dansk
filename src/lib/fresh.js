// Cards you added yourself (typed in, read from a photo, or made in the
// Assistant) should come back soon and often while they are new, then settle
// down to the normal rate. Pure logic, no screens: StudyView uses it when it
// builds a session.
//
//  - first 3 days: up to the 10 newest appear three times in the first ~30
//    cards of the session, spaced out (plus once in the normal shuffle)
//  - days 3 to 14: twice as likely as an ordinary card
//  - after that: ordinary
// Known cards never come back as themselves (that's handled elsewhere).

const DAY = 24 * 60 * 60 * 1000;
export const FRESH_MS = 3 * DAY;
export const MID_MS = 14 * DAY;
export const FRESH_LIMIT = 10; // so a big batch from a photo can't take over a session
export const FRESH_ROUNDS = 3;

// When the card was added, or last "touched" by trying to add it again.
// Built-in words only count when touched; they have a seed time that isn't
// the learner's doing.
export function addedStamp(c) {
  return Math.max(c.recentTouch || 0, c.starter ? 0 : c.createdAt || 0);
}

export function freshness(c, now) {
  const stamp = addedStamp(c);
  if (!stamp) return "none";
  const age = now - stamp;
  if (age < FRESH_MS) return "fresh";
  if (age < MID_MS) return "mid";
  return "none";
}

// The newest cards (up to FRESH_LIMIT) that get early, repeated slots.
export function pickFresh(cards, now) {
  return cards
    .filter((c) => freshness(c, now) === "fresh")
    .sort((a, b) => addedStamp(b) - addedStamp(a))
    .slice(0, FRESH_LIMIT)
    .map((c) => c.id);
}

// Puts each picked card into the (already shuffled) session list a few
// times, spaced out, near the start. `entries` are { id, up, key } objects.
export function placeFresh(entries, freshIds, rng = Math.random) {
  const slots = [];
  for (let r = 0; r < FRESH_ROUNDS; r++) {
    const order = freshIds.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((id, k) => slots.push({ id, index: 2 + r * 10 + k * 2 }));
  }
  slots.sort((a, b) => a.index - b.index);
  for (const s of slots) entries.splice(Math.min(s.index, entries.length), 0, { id: s.id, up: null, key: 0 });
  return entries;
}
