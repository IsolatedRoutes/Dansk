export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Uses the browser's built-in text-to-speech (Web Speech API): no network
// call, no AI, works offline.
// The camera-capture button only makes sense where there's an actual
// camera to open — on desktop, the capture="environment" attribute is
// simply ignored and falls back to the same file picker as "choose a
// photo", making a separate button redundant and confusing there.
export function isMobileDevice() {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
}

export function parseJSONLoose(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const body = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(body);
}

// Defensive cleanup for translation results: even with explicit prompt
// instructions not to, models occasionally echo both languages (e.g.
// "en hest / a horse" when only "a horse" was asked for). If that exact
// pattern shows up, keep just the actual answer after the last slash.
export function cleanTranslation(text) {
  if (!text) return text;
  const parts = text.split(/\s*\/\s*/);
  return parts.length > 1 ? parts[parts.length - 1].trim() : text.trim();
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

// How a card's Danish text is matched and compared. Case is ignored, except
// for the pronoun "I" (you, plural), which is a different word from the
// preposition "i" (in).
export function frontKey(front) {
  const text = (front || "").trim();
  return text === "I" ? text : text.toLowerCase();
}
