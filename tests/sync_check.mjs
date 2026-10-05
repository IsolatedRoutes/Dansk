// Checks the sync logic on its own: merging only ever adds, repeating a
// merge changes nothing, and big snapshots survive being packed and read back.
import { buildSnapshot, mergeSnapshot, mergeNotes, writeRemote, readRemote, MAX_PACKED } from "../src/lib/sync.js";

let bad = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) bad++; };
const keyOf = (t, f) => t + ":" + f.trim().toLowerCase();
let n = 0;
const newId = () => "new" + ++n;
const W = (id, front, extra = {}) => ({ id, type: "word", front, back: front + "_en", starter: true, known: false, starred: false, ignored: false, category: "c1", ...extra });
const own = (id, front, extra = {}) => ({ id, type: "word", front, back: "x", starter: false, known: false, category: "mine", ...extra });

// Two phones that studied different words.
const A = [W("1", "hund", { known: true }), W("2", "kat"), W("3", "hest", { starred: true, notes: "stor" }), own("a1", "min egen")];
const B = [W("1b", "hund"), W("2b", "kat", { known: true, upStage: 1, upDue: 50 }), W("3b", "hest", { notes: "stor\nflot" })];
const catsA = [{ id: "c1", name: "Dyr" }, { id: "mine", name: "Mine", custom: true }];
const catsB = [{ id: "c1", name: "Dyr" }];

const snapA = buildSnapshot(A, catsA, ["word:gammel"], keyOf, 1000);
ok(Object.keys(snapA.marks).length === 2 && snapA.own.length === 1, "snapshot holds only marks and own cards");
const r = mergeSnapshot(B, catsB, [], snapA, keyOf, newId);
ok(r.changed, "merge reports a change");
const get = (cards, f) => cards.find((c) => c.front === f);
ok(get(r.cards, "hund").known, "known mark from the other phone arrives");
ok(get(r.cards, "kat").known && get(r.cards, "kat").upStage === 1 && get(r.cards, "kat").upDue === 50, "this phone's own marks and level-up stay");
ok(get(r.cards, "hest").starred && get(r.cards, "hest").notes === "stor\nflot", "star arrives; notes combine without repeats");
ok(get(r.cards, "min egen") && r.cards.length === 4, "own card arrives");
ok(r.categories.some((c) => c.id === "mine"), "own topic arrives");
ok(r.deleted.includes("word:gammel"), "deleted built-in words combine");
ok(B.every((c) => r.cards.find((x) => x.id === c.id)), "nothing on this phone was removed");

// A card deleted on one phone is deleted on the other, unless made again later.
const gone = mergeSnapshot(r.cards, r.categories, r.deleted, { ...snapA, own: [], deletedOwn: [{ k: "word:min egen", t: 9e12 }] }, keyOf, newId);
ok(!get(gone.cards, "min egen") && gone.deletedOwn.length === 1, "an own card deleted on the other phone is removed here too");
const made = mergeSnapshot([own("z", "min egen", { createdAt: 9e12 + 5 })], [], [], { ...snapA, own: [], deletedOwn: [{ k: "word:min egen", t: 9e12 }] }, keyOf, newId);
ok(get(made.cards, "min egen"), "a card made again after the deletion is kept");
// Doing it again changes nothing.
const again = mergeSnapshot(r.cards, r.categories, r.deleted, snapA, keyOf, newId);
ok(!again.changed && again.cards === r.cards, "merging the same copy twice changes nothing");

// Both directions end up equal.
const snapB = buildSnapshot(B, catsB, [], keyOf, 2000);
const rA = mergeSnapshot(A, catsA, ["word:gammel"], snapB, keyOf, newId);
const norm = (cs) => JSON.stringify(cs.map((c) => [c.front, c.known, c.starred, c.notes || "", c.upStage || 0]).sort());
ok(norm(rA.cards) === norm(r.cards), "both phones end with the same marks");

// Same topic made on two phones becomes one.
const r2 = mergeSnapshot(B, [{ id: "t9", name: "mine", custom: true }], [], { ...snapA, categories: [{ id: "mine", name: "Mine", custom: true }] }, keyOf, newId);
ok(r2.categories.length === 1 && get(r2.cards, "min egen").category === "t9", "same-named topics join and cards move to it");

// Packing: normal size, with a deck of 8000 marks and 300 own cards.
const big = [];
for (let i = 0; i < 8000; i++) big.push(W("w" + i, "ord" + i, { known: true, notes: i % 20 === 0 ? "en note om ord " + i : "" }));
for (let i = 0; i < 300; i++) big.push(own("o" + i, "egen " + i, { back: "my own card " + i, examples: [{ da: "Jeg ser egen " + i, en: "I see own " + i }] }));
const store = {};
const kv = { get: async (k) => (k in store ? store[k] : null), set: async (k, v) => { store[k] = v; }, remove: async (k) => { delete store[k]; } };
const bigSnap = buildSnapshot(big, [], [], keyOf, 5);
await writeRemote(kv, bigSnap, "phone-1");
const total = Object.values(store).reduce((s, v) => s + v.length, 0);
ok(total < MAX_PACKED, "8,000 known words + 300 own cards fit in iCloud's limit (" + total + " characters)");
const back = await readRemote(kv);
ok(back && JSON.stringify(back.snapshot) === JSON.stringify(bigSnap), "a packed snapshot reads back identically");

// A half-written copy is never used.
const k = Object.keys(store).find((x) => x.endsWith("p0"));
store[k] = store[k].slice(0, -5);
let incomplete = false;
try { await readRemote(kv); } catch (e) { incomplete = e.message === "INCOMPLETE"; }
ok(incomplete, "a half-arrived copy is refused, not used");

// Too big is reported, not lost silently.
let tooBig = false;
const rnd = (len) => Array.from({ length: len }, () => String.fromCharCode(33 + Math.floor(Math.random() * 90))).join("");
const huge = Array.from({ length: 3000 }, (_, i) => own("h" + i, "x" + i + rnd(20), { back: rnd(500) }));
try { await writeRemote(kv, buildSnapshot(huge, [], [], keyOf), "p"); } catch (e) { tooBig = e.message === "TOO_BIG"; }
ok(tooBig, "an oversized deck is reported as too big");
ok(mergeNotes("a\nb", "b\nc") === "a\nb\nc", "notes combine line by line");

process.exit(bad ? 1 : 0);
