// ============================================================
// Haptics (small taps you feel on the iPhone)
// Only does anything inside the iPhone app. On the website every function
// here does nothing, so a phone browser never vibrates. A haptic is only a
// nicety: if anything goes wrong it is ignored and never reaches the screen.
// ============================================================
import { isNativeApp } from "./platform";

let pluginPromise = null;

function nativePlugin() {
  if (!pluginPromise) {
    // Wrapped in a plain object of functions: Capacitor plugin objects look
    // like a Promise and would hang if they travelled through one.
    pluginPromise = import("@capacitor/haptics").then((m) => ({
      light: () => m.Haptics.impact({ style: m.ImpactStyle.Light }),
      success: () => m.Haptics.impact({ style: m.ImpactStyle.Light }),
    }));
  }
  return pluginPromise;
}

function run(kind) {
  if (!isNativeApp()) return;
  nativePlugin()
    .then((p) => p[kind]())
    .catch(() => {});
}

// A light tap: a card leaving, a card flipping, a star changing.
export function hapticLight() {
  run("light");
}

// "This word is now known": one gentle tap (the stronger double buzz felt too intense).
export function hapticSuccess() {
  run("success");
}
