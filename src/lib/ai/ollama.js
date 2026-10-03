import { storeGet } from "../storage";

export async function callOllamaText(system, userText, opts) {
  const maxTokens = (opts && opts.maxTokens) || 1500;
  const history = (opts && opts.history) || [];
  let config;
  try {
    const raw = await storeGet("ollamaConfig");
    config = raw ? JSON.parse(raw) : null;
  } catch {
    config = null;
  }
  if (!config || !config.url || !config.model) throw new Error("MISSING_OLLAMA_CONFIG");
  const messages = [{ role: "system", content: system }, ...history, { role: "user", content: userText }];
  let res;
  try {
    // Ollama's OpenAI-compatible endpoint — needs OLLAMA_ORIGINS set on
    // their end to accept a request from this page's origin at all.
    res = await fetch(config.url + "/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, messages, max_tokens: maxTokens }),
    });
  } catch {
    throw new Error("OLLAMA_UNREACHABLE");
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error("OLLAMA_ERROR: " + res.status + (bodyText ? " " + bodyText.slice(0, 200) : ""));
  }
  const data = await res.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("OLLAMA_ERROR: empty response");
  return content;
}
