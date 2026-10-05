// ============================================================
// iCloud sync: what travels, and how two copies are combined.
// Only ever ADDS: a mark, a note or a card that exists on either device ends
// up on both. Nothing is removed by syncing, so syncing can't lose progress.
// This file is plain logic with no screen or phone parts, so it is tested on
// its own (tests/sync_check.mjs).
// ============================================================

export const SNAPSHOT_VERSION = 1;

const hasMark = (c) => !!(c.known || c.starred || c.ignored || c.upStage || (c.notes && c.notes.trim()));

// Notes from two devices are combined line by line, so merging the same
// notes again changes nothing.
export function mergeNotes(a, b) {
  const lines = [];
  [a, b].forEach((n) => (n || "").split("\n").forEach((l) => { if (l.trim() && !lines.includes(l)) lines.push(l); }));
  return lines.join("\n");
}

function sameProgress(a, b) {
  return !!a.known === !!b.known && !!a.starred === !!b.starred && !!a.ignored === !!b.ignored && (a.notes || "") === (b.notes || "") && (a.upStage || 0) === (b.upStage || 0) && (a.upDue || 0) === (b.upDue || 0) && (a.recentTouch || 0) === (b.recentTouch || 0);
}

// Takes the "more progress" of every mark from two copies of one card.
function joinProgress(local, remote) {
  const out = {
    ...local,
    known: !!(local.known || remote.known),
    starred: !!(local.starred || remote.starred),
    ignored: !!(local.ignored || remote.ignored),
    notes: mergeNotes(local.notes, remote.notes),
    upStage: Math.max(local.upStage || 0, remote.upStage || 0),
    upDue: Math.max(local.upDue || 0, remote.upDue || 0),
  };
  const touch = Math.max(local.recentTouch || 0, remote.recentTouch || 0);
  if (touch) out.recentTouch = touch;
  if (!out.upStage) delete out.upStage;
  if (!out.upDue) delete out.upDue;
  return out;
}

// What gets written to iCloud: marks on built-in cards (small), the learner's
// own cards, their own topics, and the built-in words they deleted.
export function buildSnapshot(cards, categories, deletedKeys, keyOf, now = Date.now(), deletedOwn = [], settings = null) {
  const marks = {};
  const own = [];
  cards.forEach((c) => {
    if (c.starter) {
      if (hasMark(c)) {
        const key = keyOf(c.type, c.front);
        const prev = marks[key];
        const m = { known: !!c.known, starred: !!c.starred, ignored: !!c.ignored, upStage: c.upStage || 0, upDue: c.upDue || 0, notes: c.notes || "", recentTouch: c.recentTouch || 0 };
        marks[key] = prev ? joinProgress(prev, m) : m;
      }
    } else {
      own.push(c);
    }
  });
  return {
    v: SNAPSHOT_VERSION,
    at: now,
    marks,
    own,
    categories: categories.filter((c) => c.custom).map((c) => ({ id: c.id, name: c.name, custom: true })),
    deleted: [...deletedKeys],
    deletedOwn,
    settings,
  };
}

// Combines a snapshot from another device into this device's deck.
// Returns { cards, categories, deleted, changed }.
export function mergeSnapshot(cards, categories, deletedKeys, remote, keyOf, newId, deletedOwn = []) {
  if (!remote || remote.v !== SNAPSHOT_VERSION) return { cards, categories, deleted: deletedKeys, deletedOwn, changed: false };
  let changed = false;

  // Own cards deleted on either device stay deleted (a card made again
  // afterwards is newer than the deletion, so it is kept).
  const tombs = new Map(deletedOwn.map((d) => [d.k, d.t]));
  (remote.deletedOwn || []).forEach((d) => {
    if ((tombs.get(d.k) || 0) < d.t) { tombs.set(d.k, d.t); changed = true; }
  });
  const isGone = (c) => !c.starter && tombs.has(keyOf(c.type, c.front)) && (c.createdAt || 0) <= tombs.get(keyOf(c.type, c.front));

  // Topics: add any the other device has; match by name so two devices that
  // each made "Travel" end up with one.
  const nextCategories = [...categories];
  const catMap = {};
  (remote.categories || []).forEach((rc) => {
    const same = nextCategories.find((c) => c.id === rc.id) || nextCategories.find((c) => (c.name || "").trim().toLowerCase() === (rc.name || "").trim().toLowerCase());
    if (same) catMap[rc.id] = same.id;
    else {
      nextCategories.push(rc);
      catMap[rc.id] = rc.id;
      changed = true;
    }
  });

  const byKey = new Map();
  cards.forEach((c) => byKey.set(keyOf(c.type, c.front), c));
  const usedIds = new Set(cards.map((c) => c.id));
  const nextCards = cards.filter((c) => { if (isGone(c)) { changed = true; return false; } return true; }).map((c) => {
    const key = keyOf(c.type, c.front);
    let rm = c.starter ? (remote.marks || {})[key] : null;
    if (!c.starter) {
      const ro = (remote.own || []).find((o) => keyOf(o.type, o.front) === key);
      if (ro) rm = ro;
    }
    if (!rm) return c;
    const merged = joinProgress(c, rm);
    if (sameProgress(c, merged)) return c;
    changed = true;
    return merged;
  });

  (remote.own || []).forEach((o) => {
    const key = keyOf(o.type, o.front);
    if (byKey.has(key) || isGone(o)) return;
    byKey.set(key, true);
    let card = { ...o, starter: false };
    if (card.category && catMap[card.category]) card.category = catMap[card.category];
    if (usedIds.has(card.id)) card = { ...card, id: newId() };
    usedIds.add(card.id);
    nextCards.push(card);
    changed = true;
  });

  const deleted = new Set(deletedKeys);
  (remote.deleted || []).forEach((k) => { if (!deleted.has(k)) { deleted.add(k); changed = true; } });

  return { cards: changed ? nextCards : cards, categories: nextCategories, deleted: [...deleted], deletedOwn: [...tombs].map(([k, t]) => ({ k, t })), changed };
}

// ---------- packing into iCloud's small key-value store ----------
// iCloud's store holds about 1 MB in total, so the snapshot is compressed
// (where the phone can) and cut into pieces, with a small "meta" entry that
// says how many pieces to read. Pieces are written first and meta last, so a
// reader never sees a half-written copy.

export const CHUNK_SIZE = 200000;
export const MAX_PACKED = 900000;
const PREFIX = "broen.sync.";

function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function pipe(bytes, stream) {
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function packSnapshot(snapshot) {
  const text = JSON.stringify(snapshot);
  const raw = new TextEncoder().encode(text);
  if (typeof CompressionStream === "function") {
    return { enc: "gzip", data: toB64(await pipe(raw, new CompressionStream("gzip"))) };
  }
  return { enc: "json", data: text };
}

export async function unpackSnapshot(enc, data) {
  if (enc === "json") return JSON.parse(data);
  if (enc === "gzip") {
    if (typeof DecompressionStream !== "function") throw new Error("NO_DECOMPRESS");
    return JSON.parse(new TextDecoder().decode(await pipe(fromB64(data), new DecompressionStream("gzip"))));
  }
  throw new Error("UNKNOWN_ENCODING");
}

function checksum(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// `kv` is { get(key), set(key, value), remove(key) }: the iCloud store on the
// phone, or a plain object in tests.
export async function writeRemote(kv, snapshot, deviceId) {
  const { enc, data } = await packSnapshot(snapshot);
  if (data.length > MAX_PACKED) throw new Error("TOO_BIG");
  const old = await readMeta(kv);
  const pieces = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) pieces.push(data.slice(i, i + CHUNK_SIZE));
  if (!pieces.length) pieces.push("");
  for (let i = 0; i < pieces.length; i++) await kv.set(PREFIX + "p" + i, pieces[i]);
  const meta = { v: SNAPSHOT_VERSION, enc, n: pieces.length, len: data.length, sum: checksum(data), at: snapshot.at, by: deviceId };
  await kv.set(PREFIX + "meta", JSON.stringify(meta));
  for (let i = pieces.length; old && i < old.n; i++) await kv.remove(PREFIX + "p" + i);
}

async function readMeta(kv) {
  const raw = await kv.get(PREFIX + "meta");
  if (!raw) return null;
  try {
    const m = JSON.parse(raw);
    return m && m.v === SNAPSHOT_VERSION && m.n > 0 ? m : null;
  } catch {
    return null;
  }
}

// Returns { snapshot, meta } or null when nothing is saved yet. Throws
// "INCOMPLETE" if the pieces haven't all arrived yet (try again shortly).
export async function readRemote(kv) {
  const meta = await readMeta(kv);
  if (!meta) return null;
  let data = "";
  for (let i = 0; i < meta.n; i++) {
    const piece = await kv.get(PREFIX + "p" + i);
    if (piece == null) throw new Error("INCOMPLETE");
    data += piece;
  }
  if (data.length !== meta.len || checksum(data) !== meta.sum) throw new Error("INCOMPLETE");
  return { snapshot: await unpackSnapshot(meta.enc, data), meta };
}
