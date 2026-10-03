// True inside the iPhone app (a Capacitor wrapper around this same page).
export function isNativeApp() {
  return typeof window !== "undefined" && !!window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform();
}
