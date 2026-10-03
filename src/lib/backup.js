import { storeGet, storeSet } from "./storage";

// A short fingerprint of the deck, so backup reminders only appear when
// something has actually changed since the last backup.
export function backupFingerprint(cards, categories) {
  const text = JSON.stringify([
    cards.map((c) => [c.id, c.front, c.back, c.known ? 1 : 0, c.starred ? 1 : 0, c.ignored ? 1 : 0, c.category]),
    categories.map((c) => [c.id, c.name]),
  ]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36) + ":" + text.length;
}

function markBackedUp(cards, categories) {
  storeSet("lastBackupAt", Date.now().toString()).catch(() => {});
  storeSet("lastBackupFingerprint", backupFingerprint(cards, categories)).catch(() => {});
}

// Shared by the Backup panel's own Export button and the auto-backup
// prompt, so there's exactly one implementation of the actual save flow.
export const BACKUP_SETTING_KEYS = ["verbForms", "studyLevels", "nounOptions", "deletedStarterCards"];

export async function performBackupExport(cards, categories, showToast) {
  // Study settings and deleted built-in words travel with the backup, so
  // restoring on a new phone, computer or a future app version brings
  // everything back, not just the cards.
  const settings = {};
  for (const key of BACKUP_SETTING_KEYS) {
    const v = await storeGet(key);
    if (v != null) settings[key] = v;
  }
  const payload = { exportedAt: new Date().toISOString(), cards, categories, settings };
  // Deliberately the same name every time (no date suffix) so each export
  // replaces the last one in Files/Downloads rather than piling up a new
  // file every time — the export timestamp still lives inside the file
  // itself if it's ever needed.
  const filename = "dansk-backup.json";
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });

  // Share the file directly when possible, so the person gets a real
  // "choose where to save it" prompt (Files, AirDrop, Messages, etc.)
  // instead of it silently landing wherever the browser's default
  // downloads location happens to be. This is the main path on iPhone
  // — "Save to Files" → iCloud Drive is what makes the file show up
  // on other devices later.
  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Dansk backup" });
        markBackedUp(cards, categories);
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return; // they cancelled the share sheet — not a failure
      // otherwise fall through below
    }
  }

  // On desktop Chrome/Edge, let the person pick exactly where to save
  // (e.g. straight into their iCloud Drive folder) instead of always
  // landing in the default Downloads folder. The shared id means this
  // reopens at the same folder they picked last time, automatically.
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        id: "dansk-cloud-backup",
        suggestedName: filename,
        types: [{ description: "Dansk backup", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      markBackedUp(cards, categories);
      showToast("Backup saved");
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // they cancelled the save dialog
      // otherwise fall through to the plain download below
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  markBackedUp(cards, categories);
  showToast("Backup file downloaded");
}
