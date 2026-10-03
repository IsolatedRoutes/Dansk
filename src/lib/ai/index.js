import { callClaudeText } from "./claude";
import { callGeminiText } from "./gemini";
import { callLocalText } from "./local";
import { callOllamaText } from "./ollama";
import { inClaudeApp, storeGet } from "../storage";

export async function getAIEngine() {
  // An explicit choice (e.g. switching to Gemini as a fallback) always
  // wins — Claude's own model is only the zero-setup default when nothing
  // has been chosen yet.
  const v = await storeGet("aiEngine");
  if (v === "local" || v === "api" || v === "gemini" || v === "ollama") return v;
  if (inClaudeApp()) return "api";
  return null;
}

export async function callAI(system, userText, opts) {
  const engine = await getAIEngine();
  if (engine === "local") return callLocalText(system, userText, opts);
  if (engine === "gemini") return callGeminiText(system, userText, opts);
  if (engine === "api") return callClaudeText(system, userText, opts);
  if (engine === "ollama") return callOllamaText(system, userText, opts);
  throw new Error("NO_ENGINE_CHOSEN");
}

export function apiErrorMessage(e) {
  const msg = e && e.message;
  if (msg === "MISSING_API_KEY") return "Add your Anthropic API key in AI settings to use this.";
  if (msg === "MISSING_GEMINI_KEY") return "Add your free Google Gemini API key in AI settings to use this.";
  if (msg === "RATE_LIMITED") return "Gemini's free tier limits how many requests per minute — wait a bit and try again.";
  if (msg === "GEMINI_AUTH_ERROR") return "Gemini rejected the API key — double-check it was copied correctly in AI settings (no extra spaces or missing characters).";
  if (msg && msg.indexOf("GEMINI_NETWORK_ERROR") === 0)
    return "Couldn't reach Google's servers (" + msg.replace("GEMINI_NETWORK_ERROR: ", "") + "). Check your connection and try again.";
  if (msg && msg.indexOf("NETWORK_ERROR") === 0)
    return "Couldn't reach the server (" + msg.replace("NETWORK_ERROR: ", "") + "). Check your connection and try again.";
  if (msg && msg.indexOf("RESPONSE_NOT_JSON") === 0)
    return "Got an unexpected response instead of an answer (" + msg.replace("RESPONSE_NOT_JSON: ", "") + "). Try again — if it keeps happening, this is worth reporting.";
  if (msg === "NO_ENGINE_CHOSEN") return "Choose an AI option in AI settings first.";
  if (msg === "MISSING_OLLAMA_CONFIG") return "Set up your Ollama address and model name in AI settings to use this.";
  if (msg === "TRANSLATION_DIDNT_HAPPEN") return "Didn't get an actual translation back — try again.";
  if (msg === "OLLAMA_UNREACHABLE")
    return "Couldn't reach Ollama — make sure it's running on this computer, and that you started it with OLLAMA_ORIGINS=* so this page is allowed to connect.";
  if (msg && msg.indexOf("OLLAMA_ERROR") === 0) return "Ollama returned an error (" + msg.replace("OLLAMA_ERROR: ", "") + "). Check the model name is exactly right and try again.";
  if (msg === "WEBGPU_UNSUPPORTED")
    return "Your browser doesn't support the local model (needs WebGPU — try a recent Chrome or Edge), or switch to API key mode in AI settings.";
  if (msg === "LOCAL_MODEL_LOAD_FAILED") return "Couldn't load the local model. Check your connection, or switch to API key mode in AI settings.";
  if (msg && msg.indexOf("LOCAL_MODEL_LOAD_FAILED") === 0)
    return "Couldn't load the local model (" + msg.replace("LOCAL_MODEL_LOAD_FAILED: ", "") + "). Check your connection, try a smaller model, or switch to API key mode in AI settings.";
  if (msg && msg.indexOf("USAGE_LIMIT_REACHED") === 0)
    return (
      "You've reached your usage limit for using Claude inside this app right now. It resets " +
      msg.replace("USAGE_LIMIT_REACHED: ", "") +
      " — try again after that, or add your own Anthropic API key in AI settings to keep going without waiting."
    );
  return "Something went wrong (" + (msg || "unknown error") + "). Try again.";
}

// A handful of error codes mean "this AI option isn't working right now" —
// for those specifically, offer a quick way to switch rather than just
// leaving the person stuck waiting. Matched against the already-formatted
// text so every call site can reuse this without threading raw error
// objects through extra state.
export function isSwitchableAIError(message) {
  return !!message && /AI settings|free tier limits|rejected the API key|doesn't support the local model|Couldn't load the local model|reach Ollama/i.test(message);
}
