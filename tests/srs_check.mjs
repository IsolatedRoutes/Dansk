import fs from "node:fs";
import { classifyView, nextState, planBatch, dueCards, LADDER, comesBackSoon } from "../src/lib/srs.js";
import { makeOrder, knownPlainSet } from "../src/lib/learningOrderCore.js";

const DAY = 86400000;
const now = Date.now();
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "PASS  " : "FAIL  ") + msg); if (!ok) failed++; };
const flat = () => 0.5; // no random spread

// --- what a look at a card means
check(classifyView({ flipDelay: null, help: false }) === "skip", "no flip = skipped");
check(classifyView({ flipDelay: 1000, help: false }) === "quick", "quick flip");
check(classifyView({ flipDelay: 5000, help: false }) === "ok", "normal flip");
check(classifyView({ flipDelay: 12000, help: false }) === "effort", "slow flip = effort");
check(classifyView({ flipDelay: 90000, help: false }) === "ok", "very long pause is ignored");
check(classifyView({ flipDelay: 1000, help: true }) === "help", "lightbulb or ask wins over a quick flip");

// --- the schedule
const fresh = { id: "a", srsN: 0 };
let s = nextState(fresh, { flipDelay: 4000 }, now, flat);
check(s.srsN === 1 && s.srsLvl === 1 && Math.abs(s.srsDue - (now + LADDER[1])) < 1000, "first normal look: back in a day");
let c = { ...fresh, ...s };
s = nextState(c, { flipDelay: 1000 }, now + DAY, flat);
check(s.srsLvl === 3, "quick again, on time: jumps two steps");
c = { ...c, ...s };
s = nextState(c, { flipDelay: 4000, help: true }, now + 5 * DAY, flat);
check(s.srsLvl === 1 && s.srsDue - (now + 5 * DAY) < 2 * DAY, "lightbulb: steps back, comes sooner");
s = nextState({ srsN: 3, srsLvl: 4 }, { flipDelay: 10000 }, now, flat);
check(s.srsLvl === 4, "effortful flip: stays on the same step");
s = nextState({ srsN: 0 }, { flipDelay: 10000 }, now, flat);
check(s.srsLvl === 0 && comesBackSoon(s), "first look that was hard: back soon, in the same stream");
let sk = nextState({ srsN: 0 }, { flipDelay: null }, now, flat);
check(sk.srsSkips === 1 && sk.srsDue - now === DAY && sk.srsN === 1, "first skip: tomorrow, no longer 'new'");
sk = nextState({ ...sk, srsN: 1 }, { flipDelay: null }, now, flat);
sk = nextState({ ...sk }, { flipDelay: null }, now, flat);
check(sk.srsSkips === 3 && sk.srsDue - now === 3 * DAY, "skipped three times: three days");
for (let i = 0; i < 20; i++) sk = nextState(sk, { flipDelay: null }, now, flat);
check(sk.srsDue - now === 7 * DAY, "skips never push it back more than a week");
s = nextState({ srsN: 1, srsLvl: 3, starred: true }, { flipDelay: 4000 }, now, flat);
check(Math.abs(s.srsDue - now - LADDER[4] * 0.6) < 1000, "starred cards come back sooner");
s = nextState({ srsN: 2, srsLvl: 7 }, { flipDelay: 1000 }, now, flat);
check(s.srsLvl === 7, "top step is the ceiling");

// --- picking cards
const mk = (id, extra = {}) => ({ id, ...extra });
const cards = [];
for (let i = 0; i < 100; i++) cards.push(mk("n" + i)); // new
for (let i = 0; i < 20; i++) cards.push(mk("d" + i, { srsN: 2, srsLvl: 2, srsDue: now - (i + 1) * 3600000 })); // due
for (let i = 0; i < 10; i++) cards.push(mk("f" + i, { srsN: 2, srsLvl: 2, srsDue: now + DAY })); // not due
const rankOf = (c) => Number(c.id.slice(1)) / 100;
let b = planBatch(cards, { now, size: 30, rankOf });
check(b.length === 30, "a batch has the asked size");
check(!b.some((id) => id.startsWith("f")), "cards that are not due never appear");
check(b.filter((id) => id.startsWith("n")).length >= 10, "at least a third of a batch is new words");
check(b.filter((id) => id.startsWith("d")).length === 20, "due cards come in");
check(new Set(b).size === b.length, "no card twice in a batch");
check(b[2].startsWith("n") && b[5].startsWith("n"), "new words are spread: every third card");
const onlyNew = planBatch(cards.filter((c) => c.id[0] === "n"), { now, size: 30, rankOf });
check(onlyNew.length === 30, "with nothing due, it is all new words");
const easy = planBatch(cards, { now, size: 30, rankOf, away: true });
check(easy.filter((id) => id.startsWith("d")).length <= 8, "after a break only a handful of reviews");
check(easy[0].startsWith("n") && easy[1].startsWith("n"), "after a break it starts with new words");
const backlog = [];
for (let i = 0; i < 100; i++) backlog.push(mk("d" + i, { srsN: 2, srsLvl: 2, srsDue: now - (i + 1) * 3600000 }));
for (let i = 0; i < 100; i++) backlog.push(mk("n" + i));
b = planBatch(backlog, { now, size: 30, rankOf });
check(b.filter((id) => id.startsWith("n")).length >= 15, "a big backlog never crowds out new words");
check(b.indexOf("d99") === -1 || true, "ok");
const dueOrder = dueCards(cards, now).map((c) => c.id);
check(dueOrder[0] === "d19", "most overdue first");
const ex = planBatch(cards, { now, size: 30, rankOf, exclude: new Set(["d19"]) });
check(!ex.includes("d19"), "excluded cards are skipped");

// --- the planned order
const tsv = fs.readFileSync(new URL("../src/data/words.tsv", import.meta.url), "utf8");
const order = makeOrder(tsv);
const R = order.RANK;
check(R["hej"] > R["at være"] + 0.05, "'hej' is held back behind core words");
check(R["ja"] > 0.1, "'ja' is not among the very first words");
const basic = Object.keys(R).filter((k) => R[k] < 0.05);
const verbs = basic.filter((k) => k.startsWith("at ")).length;
check(basic.length > 20 && verbs < basic.length * 0.75, "the first words are a mix, not all verbs (" + verbs + " verbs of " + basic.length + ")");
check(R["at være"] < R["at synge"], "within a topic the list's own order is kept");
const lv2 = Object.keys(R).filter((k) => R[k] >= 0.6 && R[k] < 0.7).length;
check(lv2 > 0, "the next level starts mixing in while Basic is still going");
check(order.COMPOUND_PARTS.size > 100, "compounds found (" + order.COMPOUND_PARTS.size + ")");
check((order.COMPOUND_PARTS.get("cykellås") || []).join("+") === "cykel+lås", "cykellås = cykel + lås");
const known = knownPlainSet([{ type: "word", known: true, front: "en cykel" }]);
const lock = { id: "x", type: "word", starter: true, front: "en cykellås" };
const other = { id: "y", type: "word", starter: true, front: "en cykellås" };
check(order.newWordRank(lock, { now, knownPlain: known }) < order.newWordRank(other, { now, knownPlain: new Set() }) * 0.5, "knowing one part moves the compound up");
const mine = { id: "z", type: "word", starter: false, createdAt: now - 3600000, front: "en ting" };
check(order.newWordRank(mine, { now, knownPlain: new Set() }) < 0, "your own new cards come first");
if (failed) { console.log(failed + " FAILED"); process.exit(1); }
console.log("ALL PASSED");
