import { useState } from "react";
import { MenuDropdown, menuRowStyle } from "./menus";

// The shared look for the Add, Assistant (and Library) pages: a row of two
// dropdowns, one big cream card, and pill buttons under it. The whole group
// sits in the middle of the screen. Study keeps its own layout.

// A dropdown like Study's: white box, a floating list to pick from.
export function PickMenu({ label, value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const current = (options.find((o) => o.id === value) || options[0] || {}).label || label;
  return (
    <div style={{ flex: 1, minWidth: 0 }} aria-label={ariaLabel}>
      <MenuDropdown label={current} open={open} setOpen={setOpen} width={260}>
        {options.map((o) => (
          <button
            key={o.id}
            style={menuRowStyle(o.id === value)}
            onClick={() => {
              onChange(o.id);
              setOpen(false);
            }}
          >
            {o.label}
          </button>
        ))}
      </MenuDropdown>
    </div>
  );
}

export function PickRow({ children }) {
  return <div style={{ display: "flex", gap: 10 }}>{children}</div>;
}

// Puts everything in the middle between the header and the tab bar.
export function Stage({ children }) {
  return (
    <div style={{ minHeight: "calc(100dvh - 210px)", display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
      {children}
    </div>
  );
}

export function BigCard({ children, height = 340, style }) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 16,
        background: "var(--card)",
        height,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Primary = terracotta, secondary = white with a thin line (like Back / Next).
export function PillButton({ kind = "primary", children, disabled, onClick, ...rest }) {
  const primary = kind === "primary";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        border: primary ? "none" : "1px solid var(--line)",
        background: primary ? "var(--terracotta)" : "#fff",
        color: primary ? "#fff" : "var(--ink)",
        borderRadius: 999,
        padding: "11px 24px",
        fontFamily: "var(--sans)",
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function ActionRow({ children }) {
  return <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>{children}</div>;
}

export const quietLink = { border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 13, cursor: "pointer", padding: 0 };
