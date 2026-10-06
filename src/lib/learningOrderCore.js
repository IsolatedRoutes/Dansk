// ---------- The planned order of new words ----------
// New words are introduced along a path, not in a random shuffle:
//  - Basic first, but the next level starts to mix in once Basic is partly
//    done (see LEVEL_SHIFT), so a learner with some foundation keeps moving.
//  - Within a level the topics are interleaved, so a few verbs, a few food
//    words, a few travel words... come in turn instead of one long list of
//    verbs. Inside each topic the built-in list's own order is kept (the most
//    useful words are written first).
//  - Very short greetings and yes/no words are held back a little: a learner
//    with some foundation doesn't need "hej" and "ja" as the first cards.
//  - A compound with a part you already know comes sooner: it teaches you
//    the other part (cykellås after cykel). Same for a phrase built on a
//    known word.
// Plain logic, no screens (tests/srs_check.mjs).
import { frontKey } from "./text.js";

// Level 2 starts mixing in when Basic is this far along, and so on.
export const LEVEL_SHIFT = 0.6;
// Easy "starter" words held back (as a share of their level).
const HELD_BACK = new Set(["hej", "ja", "nej", "hejsa", "hej med dig", "hejsa med dig", "farvel", "tak", "ja tak", "nej tak", "undskyld", "goddag", "godmorgen", "godnat", "godaften"]);
const HELD_BACK_BY = 0.12;
const PLAIN = /^(en|et|at)\s+/;

export const plainKey = (front) => frontKey(front).replace(PLAIN, "");

export function makeOrder(WORD_DATA) {
  // rank[frontKey] = position on the path (smaller = sooner).
  const RANK = {};
  // plain single word -> its two parts, when it is a compound of listed words.
  const COMPOUND_PARTS = new Map();
  const rows = [];
  WORD_DATA.split("\n").forEach((line) => {
    const [da, en, code, level, , , , , cls] = line.split("\t");
    if (!da || !en) return;
    rows.push({ key: frontKey(da), level: Math.min(4, Math.max(1, Number(level) || 1)), group: code || "c:" + (cls || "") });
  });
  for (let level = 1; level <= 4; level++) {
    const items = rows.filter((r) => r.level === level);
    if (!items.length) continue;
    const groups = new Map();
    items.forEach((r) => {
      if (!groups.has(r.group)) groups.set(r.group, []);
      groups.get(r.group).push(r);
    });
    // Fair interleaving: every item gets a share of the way through its own
    // topic; sorting by that mixes the topics in proportion to their size.
    const order = [];
    let gi = 0;
    groups.forEach((list) => {
      list.forEach((r, i) => order.push({ r, t: (i + 0.5) / list.length, g: gi }));
      gi++;
    });
    order.sort((a, b) => a.t - b.t || a.g - b.g);
    order.forEach((o, i) => {
      let frac = order.length > 1 ? i / (order.length - 1) : 0;
      if (HELD_BACK.has(plainKey(o.r.key))) frac += HELD_BACK_BY;
      RANK[o.r.key] = frac + LEVEL_SHIFT * (level - 1);
    });
  }
  // Compounds: a listed word that is two other listed words joined, with an
  // optional linking s or e (cykel + lås, bog + s + hylde).
  const plains = new Set();
  rows.forEach((r) => {
    const p = plainKey(r.key);
    if (!p.includes(" ") && p.length >= 3) plains.add(p);
  });
  plains.forEach((word) => {
    for (let i = word.length - 3; i >= 4; i--) {
      const left = word.slice(0, i);
      const rest = word.slice(i);
      if (!plains.has(left)) continue;
      const tail = plains.has(rest) ? rest : /^[se]/.test(rest) && plains.has(rest.slice(1)) ? rest.slice(1) : null;
      if (tail) {
        COMPOUND_PARTS.set(word, [left, tail]);
        return;
      }
    }
  });

  const rankFor = (card) => {
    const r = RANK[frontKey(card.front)];
    return r == null ? 0.5 : r;
  };

  // What the batch planner sorts new words by. `ctx` = { now, knownPlain }.
  const newWordRank = (card, ctx) => {
    const now = ctx.now;
    const stamp = Math.max(card.recentTouch || 0, card.starter ? 0 : card.createdAt || 0);
    const TWO_WEEKS = 14 * 24 * 3600 * 1000;
    // Cards the learner added themselves come first while they are new.
    if (stamp && now - stamp < TWO_WEEKS) return -1 + ((now - stamp) / TWO_WEEKS) * 0.5;
    let r = rankFor(card);
    const plain = plainKey(card.front);
    const parts = COMPOUND_PARTS.get(plain);
    if (parts && parts.some((p) => ctx.knownPlain.has(p))) r *= 0.3;
    else if (card.type === "word" && plain.includes(" ") && plain.split(/\s+/).some((w) => ctx.knownPlain.has(w))) r *= 0.55;
    if (card.starred) r *= 0.4;
    return r;
  };

  return { RANK, COMPOUND_PARTS, rankFor, newWordRank };
}

export function knownPlainSet(cards) {
  const set = new Set();
  cards.forEach((c) => {
    if (c.known && c.type === "word") set.add(plainKey(c.front));
  });
  return set;
}
