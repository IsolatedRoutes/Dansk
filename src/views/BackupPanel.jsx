import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/icons";
import { smallBtn } from "../components/ui";
import { BACKUP_SETTING_KEYS, performBackupExport } from "../lib/backup";
import { storeGet, storeSet } from "../lib/storage";

export function BackupPanel({ cards, categories, replaceAllData, showToast, onClose }) {
  const importInputRef = useRef(null);
  const [autoBackupEnabled, setAutoBackupEnabledState] = useState(false);

  useEffect(() => {
    storeGet("autoBackupEnabled").then((v) => setAutoBackupEnabledState(v === "true"));
  }, []);

  async function toggleAutoBackup(next) {
    setAutoBackupEnabledState(next);
    await storeSet("autoBackupEnabled", next ? "true" : "false");
  }

  function exportDeck() {
    return performBackupExport(cards, categories, showToast);
  }

  async function processImportedBackup(text) {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.cards) || !Array.isArray(parsed.categories)) {
        showToast("That doesn't look like a Dansk backup file");
        return;
      }
      const confirmed = window.confirm
        ? window.confirm("This replaces everything currently in your deck (" + cards.length + " cards) with the " + parsed.cards.length + " cards from this backup. Continue?")
        : true;
      if (!confirmed) return;
      if (parsed.settings && typeof parsed.settings === "object") {
        for (const key of BACKUP_SETTING_KEYS) {
          if (typeof parsed.settings[key] === "string") await storeSet(key, parsed.settings[key]);
        }
      }
      const ok = await replaceAllData(parsed.cards, parsed.categories);
      showToast(ok ? "Backup restored (" + parsed.cards.length + " cards)" : "Couldn't restore the backup");
    } catch {
      showToast("Couldn't read that file — is it a Dansk backup?");
    }
  }

  async function triggerImport() {
    // On desktop Chrome/Edge, open straight into the same remembered
    // folder Export uses (same id) — no manual navigation needed once
    // it's been picked there once.
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          id: "dansk-cloud-backup",
          types: [{ description: "Dansk backup", accept: { "application/json": [".json"] } }],
        });
        const file = await handle.getFile();
        await processImportedBackup(await file.text());
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // they cancelled the picker
        // otherwise fall through to the plain file input below
      }
    }
    if (importInputRef.current) importInputRef.current.click();
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    await processImportedBackup(await file.text());
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: "var(--serif)", fontSize: 18 }}>Backup</div>
        <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
          <Icon.X size={18} />
        </button>
      </div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55, marginBottom: 16 }}>
        Export saves your deck to a file; Import loads one back in. To carry progress between devices, export into a
        synced folder (like iCloud Drive), then Import on the other device. Every export uses the same name,
        "dansk-backup.json". Websites can't overwrite files on their own, so if your phone or browser asks, choose
        Replace to keep a single backup instead of a new numbered copy.
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 10,
          background: "var(--card)",
          border: "1px solid var(--line)",
          marginBottom: 14,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600 }}>Automatic backups</div>
          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", lineHeight: 1.4, marginTop: 2 }}>
            Prompts a one-tap backup once a week, and only if something has changed since your last one. This is a
            per-device setting — turning it on here won't affect your other devices.
          </div>
        </div>
        <button
          onClick={() => toggleAutoBackup(!autoBackupEnabled)}
          aria-label="Toggle automatic backups"
          style={{
            flexShrink: 0,
            width: 42,
            height: 24,
            borderRadius: 999,
            border: "none",
            background: autoBackupEnabled ? "var(--fjord)" : "#D8D4C8",
            position: "relative",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: autoBackupEnabled ? 20 : 2,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "#FBFAF7",
              transition: "left 0.15s ease",
            }}
          />
        </button>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={exportDeck} style={{ ...smallBtn("var(--fjord)"), flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Icon.Download size={14} /> Export
        </button>
        <button onClick={triggerImport} style={{ ...smallBtn("#A8A395"), flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Icon.Upload size={14} /> Import
        </button>
        <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: "none" }} />
      </div>
    </div>
  );
}
