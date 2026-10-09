// ============================================================
// iCloud sync (iPhone app only): the phone side.
// Uses a small native plugin that keeps a little text in the person's own
// iCloud, shared by their devices signed in to the same Apple ID. Nothing
// goes to any server of ours. The combining logic is in sync.js.
// ============================================================
import { isNativeApp } from "./platform";
import { canonicalKey, loadDeletedKeys } from "./migrations";
import { SYNCED_KEYS, loadKeyStamps, storeGet, storeSet, storeSetFromSync } from "./storage";
import { buildSnapshot, mergeSnapshot, pickKeys, readRemote, writeRemote } from "./sync";
import { uid } from "./text";
import { registerPlugin } from "@capacitor/core";
// The phone's own bridge has no registerPlugin on window.Capacitor, so use the
// one from @capacitor/core. (A test can still supply its own on window.)
function register(name) {
  const w = window.Capacitor;
  return w && typeof w.registerPlugin === "function" ? w.registerPlugin(name) : registerPlugin(name);
}


let pluginObj = null;
// Capacitor plugin objects look like a Promise, so they are never returned
// from an async function: callers get a plain object of functions.
function plugin() {
  if (!pluginObj) pluginObj = register("ICloudSync");
  return pluginObj;
}

export function icloudSupported() {
  return isNativeApp();
}

// What the phone said last time we asked (shown in the error so a problem can be found).
export let icloudDetail = "";

export async function icloudAvailable() {
  if (!icloudSupported()) return false;
  try {
    const r = await plugin().status();
    icloudDetail = JSON.stringify(r || {});
    return !!(r && r.available);
  } catch (e) {
    icloudDetail = "error: " + ((e && (e.message || e.code)) || String(e));
    return false;
  }
}

const kv = {
  get: async (key) => {
    const r = await plugin().get({ key });
    return r && typeof r.value === "string" ? r.value : null;
  },
  set: (key, value) => plugin().set({ key, value }),
  remove: (key) => plugin().remove({ key }),
};

// Calls `fn` when another device has saved something new. Returns a function
// that stops listening.
export function onICloudChange(fn) {
  let handle = null;
  let stopped = false;
  Promise.resolve(plugin().addListener("changed", fn))
    .then((h) => {
      if (stopped && h && h.remove) h.remove();
      else handle = h;
    })
    .catch(() => {});
  return () => {
    stopped = true;
    if (handle && handle.remove) handle.remove();
  };
}

async function deviceId() {
  let id = await storeGet("deviceId");
  if (!id) {
    id = uid();
    await storeSet("deviceId", id);
  }
  return id;
}

export async function loadDeletedOwn() {
  try {
    const list = JSON.parse((await storeGet("deletedOwnCards")) || "[]");
    return Array.isArray(list) ? list.filter((d) => d && typeof d.k === "string" && typeof d.t === "number") : [];
  } catch {
    return [];
  }
}

// Remembers that the person deleted one of their own cards, so the deletion
// reaches their other devices.
export async function rememberDeletedOwn(card) {
  if (!card || card.starter) return;
  const k = canonicalKey(card.type, card.front);
  const list = (await loadDeletedOwn()).filter((d) => d.k !== k);
  list.push({ k, t: Date.now() });
  await storeSet("deletedOwnCards", JSON.stringify(list.slice(-500)));
}

// Settings and the Assistant chat travel too. The newest change wins,
// judged by the time each device stamped when its owner last changed it.
async function loadKeyValues() {
  const stamps = await loadKeyStamps();
  const values = {};
  for (const k of SYNCED_KEYS) {
    const v = await storeGet(k);
    if (typeof v === "string") values[k] = { v, at: stamps[k] || 0 };
  }
  return values;
}

async function adoptKeys(remoteKeys) {
  const adopt = pickKeys(await loadKeyValues(), remoteKeys);
  const names = Object.keys(adopt).filter((k) => SYNCED_KEYS.includes(k));
  for (const k of names) await storeSetFromSync(k, adopt[k].v, adopt[k].at || 0);
  if (names.length) window.dispatchEvent(new Event("dansk-settings-changed"));
  return names.length > 0;
}

// The automatic copy taken before sync first touches the deck, so the
// person can go back to an earlier version.
export async function savePreSyncCopy(cards, categories) {
  await storeSet("preSyncBackup", JSON.stringify({ at: Date.now(), cards, categories }));
}

export async function loadPreSyncCopy() {
  try {
    const v = JSON.parse((await storeGet("preSyncBackup")) || "null");
    return v && Array.isArray(v.cards) && Array.isArray(v.categories) ? v : null;
  } catch {
    return null;
  }
}

// One round: read what other devices saved, add it to this deck, then save
// the combined result back. `deck` gives the latest cards / topics and the
// functions that save them.
export async function syncOnce(deck) {
  if (!(await icloudAvailable())) throw new Error("NO_ICLOUD");
  const remote = await readRemote(kv); // may throw "INCOMPLETE"
  const deletedSet = await loadDeletedKeys();
  let deleted = [...deletedSet].map((k) => k);
  let deletedOwn = await loadDeletedOwn();
  let cards = deck.getCards();
  let categories = deck.getCategories();

  if (remote) {
    const merged = mergeSnapshot(cards, categories, deleted, remote.snapshot, canonicalKey, uid, deletedOwn);
    if (merged.changed) {
      if (merged.categories !== categories && merged.categories.length !== categories.length) {
        const r = await deck.saveCategories(merged.categories);
        if (r && r.ok === false) throw new Error("SAVE_FAILED");
      }
      if (merged.cards !== cards) {
        const r = await deck.saveCards(merged.cards);
        if (r && r.ok === false) throw new Error("SAVE_FAILED");
      }
      if (merged.deleted.length !== deleted.length) await storeSet("deletedStarterCards", JSON.stringify(merged.deleted));
      if (merged.deletedOwn.length !== deletedOwn.length || merged.deletedOwn.some((d, i) => !deletedOwn[i] || deletedOwn[i].t !== d.t)) await storeSet("deletedOwnCards", JSON.stringify(merged.deletedOwn.slice(-500)));
      cards = merged.cards;
      categories = merged.categories;
      deleted = merged.deleted;
      deletedOwn = merged.deletedOwn;
    }
  }

  if (remote) await adoptKeys(remote.snapshot.keys);
  const snapshot = buildSnapshot(cards, categories, deleted, canonicalKey, Date.now(), deletedOwn, await loadKeyValues());
  const sameAsRemote = remote && JSON.stringify({ ...remote.snapshot, at: 0 }) === JSON.stringify({ ...snapshot, at: 0 });
  if (!sameAsRemote) await writeRemote(kv, snapshot, await deviceId());
  await storeSet("icloudLastSync", String(Date.now()));
  return Date.now();
}
