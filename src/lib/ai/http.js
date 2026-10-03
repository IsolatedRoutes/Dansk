import { inClaudeApp, storeGet } from "../storage";

// Nothing is sent to an AI company until the person has agreed in AI settings.
export async function requireConsent() {
  if ((await storeGet("aiConsent")) !== "1") throw new Error("AI_CONSENT_REQUIRED");
}

export async function buildHeaders() {
  // anthropic-version is required by the API on every request, regardless
  // of how auth is handled — omitting it inside Claude (where auth is
  // otherwise automatic) was causing every call to fail.
  const headers = { "Content-Type": "application/json", "anthropic-version": "2023-06-01" };
  if (!inClaudeApp()) {
    await requireConsent();
    const key = await storeGet("anthropicApiKey");
    if (!key) throw new Error("MISSING_API_KEY");
    headers["x-api-key"] = key;
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  return headers;
}

// Fetches and parses JSON, retrying once if the server answers 200 OK with
// a body that's empty or unparsable — a transient hiccup (from either
// Anthropic's or Google's side, or an intermediary) seen occasionally even
// on a successful-looking response. Reading as text first (rather than
// res.json() directly) also avoids an opaque Safari-specific crash when
// the body genuinely isn't JSON, so a real failure always comes with the
// actual response content instead of a dead end.
// Claude's own consumer usage limit (hit when running inside Claude via
// the person's session, not a separate API key) has its own response
// shape that doesn't match Anthropic API's normal {error:{message}}
// format — without this, it fell straight through to a raw, unreadable
// JSON dump in the UI. Detect it specifically and surface a real,
// timed message instead; anything else keeps the previous fallback.
export function describeApiFailure(res, data) {
  if (data && data.type === "exceeded_limit" && data.resetsAt) {
    const resetStr = new Date(data.resetsAt * 1000).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
    return new Error("USAGE_LIMIT_REACHED: " + resetStr);
  }
  return new Error("Request failed (" + res.status + "): " + (data?.error?.message || JSON.stringify(data).slice(0, 180)));
}

export async function fetchAndParse(url, options) {
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts - 1;
    let res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      if (!isLastAttempt) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw new Error("NETWORK_ERROR: " + (e && e.message ? e.message : e));
    }
    let text;
    try {
      text = await res.text();
    } catch {
      text = "";
    }
    if (res.ok && !text.trim() && !isLastAttempt) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      continue; // empty 200 body — usually transient, worth retrying
    }
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      if (!isLastAttempt) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue; // unparsable body — worth retrying
      }
      throw new Error("RESPONSE_NOT_JSON: " + (text ? text.slice(0, 180) : "(empty response)"));
    }
    if (res.ok && !text.trim()) {
      throw new Error("RESPONSE_NOT_JSON: (empty response)");
    }
    return { res, data };
  }
}
