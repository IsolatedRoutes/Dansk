import { Icon } from "./icons";

// ---------- shared UI bits ----------

export const inputStyle = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  fontSize: 16,
  background: "#FFFFFF",
};

export const iconBtn = { border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: 6, display: "flex" };

export function smallBtn(bg) {
  return {
    border: "none",
    background: bg,
    color: "#FBFAF7",
    borderRadius: 8,
    padding: "7px 13px",
    fontFamily: "var(--sans)",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  };
}

export const rowCheck = { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, cursor: "pointer" };

// Every popup in the app (word-insight, ask-a-word, AI settings, backup)
// uses this: a simple centered overlay, sized to the viewport with its
// own internal scroll. Deliberately NOT anchored to wherever it was
// triggered from — anchored positioning kept getting cut off in some
// real environments (especially with the keyboard open, where the
// trigger's on-screen position keeps shifting under it) despite several
// attempts to compute it dynamically. A fixed, centered box can't be
// clipped by anything and doesn't need to track a moving target.
export function CenteredOverlay({ onClose, children, maxWidth = 420 }) {
  return (
    <div
      className="popover-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(35,39,42,0.35)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="popover"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "85vh",
          overflowY: "auto",
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          padding: 20,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Pill({ children, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "1px solid " + (active ? color : "#D8D4CB"),
        background: active ? color : "transparent",
        color: active ? "#FBFAF7" : "#4A473F",
        borderRadius: 999,
        padding: "6px 13px",
        fontSize: 13,
        fontFamily: "var(--sans)",
        whiteSpace: "nowrap",
        cursor: "pointer",
        transition: "all .15s ease",
      }}
    >
      {children}
    </button>
  );
}

export function EmptyState({ icon: IconCmp, title, body }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "#8A8577" }}>
      <IconCmp size={28} strokeWidth={1.4} style={{ marginBottom: 10, opacity: 0.7 }} />
      <div style={{ fontFamily: "var(--sans)", fontSize: 15, fontWeight: 600, color: "#4A473F", marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 320, margin: "0 auto" }}>
        {body}
      </div>
    </div>
  );
}

export function SectionTitle({ children }) {
  return <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 400, margin: 0 }}>{children}</h2>;
}

export function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

export function CheckRow({ on, label, onClick }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer" }}>
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: "1.6px solid " + (on ? "var(--fjord)" : "#C9C4B6"),
          background: on ? "var(--fjord)" : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {on && <Icon.Check size={11} color="#FBFAF7" />}
      </span>
      <span style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--ink)" }}>{label}</span>
    </div>
  );
}

export function Toast({ msg }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 78,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--ink)",
        color: "#FBFAF7",
        fontFamily: "var(--sans)",
        fontSize: 13,
        padding: "9px 16px",
        borderRadius: 8,
        zIndex: 20,
        textAlign: "center",
        maxWidth: "88%",
      }}
    >
      {msg}
    </div>
  );
}
