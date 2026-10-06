// ============================================================
// iCloud sync: what travels, and how two copies are combined.
// Everything except the AI key travels. When the same thing changed on two
// devices, the newest change wins (each card, and each setting, carries the
// time it was last changed by the person). Marks and level-up progress that
// were never stamped (older cards) are combined so nothing is lost, and
// repeating a merge changes nothing. Plain logic, tested on its own
// (tests/sync_check.mjs).
// ============================================================

export const SNAPSHOT_VERSION = 2;

// Which card fields belong to "progress" (known / starred / hidden / notes),
// to "level-up" (comes back in another form), and which are plain bookkeeping.
// Everything else on an added card is its content (front, back, topic,
// examples, ...).
const PROGRESS = ["known", "starred", "ignored", "notes"];
const LEVELUP = ["upStage", "upDue"];
// Smart review marks (when a card is due again): the newest look wins.
const SRS = ["srsN", "srsLvl", "srsDue", "srsAt", "srsSkips"];
const BOOKKEEPING = new Set([...PROGRESS, ...LEVELUP, ...SRS, "s", "id", "starter", "insight", "upForms", "createdAt", "recentTouch", "progressAt", "editedAt"]);
// What can be edited on a built-in card.
const STARTER_CONTENT = ["front", "back", "category", "examples", "pattern"];

const hasMark = (c) => !!(c.known || c.starred || c.ignored || c.upStage || c.srsAt || c.progressAt || c.editedAt || (c.notes && c.notes.trim()));

// Notes combined line by line, so combining the same notes again changes nothing.
export function mergeNotes(a, b) {
  const lines = [];
  [a, b].forEach((n) => (n || "").split("\n").forEach((l) => { if (l.trim() && !lines.includes(l)) lines.push(l); }));
  return lines.join("\n");
}

const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

// Combines this device's copy of a card with another device's copy.
// `remote` holds progress fields, level-up fields, and (when it was edited)
// content fields. `contentFields` says which fields may be edited.
function joinCard(local, remote, contentFields) {
  const out = { ...local };
  const lp = local.progressAt || 0;
  const rp = remote.progressAt || 0;
  // Sets a progress field only when it really differs, so merging the same
  // copy again changes nothing.
  const setProgress = (f, v) => {
    if (f === "notes" ? (out.notes || "") !== v : !!out[f] !== v) out[f] = v;
  };
  if (rp > lp) {
    PROGRESS.forEach((f) => setProgress(f, f === "notes" ? remote.notes || "" : !!remote[f]));
    out.progressAt = rp;
  } else if (rp === lp) {
    // Neither side recorded a change time (older cards): keep both sides' marks.
    ["known", "starred", "ignored"].forEach((f) => setProgress(f, !!(local[f] || remote[f])));
    setProgress("notes", mergeNotes(local.notes, remote.notes));
  }
  const le = local.editedAt || 0;
  const re = remote.editedAt || 0;
  if (re > le) {
    contentFields.forEach((f) => { if (f in remote) out[f] = remote[f]; });
    out.editedAt = re;
  }
  const up = Math.max(local.upStage || 0, remote.upStage || 0);
  const due = Math.max(local.upDue || 0, remote.upDue || 0);
  if (up) out.upStage = up;
  if (due) out.upDue = due;
  // Smart review: whichever device looked at the card last decides when it is due.
  const rs = remote.s ? { srsN: remote.s[0], srsLvl: remote.s[1], srsDue: remote.s[2], srsAt: remote.s[3], srsSkips: remote.s[4] } : remote;
  if ((rs.srsAt || 0) > (local.srsAt || 0)) SRS.forEach((f) => { if (rs[f] != null) out[f] = rs[f]; });
  if (!Array.isArray(out.upForms) && Array.isArray(remote.upForms)) out.upForms = remote.upForms;
  const touch = Math.max(local.recentTouch || 0, remote.recentTouch || 0);
  if (touch) out.recentTouch = touch;
  return out;
}

const sameCard = (a, b) => same(a, b);

// What gets written to iCloud.
// `keyValues` is { storageKey: { v, at } } for the settings and chat.
export function buildSnapshot(cards, categories, deletedKeys, keyOf, now = Date.now(), deletedOwn = [], keyValues = {}) {
  const marks = {};
  const own = [];
  cards.forEach((c) => {
    if (c.starter) {
      if (!hasMark(c)) return;
      const m = { k: keyOf(c.type, c.front), known: !!c.known, starred: !!c.starred, ignored: !!c.ignored, notes: c.notes || "", upStage: c.upStage || 0, upDue: c.upDue || 0, recentTouch: c.recentTouch || 0, progressAt: c.progressAt || 0, editedAt: c.editedAt || 0 };
      if (c.srsAt) m.s = [c.srsN || 0, c.srsLvl || 0, c.srsDue || 0, c.srsAt, c.srsSkips || 0];
      if (c.editedAt) STARTER_CONTENT.forEach((f) => { if (f in c) m[f] = c[f]; });
      marks[c.id] = m;
    } else {
      // The saved lightbulb answer stays on each phone (it can be fetched again), so iCloud's space is kept for progress.
      const { insight, ...rest } = c;
      own.push(rest);
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
    keys: keyValues,
  };
}

// Which saved settings from another device should replace this device's.
// Newest change wins; a setting this device never had is taken as it is.
// Returns { storageKey: { v, at } } to apply.
export function pickKeys(localKeys, remoteKeys) {
  const adopt = {};
  Object.entries(remoteKeys || {}).forEach(([k, r]) => {
    if (!r || typeof r.v !== "string") return;
    const l = localKeys[k];
    if (!l || typeof l.v !== "string") adopt[k] = r;
    else if ((r.at || 0) > (l.at || 0) && r.v !== l.v) adopt[k] = r;
  });
  return adopt;
}

// Combines a snapshot from another device into this device's deck.
// Returns { cards, categories, deleted, deletedOwn, changed }.
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
    const match = nextCategories.find((c) => c.id === rc.id) || nextCategories.find((c) => (c.name || "").trim().toLowerCase() === (rc.name || "").trim().toLowerCase());
    if (match) catMap[rc.id] = match.id;
    else {
      nextCategories.push(rc);
      catMap[rc.id] = rc.id;
      changed = true;
    }
  });
  const mapCat = (c) => (c && catMap[c] ? catMap[c] : c);

  const remoteOwn = remote.own || [];
  const remoteMarks = remote.marks || {};
  const remoteMarkByKey = {};
  Object.values(remoteMarks).forEach((m) => { if (m.k) remoteMarkByKey[m.k] = m; });
  const ownById = new Map(remoteOwn.map((o) => [o.id, o]));
  const ownByKey = new Map(remoteOwn.map((o) => [keyOf(o.type, o.front), o]));

  const handled = new Set(); // remote own cards that matched a local card
  const nextCards = cards
    .filter((c) => { if (isGone(c)) { changed = true; return false; } return true; })
    .map((c) => {
      let rm = null;
      if (c.starter) {
        rm = remoteMarks[c.id] || remoteMarkByKey[keyOf(c.type, c.front)] || null;
      } else {
        rm = ownById.get(c.id) || ownByKey.get(keyOf(c.type, c.front)) || null;
        if (rm) handled.add(rm);
      }
      if (!rm) return c;
      let remoteCopy = rm;
      let fields = STARTER_CONTENT;
      if (!c.starter) {
        fields = Object.keys(rm).filter((f) => !BOOKKEEPING.has(f));
        remoteCopy = { ...rm, category: mapCat(rm.category) };
      }
      const merged = joinCard(c, remoteCopy, fields);
      if (sameCard(merged, c)) return c;
      changed = true;
      return merged;
    });

  const byKey = new Set(nextCards.map((c) => keyOf(c.type, c.front)));
  const usedIds = new Set(nextCards.map((c) => c.id));
  remoteOwn.forEach((o) => {
    if (handled.has(o)) return;
    const key = keyOf(o.type, o.front);
    if (byKey.has(key) || isGone(o)) return;
    byKey.add(key);
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
  let { enc, data } = await packSnapshot(snapshot);
  if (data.length > MAX_PACKED && snapshot.keys && snapshot.keys.chatHistory) {
    // The Assistant chat is the first thing to leave out if space runs short.
    const rest = { ...snapshot.keys };
    delete rest.chatHistory;
    ({ enc, data } = await packSnapshot({ ...snapshot, keys: rest }));
  }
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
