// ============================================================
// "Share to Broen" (iPhone app only): the phone side.
// The Share extension saves what the person shared (text or one photo) in a
// private folder; a small native plugin hands it over once. Nothing goes
// anywhere else. The website has no sharing in.
// ============================================================
import { isNativeApp } from "./platform";
import { registerPlugin } from "@capacitor/core";
// The phone's own bridge has no registerPlugin on window.Capacitor, so use the
// one from @capacitor/core. (A test can still supply its own on window.)
function register(name) {
  const w = window.Capacitor;
  return w && typeof w.registerPlugin === "function" ? w.registerPlugin(name) : registerPlugin(name);
}


let pluginObj = null;
// Capacitor plugin objects look like a Promise, so they are never returned
// from an async function.
function plugin() {
  if (!pluginObj) pluginObj = register("ShareInbox");
  return pluginObj;
}

// A shared text that is only a web address (nothing to translate).
export function isBareLink(text) {
  return /^\s*https?:\/\/\S+\s*$/i.test(text || "");
}

// Photo bytes (base64) -> a File the photo panel can use like a picked one.
export function base64ToFile(base64, type) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = type || "image/jpeg";
  const ext = mime === "image/png" ? "png" : "jpg";
  return new File([bytes], "shared." + ext, { type: mime });
}

// What was shared since last time, or null. Each item is handed over once.
export async function takeShared() {
  if (!isNativeApp()) return null;
  try {
    const r = await plugin().take();
    if (r && (r.text || r.imageBase64)) {
      return { text: r.text || "", imageBase64: r.imageBase64 || "", imageType: r.imageType || "" };
    }
  } catch {
    // no plugin or no shared folder yet: nothing shared
  }
  return null;
}

// Calls `fn(item)` whenever something new was shared: at start and each time
// the app comes back to the front (that is when a share finishes). Returns a
// function that stops listening.
export function watchShared(fn) {
  if (!isNativeApp()) return () => {};
  let busy = false;
  let stopped = false;
  async function check() {
    if (busy || stopped) return;
    busy = true;
    try {
      const item = await takeShared();
      if (item && !stopped) fn(item);
    } finally {
      busy = false;
    }
  }
  const onVisible = () => {
    if (document.visibilityState === "visible") check();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", check);
  check();
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", check);
  };
}
