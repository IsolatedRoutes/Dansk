// Chrome's built-in on-device Translator API (Chrome 138+, desktop only —
// not available on mobile, and not on Safari/Firefox/Edge either, since
// it's tied to Chrome's own bundled on-device model, not a general web
// standard). An entirely optional, opt-in extra: when enabled and
// available, it powers just the Translate button, with zero network call
// and zero cost. Everything else in the app still uses whichever main AI
// engine is configured, since this API only translates — it can't do the
// freeform reasoning Sentence analysis, Extract text, Chat, or Photo need.
export function chromeTranslatorSupported() {
  return typeof self !== "undefined" && "Translator" in self;
}

function chromeLanguageDetectorSupported() {
  return typeof self !== "undefined" && "LanguageDetector" in self;
}

export async function chromeTranslatorAvailability(sourceLanguage, targetLanguage) {
  if (!chromeTranslatorSupported()) return "unavailable";
  try {
    return await Translator.availability({ sourceLanguage, targetLanguage });
  } catch {
    return "unavailable";
  }
}

// Detects whether the input is Danish or English using Chrome's on-device
// Language Detector API (when available), then translates it with the
// on-device Translator API in the correct direction — both fully local.
export async function translateWithChromeTranslator(text, onProgress) {
  if (!chromeTranslatorSupported()) throw new Error("CHROME_TRANSLATOR_UNSUPPORTED");
  let sourceLanguage = "da";
  if (chromeLanguageDetectorSupported()) {
    try {
      const detectorAvailability = await LanguageDetector.availability();
      if (detectorAvailability !== "unavailable") {
        const detector = await LanguageDetector.create();
        const results = await detector.detect(text);
        const top = results && results[0];
        if (top && String(top.detectedLanguage || "").toLowerCase().startsWith("en")) sourceLanguage = "en";
      }
    } catch {
      // Detection failing just means we fall back to assuming Danish —
      // translation itself still proceeds normally.
    }
  }
  const targetLanguage = sourceLanguage === "da" ? "en" : "da";
  const translator = await Translator.create({
    sourceLanguage,
    targetLanguage,
    monitor(m) {
      if (onProgress) m.addEventListener("downloadprogress", (e) => onProgress(e.loaded));
    },
  });
  const translation = await translator.translate(text);
  return sourceLanguage === "da" ? { da: text, en: translation } : { da: translation, en: text };
}
