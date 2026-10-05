// Checks the sync logic on its own: newest change wins, nothing is lost by
// accident, repeating a merge changes nothing, and big snapshots survive
// being packed and read back.
import { buildSnapshot, mergeSnapshot, mergeNotes, pickKeys, writeRemote, readRemote, MAX_PACKED } from "../src/lib/sync.js";

let bad = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) bad++; };
const keyOf = (t, f) => t + ":" + f.trim().toLowerCase();
let n = 0;
const newId = () => "new" + ++n;
const W = (front, extra = {}) => ({ id: "starter:" + front, type: "word", front, back: front + "_en", starter: true, known: false, starred: false, ignored: false, category: "c1", ...extra });
const own = (id, front, extra = {}) => ({ id, type: "word", front, back: "x", starter: false, known: false, category: "mine", createdAt: 1, ...extra });
const get = (cards, f) => cards.find((c) => c.front === f);
const merge = (cards, cats, snap, tombs = []) => mergeSnapshot(cards, cats, [], snap, keyOf, newId, tombs);
const snapOf = (cards, cats = [], extra = {}) => ({ ...buildSnapshot(cards, cats, [], keyOf, 1000), ...extra });

// ---- two phones that studied different words (cards never stamped) ----
const A = [W("hund", { known: true }), W("kat"), W("hest", { starred: true, notes: "stor" }), own("a1", "min egen")];
const B = [W("hund"), W("kat", { known: true, upStage: 1, upDue: 50 }), W("hest", { notes: "stor\nflot" })];
const catsA = [{ id: "c1", name: "Dyr" }, { id: "mine", name: "Mine", custom: true }];
const catsB = [{ id: "c1", name: "Dyr" }];
const snapA = buildSnapshot(A, catsA, ["word:gammel"], keyOf, 1000);
ok(Object.keys(snapA.marks).length === 2 && snapA.own.length === 1, "snapshot holds only marked built-in cards and own cards");
const r = mergeSnapshot(B, catsB, [], snapA, keyOf, newId, []);
ok(get(r.cards, "hund").known, "known mark from the other phone arrives");
ok(get(r.cards, "kat").known && get(r.cards, "kat").upStage === 1 && get(r.cards, "kat").upDue === 50, "this phone's own marks and level-up stay");
ok(get(r.cards, "hest").starred && get(r.cards, "hest").notes === "stor\nflot", "unstamped marks combine; notes combine without repeats");
ok(get(r.cards, "min egen") && r.cards.length === 4, "added card arrives");
ok(r.categories.some((c) => c.id === "mine"), "own topic arrives");
ok(r.deleted.includes("word:gammel"), "deleted built-in words combine");
const again = mergeSnapshot(r.cards, r.categories, r.deleted, snapA, keyOf, newId, r.deletedOwn);
ok(!again.changed && again.cards === r.cards, "merging the same copy twice changes nothing");
const rA = merge(A, catsA, buildSnapshot(B, catsB, [], keyOf, 2000));
const norm = (cs) => JSON.stringify(cs.map((c) => [c.front, !!c.known, !!c.starred, c.notes || "", c.upStage || 0]).sort());
ok(norm(rA.cards) === norm(r.cards), "both phones end with the same marks");

// ---- newest change wins, including un-marking ----
const t1 = 5000, t2 = 6000;
const onA = [W("hund", { known: true, progressAt: t1 })];
const onB = [W("hund", { known: false, progressAt: t2 })]; // B un-marked it later
ok(!get(merge(onA, [], snapOf(onB)).cards, "hund").known, "un-marking a card on the newer phone reaches the older one");
ok(get(merge(onB, [], snapOf(onA)).cards, "hund").known === false, "an older mark does not undo a newer un-mark");
const star = merge([W("kat")], [], snapOf([W("kat", { starred: true, progressAt: t1 })]));
ok(get(star.cards, "kat").starred && get(star.cards, "kat").progressAt === t1, "a stamped star arrives with its time");
const note = merge([W("kat", { notes: "gammel", progressAt: t1 })], [], snapOf([W("kat", { notes: "ny tekst", progressAt: t2 })]));
ok(get(note.cards, "kat").notes === "ny tekst", "an edited note replaces the older one (not added to it)");

// ---- edits to built-in cards ----
const edited = merge([W("hund")], [], snapOf([W("hund", { back: "dog (my wording)", examples: [{ da: "Hunden løber", en: "The dog runs" }], editedAt: t2 })]));
ok(get(edited.cards, "hund").back === "dog (my wording)" && get(edited.cards, "hund").examples.length === 1, "an edited built-in card arrives");
const stale = merge([W("hund", { back: "newer here", editedAt: t2 })], [], snapOf([W("hund", { back: "older there", editedAt: t1 })]));
ok(!stale.changed || get(stale.cards, "hund").back === "newer here", "an older edit does not overwrite a newer one");
const renamed = merge([W("hund")], [], snapOf([W("hund", { front: "hunden", editedAt: t2 })]));
ok(renamed.cards.length === 1 && renamed.cards[0].front === "hunden", "a renamed built-in card is renamed here, not duplicated");

// ---- edits to added cards ----
const myA = [own("o1", "min egen", { back: "gammel", progressAt: t1 })];
const myB = [own("o1", "min egen", { back: "ny betydning", editedAt: t2, examples: [{ da: "a", en: "b" }] })];
const ed = merge(myA, [], snapOf(myB));
ok(get(ed.cards, "min egen").back === "ny betydning" && get(ed.cards, "min egen").examples.length === 1, "an edited added card arrives, and its marks are kept");
const rename = merge([own("o1", "min egen")], [], snapOf([own("o1", "min nye", { editedAt: t2 })]));
ok(rename.cards.length === 1 && rename.cards[0].front === "min nye", "a renamed added card is renamed here, not duplicated");
const own2 = merge([], [], snapOf([own("o2", "helt ny")]));
ok(own2.cards.length === 1, "a brand-new added card arrives");

// ---- deletions and topics ----
const gone = merge(r.cards, r.categories, { ...snapA, own: [], deletedOwn: [{ k: "word:min egen", t: 9e12 }] });
ok(!get(gone.cards, "min egen") && gone.deletedOwn.length === 1, "an added card deleted on the other phone is removed here too");
const made = merge([own("z", "min egen", { createdAt: 9e12 + 5 })], [], { ...snapA, own: [], deletedOwn: [{ k: "word:min egen", t: 9e12 }] });
ok(get(made.cards, "min egen"), "a card made again after the deletion is kept");
const r2 = merge(B, [{ id: "t9", name: "mine", custom: true }], { ...snapA, categories: [{ id: "mine", name: "Mine", custom: true }] });
ok(r2.categories.length === 1 && get(r2.cards, "min egen").category === "t9", "same-named topics join and cards move to it");

// ---- settings and chat: newest wins ----
const L = { aiEngine: { v: "api", at: 100 }, studySettings: { v: "L1", at: 300 } };
const R = { aiEngine: { v: "gemini", at: 200 }, studySettings: { v: "R1", at: 200 }, aiConsent: { v: "true", at: 0 }, chatHistory: { v: "[1]", at: 50 } };
const pick = pickKeys(L, R);
ok(pick.aiEngine && pick.aiEngine.v === "gemini", "a newer setting from the other device is taken");
ok(!pick.studySettings, "an older setting does not replace a newer one here");
ok(pick.aiConsent && pick.chatHistory, "a setting this device never had is taken");
ok(Object.keys(pickKeys(L, L)).length === 0, "identical settings change nothing");

// ---- packing ----
const big = [];
for (let i = 0; i < 8000; i++) big.push(W("ord" + i, { known: true, progressAt: 5, notes: i % 20 === 0 ? "en note om ord " + i : "" }));
for (let i = 0; i < 300; i++) big.push(own("o" + i, "egen " + i, { back: "my own card " + i, examples: [{ da: "Jeg ser egen " + i, en: "I see own " + i }] }));
const store = {};
const kv = { get: async (k) => (k in store ? store[k] : null), set: async (k, v) => { store[k] = v; }, remove: async (k) => { delete store[k]; } };
const bigSnap = buildSnapshot(big, [], [], keyOf, 5, [], { chatHistory: { v: JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ role: "user", text: "spørgsmål nummer " + i }))), at: 5 } });
await writeRemote(kv, bigSnap, "phone-1");
const total = Object.values(store).reduce((s, v) => s + v.length, 0);
ok(total < MAX_PACKED, "8,000 known words + 300 added cards + a chat fit in iCloud's limit (" + total + " characters)");
const back = await readRemote(kv);
ok(back && JSON.stringify(back.snapshot) === JSON.stringify(bigSnap), "a packed snapshot reads back identically");
const k = Object.keys(store).find((x) => x.endsWith("p0"));
store[k] = store[k].slice(0, -5);
let incomplete = false;
try { await readRemote(kv); } catch (e) { incomplete = e.message === "INCOMPLETE"; }
ok(incomplete, "a half-arrived copy is refused, not used");

// Too big: the chat is left out first; only if it still won't fit is it an error.
const rnd = (len) => Array.from({ length: len }, () => String.fromCharCode(33 + Math.floor(Math.random() * 90))).join("");
const medium = Array.from({ length: 1500 }, (_, i) => own("m" + i, "x" + i + rnd(20), { back: rnd(500) }));
const chatBig = { chatHistory: { v: rnd(600000), at: 1 } };
const s2 = {}; const kv2 = { get: async (k) => s2[k] ?? null, set: async (k, v) => { s2[k] = v; }, remove: async (k) => { delete s2[k]; } };
await writeRemote(kv2, buildSnapshot(medium, [], [], keyOf, 1, [], chatBig), "p");
const got = await readRemote(kv2);
ok(got && !got.snapshot.keys.chatHistory && got.snapshot.own.length === 1500, "when space is short, the chat is left out and the cards still sync");
const huge = Array.from({ length: 3000 }, (_, i) => own("h" + i, "x" + i + rnd(20), { back: rnd(500) }));
let tooBig = false;
try { await writeRemote(kv, buildSnapshot(huge, [], [], keyOf), "p"); } catch (e) { tooBig = e.message === "TOO_BIG"; }
ok(tooBig, "an oversized deck is reported as too big");
ok(mergeNotes("a\nb", "b\nc") === "a\nb\nc", "notes combine line by line");

process.exit(bad ? 1 : 0);
