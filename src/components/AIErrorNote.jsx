import { Icon } from "./icons";
import { isSwitchableAIError } from "../lib/ai/index";

export function AIErrorNote({ message, onOpenSettings }) {
  if (!message) return null;
  return (
    <div style={{ color: "var(--rust)", fontFamily: "var(--sans)", fontSize: 13, marginTop: 8, lineHeight: 1.45 }}>
      <div>{message}</div>
      {onOpenSettings && isSwitchableAIError(message) && (
        <button
          onClick={onOpenSettings}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            border: "none",
            background: "none",
            color: "var(--fjord)",
            fontFamily: "var(--sans)",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
            marginTop: 6,
          }}
        >
          <Icon.Key size={12} /> Choose another AI option
        </button>
      )}
    </div>
  );
}
