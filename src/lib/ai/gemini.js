import { describeApiFailure, fetchAndParse, requireConsent } from "./http";
import { secretGet } from "../secrets";

// Google Gemini's free tier — no credit card, callable directly from a
// browser. Meaningfully better than the local model, still a notch below
// Claude for nuanced grammar. Also handles Photo import for free, since
// Gemini Flash is multimodal (the local model isn't).
const GEMINI_MODEL_ID = "gemini-flash-latest";

async function geminiHeaders() {
  await requireConsent();
  const key = await secretGet("geminiApiKey");
  if (!key) throw new Error("MISSING_GEMINI_KEY");
  return { "Content-Type": "application/json", "x-goog-api-key": key };
}

function toGeminiHistory(history) {
  return (history || []).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

async function geminiGenerate(headers, body) {
  let res, data;
  try {
    ({ res, data } = await fetchAndParse(
      "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL_ID + ":generateContent",
      { method: "POST", headers, body: JSON.stringify(body) }
    ));
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg.indexOf("NETWORK_ERROR") === 0) throw new Error("GEMINI_NETWORK_ERROR: " + msg.replace("NETWORK_ERROR: ", ""));
    throw e;
  }
  if (!res.ok) {
    if (res.status === 429) throw new Error("RATE_LIMITED");
    if (res.status === 401 || res.status === 403) throw new Error("GEMINI_AUTH_ERROR");
    throw describeApiFailure(res, data);
  }
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

export async function callGeminiText(system, userText, opts) {
  const maxTokens = (opts && opts.maxTokens) || 1500;
  const history = (opts && opts.history) || [];
  const headers = await geminiHeaders();
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [...toGeminiHistory(history), { role: "user", parts: [{ text: userText }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (!(opts && opts.fast)) return geminiGenerate(headers, body);
  // "fast": ask Gemini not to spend time thinking first (quicker answers for
  // short explanations). If this model refuses that setting, try again normally.
  try {
    return await geminiGenerate(headers, { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: { thinkingBudget: 0 } } });
  } catch (e) {
    const m = (e && e.message) || "";
    if (m === "RATE_LIMITED" || m === "GEMINI_AUTH_ERROR" || m.indexOf("NETWORK_ERROR") >= 0) throw e;
    return geminiGenerate(headers, body);
  }
}

export async function callGeminiImage(system, userText, base64, mediaType, maxTokens) {
  const headers = await geminiHeaders();
  return geminiGenerate(headers, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      { role: "user", parts: [{ inlineData: { mimeType: mediaType, data: base64 } }, { text: userText }] },
    ],
    generationConfig: { maxOutputTokens: maxTokens || 1500 },
  });
}
