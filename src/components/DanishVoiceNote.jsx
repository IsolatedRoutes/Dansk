import { useEffect, useState } from "react";
import { onNoDanishVoice } from "../lib/speech";
import { isNativeApp } from "../lib/platform";
import { Icon } from "./icons";
import { CenteredOverlay, smallBtn } from "./ui";

// Shown when someone taps a speaker button but the device has no spoken
// Danish language turned on. An app can't jump straight to that setting, so
// this explains where it is.
export function DanishVoiceNote() {
  const [open, setOpen] = useState(false);
  useEffect(() => onNoDanishVoice(() => setOpen(true)), []);
  if (!open) return null;

  const onIPhone = isNativeApp() || (typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent));
  const pathStyle = { fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)", lineHeight: 1.5, fontWeight: 600, margin: "8px 0" };
  const bodyStyle = { fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 };

  return (
    <CenteredOverlay onClose={() => setOpen(false)} maxWidth={340}>
      <div style={{ textAlign: "center" }}>
        <Icon.Volume2 size={22} color="var(--fjord)" style={{ marginBottom: 8 }} />
        <div style={{ fontFamily: "var(--serif)", fontSize: 17, marginBottom: 8 }}>Spoken Danish isn't turned on</div>
        {onIPhone ? (
          <>
            <div style={bodyStyle}>Your iPhone needs a spoken Danish language setting turned on before it can read Danish aloud. Go to:</div>
            <div style={pathStyle}>Settings → Accessibility → Spoken Content → Voices → Danish</div>
            <div style={{ ...bodyStyle, marginBottom: 16 }}>Pick a voice and let it download, then come back and tap the speaker again.</div>
          </>
        ) : (
          <div style={{ ...bodyStyle, marginBottom: 16 }}>
            This device needs a spoken Danish language setting turned on before it can read Danish aloud. Look for Danish in your device's text-to-speech or language settings.
          </div>
        )}
        <button onClick={() => setOpen(false)} style={{ ...smallBtn("var(--fjord)"), width: "100%", padding: "10px", fontSize: 14 }}>
          OK
        </button>
      </div>
    </CenteredOverlay>
  );
}
