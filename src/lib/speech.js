// Reading Danish aloud with the device's own speech.
// If the device has no Danish voice, it would read Danish in its normal
// (English) voice, which teaches the wrong pronunciation. So in that case
// nothing is spoken, and a short message explains how to turn on spoken
// Danish (see DanishVoiceNote).

export function speechSupported() {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

function isDanish(voice) {
  return !!voice.lang && voice.lang.toLowerCase().replace("_", "-").startsWith("da");
}

// Phones sometimes report their voice list a moment late; asking once at
// startup makes the list ready by the time someone taps a speaker.
if (speechSupported()) {
  try {
    window.speechSynthesis.getVoices();
  } catch {
    // Speech is a nicety; never an error.
  }
}

const noVoiceListeners = new Set();

// Calls `fn` whenever someone taps a speaker but the device has no Danish
// voice. Returns a function that stops listening.
export function onNoDanishVoice(fn) {
  noVoiceListeners.add(fn);
  return () => noVoiceListeners.delete(fn);
}

export function speakDanish(text) {
  if (!text || !speechSupported()) return false;
  const synth = window.speechSynthesis;
  synth.cancel(); // stop anything already playing first
  const voices = synth.getVoices();
  const voice = voices.find(isDanish) || null;
  // No Danish voice found (including an empty list): never speak, because the
  // device would fall back to an English voice and teach the wrong sound.
  if (!voice) {
    noVoiceListeners.forEach((fn) => fn());
    return false;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "da-DK";
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
  return true;
}
