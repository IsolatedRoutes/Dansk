// ============================================================
// Runtime environment and storage
// Saved data lives in IndexedDB (a large, asynchronous browser database).
// Inside a Claude artifact, window.storage is used instead. Where neither
// is available, saves fall back to localStorage, then to memory.
// Outside Claude, AI features run either as a small model in the browser
// or through the person's own API key, set in the Chat tab's AI settings.
// ============================================================

// Checked at call time: window.storage can attach after this script starts.
export function inClaudeApp() {
  return typeof window !== "undefined" && !!window.storage;
}

// Once Claude's artifact storage fails, later saves skip straight to the
// fallbacks.
let claudeStorageBroken = false;

const memoryStore = {};

const IDB_NAME = "dansk";

const IDB_STORE = "kv";

const IDB_LEGACY_FLAG = "__legacyCopied";

let idbPromise = null;

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbTransaction(db, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, mode);
    const store = tx.objectStore(IDB_STORE);
    let result;
    Promise.resolve(work(store)).then((r) => (result = r), reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("transaction aborted"));
  });
}

// Copies everything saved in localStorage (the earlier storage) into
// IndexedDB once. The localStorage copy is left untouched as a backup, and
// IndexedDB is used only after every value has been read back and matched.
async function copyLegacyStorage(db) {
  try {
    const done = await idbTransaction(db, "readonly", (store) => idbRequest(store.get(IDB_LEGACY_FLAG)));
    if (done) return db;
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      entries.push([key, localStorage.getItem(key)]);
    }
    await idbTransaction(db, "readwrite", (store) => {
      for (const [key, value] of entries) store.put(value, key);
    });
    const stored = await idbTransaction(db, "readonly", (store) => Promise.all(entries.map(([key]) => idbRequest(store.get(key)))));
    if (!entries.every(([, value], i) => stored[i] === value)) return null;
    await idbTransaction(db, "readwrite", (store) => {
      store.put("1", IDB_LEGACY_FLAG);
    });
    return db;
  } catch {
    return null;
  }
}

function openIdb() {
  if (!idbPromise) {
    idbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined") return resolve(null);
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }).then((db) => {
      if (!db) return null;
      // Ask the browser not to clear this data when the device is low on space.
      try {
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      } catch {}
      return copyLegacyStorage(db);
    });
  }
  return idbPromise;
}

// Tells other open tabs that saved data changed.
export const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("dansk-sync") : null;

async function readStore(key, strict) {
  if (inClaudeApp() && !claudeStorageBroken) {
    try {
      const r = await window.storage.get(key, false);
      if (r) return r.value;
    } catch {
      claudeStorageBroken = true;
    }
  }
  const db = await openIdb();
  if (db) {
    // One retry, then either report the failure (strict) or carry on with
    // the other stores. Strict reads are for the deck itself: it must never
    // be mistaken for "nothing saved yet".
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const v = await idbTransaction(db, "readonly", (store) => idbRequest(store.get(key)));
        return v === undefined ? null : v;
      } catch {}
    }
    if (strict) throw new Error("STORAGE_UNREADABLE");
  }
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch {}
  return key in memoryStore ? memoryStore[key] : null;
}

export function storeGet(key) {
  return readStore(key, false);
}

// Like storeGet, but throws STORAGE_UNREADABLE when saved data exists and
// cannot be read right now.
export function storeGetStrict(key) {
  return readStore(key, true);
}

// Saved settings that follow the person between devices with iCloud sync
// (everything except the AI key, which is never stored here on the phone).
// Each remembers when the person last changed it, so the newest change wins.
export const SYNCED_KEYS = ["studySettings", "verbForms", "nounOptions", "aiEngine", "aiConsent", "autoBackupEnabled", "welcomeSeen", "chatHistory"];
const STAMPS_KEY = "keyStamps";

export async function loadKeyStamps() {
  try {
    const o = JSON.parse((await readStore(STAMPS_KEY, false)) || "{}");
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

async function stampKey(key, at) {
  const stamps = await loadKeyStamps();
  stamps[key] = at;
  await writeRaw(STAMPS_KEY, JSON.stringify(stamps));
}

// A change made by the person: remembered with the time it happened. The
// first time a setting is ever saved is not stamped (it is usually the app
// writing a default), so a new device never overrules the one with real choices.
export async function storeSet(key, value) {
  if (!SYNCED_KEYS.includes(key)) return writeRaw(key, value);
  const before = await readStore(key, false);
  const result = await writeRaw(key, value);
  if (result.ok && before !== null && before !== value) {
    await stampKey(key, Date.now());
    if (typeof window !== "undefined") window.dispatchEvent(new Event("dansk-key-stamped"));
  }
  return result;
}

// A value that arrived from another device, kept with that device's time.
export async function storeSetFromSync(key, value, at) {
  const result = await writeRaw(key, value);
  if (result.ok) await stampKey(key, at);
  return result;
}

async function writeRaw(key, value) {
  if (inClaudeApp() && !claudeStorageBroken) {
    try {
      const r = await window.storage.set(key, value, false);
      if (r) return { ok: true };
      claudeStorageBroken = true;
    } catch {
      claudeStorageBroken = true;
    }
  }
  const db = await openIdb();
  if (db) {
    // A failed write is reported, never redirected to another store: the
    // other stores are not read back once IndexedDB is in use.
    try {
      await idbTransaction(db, "readwrite", (store) => {
        store.put(value, key);
      });
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
    if (syncChannel) syncChannel.postMessage(key);
    return { ok: true, degraded: inClaudeApp() };
  }
  try {
    localStorage.setItem(key, value);
    return { ok: true, degraded: true };
  } catch {
    memoryStore[key] = value;
    return { ok: true, degraded: true, memoryOnly: true };
  }
}

// Deletes one saved value everywhere it could be held.
export async function storeRemove(key) {
  delete memoryStore[key];
  try {
    localStorage.removeItem(key);
  } catch {}
  if (inClaudeApp() && !claudeStorageBroken) {
    try {
      if (window.storage.delete) await window.storage.delete(key, false);
    } catch {}
  }
  const db = await openIdb();
  if (db) {
    try {
      await idbTransaction(db, "readwrite", (store) => {
        store.delete(key);
      });
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
    if (syncChannel) syncChannel.postMessage(key);
  }
  return { ok: true };
}

// The deck is saved in a compact form: fields that just hold their
// default value (empty notes, no examples, not starred, not known, ...)
// are left out, and filled back in on load. With 8,000 cards this keeps
// the saved deck well under the ~5 MB browser storage limit. Older saves
// in the full format load exactly the same way.
const CARD_DEFAULTS = { notes: "", examples: [], starred: false, known: false, ignored: false, upStage: 0, upDue: 0, forms: "", gender: "", level: 0, pos: "", pattern: "" };

function packCards(json) {
  try {
    const list = JSON.parse(json);
    if (!Array.isArray(list)) return json;
    return JSON.stringify(
      list.map((card) => {
        const out = {};
        for (const [k, v] of Object.entries(card)) {
          if (k in CARD_DEFAULTS) {
            const d = CARD_DEFAULTS[k];
            if (v === undefined || v === null || v === d || (Array.isArray(d) && Array.isArray(v) && v.length === 0)) continue;
          }
          if (k === "createdAt" && card.starter) continue; // seed time, never shown
          out[k] = v;
        }
        return out;
      })
    );
  } catch {
    return json;
  }
}

export function unpackCards(list) {
  return list.map((card) => ({ ...CARD_DEFAULTS, examples: [], ...card }));
}

// Saves go out one at a time, in order, so a slower earlier save can never
// land after (and overwrite) a newer one.
let saveQueue = Promise.resolve();

export function persistWithRetry(key, value) {
  const run = saveQueue.then(() => persistNow(key, value));
  saveQueue = run.catch(() => {});
  return run;
}

async function persistNow(key, value) {
  if (key === "cards") value = packCards(value);
  let lastError = "unknown error";
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await storeSet(key, value);
    if (result.ok) return result;
    lastError = result.error;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return { ok: false, error: lastError };
}
