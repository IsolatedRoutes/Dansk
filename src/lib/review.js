// ============================================================
// App Store rating request
// Apple lets an app ask for a rating with its own system popup. Apple also
// limits how often that popup can really appear, so we ask rarely and only
// after the person has genuinely used the app: enough words marked known,
// spread over several different days. Only in the iPhone app. Nothing here
// is sent anywhere; the day list stays on the phone.
// ============================================================
import { isNativeApp } from "./platform";
import { storeGet, storeSet } from "./storage";

// Single place to change the thresholds.
export const REVIEW_MIN_KNOWN = 60;
export const REVIEW_MIN_DAYS = 3;
export const REVIEW_GAP_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

// Remembers that the app was opened today (a short list of different days).
export async function recordOpenDay() {
  try {
    const raw = await storeGet("openDays");
    let days = [];
    try {
      days = JSON.parse(raw || "[]");
    } catch {
      days = [];
    }
    if (!Array.isArray(days)) days = [];
    const t = today();
    if (days.includes(t)) return;
    days.push(t);
    await storeSet("openDays", JSON.stringify(days.slice(-10)));
  } catch {
    // A missing day only delays the request; never an error for the person.
  }
}

export async function shouldAskForReview(knownCount) {
  if (!isNativeApp()) return false;
  if (knownCount < REVIEW_MIN_KNOWN) return false;
  try {
    const askedAt = Number((await storeGet("reviewAskedAt")) || 0);
    if (askedAt && Date.now() - askedAt < REVIEW_GAP_DAYS * DAY_MS) return false;
    let days = [];
    try {
      days = JSON.parse((await storeGet("openDays")) || "[]");
    } catch {
      days = [];
    }
    return Array.isArray(days) && days.length >= REVIEW_MIN_DAYS;
  } catch {
    return false;
  }
}

let pluginPromise = null;

function nativePlugin() {
  if (!pluginPromise) {
    // Plain object of functions: Capacitor plugin objects look like a Promise
    // and would hang if they travelled through one.
    pluginPromise = import("@capacitor-community/in-app-review").then((m) => ({
      request: () => m.InAppReview.requestReview(),
    }));
  }
  return pluginPromise;
}

export async function askForReview() {
  if (!isNativeApp()) return;
  try {
    // Written first, so a failure can never make the request repeat.
    await storeSet("reviewAskedAt", String(Date.now()));
    const p = await nativePlugin();
    await p.request();
  } catch {
    // Not important enough to bother anyone.
  }
}
