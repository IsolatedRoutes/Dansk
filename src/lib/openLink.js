// Opens a web page. In the iPhone app it opens inside the app (a sheet with a
// Done button that comes straight back); on the website it opens a new tab.
// If the in-app sheet is unavailable for any reason, it falls back to a new tab.
import { isNativeApp } from "./platform";

export async function openLink(url) {
  if (isNativeApp()) {
    try {
      const m = await import("@capacitor/browser");
      await m.Browser.open({ url });
      return;
    } catch {
      // fall through to a normal tab
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
