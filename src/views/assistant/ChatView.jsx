import { useEffect, useState } from "react";
import { Icon } from "../../components/icons";
import { ActionRow, BigCard, PickMenu, PickRow, PillButton, Stage } from "../../components/layout";
import { ChatConversation } from "./ChatConversation";
import { PhotoPanel } from "./PhotoPanel";
import { TextExtractPanel } from "./TextExtractPanel";

export function ChatView({ categories, addCategory, addCards, showToast, engine, onOpenSettings, incoming, onIncomingUsed }) {
  const [mode, setMode] = useState("chat");

  // Something shared from another app: a photo goes to Photo, text to Translate.
  // It waits here until the AI is set up. The panels read it in the same render
  // (children first), so it can be cleared right after.
  useEffect(() => {
    if (!incoming || !engine) return;
    setMode(incoming.imageBase64 ? "photo" : "translate");
    if (onIncomingUsed) onIncomingUsed();
  }, [incoming, engine, onIncomingUsed]);

  const modes = [
    { id: "chat", label: "Ask" },
    { id: "translate", label: "Translate" },
    { id: "analyze", label: "Analyze sentence" },
    { id: "extract", label: "Extract text" },
    { id: "photo", label: "Photo" },
  ];
  const isText = mode === "translate" || mode === "analyze" || mode === "extract";

  if (engine === undefined) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <Icon.Loader2 className="spin" size={18} color="var(--muted)" />
      </div>
    );
  }

  if (!engine) {
    return (
      <Stage>
        <BigCard>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 22 }}>Set up your AI</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, marginTop: 8, maxWidth: 300 }}>
              The Assistant answers questions about Danish, explains grammar, translates text and reads photos. It takes about two minutes, and Gemini is free.
            </div>
          </div>
        </BigCard>
        <ActionRow>
          <PillButton onClick={onOpenSettings}>Set up AI</PillButton>
        </ActionRow>
      </Stage>
    );
  }

  const body = (
    <>
      <PickRow>
        <PickMenu ariaLabel="Assistant mode" value={mode} options={modes} onChange={setMode} />
      </PickRow>

      {/* Every panel stays mounted so switching between them doesn't
          wipe out what you were in the middle of typing — only the
          active one is visible, the rest are just hidden. The three text
          actions share one panel (and one box of text). */}
      <div style={{ display: mode === "chat" ? "block" : "none" }}>
        <ChatConversation engine={engine} categories={categories} addCategory={addCategory} addCards={addCards} showToast={showToast} onOpenSettings={onOpenSettings} />
      </div>
      <div style={{ display: isText ? "block" : "none" }}>
        <TextExtractPanel action={mode} incomingText={incoming && !incoming.imageBase64 ? incoming : null} engine={engine} categories={categories} addCategory={addCategory} addCards={addCards} onOpenSettings={onOpenSettings} />
      </div>
      <div style={{ display: mode === "photo" ? "block" : "none" }}>
        <PhotoPanel incomingImage={incoming && incoming.imageBase64 ? incoming : null} categories={categories} addCategory={addCategory} addCards={addCards} onOpenSettings={onOpenSettings} />
      </div>
    </>
  );

  // The text actions sit in the middle of the screen like Add; Ask and Photo
  // need room, so they start at the top.
  // One wrapper for every mode, so switching never remounts the panels.
  return (
    <div style={{ minHeight: isText ? "calc(100dvh - 210px)" : undefined, display: "flex", flexDirection: "column", justifyContent: isText ? "center" : "flex-start", gap: 12, paddingTop: isText ? 0 : 16 }}>
      {body}
    </div>
  );
}
