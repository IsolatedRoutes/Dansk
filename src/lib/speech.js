export function speechSupported() {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

function pickDanishVoice() {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("da")) || null;
}

export function speakDanish(text) {
  if (!text || !speechSupported()) return false;
  window.speechSynthesis.cancel(); // stop anything already playing first
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "da-DK";
  const voice = pickDanishVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
  return true;
}
