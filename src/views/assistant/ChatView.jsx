import { useEffect, useState } from "react";
import { Icon } from "../../components/icons";
import { ActionRow, BigCard, PillButton, Stage } from "../../components/layout";
import { Pill } from "../../components/ui";
import { ChatConversation } from "./ChatConversation";
import { PhotoPanel } from "./PhotoPanel";
import { TextExtractPanel } from "./TextExtractPanel";

export function ChatView({ categories, addCategory, addCards, showToast, engine, onOpenSettings, incoming, onIncomingUsed }) {
  const [mode, setMode] = useState("text");

  // Something shared from another app: a photo goes to Photo, text to Translate.
  // It waits here until the AI is set up. The panels read it in the same render
  // (children first), so it can be cleared right after.
  useEffect(() => {
    if (!incoming || !engine) return;
    setMode(incoming.imageBase64 ? "photo" : "text");
    if (onIncomingUsed) onIncomingUsed();
  }, [incoming, engine, onIncomingUsed]);

  const modes = [
    { id: "chat", label: "Ask" },
    { id: "text", label: "Text" },
    { id: "photo", label: "Photo" },
  ];

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

  return (
    <div style={{ minHeight: "calc(100dvh - 210px)", display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {modes.map((m) => (
          <Pill key={m.id} color="var(--fjord)" active={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </Pill>
        ))}
      </div>

      {/* Every panel stays mounted so switching between them doesn't
          wipe out what you were in the middle of typing — only the
          active one is visible, the rest are just hidden. */}
      <div style={{ display: mode === "chat" ? "block" : "none" }}>
        <ChatConversation engine={engine} categories={categories} addCategory={addCategory} addCards={addCards} showToast={showToast} onOpenSettings={onOpenSettings} />
      </div>
      <div style={{ display: mode === "text" ? "block" : "none" }}>
        <TextExtractPanel incomingText={incoming && !incoming.imageBase64 ? incoming : null} engine={engine} categories={categories} addCategory={addCategory} addCards={addCards} onOpenSettings={onOpenSettings} />
      </div>
      <div style={{ display: mode === "photo" ? "block" : "none" }}>
        <PhotoPanel incomingImage={incoming && incoming.imageBase64 ? incoming : null} categories={categories} addCategory={addCategory} addCards={addCards} onOpenSettings={onOpenSettings} />
      </div>
    </div>
  );
}
