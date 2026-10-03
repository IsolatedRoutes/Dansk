import { useState } from "react";
import { Icon } from "../../components/icons";
import { EmptyState, Pill, SectionTitle } from "../../components/ui";
import { ChatConversation } from "./ChatConversation";
import { PhotoPanel } from "./PhotoPanel";
import { TextExtractPanel } from "./TextExtractPanel";

export function ChatView({ categories, addCategory, addCards, showToast, engine, onOpenSettings }) {
  const [mode, setMode] = useState("chat");

  const quickActions = [
    { id: "chat", label: "Chat", icon: Icon.MessageCircle },
    { id: "article", label: "Translate", icon: Icon.FileText },
    { id: "photo", label: "Photo", icon: Icon.Camera },
  ];

  if (engine === undefined) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <Icon.Loader2 className="spin" size={18} color="var(--muted)" />
      </div>
    );
  }

  return (
    <div>
      <SectionTitle>Ask your tutor</SectionTitle>
      <div style={{ height: 12 }} />

      {!engine && (
        <EmptyState icon={Icon.MessageCircle} title="Choose an AI option" body="Open AI settings above to use the local model or your own API key." />
      )}

      {engine && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
            {quickActions.map((a) => (
              <Pill key={a.id} color="var(--fjord)" active={mode === a.id} onClick={() => setMode(a.id)}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <a.icon size={12} />
                  {a.label}
                </span>
              </Pill>
            ))}
          </div>

          {/* Every panel stays mounted so switching between them doesn't
              wipe out what you were in the middle of typing — only the
              active one is visible, the rest are just hidden. */}
          <div style={{ display: mode === "chat" ? "block" : "none" }}>
            <ChatConversation engine={engine} categories={categories} addCategory={addCategory} addCards={addCards} showToast={showToast} onOpenSettings={onOpenSettings} />
          </div>
          <div style={{ display: mode === "article" ? "block" : "none" }}>
            <TextExtractPanel engine={engine} categories={categories} addCategory={addCategory} addCards={addCards} onOpenSettings={onOpenSettings} />
          </div>
          <div style={{ display: mode === "photo" ? "block" : "none" }}>
            <PhotoPanel categories={categories} addCategory={addCategory} addCards={addCards} onOpenSettings={onOpenSettings} />
          </div>
        </>
      )}
    </div>
  );
}
