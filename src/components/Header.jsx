import { useState } from "react";
import { Icon } from "./icons";
import { INFO_PAGES } from "../data/infoPages";

export function Header({ onOpenSettings, onOpenBackup, onOpenInfo, settingsOpen, backupOpen }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div style={{ padding: "22px 18px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, margin: 0, fontWeight: 400, letterSpacing: 0.2 }}>
          Dansk<span style={{ color: "var(--rust)" }}>.</span>
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={onOpenBackup}
            aria-label="Backup and sync"
            style={{ border: "none", background: "none", color: backupOpen ? "var(--fjord)" : "var(--muted)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: "var(--sans)", fontSize: 11.5, fontWeight: backupOpen ? 700 : 400, padding: 0 }}
          >
            <Icon.Download size={12} />
            Backup
            {backupOpen ? <Icon.ChevronUp size={11} /> : null}
          </button>
          <button
            onClick={onOpenSettings}
            style={{ border: "none", background: "none", color: settingsOpen ? "var(--fjord)" : "var(--muted)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: "var(--sans)", fontSize: 11.5, fontWeight: settingsOpen ? 700 : 400, padding: 0 }}
          >
            <Icon.Key size={12} />
            AI settings
            {settingsOpen ? <Icon.ChevronUp size={11} /> : null}
          </button>
          <div style={{ position: "relative", display: "flex" }}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              style={{ border: "none", background: "none", color: menuOpen ? "var(--fjord)" : "var(--muted)", cursor: "pointer", padding: 2, display: "flex" }}
            >
              <Icon.Menu size={17} />
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
                <div
                  className="popover"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    zIndex: 91,
                    minWidth: 150,
                    background: "var(--card)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    padding: 4,
                  }}
                >
                  {INFO_PAGES.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenInfo(page.id);
                      }}
                      style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "none", color: "var(--ink)", fontFamily: "var(--sans)", fontSize: 14, padding: "10px 12px", borderRadius: 8, cursor: "pointer" }}
                    >
                      {page.title}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
