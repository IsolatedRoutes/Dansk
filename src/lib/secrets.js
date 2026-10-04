// ============================================================
// Secrets (AI keys)
// In the iPhone app, keys are kept in the iOS Keychain: encrypted by the
// system, readable only by this app, never copied to iCloud or a backup
// file. On the website there is no safer place than the browser's own
// per-site storage, which only this site can read, so keys stay there.
// Everything that reads or writes a key goes through these three functions.
// ============================================================
import { isNativeApp } from "./platform";
import { storeGet, storeSet, storeRemove } from "./storage";

export const SECRET_KEYS = ["anthropicApiKey", "geminiApiKey"];

let pluginPromise = null;

function nativePlugin() {
  if (!pluginPromise) {
    // Capacitor plugin objects must not travel through a Promise (they look
    // like a Promise themselves and the call never finishes), so they are
    // wrapped in a plain object of functions.
    pluginPromise = import("capacitor-secure-storage-plugin").then((m) => ({
      get: (options) => m.SecureStoragePlugin.get(options),
      set: (options) => m.SecureStoragePlugin.set(options),
      remove: (options) => m.SecureStoragePlugin.remove(options),
    }));
  }
  return pluginPromise;
}

// Moves a key that an earlier version left in ordinary storage into the
// Keychain. The old copy is removed only after the Keychain copy reads back
// identically.
async function moveToKeychain(name, plugin) {
  const old = await storeGet(name);
  if (!old) return null;
  await plugin.set({ key: name, value: old });
  const back = await plugin.get({ key: name });
  if (!back || back.value !== old) throw new Error("KEYCHAIN_VERIFY_FAILED");
  await storeRemove(name);
  return old;
}

export async function secretGet(name) {
  if (!isNativeApp()) return storeGet(name);
  const plugin = await nativePlugin();
  try {
    const r = await plugin.get({ key: name });
    return r && r.value ? r.value : null;
  } catch {
    // The plugin throws when nothing is stored under that name.
    try {
      return await moveToKeychain(name, plugin);
    } catch {
      return null;
    }
  }
}

export async function secretSet(name, value) {
  if (!isNativeApp()) return storeSet(name, value);
  try {
    const plugin = await nativePlugin();
    await plugin.set({ key: name, value });
    const back = await plugin.get({ key: name });
    if (!back || back.value !== value) return { ok: false, error: "Keychain read-back did not match" };
    return { ok: true };
  } catch (e) {
    // Never fall back to ordinary storage: the key would be less protected.
    return { ok: false, error: String((e && e.message) || e) };
  }
}

export async function secretRemove(name) {
  if (!isNativeApp()) return storeRemove(name);
  try {
    const plugin = await nativePlugin();
    await plugin.remove({ key: name });
  } catch {
    // Nothing stored under that name: already gone.
  }
  await storeRemove(name);
  return { ok: true };
}

// iOS keeps Keychain items when an app is deleted, but deletes the app's own
// storage. A first launch with no marker in storage therefore means a fresh
// install: any key found in the Keychain is left over from a deleted copy
// and is removed, so deleting the app really does delete the keys.
export async function clearLeftoverSecrets() {
  if (!isNativeApp()) return;
  try {
    if ((await storeGet("installMarker")) === "1") return;
    const plugin = await nativePlugin();
    for (const name of SECRET_KEYS) {
      try {
        await plugin.remove({ key: name });
      } catch {}
    }
    await storeSet("installMarker", "1");
  } catch {}
}
