import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";

// ============================================================
// Runtime environment
// Inside a Claude artifact, window.storage exists and API calls
// to api.anthropic.com are authenticated automatically. Outside
// Claude (a standalone page — the main way this app is meant to
// be used), neither is true: we fall back to localStorage, and
// AI features run either as a small model in your own browser,
// or via your own Anthropic API key — your choice, set in the
// Chat tab's AI settings.
// ============================================================

// Checked at call time (not cached) since window.storage can attach
// slightly after this script starts running — a one-time check at load
// could permanently misjudge the environment for the rest of the session.
function inClaudeApp() {
  return typeof window !== "undefined" && !!window.storage;
}

// If Claude's own artifact storage turns out to be unavailable in this
// session, there's no point re-trying it on every single save — that just
// adds delay before falling through. Once we see it fail, skip straight to
// the fallback tiers for the rest of the session.
let claudeStorageBroken = false;
let storageDegraded = false; // true once we've ever had to fall back
const memoryStore = {};

async function storeGet(key) {
  if (inClaudeApp() && !claudeStorageBroken) {
    try {
      const r = await window.storage.get(key, false);
      if (r) return r.value;
    } catch (e) {
      claudeStorageBroken = true;
    }
  }
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch (e) {}
  return key in memoryStore ? memoryStore[key] : null;
}

async function storeSet(key, value) {
  if (inClaudeApp() && !claudeStorageBroken) {
    try {
      const r = await window.storage.set(key, value, false);
      if (r) return { ok: true };
      claudeStorageBroken = true;
    } catch (e) {
      claudeStorageBroken = true;
    }
  }
  // Fall back to a normal browser store. This keeps saves working for the
  // rest of the session even when the artifact's own storage doesn't —
  // but it's a real degradation worth surfacing once, since data kept
  // only in memory won't survive closing the tab.
  try {
    localStorage.setItem(key, value);
    storageDegraded = true;
    return { ok: true, degraded: true };
  } catch (e) {
    memoryStore[key] = value;
    storageDegraded = true;
    return { ok: true, degraded: true, memoryOnly: true };
  }
}

// The deck is saved in a compact form: fields that just hold their
// default value (empty notes, no examples, not starred, not known, ...)
// are left out, and filled back in on load. With 8,000 cards this keeps
// the saved deck well under the ~5 MB browser storage limit. Older saves
// in the full format load exactly the same way.
const CARD_DEFAULTS = { notes: "", examples: [], starred: false, known: false, ignored: false, forms: "", gender: "", level: 0 };
function packCards(json) {
  try {
    const list = JSON.parse(json);
    if (!Array.isArray(list)) return json;
    return JSON.stringify(
      list.map((card) => {
        const out = {};
        for (const [k, v] of Object.entries(card)) {
          if (k in CARD_DEFAULTS) {
            const d = CARD_DEFAULTS[k];
            if (v === undefined || v === null || v === d || (Array.isArray(d) && Array.isArray(v) && v.length === 0)) continue;
          }
          if (k === "createdAt" && card.starter) continue; // seed time, never shown
          out[k] = v;
        }
        return out;
      })
    );
  } catch (e) {
    return json;
  }
}
function unpackCards(list) {
  return list.map((card) => ({ ...CARD_DEFAULTS, examples: [], ...card }));
}

async function persistWithRetry(key, value) {
  if (key === "cards") value = packCards(value);
  let lastError = "unknown error";
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await storeSet(key, value);
    if (result.ok) return result;
    lastError = result.error;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return { ok: false, error: lastError };
}

// ============================================================
// Custom icon set — no external icon library, so this file has
// zero dependencies beyond React (and, only if you choose local
// AI, the model library loaded on demand).
// ============================================================

function makeIcon(renderChildren) {
  return function IconCmp({ size = 16, color = "currentColor", strokeWidth = 1.8, className, style }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
      >
        {renderChildren()}
      </svg>
    );
  };
}

const Icon = {
  EyeOff: makeIcon(() => (
    <>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </>
  )),
  Plus: makeIcon(() => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  )),
  Search: makeIcon(() => (
    <>
      <circle cx="10" cy="10" r="6" />
      <line x1="15" y1="15" x2="20" y2="20" />
    </>
  )),
  Layers: makeIcon(() => (
    <>
      <rect x="5" y="4.5" width="14" height="4" rx="1" />
      <rect x="5" y="10" width="14" height="4" rx="1" />
      <rect x="5" y="15.5" width="14" height="4" rx="1" />
    </>
  )),
  Camera: makeIcon(() => (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <circle cx="12" cy="13" r="3.3" />
      <rect x="9" y="4" width="6" height="3" rx="1" />
    </>
  )),
  Sparkles: makeIcon(() => <polygon points="12,3 14,10 21,12 14,14 12,21 10,14 3,12 10,10" />),
  Lightbulb: makeIcon(() => (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.7.8 1 1.4 1 2.5h6c0-1.1.3-1.7 1-2.5A6 6 0 0 0 12 3z" />
    </>
  )),
  HelpCircle: makeIcon(() => (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.2 1-1.2 2" />
      <line x1="12" y1="17" x2="12" y2="17.01" />
    </>
  )),
  ArrowUp: makeIcon(() => (
    <>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="6,11 12,5 18,11" />
    </>
  )),
  ArrowDown: makeIcon(() => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="6,13 12,19 18,13" />
    </>
  )),
  ChevronUp: makeIcon(() => <polyline points="5,15 12,8 19,15" />),
  ChevronDown: makeIcon(() => <polyline points="5,9 12,16 19,9" />),
  Volume2: makeIcon(() => (
    <>
      <polygon points="3,9 3,15 8,15 13,20 13,4 8,9" />
      <path d="M16 8a5 5 0 0 1 0 8" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  )),
  Check: makeIcon(() => <polyline points="4,12 9,17 20,6" />),
  X: makeIcon(() => (
    <>
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </>
  )),
  Tag: makeIcon(() => (
    <>
      <rect x="3" y="6" width="14" height="12" rx="2" />
      <circle cx="8" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  )),
  RotateCcw: makeIcon(() => (
    <>
      <circle cx="12" cy="13" r="7" />
      <polyline points="8,5 8,9 12,9" />
    </>
  )),
  Trash2: makeIcon(() => (
    <>
      <rect x="6" y="8" width="12" height="12" rx="1" />
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="10" y1="3" x2="14" y2="3" />
      <line x1="9" y1="11" x2="9" y2="17" />
      <line x1="15" y1="11" x2="15" y2="17" />
    </>
  )),
  Edit3: makeIcon(() => (
    <>
      <line x1="4" y1="20" x2="20" y2="4" />
      <line x1="16" y1="4" x2="20" y2="8" />
    </>
  )),
  Loader2: makeIcon(() => <circle cx="12" cy="12" r="9" strokeDasharray="34 22" />),
  Upload: makeIcon(() => (
    <>
      <line x1="12" y1="4" x2="12" y2="15" />
      <polyline points="7,9 12,4 17,9" />
      <line x1="5" y1="19" x2="19" y2="19" />
    </>
  )),
  GraduationCap: makeIcon(() => (
    <>
      <polygon points="12,4 21,9 12,14 3,9" />
      <line x1="7" y1="11" x2="7" y2="17" />
    </>
  )),
  Wand2: makeIcon(() => (
    <>
      <line x1="4" y1="20" x2="16" y2="8" />
      <line x1="16" y1="4" x2="18" y2="6" />
      <line x1="20" y1="8" x2="18" y2="6" />
    </>
  )),
  Save: makeIcon(() => (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="7" y="4" width="8" height="5" />
      <rect x="7" y="14" width="10" height="6" />
    </>
  )),
  MessageCircle: makeIcon(() => (
    <>
      <circle cx="12" cy="11" r="8" />
      <polygon points="9,18 7,22 13,18" />
    </>
  )),
  Send: makeIcon(() => <polygon points="3,12 21,4 14,21 11,13" />),
  Download: makeIcon(() => (
    <>
      <line x1="12" y1="4" x2="12" y2="15" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="5" y1="19" x2="19" y2="19" />
    </>
  )),
  Key: makeIcon(() => (
    <>
      <circle cx="8" cy="12" r="4" />
      <line x1="12" y1="12" x2="21" y2="12" />
      <line x1="17" y1="12" x2="17" y2="16" />
      <line x1="20" y1="12" x2="20" y2="15" />
    </>
  )),
  FileText: makeIcon(() => (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </>
  )),
};

function StarIcon({ size = 16, color = "currentColor", filled = false, strokeWidth = 1.8, style, onClick, onPointerDown }) {
  return (
    <svg
      onClick={onClick}
      onPointerDown={onPointerDown}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <polygon points="12,3 14.6,9.2 21.5,9.8 16.2,14.2 17.8,21 12,17.3 6.2,21 7.8,14.2 2.5,9.8 9.4,9.2" />
    </svg>
  );
}

// Small badge check, mirroring StarIcon's outline/filled pattern — outline
// and muted until checked, filled green once marked known.
function CheckBadgeIcon({ size = 16, filled = false, style, onClick, onPointerDown }) {
  const color = filled ? "#4C8A5E" : "#C9C4B6";
  return (
    <svg onClick={onClick} onPointerDown={onPointerDown} width={size} height={size} viewBox="0 0 24 24" style={style}>
      <circle cx="12" cy="12" r="9.5" fill={filled ? color : "none"} stroke={color} strokeWidth="1.8" />
      <polyline
        points="7.5,12.3 10.5,15.5 16.5,8.5"
        fill="none"
        stroke={filled ? "#FBFAF7" : color}
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------- constants ----------

const DEFAULT_CATEGORIES = [{ id: "grammar-lessons", name: "Grammar Lessons", custom: false }];

// The vocabulary buildout created a lot of thin, overlapping categories
// (e.g. "More Verbs", "Emotions in Depth"). This maps each one to the
// broader category it was consolidated into, so a one-time migration can
// re-point any of a user's existing cards at the surviving category
// instead of leaving them scattered across dozens of near-duplicates.
const CATEGORY_MERGE_MAP = {
  // Renamed so it doesn't clash with the new "Basic" level. Listed first so
  // the existing category is renamed in place (keeping its cards) before
  // anything else is merged into it.
  "Basic Verbs": "Verbs",
  "More Verbs": "Verbs",
  "Common Actions": "Verbs",
  "People & Roles": "Common Nouns",
  "More Adjectives": "Adjectives",
  "Qualities & States": "Adjectives",
  "Time & Sequencing": "Numbers & Time",
  "Shapes & Measurements": "Numbers & Time",
  "Relationships & Social Life": "Family & People",
  "Cooking & Dining Out": "Food & Drink",
  "Housing & Real Estate": "Home & Daily Life",
  "Household Chores": "Home & Daily Life",
  "Everyday Situations": "Home & Daily Life",
  "Travel Details": "Travel & Transport",
  "Nature & Environment": "Weather & Nature",
  "Weather in Detail": "Weather & Nature",
  "Body Language & Gestures": "Body & Health",
  "Education & Learning": "Work & School",
  "Money & Personal Finance": "Work & School",
  "Emotions in Depth": "Emotions & Personality",
  "Personality Traits": "Emotions & Personality",
  "Idioms & Expressions": "Common Phrases & Idioms",
  "Opinions & Debate Language": "Common Phrases & Idioms",
  "Common Connectors": "Prepositions & Connectors",
  "Technology & Digital Life": "Technology & Media",
  "Media & Entertainment": "Technology & Media",
  "Problems & Solutions": "Abstract Concepts & Opinions",
  "Final Additions": "Abstract Concepts & Opinions",
  "Crime & Safety": "Society & Culture",
  "Science & Research": "Society & Culture",
  "Communication & Language": "Society & Culture",
  "Sports & Fitness": "Hobbies & Leisure",
};

// A small number of starter words turned out to have real accuracy
// issues on review (mostly mass nouns that were mechanically given an
// indefinite article they don't take in ordinary Danish usage — "en
// regn" instead of just "regn", for example). Maps the old, incorrect
// Danish text to the corrected version so an existing user's already-
// seeded card gets fixed in place, rather than the corrected word being
// added as a duplicate alongside the old wrong one.
const VOCAB_CORRECTIONS = {
  // 8,000-word update: verbs now always start with "at", and uncountable
  // nouns drop the en/et they don't take in normal Danish.
  "kunne": "at kunne",
  "skulle": "at skulle",
  "måtte": "at måtte",
  "være": "at være",
  "have": "at have",
  "blive": "at blive",
  "gøre": "at gøre",
  "ville": "at ville",
  "få": "at få",
  "give": "at give",
  "tage": "at tage",
  "komme": "at komme",
  "gå": "at gå",
  "se": "at se",
  "vide": "at vide",
  "kende": "at kende",
  "sige": "at sige",
  "tale": "at tale",
  "tro": "at tro",
  "tænke": "at tænke",
  "synes": "at synes",
  "mene": "at mene",
  "finde": "at finde",
  "lave": "at lave",
  "spise": "at spise",
  "drikke": "at drikke",
  "sove": "at sove",
  "vågne": "at vågne",
  "stå": "at stå",
  "sidde": "at sidde",
  "ligge": "at ligge",
  "løbe": "at løbe",
  "køre": "at køre",
  "flyve": "at flyve",
  "svømme": "at svømme",
  "læse": "at læse",
  "skrive": "at skrive",
  "lytte": "at lytte",
  "høre": "at høre",
  "kigge": "at kigge",
  "vise": "at vise",
  "forstå": "at forstå",
  "lære": "at lære",
  "undervise": "at undervise",
  "studere": "at studere",
  "arbejde": "at arbejde",
  "spille": "at spille",
  "lege": "at lege",
  "vinde": "at vinde",
  "tabe": "at tabe",
  "prøve": "at prøve",
  "øve": "at øve",
  "begynde": "at begynde",
  "starte": "at starte",
  "stoppe": "at stoppe",
  "slutte": "at slutte",
  "fortsætte": "at fortsætte",
  "vente": "at vente",
  "håbe": "at håbe",
  "ønske": "at ønske",
  "elske": "at elske",
  "kunne lide": "at kunne lide",
  "hade": "at hade",
  "savne": "at savne",
  "huske": "at huske",
  "glemme": "at glemme",
  "forklare": "at forklare",
  "spørge": "at spørge",
  "svare": "at svare",
  "bede": "at bede",
  "takke": "at takke",
  "undskylde": "at undskylde",
  "hjælpe": "at hjælpe",
  "bruge": "at bruge",
  "betale": "at betale",
  "koste": "at koste",
  "sælge": "at sælge",
  "købe": "at købe",
  "låne": "at låne",
  "sende": "at sende",
  "modtage": "at modtage",
  "ringe": "at ringe",
  "besøge": "at besøge",
  "rejse": "at rejse",
  "flytte": "at flytte",
  "bo": "at bo",
  "bygge": "at bygge",
  "reparere": "at reparere",
  "ødelægge": "at ødelægge",
  "åbne": "at åbne",
  "lukke": "at lukke",
  "slukke": "at slukke",
  "tænde": "at tænde",
  "skifte": "at skifte",
  "ændre": "at ændre",
  "vokse": "at vokse",
  "falde": "at falde",
  "hoppe": "at hoppe",
  "danse": "at danse",
  "synge": "at synge",
  "grine": "at grine",
  "græde": "at græde",
  "smile": "at smile",
  "råbe": "at råbe",
  "hviske": "at hviske",
  "passe": "at passe",
  "invitere": "at invitere",
  "acceptere": "at acceptere",
  "nægte": "at nægte",
  "tillade": "at tillade",
  "kræve": "at kræve",
  "foreslå": "at foreslå",
  "bestemme": "at bestemme",
  "vælge": "at vælge",
  "planlægge": "at planlægge",
  "forberede": "at forberede",
  "vaske": "at vaske",
  "male": "at male",
  "tegne": "at tegne",
  "optage": "at optage",
  "ansætte": "at ansætte",
  "søge": "at søge",
  "holde": "at holde",
  "miste": "at miste",
  "dele": "at dele",
  "samle": "at samle",
  "sætte": "at sætte",
  "lægge": "at lægge",
  "forsøge": "at forsøge",
  "anbefale": "at anbefale",
  "overveje": "at overveje",
  "beslutte": "at beslutte",
  "undgå": "at undgå",
  "forhindre": "at forhindre",
  "love": "at love",
  "true": "at true",
  "advare": "at advare",
  "overtale": "at overtale",
  "overbevise": "at overbevise",
  "påvirke": "at påvirke",
  "forbedre": "at forbedre",
  "forværre": "at forværre",
  "forandre": "at forandre",
  "udvikle": "at udvikle",
  "forsvinde": "at forsvinde",
  "dukke op": "at dukke op",
  "opdage": "at opdage",
  "afsløre": "at afsløre",
  "skjule": "at skjule",
  "gemme": "at gemme",
  "bekræfte": "at bekræfte",
  "benægte": "at benægte",
  "klage": "at klage",
  "reagere": "at reagere",
  "handle": "at handle",
  "undlade": "at undlade",
  "overtage": "at overtage",
  "deltage": "at deltage",
  "rive ned": "at rive ned",
  "sprede": "at sprede",
  "forene": "at forene",
  "adskille": "at adskille",
  "forbinde": "at forbinde",
  "afbryde": "at afbryde",
  "genoptage": "at genoptage",
  "udsætte": "at udsætte",
  "fremskynde": "at fremskynde",
  "bremse": "at bremse",
  "forsinke": "at forsinke",
  "organisere": "at organisere",
  "gennemføre": "at gennemføre",
  "opnå": "at opnå",
  "mislykkes": "at mislykkes",
  "lykkes": "at lykkes",
  "prøve på": "at prøve på",
  "teste": "at teste",
  "måle": "at måle",
  "veje": "at veje",
  "tælle": "at tælle",
  "beregne": "at beregne",
  "anslå": "at anslå",
  "en vind": "vind",
  "et håb": "håb",
  "en frygt": "frygt",
  "en glæde": "glæde",
  "en sorg": "sorg",
  "en kærlighed": "kærlighed",
  "en sladder": "sladder",
  "en morgenmad": "morgenmad",
  "en frokost": "frokost",
  "en aftensmad": "aftensmad",
  "et brød": "brød",
  "et rugbrød": "rugbrød",
  "en ost": "ost",
  "en fløde": "fløde",
  "en kylling": "kylling",
  "en laks": "laks",
  "et hvidløg": "hvidløg",
  "en is": "is",
  "en chokolade": "chokolade",
  "en juice": "juice",
  "en kaffe": "kaffe",
  "en te": "te",
  "tilberede": "at tilberede",
  "stege": "at stege",
  "koge": "at koge",
  "bage": "at bage",
  "grille": "at grille",
  "skære": "at skære",
  "rive": "at rive",
  "blande": "at blande",
  "smage": "at smage",
  "servere": "at servere",
  "bestille": "at bestille",
  "en appetit": "appetit",
  "et franskbrød": "franskbrød",
  "en risengrød": "risengrød",
  "en leverpostej": "leverpostej",
  "en rødgrød": "rødgrød",
  "et knækbrød": "knækbrød",
  "en müsli": "müsli",
  "en yoghurt": "yoghurt",
  "en spegepølse": "spegepølse",
  "feje": "at feje",
  "stryge": "at stryge",
  "et lyn": "lyn",
  "en torden": "torden",
  "en tåge": "tåge",
  "en frost": "frost",
  "et isslag": "isslag",
  "et hår": "hår",
  "en influenza": "influenza",
  "en medicin": "medicin",
  "en træning": "træning",
  "en vrede": "vrede",
  "en jalousi": "jalousi",
  "en skyld": "skyld",
  "en skam": "skam",
  "en stolthed": "stolthed",
  "en medlidenhed": "medlidenhed",
  "en forvirring": "forvirring",
  "en lettelse": "lettelse",
  "en ensomhed": "ensomhed",
  "en kedsomhed": "kedsomhed",
  "en spænding": "spænding",
  "en ro": "ro",
  "en tillid": "tillid",
  "en mistillid": "mistillid",
  "en respekt": "respekt",
  "en tålmodighed": "tålmodighed",
  "en utålmodighed": "utålmodighed",
  "et mod": "mod",
  "en fejhed": "fejhed",
  "en generøsitet": "generøsitet",
  "en gerrighed": "gerrighed",
  "en jeans": "et par jeans",
  "et badetøj": "badetøj",
  "returnere": "at returnere",
  "bytte": "at bytte",
  "en kunstig intelligens": "kunstig intelligens",
  "en fremgang": "fremgang",
  "en fattigdom": "fattigdom",
  "en rigdom": "rigdom",
  "et havearbejde": "havearbejde",
  "en mode": "mode",
  "et software": "software",
  "en streaming": "streaming",
  "en sikkerhed": "sikkerhed",
  "en opladning": "opladning",
  "et hardware": "hardware",
  "en fritid": "fritid",
  "en strikning": "strikning",
  "en syning": "syning",
  "en maling": "et maleri",
  "en yoga": "yoga",
  "et fiskeri": "fiskeri",
  "en havearbejde": "et havearbejde",
  "en kondition": "kondition",
  "et vand": "vand",
  "en ild": "ild",
  "en bryllup": "et bryllup",
  "en jubilæum": "et jubilæum",
  "en sæbe": "sæbe",
  "en shampoo": "shampoo",
  "en tandpasta": "tandpasta",
  "et affald": "affald",
  "et internet": "internet",
  "en wifi": "wifi",
  "et tøj": "tøj",
  "en husleje": "husleje",
  "en forsikring": "forsikring",
  "en bagage": "bagage",
  "en told": "told",
  "en benzin": "benzin",
  "en diesel": "diesel",
  "en parkering": "parkering",
  "en trafik": "trafik",
  "et jetlag": "jetlag",
  "et toldkontrol": "en toldkontrol",
  "en is (frozen water)": "is (frozen water)",
  "en varme": "varme",
  "en kulde": "kulde",
  "et sand": "sand",
  "en dug": "dug",
  "en hagl": "hagl",
  "en biodiversitet": "biodiversitet",
  "en forurening": "forurening",
  "en genbrug": "genbrug",
  "en bæredygtighed": "bæredygtighed",
  "en energi": "energi",
  "en fugtighed": "fugtighed",
  "en klimaforandring": "klimaforandring",
  "en hud": "hud",
  "et blod": "blod",
  "et helbred": "helbred",
  "en motion": "motion",
  "en søvn": "søvn",
  "en træthed": "træthed",
  "en stress": "stress",
  "en angst": "angst",
  "at forsøge": "forsøge",
  "at anbefale": "anbefale",
  "at overveje": "overveje",
  "at beslutte": "beslutte",
  "at undgå": "undgå",
  "at forhindre": "forhindre",
  "at love": "love",
  "at true": "true",
  "at advare": "advare",
  "at overtale": "overtale",
  "at overbevise": "overbevise",
  "at påvirke": "påvirke",
  "at forbedre": "forbedre",
  "at forværre": "forværre",
  "at forandre": "forandre",
  "at udvikle": "udvikle",
  "at forsvinde": "forsvinde",
  "at dukke op": "dukke op",
  "at opdage": "opdage",
  "at afsløre": "afsløre",
  "at skjule": "skjule",
  "at gemme": "gemme",
  "at bekræfte": "bekræfte",
  "at benægte": "benægte",
  "at klage": "klage",
  "at reagere": "reagere",
  "at handle": "handle",
  "at undlade": "undlade",
  "at overtage": "overtage",
  "at deltage": "deltage",
  "at rive ned": "rive ned",
  "at sprede": "sprede",
  "at forene": "forene",
  "at adskille": "adskille",
  "at forbinde": "forbinde",
  "at afbryde": "afbryde",
  "at genoptage": "genoptage",
  "at udsætte": "udsætte",
  "at fremskynde": "fremskynde",
  "at bremse": "bremse",
  "at forsinke": "forsinke",
  "at organisere": "organisere",
  "at gennemføre": "gennemføre",
  "at opnå": "opnå",
  "at mislykkes": "mislykkes",
  "at lykkes": "lykkes",
  "at prøve på": "prøve på",
  "at teste": "teste",
  "at måle": "måle",
  "at veje": "veje",
  "at tælle": "tælle",
  "at beregne": "beregne",
  "at anslå": "anslå",
  "en regn": "regn",
  "en sne": "sne",
  "en luft": "luft",
  "et græs": "græs",
  "en jord": "jord",
  "et vejr": "vejr",
  "en kompromis": "et kompromis",
  "en alternativ": "et alternativ",
  "en tilhænger af": "en tilhænger",
  "en modstander af": "en modstander",
  "et data": "data",
  "en genetik": "genetik",
  "en brandvæsen": "et brandvæsen",
  "en offer": "et offer",
  "en matematik": "matematik",
  "et dansk": "dansk",
  "et engelsk": "engelsk",
  "en geografi": "geografi",
  "en fysik": "fysik",
  "en kemi": "kemi",
  "en biologi": "biologi",
  "en idræt": "idræt",
  "en mad": "mad",
  "en mælk": "mælk",
  "et kød": "kød",
  "et oksekød": "oksekød",
  "et svinekød": "svinekød",
  "en ris": "ris",
  "en pasta": "pasta",
  "en peber": "peber",
  "et sukker": "sukker",
  "en honning": "honning",
  "et syltetøj": "syltetøj",
  "et smør": "smør",
  "et slik": "slik",
  "en menukort": "et menukort",
  "en musik": "musik",
  "en kunst": "kunst",
};
const VOCAB_TRANSLATION_CORRECTIONS = {
  "skulle": "shall / should / have to",
  "måtte": "may / must",
  "være": "to be",
  "have": "to have",
  "blive": "to become / stay",
  "gøre": "to do",
  "ville": "to want to / will",
  "få": "to get",
  "give": "to give",
  "tage": "to take",
  "komme": "to come",
  "gå": "to go / walk",
  "se": "to see",
  "vide": "to know (a fact)",
  "kende": "to know (a person/place)",
  "sige": "to say",
  "tale": "to speak",
  "tro": "to believe",
  "tænke": "to think",
  "synes": "to think (an opinion)",
  "mene": "to mean / think",
  "finde": "to find",
  "lave": "to make / do",
  "spise": "to eat",
  "drikke": "to drink",
  "sove": "to sleep",
  "vågne": "to wake up",
  "stå": "to stand",
  "sidde": "to sit",
  "ligge": "to lie down",
  "løbe": "to run",
  "køre": "to drive",
  "flyve": "to fly",
  "svømme": "to swim",
  "læse": "to read",
  "skrive": "to write",
  "lytte": "to listen",
  "høre": "to hear",
  "kigge": "to look",
  "vise": "to show",
  "forstå": "to understand",
  "lære": "to learn",
  "undervise": "to teach",
  "studere": "to study",
  "arbejde": "to work",
  "spille": "to play (game/instrument)",
  "lege": "to play (children)",
  "vinde": "to win",
  "tabe": "to lose",
  "prøve": "to try",
  "øve": "to practice",
  "begynde": "to begin",
  "starte": "to start",
  "stoppe": "to stop",
  "slutte": "to end / finish",
  "fortsætte": "to continue",
  "vente": "to wait",
  "håbe": "to hope",
  "ønske": "to wish",
  "elske": "to love",
  "kunne lide": "to like",
  "hade": "to hate",
  "savne": "to miss",
  "huske": "to remember",
  "glemme": "to forget",
  "forklare": "to explain",
  "spørge": "to ask",
  "svare": "to answer",
  "bede": "to ask / pray",
  "takke": "to thank",
  "undskylde": "to apologize",
  "hjælpe": "to help",
  "bruge": "to use",
  "betale": "to pay",
  "koste": "to cost",
  "sælge": "to sell",
  "købe": "to buy",
  "låne": "to borrow / lend",
  "sende": "to send",
  "modtage": "to receive",
  "ringe": "to call (phone)",
  "besøge": "to visit",
  "rejse": "to travel",
  "flytte": "to move",
  "bo": "to live / reside",
  "bygge": "to build",
  "reparere": "to repair",
  "ødelægge": "to destroy / break",
  "åbne": "to open",
  "lukke": "to close",
  "slukke": "to turn off",
  "tænde": "to turn on",
  "skifte": "to change / switch",
  "ændre": "to change / alter",
  "vokse": "to grow",
  "falde": "to fall",
  "hoppe": "to jump",
  "danse": "to dance",
  "synge": "to sing",
  "grine": "to laugh",
  "græde": "to cry",
  "smile": "to smile",
  "råbe": "to shout",
  "hviske": "to whisper",
  "passe": "to fit / suit",
  "invitere": "to invite",
  "acceptere": "to accept",
  "nægte": "to refuse",
  "tillade": "to allow",
  "kræve": "to require",
  "foreslå": "to suggest",
  "bestemme": "to decide",
  "vælge": "to choose",
  "planlægge": "to plan",
  "forberede": "to prepare",
  "vaske": "to wash",
  "male": "to paint",
  "tegne": "to draw",
  "optage": "to record",
  "ansætte": "to hire",
  "søge": "to search / apply",
  "holde": "to hold / keep",
  "miste": "to lose (something)",
  "dele": "to share / divide",
  "samle": "to gather / collect",
  "sætte": "to put / place",
  "lægge": "to lay down",
  "forsøge": "to attempt",
  "anbefale": "to recommend",
  "overveje": "to consider",
  "beslutte": "to decide",
  "undgå": "to avoid",
  "forhindre": "to prevent",
  "love": "to promise",
  "true": "to threaten",
  "advare": "to warn",
  "overtale": "to persuade",
  "overbevise": "to convince",
  "påvirke": "to influence",
  "forbedre": "to improve",
  "forværre": "to worsen",
  "forandre": "to change",
  "udvikle": "to develop",
  "forsvinde": "to disappear",
  "dukke op": "to show up",
  "opdage": "to discover",
  "afsløre": "to reveal",
  "skjule": "to hide",
  "gemme": "to save/hide",
  "bekræfte": "to confirm",
  "benægte": "to deny",
  "klage": "to complain",
  "reagere": "to react",
  "handle": "to act",
  "undlade": "to omit",
  "overtage": "to take over",
  "deltage": "to participate",
  "rive ned": "to tear down",
  "sprede": "to spread",
  "forene": "to unite",
  "adskille": "to separate",
  "forbinde": "to connect",
  "afbryde": "to interrupt",
  "genoptage": "to resume",
  "udsætte": "to postpone",
  "fremskynde": "to speed up",
  "bremse": "to slow down",
  "forsinke": "to delay",
  "organisere": "to organize",
  "gennemføre": "to carry out",
  "opnå": "to achieve",
  "mislykkes": "to fail",
  "lykkes": "to succeed",
  "prøve på": "to try on",
  "teste": "to test",
  "måle": "to measure",
  "veje": "to weigh",
  "tælle": "to count",
  "beregne": "to calculate",
  "anslå": "to estimate",
  "en vind": "wind",
  "et håb": "hope",
  "en frygt": "fear",
  "en glæde": "joy",
  "en sorg": "sorrow / grief",
  "en kærlighed": "love",
  "en morgenmad": "breakfast",
  "en frokost": "lunch",
  "en aftensmad": "dinner",
  "et brød": "bread",
  "et rugbrød": "rye bread",
  "en ost": "cheese",
  "en fløde": "cream",
  "en kylling": "chicken (meat)",
  "en laks": "salmon",
  "et hvidløg": "garlic",
  "en is": "ice cream / ice",
  "en chokolade": "chocolate",
  "en juice": "juice",
  "en kaffe": "coffee",
  "en te": "tea",
  "tilberede": "to prepare (food)",
  "stege": "to fry / roast",
  "koge": "to boil",
  "bage": "to bake",
  "grille": "to grill",
  "skære": "to cut",
  "rive": "to grate",
  "blande": "to mix",
  "smage": "to taste",
  "servere": "to serve",
  "bestille": "to order",
  "en appetit": "appetite",
  "et franskbrød": "white bread",
  "en risengrød": "rice porridge",
  "en leverpostej": "liver pâté",
  "en rødgrød": "red berry pudding",
  "et knækbrød": "crispbread",
  "en müsli": "muesli",
  "en yoghurt": "yogurt",
  "en spegepølse": "salami",
  "feje": "to sweep",
  "stryge": "to iron",
  "et lyn": "lightning",
  "en torden": "thunder",
  "en tåge": "fog",
  "en frost": "frost",
  "et isslag": "black ice / freezing rain",
  "et hår": "hair",
  "en influenza": "the flu",
  "en medicin": "medicine",
  "en træning": "training / exercise",
  "en vrede": "anger",
  "en jalousi": "jealousy",
  "en skyld": "guilt / fault",
  "en skam": "shame",
  "en stolthed": "pride",
  "en medlidenhed": "pity",
  "en forvirring": "confusion",
  "en lettelse": "relief",
  "en ensomhed": "loneliness",
  "en kedsomhed": "boredom",
  "en spænding": "excitement / tension",
  "en ro": "calm / peace and quiet",
  "en tillid": "trust",
  "en mistillid": "distrust",
  "en respekt": "respect",
  "en tålmodighed": "patience",
  "en utålmodighed": "impatience",
  "et mod": "courage",
  "en fejhed": "cowardice",
  "en generøsitet": "generosity",
  "en gerrighed": "greed",
  "en jeans": "a pair of jeans",
  "et badetøj": "swimwear",
  "returnere": "to return an item",
  "bytte": "to exchange",
  "en kunstig intelligens": "artificial intelligence",
  "en fremgang": "progress",
  "en fattigdom": "poverty",
  "en rigdom": "wealth",
  "et havearbejde": "gardening",
  "en tekst": "a text",
  "en fritid": "free time",
  "en strikning": "knitting",
  "en syning": "sewing",
  "en yoga": "yoga",
  "et fiskeri": "fishing",
  "en havearbejde": "gardening",
  "en kondition": "fitness",
  "en sladder": "gossip",
  "en rejseforsikring": "a travel insurance policy",
  "en biodiversitet": "biodiversity",
  "en forurening": "pollution",
  "en genbrug": "recycling",
  "en bæredygtighed": "sustainability",
  "en energi": "energy",
  "en fugtighed": "humidity",
  "en klimaforandring": "climate change",
  "en politik": "a policy",
  "en tilhænger af": "a supporter",
  "en modstander af": "an opponent",
  "et bevis": "a proof",
  "en indtægt": "an income",
  "et data": "data",
  "en statistik": "a statistic",
  "en genetik": "genetics",
};


// These used to be pre-seeded alongside the starter vocabulary, but they
// sat empty next to near-identically-named starter categories (e.g. an
// empty "Verbs & Tense" right next to a populated "Basic Verbs") — purely
// confusing, since nothing ever auto-filed cards into them. Cleaned up
// below for anyone who already has them saved from before.
const LEGACY_EMPTY_CATEGORY_IDS = ["verbs", "gender", "structure", "conditional", "prepositions", "phrases", "false-friends"];

const TYPE_LABEL = { word: "Word", sentence: "Sentence", grammar: "Grammar" };
const TYPE_COLOR = { word: "#4C6B65", sentence: "#C1653F", grammar: "#8C6FA0" };

// Preloaded starter vocabulary — no AI involved. 8,000 words, chosen
// using a Danish word-frequency list (FrequencyWords by Hermit Dave,
// CC BY-SA 4.0 — used only to decide which words to include; no
// frequency data is shipped) plus common course vocabulary. All English
// translations are our own.
//
// One line per word: Danish, English, category code, level (1 Basic,
// 2 Intermediate, 3 Advanced, 4 Fluent), verb forms (present|past|past
// participle, verbs only) and hidden gender for nouns shown without
// en/et (uncountable nouns like "vand", or "pl" for plural-only).
//
// Consistency rules: countable nouns always carry en/et ("en hund" → "a
// dog"); uncountable nouns never do ("vand" → "water"); verbs always
// start with "at" ("at spise" → "to eat").
const WORD_CATEGORY_NAMES = {
  V: "Verbs",
  N: "Common Nouns",
  A: "Adjectives",
  O: "Pronouns & Adverbs",
  C: "Prepositions & Connectors",
  P: "Common Phrases & Idioms",
  T: "Numbers & Time",
  F: "Family & People",
  D: "Food & Drink",
  H: "Home & Daily Life",
  R: "Travel & Transport",
  W: "Weather & Nature",
  B: "Body & Health",
  S: "Work & School",
  E: "Emotions & Personality",
  K: "Clothing & Shopping",
  M: "Technology & Media",
  X: "Abstract Concepts & Opinions",
  U: "Society & Culture",
  L: "Hobbies & Leisure",
  G: "Politics & Law",
  Y: "Money & Business",
};

const LEVELS = [
  { id: 1, name: "Basic", cefr: "A1–A2" },
  { id: 2, name: "Intermediate", cefr: "B1" },
  { id: 3, name: "Advanced", cefr: "B2–C1" },
  { id: 4, name: "Fluent", cefr: "C1–C2" },
];

const WORD_DATA = `at være	to be	V	1	er|var|været	
at have	to have	V	1	har|havde|haft	
at blive	to become / stay	V	1	bliver|blev|blevet	
at gøre	to do	V	1	gør|gjorde|gjort	
at kunne	can / to be able to	V	1	kan|kunne|kunnet	
at skulle	shall / should / have to	V	1	skal|skulle|skullet	
at ville	to want to / will	V	1	vil|ville|villet	
at måtte	may / must	V	1	må|måtte|måttet	
at få	to get	V	1	får|fik|fået	
at give	to give	V	1	giver|gav|givet	
at tage	to take	V	1	tager|tog|taget	
at komme	to come	V	1	kommer|kom|kommet	
at gå	to go / walk	V	1	går|gik|gået	
at se	to see	V	1	ser|så|set	
at vide	to know (a fact)	V	1	ved|vidste|vidst	
at kende	to know (a person/place)	V	1	kender|kendte|kendt	
at sige	to say	V	1	siger|sagde|sagt	
at tale	to speak	V	1	taler|talte|talt	
at tro	to believe	V	1	tror|troede|troet	
at tænke	to think	V	1	tænker|tænkte|tænkt	
at synes	to think (an opinion)	V	1	synes|syntes|syntes	
at mene	to mean / think	V	1	mener|mente|ment	
at finde	to find	V	1	finder|fandt|fundet	
at lave	to make / do	V	1	laver|lavede|lavet	
at spise	to eat	V	1	spiser|spiste|spist	
at drikke	to drink	V	1	drikker|drak|drukket	
at sove	to sleep	V	1	sover|sov|sovet	
at vågne	to wake up	V	2	vågner|vågnede|vågnet	
at stå	to stand	V	1	står|stod|stået	
at sidde	to sit	V	1	sidder|sad|siddet	
at ligge	to lie down	V	1	ligger|lå|ligget	
at løbe	to run	V	1	løber|løb|løbet	
at køre	to drive	V	1	kører|kørte|kørt	
at flyve	to fly	V	1	flyver|fløj|fløjet	
at svømme	to swim	V	2	svømmer|svømmede|svømmet	
at læse	to read	V	1	læser|læste|læst	
at skrive	to write	V	1	skriver|skrev|skrevet	
at lytte	to listen	V	1	lytter|lyttede|lyttet	
at høre	to hear	V	1	hører|hørte|hørt	
at kigge	to look	V	1	kigger|kiggede|kigget	
at vise	to show	V	1	viser|viste|vist	
at forstå	to understand	V	1	forstår|forstod|forstået	
at lære	to learn	V	1	lærer|lærte|lært	
at undervise	to teach	V	2	underviser|underviste|undervist	
at studere	to study	V	3	studerer|studerede|studeret	
at arbejde	to work	V	1	arbejder|arbejdede|arbejdet	
at spille	to play (game/instrument)	V	1	spiller|spillede|spillet	
at lege	to play (children)	V	1	leger|legede|leget	
at vinde	to win	V	1	vinder|vandt|vundet	
at tabe	to lose	V	1	taber|tabte|tabt	
at prøve	to try	V	1	prøver|prøvede|prøvet	
at øve	to practice	V	3	øver|øvede|øvet	
at begynde	to begin	V	1	begynder|begyndte|begyndt	
at starte	to start	V	1	starter|startede|startet	
at stoppe	to stop	V	1	stopper|stoppede|stoppet	
at slutte	to end / finish	V	2	slutter|sluttede|sluttet	
at fortsætte	to continue	V	1	fortsætter|fortsatte|fortsat	
at vente	to wait	V	1	venter|ventede|ventet	
at håbe	to hope	V	1	håber|håbede|håbet	
at ønske	to wish	V	1	ønsker|ønskede|ønsket	
at elske	to love	V	1	elsker|elskede|elsket	
at kunne lide	to like	V	1	kan lide|kunne lide|kunnet lide	
at hade	to hate	V	1	hader|hadede|hadet	
at savne	to miss	V	1	savner|savnede|savnet	
at huske	to remember	V	1	husker|huskede|husket	
at glemme	to forget	V	1	glemmer|glemte|glemt	
at forklare	to explain	V	1	forklarer|forklarede|forklaret	
at spørge	to ask	V	1	spørger|spurgte|spurgt	
at svare	to answer	V	1	svarer|svarede|svaret	
at bede	to ask / pray	V	1	beder|bad|bedt	
at takke	to thank	V	1	takker|takkede|takket	
at undskylde	to apologize	V	1	undskylder|undskyldte|undskyldt	
at hjælpe	to help	V	1	hjælper|hjalp|hjulpet	
at bruge	to use	V	1	bruger|brugte|brugt	
at betale	to pay	V	1	betaler|betalte|betalt	
at koste	to cost	V	1	koster|kostede|kostet	
at sælge	to sell	V	1	sælger|solgte|solgt	
at købe	to buy	V	1	køber|købte|købt	
at låne	to borrow / lend	V	1	låner|lånte|lånt	
at sende	to send	V	1	sender|sendte|sendt	
at modtage	to receive	V	1	modtager|modtog|modtaget	
at ringe	to call (phone)	V	1	ringer|ringede|ringet	
at besøge	to visit	V	1	besøger|besøgte|besøgt	
at rejse	to travel	V	1	rejser|rejste|rejst	
at flytte	to move	V	1	flytter|flyttede|flyttet	
at bo	to live / reside	V	1	bor|boede|boet	
at bygge	to build	V	1	bygger|byggede|bygget	
at reparere	to repair	V	2	reparerer|reparerede|repareret	
at ødelægge	to destroy / break	V	1	ødelægger|ødelagde|ødelagt	
at åbne	to open	V	1	åbner|åbnede|åbnet	
at lukke	to close	V	1	lukker|lukkede|lukket	
at slukke	to turn off	V	2	slukker|slukkede|slukket	
at tænde	to turn on	V	1	tænder|tændte|tændt	
at skifte	to change / switch	V	1	skifter|skiftede|skiftet	
at ændre	to change / alter	V	1	ændrer|ændrede|ændret	
at vokse	to grow	V	2	vokser|voksede|vokset	
at falde	to fall	V	1	falder|faldt|faldet	
at hoppe	to jump	V	2	hopper|hoppede|hoppet	
at danse	to dance	V	1	danser|dansede|danset	
at synge	to sing	V	1	synger|sang|sunget	
at grine	to laugh	V	2	griner|grinede|grinet	
at græde	to cry	V	2	græder|græd|grædt	
at smile	to smile	V	3	smiler|smilede|smilet	
at råbe	to shout	V	2	råber|råbte|råbt	
at hviske	to whisper	V	4	hvisker|hviskede|hvisket	
at passe	to fit / suit	V	1	passer|passede|passet	
at invitere	to invite	V	2	inviterer|inviterede|inviteret	
at acceptere	to accept	V	2	accepterer|accepterede|accepteret	
at nægte	to refuse	V	2	nægter|nægtede|nægtet	
at tillade	to allow	V	2	tillader|tillod|tilladt	
at kræve	to require	V	1	kræver|krævede|krævet	
at foreslå	to suggest	V	2	foreslår|foreslog|foreslået	
at bestemme	to decide	V	1	bestemmer|bestemte|bestemt	
at vælge	to choose	V	1	vælger|valgte|valgt	
at planlægge	to plan	V	2	planlægger|planlagde|planlagt	
at forberede	to prepare	V	2	forbereder|forberedte|forberedt	
at vaske	to wash	V	2	vasker|vaskede|vasket	
at male	to paint	V	2	maler|malede|malet	
at tegne	to draw	V	2	tegner|tegnede|tegnet	
at optage	to record	V	1	optager|optog|optaget	
at ansætte	to hire	V	2	ansætter|ansatte|ansat	
at søge	to search / apply	V	1	søger|søgte|søgt	
at holde	to hold / keep	V	1	holder|holdt|holdt	
at miste	to lose (something)	V	1	mister|mistede|mistet	
at dele	to share / divide	V	1	deler|delte|delt	
at samle	to gather / collect	V	2	samler|samlede|samlet	
at sætte	to put / place	V	1	sætter|satte|sat	
at lægge	to lay down	V	1	lægger|lagde|lagt	
at forsøge	to attempt	V	1	forsøger|forsøgte|forsøgt	
at anbefale	to recommend	V	3	anbefaler|anbefalede|anbefalet	
at overveje	to consider	V	2	overvejer|overvejede|overvejet	
at beslutte	to decide	V	2	beslutter|besluttede|besluttet	
at undgå	to avoid	V	1	undgår|undgik|undgået	
at forhindre	to prevent	V	2	forhindrer|forhindrede|forhindret	
at love	to promise	V	1	lover|lovede|lovet	
at true	to threaten	V	2	truer|truede|truet	
at advare	to warn	V	2	advarer|advarede|advaret	
at overtale	to persuade	V	3	overtaler|overtalte|overtalt	
at overbevise	to convince	V	2	overbeviser|overbeviste|overbevist	
at påvirke	to influence	V	3	påvirker|påvirkede|påvirket	
at forbedre	to improve	V	3	forbedrer|forbedrede|forbedret	
at forværre	to worsen	V	4	forværrer|forværrede|forværret	
at forandre	to change	V	2	forandrer|forandrede|forandret	
at udvikle	to develop	V	3	udvikler|udviklede|udviklet	
at forsvinde	to disappear	V	1	forsvinder|forsvandt|forsvundet	
at dukke op	to show up	V	2	dukker op|dukkede op|dukket op	
at opdage	to discover	V	2	opdager|opdagede|opdaget	
at afsløre	to reveal	V	2	afslører|afslørede|afsløret	
at skjule	to hide	V	2	skjuler|skjulte|skjult	
at gemme	to save/hide	V	1	gemmer|gemte|gemt	
at bekræfte	to confirm	V	2	bekræfter|bekræftede|bekræftet	
at benægte	to deny	V	3	benægter|benægtede|benægtet	
at klage	to complain	V	3	klager|klagede|klaget	
at reagere	to react	V	3	reagerer|reagerede|reageret	
at handle	to act	V	1	handler|handlede|handlet	
at undlade	to omit	V	4	undlader|undlod|undladt	
at overtage	to take over	V	2	overtager|overtog|overtaget	
at deltage	to participate	V	2	deltager|deltog|deltaget	
at rive ned	to tear down	V	2	river ned|rev ned|revet ned	
at sprede	to spread	V	3	spreder|spredte|spredt	
at forene	to unite	V	3	forener|forenede|forenet	
at adskille	to separate	V	3	adskiller|adskilte|adskilt	
at forbinde	to connect	V	2	forbinder|forbandt|forbundet	
at afbryde	to interrupt	V	3	afbryder|afbrød|afbrudt	
at genoptage	to resume	V	4	genoptager|genoptog|genoptaget	
at udsætte	to postpone	V	3	udsætter|udsatte|udsat	
at fremskynde	to speed up	V	4	fremskynder|fremskyndede|fremskyndet	
at bremse	to slow down	V	4	bremser|bremsede|bremset	
at forsinke	to delay	V	2	forsinker|forsinkede|forsinket	
at organisere	to organize	V	3	organiserer|organiserede|organiseret	
at gennemføre	to carry out	V	3	gennemfører|gennemførte|gennemført	
at opnå	to achieve	V	2	opnår|opnåede|opnået	
at mislykkes	to fail	V	4	mislykkes|mislykkedes|mislykkedes	
at lykkes	to succeed	V	2	lykkes|lykkedes|lykkedes	
at prøve på	to try on	V	1	prøver på|prøvede på|prøvet på	
at teste	to test	V	3	tester|testede|testet	
at måle	to measure	V	3	måler|målte|målt	
at veje	to weigh	V	2	vejer|vejede|vejet	
at tælle	to count	V	1	tæller|talte|talt	
at beregne	to calculate	V	4	beregner|beregnede|beregnet	
at anslå	to estimate	V	4	anslår|anslog|anslået	
at lade	to let	V	1	lader|lod|ladet	
at burde	ought to / should	V	1	bør|burde|burdet	
at behøve	to need	V	1	behøver|behøvede|behøvet	
at betyde	to mean	V	1	betyder|betød|betydet	
at dræbe	to kill	V	1	dræber|dræbte|dræbt	
at lyde	to sound	V	1	lyder|lød|lydt	
at virke	to work / seem	V	1	virker|virkede|virket	
at ligne	to look like	V	1	ligner|lignede|lignet	
at føle	to feel	V	1	føler|følte|følt	
at kalde	to call	V	1	kalder|kaldte|kaldt	
at snakke	to talk / chat	V	1	snakker|snakkede|snakket	
at leve	to live (be alive)	V	1	lever|levede|levet	
at redde	to save / rescue	V	1	redder|reddede|reddet	
at slå	to hit / beat	V	1	slår|slog|slået	
at foregå	to take place / happen	V	1	foregår|foregik|foregået	
at ane	to have an idea / suspect	V	1	aner|anede|anet	
at slippe	to let go / escape	V	1	slipper|slap|sluppet	
at beskytte	to protect	V	1	beskytter|beskyttede|beskyttet	
at hente	to fetch / pick up	V	1	henter|hentede|hentet	
at skynde sig	to hurry	V	2	skynder sig|skyndte sig|skyndt sig	
at mangle	to lack / be missing	V	1	mangler|manglede|manglet	
at føles	to feel (seem)	V	1	føles|føltes|følts	
at mærke	to feel / notice	V	1	mærker|mærkede|mærket	
at følge	to follow	V	1	følger|fulgte|fulgt	
at trække	to pull	V	1	trækker|trak|trukket	
at gide	to bother / can be bothered	V	1	gider|gad|gidet	
at skyde	to shoot	V	3	skyder|skød|skudt	
at lyve	to lie (tell a lie)	V	1	lyver|løj|løjet	
at fange	to catch	V	3	fanger|fangede|fanget	
at fortjene	to deserve	V	1	fortjener|fortjente|fortjent	
at stjæle	to steal	V	1	stjæler|stjal|stjålet	
at vende	to turn	V	1	vender|vendte|vendt	
at bryde	to break	V	1	bryder|brød|brudt	
at skaffe	to get / obtain	V	1	skaffer|skaffede|skaffet	
at ordne	to fix / sort out	V	1	ordner|ordnede|ordnet	
at pleje	to usually (do) / to care for	V	1	plejer|plejede|plejet	
at sværge	to swear (promise)	V	3	sværger|svor|svoret	
at såre	to hurt / wound	V	1	sårer|sårede|såret	
at bekymre sig	to worry	V	1	bekymrer sig|bekymrede sig|bekymret sig	
at røre	to touch / stir	V	1	rører|rørte|rørt	
at ramme	to hit (a target)	V	1	rammer|ramte|ramt	
at tjekke	to check	V	1	tjekker|tjekkede|tjekket	
at fatte	to grasp / understand	V	1	fatter|fattede|fattet	
at myrde	to murder	V	3	myrder|myrdede|myrdet	
at tjene	to earn / serve	V	1	tjener|tjente|tjent	
at bringe	to bring	V	1	bringer|bragte|bragt	
at fungere	to work / function	V	1	fungerer|fungerede|fungeret	
at mødes	to meet (each other)	V	1	mødes|mødtes|mødtes	
at kæmpe	to fight / struggle	V	1	kæmper|kæmpede|kæmpet	
at kysse	to kiss	V	2	kysser|kyssede|kysset	
at anholde	to arrest	V	3	anholder|anholdt|anholdt	
at overleve	to survive	V	1	overlever|overlevede|overlevet	
at efterlade	to leave behind	V	3	efterlader|efterlod|efterladt	
at støtte	to support	V	1	støtter|støttede|støttet	
at gifte sig	to get married	V	1	gifter sig|giftede sig|giftet sig	
at styre	to control / steer	V	1	styrer|styrede|styret	
at fyre	to fire (dismiss)	V	1	fyrer|fyrede|fyret	
at fjerne	to remove	V	1	fjerner|fjernede|fjernet	
at hænge	to hang	V	1	hænger|hang|hængt	
at forestille sig	to imagine	V	1	forestiller sig|forestillede sig|forestillet sig	
at bære	to carry / wear	V	1	bærer|bar|båret	
at sørge for	to make sure / take care of	V	1	sørger for|sørgede for|sørget for	
at smutte	to slip away / pop out	V	1	smutter|smuttede|smuttet	
at brænde	to burn	V	1	brænder|brændte|brændt	
at stikke	to stick / sting / stab	V	3	stikker|stak|stukket	
at lugte	to smell	V	1	lugter|lugtede|lugtet	
at gå glip af	to miss out on	V	1	går glip af|gik glip af|gået glip af	
at tilhøre	to belong to	V	1	tilhører|tilhørte|tilhørt	
at beholde	to keep	V	1	beholder|beholdt|beholdt	
at lede	to search / lead	V	1	leder|ledte|ledt	
at forvente	to expect	V	1	forventer|forventede|forventet	
at dreje	to turn	V	1	drejer|drejede|drejet	
at flygte	to flee	V	1	flygter|flygtede|flygtet	
at smide	to throw (away)	V	1	smider|smed|smidt	
at trænge	to need / push through	V	2	trænger|trængte|trængt	
at undersøge	to examine / investigate	V	1	undersøger|undersøgte|undersøgt	
at hvile	to rest	V	2	hviler|hvilede|hvilet	
at dække	to cover	V	2	dækker|dækkede|dækket	
at nå	to reach / make it	V	1	når|nåede|nået	
at ende	to end	V	1	ender|endte|endt	
at droppe	to drop / skip	V	2	dropper|droppede|droppet	
at nævne	to mention	V	2	nævner|nævnte|nævnt	
at foretrække	to prefer	V	2	foretrækker|foretrak|foretrukket	
at mistænke	to suspect	V	2	mistænker|mistænkte|mistænkt	
at nærme sig	to approach	V	2	nærmer sig|nærmede sig|nærmet sig	
at bevæge sig	to move	V	2	bevæger sig|bevægede sig|bevæget sig	
at nyde	to enjoy	V	1	nyder|nød|nydt	
at opføre sig	to behave	V	2	opfører sig|opførte sig|opført sig	
at samarbejde	to cooperate	V	2	samarbejder|samarbejdede|samarbejdet	
at træde	to step	V	2	træder|trådte|trådt	
at skændes	to argue	V	2	skændes|skændtes|skændtes	
at tilgive	to forgive	V	2	tilgiver|tilgav|tilgivet	
at begå	to commit (a crime)	V	2	begår|begik|begået	
at kaste	to throw	V	2	kaster|kastede|kastet	
at præsentere	to present / introduce	V	2	præsenterer|præsenterede|præsenteret	
at gætte	to guess	V	2	gætter|gættede|gættet	
at fejre	to celebrate	V	2	fejrer|fejrede|fejret	
at indrømme	to admit	V	2	indrømmer|indrømmede|indrømmet	
at hilse	to greet / say hello	V	2	hilser|hilste|hilst	
at spore	to track / trace	V	2	sporer|sporede|sporet	
at forsvare	to defend	V	2	forsvarer|forsvarede|forsvaret	
at begrave	to bury	V	2	begraver|begravede|begravet	
at angå	to concern	V	2	angår|angik|angået	
at diskutere	to discuss	V	2	diskuterer|diskuterede|diskuteret	
at eksistere	to exist	V	2	eksisterer|eksisterede|eksisteret	
at vove	to dare	V	2	vover|vovede|vovet	
at springe	to jump	V	2	springer|sprang|sprunget	
at håndtere	to handle	V	2	håndterer|håndterede|håndteret	
at indse	to realize	V	2	indser|indså|indset	
at kontakte	to contact	V	2	kontakter|kontaktede|kontaktet	
at vædde	to bet	V	2	vædder|væddede|væddet	
at tilbyde	to offer	V	2	tilbyder|tilbød|tilbudt	
at spilde	to waste / spill	V	2	spilder|spildte|spildt	
at forstyrre	to disturb	V	2	forstyrrer|forstyrrede|forstyrret	
at afslutte	to finish / end	V	2	afslutter|afsluttede|afsluttet	
at grave	to dig	V	2	graver|gravede|gravet	
at tvinge	to force	V	2	tvinger|tvang|tvunget	
at drive	to run (a business) / drift	V	2	driver|drev|drevet	
at dømme	to judge / sentence	V	2	dømmer|dømte|dømt	
at behandle	to treat	V	2	behandler|behandlede|behandlet	
at standse	to stop	V	2	standser|standsede|standset	
at kontrollere	to control / check	V	2	kontrollerer|kontrollerede|kontrolleret	
at formode	to suppose / presume	V	2	formoder|formodede|formodet	
at drømme	to dream	V	1	drømmer|drømte|drømt	
at udføre	to carry out	V	2	udfører|udførte|udført	
at aflevere	to hand in / deliver	V	2	afleverer|afleverede|afleveret	
at genkende	to recognize	V	2	genkender|genkendte|genkendt	
at gentage	to repeat	V	2	gentager|gentog|gentaget	
at rydde op	to tidy up	V	2	rydder op|ryddede op|ryddet op	
at bløde	to bleed	V	2	bløder|blødte|blødt	
at skyldes	to be due to	V	2	skyldes|skyldtes|skyldtes	
at afhænge af	to depend on	V	2	afhænger af|afhang af|afhængt af	
at træffe	to meet / make (a decision)	V	2	træffer|traf|truffet	
at jage	to hunt / chase	V	2	jager|jagede|jaget	
at brække	to break (a bone) / to vomit	V	2	brækker|brækkede|brækket	
at ride	to ride (a horse)	V	1	rider|red|redet	
at ankomme	to arrive	V	2	ankommer|ankom|ankommet	
at narre	to fool / trick	V	2	narrer|narrede|narret	
at vække	to wake (someone)	V	2	vækker|vækkede|vækket	
at oversætte	to translate	V	2	oversætter|oversatte|oversat	
at risikere	to risk	V	2	risikerer|risikerede|risikeret	
at genere	to bother	V	2	generer|generede|generet	
at melde	to report / announce	V	2	melder|meldte|meldt	
at duer	to be any good / work	V	2	duer|duede|duet	
at fortryde	to regret	V	2	fortryder|fortrød|fortrudt	
at rykke	to move / pull	V	2	rykker|rykkede|rykket	
at påstå	to claim	V	2	påstår|påstod|påstået	
at tisse	to pee	V	2	tisser|tissede|tisset	
at sprænge	to blow up	V	2	sprænger|sprængte|sprængt	
at opleve	to experience	V	2	oplever|oplevede|oplevet	
at glo	to stare	V	2	glor|gloede|gloet	
at respektere	to respect	V	2	respekterer|respekterede|respekteret	
at værdsætte	to appreciate	V	2	værdsætter|værdsatte|værdsat	
at bevare	to preserve / keep	V	3	bevarer|bevarede|bevaret	
at velsigne	to bless	V	3	velsigner|velsignede|velsignet	
at snyde	to cheat	V	3	snyder|snød|snydt	
at opgive	to give up	V	3	opgiver|opgav|opgivet	
at fokusere	to focus	V	3	fokuserer|fokuserede|fokuseret	
at knuse	to crush	V	2	knuser|knuste|knust	
at fylde	to fill / take up space	V	1	fylder|fyldte|fyldt	
at arrestere	to arrest	V	3	arresterer|arresterede|arresteret	
at løfte	to lift	V	2	løfter|løftede|løftet	
at føde	to give birth	V	1	føder|fødte|født	
at løse	to solve	V	1	løser|løste|løst	
at smadre	to smash	V	3	smadrer|smadrede|smadret	
at stamme	to stutter / come from	V	3	stammer|stammede|stammet	
at gennemgå	to go through / review	V	3	gennemgår|gennemgik|gennemgået	
at befinde sig	to be (located)	V	3	befinder sig|befandt sig|befundet sig	
at godkende	to approve	V	3	godkender|godkendte|godkendt	
at identificere	to identify	V	3	identificerer|identificerede|identificeret	
at presse	to press / pressure	V	2	presser|pressede|presset	
at forblive	to remain	V	3	forbliver|forblev|forblevet	
at stige	to rise / climb	V	2	stiger|steg|steget	
at udnytte	to exploit / make use of	V	3	udnytter|udnyttede|udnyttet	
at bemærke	to notice / remark	V	3	bemærker|bemærkede|bemærket	
at tyde på	to suggest / indicate	V	3	tyder på|tydede på|tydet på	
at bekæmpe	to fight / combat	V	3	bekæmper|bekæmpede|bekæmpet	
at tilbringe	to spend (time)	V	3	tilbringer|tilbragte|tilbragt	
at række	to reach / hand	V	2	rækker|rakte|rakt	
at sænke	to lower	V	3	sænker|sænkede|sænket	
at indeholde	to contain	V	3	indeholder|indeholdt|indeholdt	
at træne	to train	V	2	træner|trænede|trænet	
at pakke	to pack	V	1	pakker|pakkede|pakket	
at skrige	to scream	V	3	skriger|skreg|skreget	
at skubbe	to push	V	3	skubber|skubbede|skubbet	
at forhandle	to negotiate	V	3	forhandler|forhandlede|forhandlet	
at løslade	to release (from prison)	V	3	løslader|løslod|løsladt	
at bide	to bite	V	1	bider|bed|bidt	
at befri	to free / liberate	V	3	befrier|befriede|befriet	
at afgøre	to decide / settle	V	3	afgør|afgjorde|afgjort	
at trykke	to press / print	V	3	trykker|trykkede|trykket	
at skinne	to shine	V	2	skinner|skinnede|skinnet	
at spare	to save (money)	V	3	sparer|sparede|sparet	
at foretage	to make / carry out	V	3	foretager|foretog|foretaget	
at hyre	to hire	V	3	hyrer|hyrede|hyret	
at undre sig	to wonder	V	3	undrer sig|undrede sig|undret sig	
at skuffe	to disappoint	V	2	skuffer|skuffede|skuffet	
at kidnappe	to kidnap	V	3	kidnapper|kidnappede|kidnappet	
at ryste	to shake	V	3	ryster|rystede|rystet	
at repræsentere	to represent	V	3	repræsenterer|repræsenterede|repræsenteret	
at dyrke	to grow / practice (a sport)	V	2	dyrker|dyrkede|dyrket	
at gribe	to grab / catch	V	3	griber|greb|grebet	
at nytte	to be of use	V	3	nytter|nyttede|nyttet	
at bestå	to pass (an exam) / consist	V	3	består|bestod|bestået	
at kede sig	to be bored	V	3	keder sig|kedede sig|kedet sig	
at antage	to assume	V	3	antager|antog|antaget	
at skilles	to divorce / separate	V	3	skilles|skiltes|skiltes	
at leje	to rent	V	3	lejer|lejede|lejet	
at afvise	to reject	V	3	afviser|afviste|afvist	
at pege	to point	V	3	peger|pegede|peget	
at svigte	to let down / fail	V	3	svigter|svigtede|svigtet	
at binde	to tie / bind	V	2	binder|bandt|bundet	
at bebrejde	to blame	V	3	bebrejder|bebrejdede|bebrejdet	
at beskrive	to describe	V	3	beskriver|beskrev|beskrevet	
at straffe	to punish	V	3	straffer|straffede|straffet	
at forlange	to demand	V	3	forlanger|forlangte|forlangt	
at mindes	to remember / commemorate	V	3	mindes|mindedes|mindedes	
at rådne	to rot	V	3	rådner|rådnede|rådnet	
at forråde	to betray	V	3	forråder|forrådte|forrådt	
at vænne sig til	to get used to	V	3	vænner sig til|vænnede sig til|vænnet sig til	
at koncentrere sig	to concentrate	V	3	koncentrerer sig|koncentrerede sig|koncentreret sig	
at overvåge	to monitor / watch	V	3	overvåger|overvågede|overvåget	
at ignorere	to ignore	V	3	ignorerer|ignorerede|ignoreret	
at udgive	to publish	V	3	udgiver|udgav|udgivet	
at besejre	to defeat	V	3	besejrer|besejrede|besejret	
at insistere	to insist	V	3	insisterer|insisterede|insisteret	
at stirre	to stare	V	3	stirrer|stirrede|stirret	
at ånde	to breathe	V	3	ånder|åndede|åndet	
at smitte	to infect	V	3	smitter|smittede|smittet	
at hygge sig	to have a cozy / nice time	V	3	hygger sig|hyggede sig|hygget sig	
at skamme sig	to be ashamed	V	3	skammer sig|skammede sig|skammet sig	
at hævne	to avenge	V	3	hævner|hævnede|hævnet	
at kvæle	to strangle / choke	V	3	kvæler|kvalte|kvalt	
at nøjes med	to make do with	V	3	nøjes med|nøjedes med|nøjedes med	
at arrangere	to arrange	V	3	arrangerer|arrangerede|arrangeret	
at bortføre	to abduct	V	3	bortfører|bortførte|bortført	
at flyde	to float / flow	V	3	flyder|flød|flydt	
at tåle	to tolerate / stand	V	3	tåler|tålte|tålt	
at sladre	to gossip / tell on	V	3	sladrer|sladrede|sladret	
at hæve	to raise / withdraw (money)	V	3	hæver|hævede|hævet	
at modstå	to resist	V	3	modstår|modstod|modstået	
at tilstå	to confess	V	3	tilstår|tilstod|tilstået	
at spytte	to spit	V	4	spytter|spyttede|spyttet	
at besvare	to answer	V	3	besvarer|besvarede|besvaret	
at drille	to tease	V	3	driller|drillede|drillet	
at hive	to pull / heave	V	3	hiver|hev|hevet	
at rulle	to roll	V	3	ruller|rullede|rullet	
at overgive sig	to surrender	V	3	overgiver sig|overgav sig|overgivet sig	
at affyre	to fire (a weapon)	V	3	affyrer|affyrede|affyret	
at hævde	to claim	V	3	hævder|hævdede|hævdet	
at flå	to rip / skin	V	3	flår|flåede|flået	
at anmode	to request	V	3	anmoder|anmodede|anmodet	
at forsikre	to assure / insure	V	3	forsikrer|forsikrede|forsikret	
at udslette	to wipe out	V	3	udsletter|udslettede|udslettet	
at styrte	to rush / crash	V	3	styrter|styrtede|styrtet	
at røve	to rob	V	3	røver|røvede|røvet	
at undvære	to do without	V	3	undværer|undværede|undværet	
at omgås	to associate with / socialize	V	3	omgås|omgikkes|omgåedes	
at drukne	to drown	V	3	drukner|druknede|druknet	
at forfølge	to pursue / persecute	V	3	forfølger|forfulgte|forfulgt	
at erstatte	to replace	V	3	erstatter|erstattede|erstattet	
at le	to laugh	V	3	ler|lo|leet	
at imponere	to impress	V	2	imponerer|imponerede|imponeret	
at spekulere	to speculate / wonder	V	3	spekulerer|spekulerede|spekuleret	
at udtrykke	to express	V	3	udtrykker|udtrykte|udtrykt	
at adlyde	to obey	V	3	adlyder|adlød|adlydt	
at klatre	to climb	V	3	klatrer|klatrede|klatret	
at rette	to correct / straighten	V	1	retter|rettede|rettet	
at designe	to design	V	3	designer|designede|designet	
at plage	to pester / torment	V	3	plager|plagede|plaget	
at snige sig	to sneak	V	3	sniger sig|sneg sig|sneget sig	
at tilkalde	to summon / call in	V	3	tilkalder|tilkaldte|tilkaldt	
at optræde	to perform / appear	V	3	optræder|optrådte|optrådt	
at glide	to slide / slip	V	3	glider|gled|gledet	
at spænde	to tighten / fasten	V	2	spænder|spændte|spændt	
at orke	to have the energy for	V	3	orker|orkede|orket	
at sutte	to suck	V	3	sutter|suttede|suttet	
at fornemme	to sense	V	3	fornemmer|fornemmede|fornemmet	
at snuppe	to snatch / grab	V	3	snupper|snuppede|snuppet	
at klemme	to squeeze / pinch	V	3	klemmer|klemte|klemt	
at forfremme	to promote	V	3	forfremmer|forfremmede|forfremmet	
at overføre	to transfer	V	3	overfører|overførte|overført	
at fornærme	to offend	V	3	fornærmer|fornærmede|fornærmet	
at råde over	to have at one's disposal	V	3	råder over|rådede over|rådet over	
at fodre	to feed	V	3	fodrer|fodrede|fodret	
at satse	to bet / go for	V	3	satser|satsede|satset	
at klø	to itch / scratch	V	3	klør|kløede|kløet	
at afvente	to await	V	3	afventer|afventede|afventet	
at overse	to overlook	V	3	overser|overså|overset	
at undslippe	to escape	V	3	undslipper|undslap|undsluppet	
at erklære	to declare	V	3	erklærer|erklærede|erklæret	
at indgå	to enter into (an agreement)	V	3	indgår|indgik|indgået	
at garantere	to guarantee	V	3	garanterer|garanterede|garanteret	
at bade	to bathe / swim	V	3	bader|badede|badet	
at betragte	to regard / consider	V	3	betragter|betragtede|betragtet	
at sigte	to aim / charge (with a crime)	V	3	sigter|sigtede|sigtet	
at opfinde	to invent	V	3	opfinder|opfandt|opfundet	
at underrette	to notify	V	3	underretter|underrettede|underrettet	
at stemme	to vote	V	1	stemmer|stemte|stemt	
at forvandle	to transform	V	3	forvandler|forvandlede|forvandlet	
at trives	to thrive	V	3	trives|trivedes|trivedes	
at besvime	to faint	V	3	besvimer|besvimede|besvimet	
at indhente	to catch up with	V	3	indhenter|indhentede|indhentet	
at fikse	to fix	V	3	fikser|fiksede|fikset	
at kravle	to crawl	V	3	kravler|kravlede|kravlet	
at sikre	to secure / ensure	V	1	sikrer|sikrede|sikret	
at forårsage	to cause	V	3	forårsager|forårsagede|forårsaget	
at udfylde	to fill in / fill out	V	3	udfylder|udfyldte|udfyldt	
at henrette	to execute	V	3	henretter|henrettede|henrettet	
at bokse	to box	V	3	bokser|boksede|bokset	
at bøje	to bend	V	3	bøjer|bøjede|bøjet	
at bande	to swear (curse)	V	2	bander|bandede|bandet	
at beordre	to order (command)	V	3	beordrer|beordrede|beordret	
at udrydde	to exterminate / eradicate	V	3	udrydder|udryddede|udryddet	
at drøfte	to discuss	V	3	drøfter|drøftede|drøftet	
at meddele	to announce / inform	V	3	meddeler|meddelte|meddelt	
at vælte	to knock over / tip over	V	3	vælter|væltede|væltet	
at enes	to agree / get along	V	3	enes|enedes|enedes	
at tilintetgøre	to annihilate	V	3	tilintetgør|tilintetgjorde|tilintetgjort	
at øge	to increase	V	3	øger|øgede|øget	
at opfylde	to fulfill	V	3	opfylder|opfyldte|opfyldt	
at udfordre	to challenge	V	3	udfordrer|udfordrede|udfordret	
at indebære	to involve / imply	V	3	indebærer|indebar|indebåret	
at synke	to sink / swallow	V	3	synker|sank|sunket	
at operere	to operate	V	3	opererer|opererede|opereret	
at overlade	to leave (to someone) / hand over	V	3	overlader|overlod|overladt	
at slæbe	to drag	V	3	slæber|slæbte|slæbt	
at havne	to end up	V	3	havner|havnede|havnet	
at afhøre	to interrogate	V	3	afhører|afhørte|afhørt	
at anbringe	to place	V	3	anbringer|anbragte|anbragt	
at tiltrække	to attract	V	3	tiltrækker|tiltrak|tiltrukket	
at danne	to form	V	3	danner|dannede|dannet	
at sludre	to chat	V	3	sludrer|sludrede|sludret	
at misforstå	to misunderstand	V	3	misforstår|misforstod|misforstået	
at genskabe	to recreate / restore	V	3	genskaber|genskabte|genskabt	
at rapportere	to report	V	3	rapporterer|rapporterede|rapporteret	
at fryse	to freeze	V	2	fryser|frøs|frosset	
at misse	to miss	V	3	misser|missede|misset	
at opstå	to arise / occur	V	3	opstår|opstod|opstået	
at vare	to last	V	2	varer|varede|varet	
at hylde	to celebrate / honor	V	3	hylder|hyldede|hyldet	
at knække	to crack / break	V	3	knækker|knækkede|knækket	
at udvide	to expand	V	3	udvider|udvidede|udvidet	
at introducere	to introduce	V	3	introducerer|introducerede|introduceret	
at irritere	to irritate	V	3	irriterer|irriterede|irriteret	
at passere	to pass	V	3	passerer|passerede|passeret	
at anmelde	to report (to police) / review	V	3	anmelder|anmeldte|anmeldt	
at opsøge	to seek out	V	3	opsøger|opsøgte|opsøgt	
at sulte	to starve	V	3	sulter|sultede|sultet	
at tilpasse	to adapt	V	3	tilpasser|tilpassede|tilpasset	
at indikere	to indicate	V	3	indikerer|indikerede|indikeret	
at lokke	to lure / tempt	V	3	lokker|lokkede|lokket	
at blokere	to block	V	3	blokerer|blokerede|blokeret	
at sagsøge	to sue	V	3	sagsøger|sagsøgte|sagsøgt	
at hacke	to hack	V	3	hacker|hackede|hacket	
at tigge	to beg	V	3	tigger|tiggede|tigget	
at klappe	to clap / pat	V	3	klapper|klappede|klappet	
at opklare	to solve (a case)	V	3	opklarer|opklarede|opklaret	
at udrette	to accomplish	V	3	udretter|udrettede|udrettet	
at berolige	to calm / reassure	V	3	beroliger|beroligede|beroliget	
at informere	to inform	V	3	informerer|informerede|informeret	
at svinge	to swing	V	3	svinger|svingede|svinget	
at opretholde	to maintain	V	3	opretholder|opretholdt|opretholdt	
at vandre	to wander / hike	V	3	vandrer|vandrede|vandret	
at kurere	to cure	V	3	kurerer|kurerede|kureret	
at hugge	to chop	V	3	hugger|huggede|hugget	
at bluffe	to bluff	V	3	bluffer|bluffede|bluffet	
at tømme	to empty	V	3	tømmer|tømte|tømt	
at dæmpe	to dampen / turn down	V	4	dæmper|dæmpede|dæmpet	
at trøste	to comfort	V	3	trøster|trøstede|trøstet	
at forbyde	to forbid / ban	V	2	forbyder|forbød|forbudt	
at forsørge	to support (financially)	V	4	forsørger|forsørgede|forsørget	
at overnatte	to stay overnight	V	4	overnatter|overnattede|overnattet	
at indtage	to consume / take	V	4	indtager|indtog|indtaget	
at besidde	to possess	V	4	besidder|besad|besiddet	
at investere	to invest	V	4	investerer|investerede|investeret	
at benytte	to use	V	4	benytter|benyttede|benyttet	
at placere	to place	V	3	placerer|placerede|placeret	
at manipulere	to manipulate	V	4	manipulerer|manipulerede|manipuleret	
at hælde	to pour / lean	V	4	hælder|hældte|hældt	
at notere	to note down	V	4	noterer|noterede|noteret	
at omtale	to mention / refer to	V	4	omtaler|omtalte|omtalt	
at konkurrere	to compete	V	4	konkurrerer|konkurrerede|konkurreret	
at distrahere	to distract	V	3	distraherer|distraherede|distraheret	
at stave	to spell	V	4	staver|stavede|stavet	
at kvaje sig	to mess up	V	4	kvajer sig|kvajede sig|kvajet sig	
at opbygge	to build up	V	4	opbygger|opbyggede|opbygget	
at smugle	to smuggle	V	4	smugler|smuglede|smuglet	
at overvinde	to overcome	V	4	overvinder|overvandt|overvundet	
at hindre	to prevent / hinder	V	4	hindrer|hindrede|hindret	
at opmuntre	to encourage / cheer up	V	4	opmuntrer|opmuntrede|opmuntret	
at evakuere	to evacuate	V	4	evakuerer|evakuerede|evakueret	
at vrimle	to swarm / teem	V	4	vrimler|vrimlede|vrimlet	
at overdrive	to exaggerate	V	4	overdriver|overdrev|overdrevet	
at fuldføre	to complete	V	3	fuldfører|fuldførte|fuldført	
at suge	to suck	V	4	suger|sugede|suget	
at fødes	to be born	V	4	fødes|fødtes|fødtes	
at give afkald på	to give up / renounce	V	4	giver afkald på|gav afkald på|givet afkald på	
at hele	to heal	V	1	heler|helede|helet	
at opdrage	to raise (a child)	V	3	opdrager|opdrog|opdraget	
at larme	to make noise	V	4	larmer|larmede|larmet	
at oplyse	to inform / light up	V	4	oplyser|oplyste|oplyst	
at blinke	to blink / wink	V	4	blinker|blinkede|blinket	
at afgive	to give off / submit	V	4	afgiver|afgav|afgivet	
at afhente	to collect / pick up	V	4	afhenter|afhentede|afhentet	
at afprøve	to test / try out	V	4	afprøver|afprøvede|afprøvet	
at afspejle	to reflect	V	4	afspejler|afspejlede|afspejlet	
at afstå	to give up / refrain	V	4	afstår|afstod|afstået	
at aftale	to agree / arrange	V	1	aftaler|aftalte|aftalt	
at aftage	to decrease	V	4	aftager|aftog|aftaget	
at analysere	to analyze	V	4	analyserer|analyserede|analyseret	
at angive	to state / indicate	V	4	angiver|angav|angivet	
at anse	to regard / consider	V	4	anser|anså|anset	
at anskaffe	to acquire	V	4	anskaffer|anskaffede|anskaffet	
at anvende	to use / apply	V	4	anvender|anvendte|anvendt	
at argumentere	to argue	V	4	argumenterer|argumenterede|argumenteret	
at bede om	to ask for	V	1	beder om|bad om|bedt om	
at begrunde	to justify	V	4	begrunder|begrundede|begrundet	
at begrænse	to limit	V	3	begrænser|begrænsede|begrænset	
at belyse	to shed light on	V	4	belyser|belyste|belyst	
at berøre	to touch / affect	V	4	berører|berørte|berørt	
at beskæftige sig med	to deal with / work with	V	4	beskæftiger sig med|beskæftigede sig med|beskæftiget sig med	
at bestemme sig	to make up one's mind	V	1	bestemmer sig|bestemte sig|bestemt sig	
at betale sig	to pay off (be worth it)	V	1	betaler sig|betalte sig|betalt sig	
at bevise	to prove	V	1	beviser|beviste|bevist	
at blande sig	to interfere	V	2	blander sig|blandede sig|blandet sig	
at bygge om	to rebuild / convert	V	2	bygger om|byggede om|bygget om	
at byde	to offer / bid	V	2	byder|bød|budt	
at byde velkommen	to welcome	V	2	byder velkommen|bød velkommen|budt velkommen	
at dele ud	to hand out	V	1	deler ud|delte ud|delt ud	
at definere	to define	V	4	definerer|definerede|defineret	
at erfare	to learn / experience	V	4	erfarer|erfarede|erfaret	
at erobre	to conquer	V	4	erobrer|erobrede|erobret	
at evaluere	to evaluate	V	4	evaluerer|evaluerede|evalueret	
at falde ned	to fall down	V	1	falder ned|faldt ned|faldet ned	
at fastholde	to maintain / hold on to	V	4	fastholder|fastholdt|fastholdt	
at fastslå	to establish / determine	V	4	fastslår|fastslog|fastslået	
at fejle	to fail / be wrong with	V	2	fejler|fejlede|fejlet	
at finde på	to come up with	V	1	finder på|fandt på|fundet på	
at finde ud af	to find out / figure out	V	1	finder ud af|fandt ud af|fundet ud af	
at flytte sig	to move (oneself)	V	1	flytter sig|flyttede sig|flyttet sig	
at forandre sig	to change	V	2	forandrer sig|forandrede sig|forandret sig	
at forberede sig	to prepare oneself	V	2	forbereder sig|forberedte sig|forberedt sig	
at forbruge	to consume	V	4	forbruger|forbrugte|forbrugt	
at fordele	to distribute	V	3	fordeler|fordelte|fordelt	
at foregive	to pretend	V	4	foregiver|foregav|foregivet	
at forestå	to be in charge of / lie ahead	V	4	forestår|forestod|forestået	
at forlænge	to extend	V	4	forlænger|forlængede|forlænget	
at formulere	to formulate	V	4	formulerer|formulerede|formuleret	
at forny	to renew	V	4	fornyer|fornyede|fornyet	
at forske	to research	V	3	forsker|forskede|forsket	
at forsømme	to neglect	V	4	forsømmer|forsømte|forsømt	
at fortolke	to interpret	V	4	fortolker|fortolkede|fortolket	
at forurene	to pollute	V	4	forurener|forurenede|forurenet	
at forvirre	to confuse	V	2	forvirrer|forvirrede|forvirret	
at fremhæve	to emphasize	V	4	fremhæver|fremhævede|fremhævet	
at fremstille	to produce / portray	V	4	fremstiller|fremstillede|fremstillet	
at fremføre	to present / put forward	V	4	fremfører|fremførte|fremført	
at frigive	to release	V	4	frigiver|frigav|frigivet	
at føre	to lead / conduct	V	1	fører|førte|ført	
at følge med	to keep up / come along	V	1	følger med|fulgte med|fulgt med	
at få fat i	to get hold of	V	1	får fat i|fik fat i|fået fat i	
at få lov til	to be allowed to	V	1	får lov til|fik lov til|fået lov til	
at få øje på	to catch sight of	V	1	får øje på|fik øje på|fået øje på	
at gå i gang med	to get started on	V	1	går i gang med|gik i gang med|gået i gang med	
at gå ind for	to be in favor of	V	1	går ind for|gik ind for|gået ind for	
at gå op for	to dawn on	V	1	går op for|gik op for|gået op for	
at gå ud fra	to assume	V	1	går ud fra|gik ud fra|gået ud fra	
at gå videre	to move on	V	1	går videre|gik videre|gået videre	
at genoprette	to restore	V	4	genopretter|genoprettede|genoprettet	
at give op	to give up	V	1	giver op|gav op|givet op	
at give sig	to give in / yield	V	1	giver sig|gav sig|givet sig	
at glæde sig over	to be happy about	V	1	glæder sig over|glædede sig over|glædet sig over	
at gribe ind	to intervene	V	3	griber ind|greb ind|grebet ind	
at gøre sig umage	to make an effort	V	4	gør sig umage|gjorde sig umage|gjort sig umage	
at halvere	to halve	V	4	halverer|halverede|halveret	
at handle om	to be about	V	1	handler om|handlede om|handlet om	
at henvende sig	to contact / turn to	V	4	henvender sig|henvendte sig|henvendt sig	
at henvise	to refer	V	4	henviser|henviste|henvist	
at holde fast	to hold on	V	1	holder fast|holdt fast|holdt fast	
at holde op	to stop	V	1	holder op|holdt op|holdt op	
at holde øje med	to keep an eye on	V	1	holder øje med|holdt øje med|holdt øje med	
at høre efter	to listen	V	1	hører efter|hørte efter|hørt efter	
at høre til	to belong	V	1	hører til|hørte til|hørt til	
at indføre	to introduce (a rule)	V	4	indfører|indførte|indført	
at indkalde	to call in / summon	V	3	indkalder|indkaldte|indkaldt	
at indrette sig	to adapt / settle in	V	4	indretter sig|indrettede sig|indrettet sig	
at indstille	to adjust / set	V	4	indstiller|indstillede|indstillet	
at inddrage	to involve	V	4	inddrager|inddrog|inddraget	
at interessere sig for	to be interested in	V	1	interesserer sig for|interesserede sig for|interesseret sig for	
at justere	to adjust	V	4	justerer|justerede|justeret	
at kalde på	to call for	V	1	kalder på|kaldte på|kaldt på	
at klare	to manage / cope	V	1	klarer|klarede|klaret	
at klare sig	to get by / do well	V	1	klarer sig|klarede sig|klaret sig	
at kombinere	to combine	V	4	kombinerer|kombinerede|kombineret	
at kommentere	to comment	V	4	kommenterer|kommenterede|kommenteret	
at kommunikere	to communicate	V	3	kommunikerer|kommunikerede|kommunikeret	
at komme an på	to depend on	V	1	kommer an på|kom an på|kommet an på	
at komme frem	to arrive / come forward	V	1	kommer frem|kom frem|kommet frem	
at komme i tanke om	to remember / think of	V	2	kommer i tanke om|kom i tanke om|kommet i tanke om	
at komme tilbage	to come back	V	1	kommer tilbage|kom tilbage|kommet tilbage	
at komme videre	to move on	V	1	kommer videre|kom videre|kommet videre	
at køre fast	to get stuck	V	1	kører fast|kørte fast|kørt fast	
at lade være	to not do / refrain	V	1	lader være|lod være|ladet være	
at lede efter	to look for	V	1	leder efter|ledte efter|ledt efter	
at lægge mærke til	to notice	V	1	lægger mærke til|lagde mærke til|lagt mærke til	
at lægge vægt på	to emphasize	V	3	lægger vægt på|lagde vægt på|lagt vægt på	
at lære at kende	to get to know	V	1	lærer at kende|lærte at kende|lært at kende	
at løbe tør for	to run out of	V	1	løber tør for|løb tør for|løbet tør for	
at markere	to mark	V	4	markerer|markerede|markeret	
at medføre	to lead to / result in	V	4	medfører|medførte|medført	
at medvirke	to contribute / take part	V	4	medvirker|medvirkede|medvirket	
at minde om	to remind of	V	1	minder om|mindede om|mindet om	
at modarbejde	to counteract	V	4	modarbejder|modarbejdede|modarbejdet	
at motivere	to motivate	V	4	motiverer|motiverede|motiveret	
at møde op	to show up	V	1	møder op|mødte op|mødt op	
at nedsætte	to reduce	V	4	nedsætter|nedsatte|nedsat	
at observere	to observe	V	4	observerer|observerede|observeret	
at omfatte	to include	V	4	omfatter|omfattede|omfattet	
at omgive	to surround	V	3	omgiver|omgav|omgivet	
at omstille sig	to adapt	V	4	omstiller sig|omstillede sig|omstillet sig	
at opbevare	to store	V	4	opbevarer|opbevarede|opbevaret	
at opføre	to build / perform	V	2	opfører|opførte|opført	
at ophøre	to cease	V	4	ophører|ophørte|ophørt	
at oprette	to set up / create	V	4	opretter|oprettede|oprettet	
at opstille	to set up / nominate	V	4	opstiller|opstillede|opstillet	
at orientere	to inform / orient	V	4	orienterer|orienterede|orienteret	
at overraske	to surprise	V	2	overrasker|overraskede|overrasket	
at passe på	to take care / watch out	V	1	passer på|passede på|passet på	
at pege på	to point to	V	3	peger på|pegede på|peget på	
at producere	to produce	V	4	producerer|producerede|produceret	
at protestere	to protest	V	4	protesterer|protesterede|protesteret	
at prioritere	to prioritize	V	4	prioriterer|prioriterede|prioriteret	
at realisere	to realize (achieve)	V	4	realiserer|realiserede|realiseret	
at redegøre for	to account for	V	4	redegør for|redegjorde for|redegjort for	
at regne med	to count on / expect	V	2	regner med|regnede med|regnet med	
at registrere	to register	V	3	registrerer|registrerede|registreret	
at rejse sig	to stand up / rise	V	1	rejser sig|rejste sig|rejst sig	
at ringe tilbage	to call back	V	1	ringer tilbage|ringede tilbage|ringet tilbage	
at rydde	to clear	V	2	rydder|ryddede|ryddet	
at sammenfatte	to summarize	V	4	sammenfatter|sammenfattede|sammenfattet	
at sammensætte	to put together	V	4	sammensætter|sammensatte|sammensat	
at sanse	to sense	V	4	sanser|sansede|sanset	
at se ud	to look (appear)	V	1	ser ud|så ud|set ud	
at se frem til	to look forward to	V	1	ser frem til|så frem til|set frem til	
at se på	to look at	V	1	ser på|så på|set på	
at sidde fast	to be stuck	V	1	sidder fast|sad fast|siddet fast	
at sige til	to tell / let know	V	1	siger til|sagde til|sagt til	
at skabe	to create	V	1	skaber|skabte|skabt	
at skade	to harm / damage	V	1	skader|skadede|skadet	
at skelne	to distinguish	V	4	skelner|skelnede|skelnet	
at skrive ned	to write down	V	1	skriver ned|skrev ned|skrevet ned	
at slippe af med	to get rid of	V	1	slipper af med|slap af med|sluppet af med	
at slå sig ned	to settle down	V	1	slår sig ned|slog sig ned|slået sig ned	
at smide ud	to throw out	V	1	smider ud|smed ud|smidt ud	
at spille en rolle	to play a role	V	2	spiller en rolle|spillede en rolle|spillet en rolle	
at springe over	to skip	V	2	springer over|sprang over|sprunget over	
at stå for	to be in charge of	V	1	står for|stod for|stået for	
at stå i kø	to stand in line	V	3	står i kø|stod i kø|stået i kø	
at stille	to put / place (upright)	V	1	stiller|stillede|stillet	
at stille et spørgsmål	to ask a question	V	1	stiller et spørgsmål|stillede et spørgsmål|stillet et spørgsmål	
at strække	to stretch	V	4	strækker|strakte|strakt	
at styrke	to strengthen	V	1	styrker|styrkede|styrket	
at støde på	to come across	V	3	støder på|stødte på|stødt på	
at svække	to weaken	V	4	svækker|svækkede|svækket	
at sætte pris på	to appreciate	V	1	sætter pris på|satte pris på|sat pris på	
at sætte sig	to sit down	V	1	sætter sig|satte sig|sat sig	
at søge om	to apply for	V	1	søger om|søgte om|søgt om	
at tage fejl	to be wrong	V	1	tager fejl|tog fejl|taget fejl	
at tage hensyn til	to take into account	V	2	tager hensyn til|tog hensyn til|taget hensyn til	
at tage imod	to receive / accept	V	1	tager imod|tog imod|taget imod	
at tage med	to bring along / come along	V	1	tager med|tog med|taget med	
at tage stilling til	to take a position on	V	2	tager stilling til|tog stilling til|taget stilling til	
at tage sig sammen	to pull oneself together	V	1	tager sig sammen|tog sig sammen|taget sig sammen	
at tale om	to talk about	V	1	taler om|talte om|talt om	
at tale sammen	to talk (with each other)	V	1	taler sammen|talte sammen|talt sammen	
at tilbagebetale	to pay back	V	4	tilbagebetaler|tilbagebetalte|tilbagebetalt	
at tilføje	to add	V	2	tilføjer|tilføjede|tilføjet	
at tilmelde sig	to sign up	V	4	tilmelder sig|tilmeldte sig|tilmeldt sig	
at træde i kraft	to take effect	V	2	træder i kraft|trådte i kraft|trådt i kraft	
at trække sig	to withdraw	V	1	trækker sig|trak sig|trukket sig	
at tvivle	to doubt	V	2	tvivler|tvivlede|tvivlet	
at tænke over	to think about	V	1	tænker over|tænkte over|tænkt over	
at tænke på	to think of	V	1	tænker på|tænkte på|tænkt på	
at udarbejde	to prepare / draw up	V	4	udarbejder|udarbejdede|udarbejdet	
at udbrede	to spread	V	4	udbreder|udbredte|udbredt	
at uddanne	to educate / train	V	3	uddanner|uddannede|uddannet	
at uddele	to hand out	V	4	uddeler|uddelte|uddelt	
at udgøre	to constitute	V	3	udgør|udgjorde|udgjort	
at udløse	to trigger	V	4	udløser|udløste|udløst	
at udnævne	to appoint	V	4	udnævner|udnævnte|udnævnt	
at udskifte	to replace	V	4	udskifter|udskiftede|udskiftet	
at udtale	to pronounce	V	2	udtaler|udtalte|udtalt	
at udvikle sig	to develop	V	3	udvikler sig|udviklede sig|udviklet sig	
at undervurdere	to underestimate	V	4	undervurderer|undervurderede|undervurderet	
at vedligeholde	to maintain	V	4	vedligeholder|vedligeholdt|vedligeholdt	
at vejlede	to guide / advise	V	4	vejleder|vejledte|vejledt	
at vende tilbage	to return	V	1	vender tilbage|vendte tilbage|vendt tilbage	
at vise sig	to turn out	V	1	viser sig|viste sig|vist sig	
at vågne op	to wake up	V	2	vågner op|vågnede op|vågnet op	
at være ved at	to be about to / be in the middle of	V	1	er ved at|var ved at|været ved at	
at være nødt til	to have to	V	1	er nødt til|var nødt til|været nødt til	
at være vant til	to be used to	V	2	er vant til|var vant til|været vant til	
at åbne op	to open up	V	1	åbner op|åbnede op|åbnet op	
at agere	to act	V	4	agerer|agerede|ageret	
at ansøge	to apply	V	4	ansøger|ansøgte|ansøgt	
at betro	to confide	V	4	betror|betroede|betroet	
at bidrage	to contribute	V	4	bidrager|bidrog|bidraget	
at brokke sig	to complain / grumble	V	4	brokker sig|brokkede sig|brokket sig	
at dufte	to smell (nice)	V	3	dufter|duftede|duftet	
at eje	to own	V	1	ejer|ejede|ejet	
at forkæle	to spoil (pamper)	V	4	forkæler|forkælede|forkælet	
at gynge	to swing	V	4	gynger|gyngede|gynget	
at huske på	to keep in mind	V	1	husker på|huskede på|husket på	
at lappe	to patch / mend	V	4	lapper|lappede|lappet	
at lyse	to shine / light	V	1	lyser|lyste|lyst	
at mumle	to mumble	V	4	mumler|mumlede|mumlet	
at nusse	to cuddle / stroke	V	4	nusser|nussede|nusset	
at pudse	to polish	V	4	pudser|pudsede|pudset	
at puste	to blow / puff	V	4	puster|pustede|pustet	
at rive i stykker	to tear to pieces	V	3	river i stykker|rev i stykker|revet i stykker	
at sige farvel	to say goodbye	V	1	siger farvel|sagde farvel|sagt farvel	
at sige goddag	to say hello	V	1	siger goddag|sagde goddag|sagt goddag	
at skrabe	to scrape	V	4	skraber|skrabede|skrabet	
at skrubbe	to scrub	V	4	skrubber|skrubbede|skrubbet	
at snorke	to snore	V	4	snorker|snorkede|snorket	
at sprøjte	to spray	V	2	sprøjter|sprøjtede|sprøjtet	
at trampe	to stomp	V	4	tramper|trampede|trampet	
at tude	to cry / howl	V	4	tuder|tudede|tudet	
at vakle	to wobble / waver	V	4	vakler|vaklede|vaklet	
at vifte	to wave (something)	V	4	vifter|viftede|viftet	
at vippe	to tip / rock	V	4	vipper|vippede|vippet	
at vride	to twist / wring	V	1	vrider|vred|vredet	
at ønske sig	to wish for	V	1	ønsker sig|ønskede sig|ønsket sig	
at afbestille	to cancel (an order / booking)	V	4	afbestiller|afbestilte|afbestilt	
at afgå	to depart	V	4	afgår|afgik|afgået	
at afholde	to hold (an event)	V	4	afholder|afholdt|afholdt	
at afmelde	to cancel / unsubscribe	V	4	afmelder|afmeldte|afmeldt	
at afsende	to send / dispatch	V	4	afsender|afsendte|afsendt	
at afskaffe	to abolish	V	4	afskaffer|afskaffede|afskaffet	
at angre	to regret	V	4	angrer|angrede|angret	
at annoncere	to announce / advertise	V	4	annoncerer|annoncerede|annonceret	
at applaudere	to applaud	V	4	applauderer|applauderede|applauderet	
at arve	to inherit	V	4	arver|arvede|arvet	
at bakke op	to back up / support	V	3	bakker op|bakkede op|bakket op	
at bebo	to inhabit	V	4	bebor|beboede|beboet	
at bedrage	to deceive	V	3	bedrager|bedrog|bedraget	
at begejstre	to inspire / excite	V	2	begejstrer|begejstrede|begejstret	
at bekende	to confess	V	2	bekender|bekendte|bekendt	
at belaste	to burden / strain	V	4	belaster|belastede|belastet	
at belønne	to reward	V	4	belønner|belønnede|belønnet	
at berette	to report / tell	V	4	beretter|berettede|berettet	
at beskatte	to tax	V	4	beskatter|beskattede|beskattet	
at beslaglægge	to confiscate	V	4	beslaglægger|beslaglagde|beslaglagt	
at bestige	to climb (a mountain)	V	4	bestiger|besteg|besteget	
at betjene	to serve / operate	V	1	betjener|betjente|betjent	
at betvivle	to question / doubt	V	4	betvivler|betvivlede|betvivlet	
at beundre	to admire	V	3	beundrer|beundrede|beundret	
at bevilge	to grant	V	4	bevilger|bevilgede|bevilget	
at blegne	to fade	V	4	blegner|blegnede|blegnet	
at bo sammen	to live together	V	1	bor sammen|boede sammen|boet sammen	
at bruge op	to use up	V	1	bruger op|brugte op|brugt op	
at brøle	to roar	V	4	brøler|brølede|brølet	
at bukke	to bow	V	4	bukker|bukkede|bukket	
at censurere	to censor	V	4	censurerer|censurerede|censureret	
at citere	to quote	V	4	citerer|citerede|citeret	
at cirkulere	to circulate	V	4	cirkulerer|cirkulerede|cirkuleret	
at dampe	to steam	V	4	damper|dampede|dampet	
at dirigere	to conduct / direct	V	4	dirigerer|dirigerede|dirigeret	
at dokumentere	to document	V	4	dokumenterer|dokumenterede|dokumenteret	
at dominere	to dominate	V	4	dominerer|dominerede|domineret	
at donere	to donate	V	4	donerer|donerede|doneret	
at drysse	to sprinkle	V	4	drysser|dryssede|drysset	
at dryppe	to drip	V	4	drypper|dryppede|dryppet	
at dyppe	to dip	V	4	dypper|dyppede|dyppet	
at efterligne	to imitate	V	4	efterligner|efterlignede|efterlignet	
at efterlyse	to call for / search for	V	3	efterlyser|efterlyste|efterlyst	
at eksperimentere	to experiment	V	4	eksperimenterer|eksperimenterede|eksperimenteret	
at eksportere	to export	V	4	eksporterer|eksporterede|eksporteret	
at importere	to import	V	4	importerer|importerede|importeret	
at etablere	to establish	V	4	etablerer|etablerede|etableret	
at falde over	to trip over / come across	V	1	falder over|faldt over|faldet over	
at fare	to rush	V	1	farer|for|faret	
at farve	to color / dye	V	2	farver|farvede|farvet	
at finansiere	to finance	V	4	finansierer|finansierede|finansieret	
at flirte	to flirt	V	4	flirter|flirtede|flirtet	
at flække	to split	V	4	flækker|flækkede|flækket	
at forfalde	to fall due / decay	V	4	forfalder|forfaldt|forfaldet	
at forfatte	to author	V	2	forfatter|forfattede|forfattet	
at forhøre sig	to inquire	V	4	forhører sig|forhørte sig|forhørt sig	
at forklæde sig	to disguise oneself	V	4	forklæder sig|forklædte sig|forklædt sig	
at forløbe	to proceed / go (well/badly)	V	4	forløber|forløb|forløbet	
at formindske	to reduce	V	4	formindsker|formindskede|formindsket	
at fornægte	to deny	V	4	fornægter|fornægtede|fornægtet	
at forsone sig	to reconcile	V	4	forsoner sig|forsonede sig|forsonet sig	
at forsyne	to supply	V	4	forsyner|forsynede|forsynet	
at fortage sig	to wear off	V	4	fortager sig|fortog sig|fortaget sig	
at fortrænge	to repress / displace	V	4	fortrænger|fortrængte|fortrængt	
at forudse	to foresee	V	4	forudser|forudså|forudset	
at forudsige	to predict	V	4	forudsiger|forudsagde|forudsagt	
at forære	to give (as a gift)	V	4	forærer|forærede|foræret	
at fremkalde	to cause / develop (film)	V	4	fremkalder|fremkaldte|fremkaldt	
at fremme	to promote / further	V	2	fremmer|fremmede|fremmet	
at fremvise	to display / show	V	4	fremviser|fremviste|fremvist	
at fylde op	to fill up	V	1	fylder op|fyldte op|fyldt op	
at få ondt af	to feel sorry for	V	1	får ondt af|fik ondt af|fået ondt af	
at gemme sig	to hide (oneself)	V	1	gemmer sig|gemte sig|gemt sig	
at genbruge	to recycle / reuse	V	4	genbruger|genbrugte|genbrugt	
at gengive	to reproduce / render	V	4	gengiver|gengav|gengivet	
at genoplive	to revive	V	2	genopliver|genoplivede|genoplivet	
at genopbygge	to rebuild	V	4	genopbygger|genopbyggede|genopbygget	
at give efter	to give in	V	1	giver efter|gav efter|givet efter	
at give lov	to give permission	V	1	giver lov|gav lov|givet lov	
at give tilbage	to give back	V	1	giver tilbage|gav tilbage|givet tilbage	
at gløde	to glow	V	4	gløder|glødede|glødet	
at gnide	to rub	V	4	gnider|gned|gnedet	
at gro	to grow	V	4	gror|groede|groet	
at gruble	to brood / ponder	V	4	grubler|grublede|grublet	
at gruppere	to group	V	4	grupperer|grupperede|grupperet	
at gå af	to resign / go off	V	1	går af|gik af|gået af	
at gå forbi	to pass by	V	1	går forbi|gik forbi|gået forbi	
at gå i stykker	to break	V	1	går i stykker|gik i stykker|gået i stykker	
at gå ind	to go in	V	1	går ind|gik ind|gået ind	
at gå med til	to agree to	V	1	går med til|gik med til|gået med til	
at gå tabt	to be lost	V	1	går tabt|gik tabt|gået tabt	
at gå til	to go to (regularly) / perish	V	1	går til|gik til|gået til	
at gå væk	to go away	V	1	går væk|gik væk|gået væk	
at halte	to limp	V	4	halter|haltede|haltet	
at hjælpe til	to help out	V	1	hjælper til|hjalp til|hjulpet til	
at holde sig	to keep / stay	V	1	holder sig|holdt sig|holdt sig	
at holde tale	to give a speech	V	1	holder tale|holdt tale|holdt tale	
at hyle	to howl	V	4	hyler|hylede|hylet	
at hænge sammen	to make sense / be connected	V	2	hænger sammen|hang sammen|hængt sammen	
at høste	to harvest	V	4	høster|høstede|høstet	
at indlede	to begin / introduce	V	4	indleder|indledte|indledt	
at indsamle	to collect	V	4	indsamler|indsamlede|indsamlet	
at indsætte	to insert / deposit	V	3	indsætter|indsatte|indsat	
at inspirere	to inspire	V	3	inspirerer|inspirerede|inspireret	
at interviewe	to interview	V	3	interviewer|interviewede|interviewet	
at invadere	to invade	V	4	invaderer|invaderede|invaderet	
at jamre	to wail / whine	V	4	jamrer|jamrede|jamret	
at juble	to cheer	V	4	jubler|jublede|jublet	
at kigge efter	to look for	V	1	kigger efter|kiggede efter|kigget efter	
at kildre	to tickle	V	4	kildrer|kildrede|kildret	
at klippe	to cut (with scissors)	V	2	klipper|klippede|klippet	
at klynge sig	to cling	V	4	klynger sig|klyngede sig|klynget sig	
at knytte	to tie / connect	V	3	knytter|knyttede|knyttet	
at koge over	to boil over	V	4	koger over|kogte over|kogt over	
at kollidere	to collide	V	4	kolliderer|kolliderede|kollideret	
at komme ind	to come in	V	1	kommer ind|kom ind|kommet ind	
at komme ud	to come out / get out	V	1	kommer ud|kom ud|kommet ud	
at komme med	to come along / bring	V	1	kommer med|kom med|kommet med	
at komme over	to get over	V	1	kommer over|kom over|kommet over	
at komponere	to compose	V	4	komponerer|komponerede|komponeret	
at konstatere	to state / establish	V	4	konstaterer|konstaterede|konstateret	
at konstruere	to construct	V	4	konstruerer|konstruerede|konstrueret	
at korrigere	to correct	V	4	korrigerer|korrigerede|korrigeret	
at krybe	to creep / crawl	V	4	kryber|krøb|krøbet	
at kvittere	to acknowledge / sign for	V	4	kvitterer|kvitterede|kvitteret	
at kæle	to cuddle / pet	V	4	kæler|kælede|kælet	
at legalisere	to legalize	V	4	legaliserer|legaliserede|legaliseret	
at lindre	to relieve	V	4	lindrer|lindrede|lindret	
at lokalisere	to locate	V	4	lokaliserer|lokaliserede|lokaliseret	
at lyse op	to light up	V	1	lyser op|lyste op|lyst op	
at lytte til	to listen to	V	1	lytter til|lyttede til|lyttet til	
at lægge sig	to lie down	V	1	lægger sig|lagde sig|lagt sig	
at lægge fra sig	to put down	V	1	lægger fra sig|lagde fra sig|lagt fra sig	
at lække	to leak	V	1	lækker|lækkede|lækket	
at læne sig	to lean	V	4	læner sig|lænede sig|lænet sig	
at løbe væk	to run away	V	1	løber væk|løb væk|løbet væk	
at mase	to squeeze / push	V	4	maser|masede|maset	
at massere	to massage	V	3	masserer|masserede|masseret	
at melde sig	to sign up / volunteer	V	2	melder sig|meldte sig|meldt sig	
at mindske	to reduce	V	4	mindsker|mindskede|mindsket	
at moderere	to moderate	V	4	modererer|modererede|modereret	
at navngive	to name	V	4	navngiver|navngav|navngivet	
at nedlægge	to shut down / lay down	V	4	nedlægger|nedlagde|nedlagt	
at nedtone	to downplay	V	4	nedtoner|nedtonede|nedtonet	
at nøle	to hesitate	V	4	nøler|nølede|nølet	
at offentliggøre	to publish / make public	V	4	offentliggør|offentliggjorde|offentliggjort	
at ofre	to sacrifice	V	1	ofrer|ofrede|ofret	
at omdanne	to transform	V	4	omdanner|omdannede|omdannet	
at omringe	to surround	V	3	omringer|omringede|omringet	
at opdele	to divide	V	4	opdeler|opdelte|opdelt	
at opfordre	to urge / encourage	V	4	opfordrer|opfordrede|opfordret	
at opfatte	to perceive	V	4	opfatter|opfattede|opfattet	
at opgradere	to upgrade	V	3	opgraderer|opgraderede|opgraderet	
at opsige	to cancel / terminate	V	4	opsiger|opsagde|opsagt	
at opsummere	to summarize	V	4	opsummerer|opsummerede|opsummeret	
at opsætte	to set up	V	4	opsætter|opsatte|opsat	
at optimere	to optimize	V	4	optimerer|optimerede|optimeret	
at overdrage	to hand over / transfer	V	4	overdrager|overdrog|overdraget	
at overgå	to exceed / surpass	V	4	overgår|overgik|overgået	
at overholde	to comply with	V	4	overholder|overholdt|overholdt	
at overskride	to exceed	V	4	overskrider|overskred|overskredet	
at plukke	to pick	V	4	plukker|plukkede|plukket	
at praktisere	to practice	V	4	praktiserer|praktiserede|praktiseret	
at pynte	to decorate	V	3	pynter|pyntede|pyntet	
at pådrage sig	to incur / catch (an illness)	V	4	pådrager sig|pådrog sig|pådraget sig	
at påføre	to inflict / apply	V	4	påfører|påførte|påført	
at påtage sig	to take on	V	4	påtager sig|påtog sig|påtaget sig	
at påpege	to point out	V	4	påpeger|påpegede|påpeget	
at rasle	to rattle	V	4	rasler|raslede|raslet	
at redigere	to edit	V	4	redigerer|redigerede|redigeret	
at reducere	to reduce	V	4	reducerer|reducerede|reduceret	
at referere	to refer / report	V	4	refererer|refererede|refereret	
at reflektere	to reflect	V	4	reflekterer|reflekterede|reflekteret	
at rekruttere	to recruit	V	4	rekrutterer|rekrutterede|rekrutteret	
at restaurere	to restore	V	4	restaurerer|restaurerede|restaureret	
at ringe efter	to call for	V	1	ringer efter|ringede efter|ringet efter	
at rode	to rummage / mess up	V	3	roder|rodede|rodet	
at runde af	to round off	V	2	runder af|rundede af|rundet af	
at ryge	to smoke	V	1	ryger|røg|røget	
at rynke	to wrinkle / frown	V	4	rynker|rynkede|rynket	
at signere	to sign	V	4	signerer|signerede|signeret	
at simulere	to simulate	V	4	simulerer|simulerede|simuleret	
at sjuske	to be sloppy	V	4	sjusker|sjuskede|sjusket	
at skabe sig	to make a fuss	V	1	skaber sig|skabte sig|skabt sig	
at skele	to squint / glance	V	4	skeler|skelede|skelet	
at skifte ud	to replace	V	1	skifter ud|skiftede ud|skiftet ud	
at skildre	to depict	V	4	skildrer|skildrede|skildret	
at skræmme	to scare	V	2	skræmmer|skræmte|skræmt	
at skumme	to foam / skim	V	4	skummer|skummede|skummet	
at skylle	to rinse	V	4	skyller|skyllede|skyllet	
at skåne	to spare	V	4	skåner|skånede|skånet	
at slentre	to stroll	V	4	slentrer|slentrede|slentret	
at slibe	to sharpen / sand	V	4	sliber|sleb|slebet	
at slide	to wear out / toil	V	3	slider|sled|slidt	
at smuldre	to crumble	V	4	smuldrer|smuldrede|smuldret	
at snuble	to stumble	V	4	snubler|snublede|snublet	
at sortere	to sort	V	4	sorterer|sorterede|sorteret	
at spadsere	to stroll / walk	V	4	spadserer|spadserede|spadseret	
at spejle	to mirror	V	3	spejler|spejlede|spejlet	
at spilde tid	to waste time	V	2	spilder tid|spildte tid|spildt tid	
at sponsorere	to sponsor	V	4	sponsorerer|sponsorerede|sponsoreret	
at spøge	to joke	V	3	spøger|spøgte|spøgt	
at stabilisere	to stabilize	V	4	stabiliserer|stabiliserede|stabiliseret	
at stikke af	to run off	V	1	stikker af|stak af|stukket af	
at stramme	to tighten	V	3	strammer|strammede|strammet	
at strø	to sprinkle / scatter	V	4	strør|strøede|strøet	
at stønne	to groan	V	4	stønner|stønnede|stønnet	
at støve af	to dust	V	3	støver af|støvede af|støvet af	
at symbolisere	to symbolize	V	4	symboliserer|symboliserede|symboliseret	
at tage fat	to get to work / grab hold	V	1	tager fat|tog fat|taget fat	
at tage hjem	to go home	V	1	tager hjem|tog hjem|taget hjem	
at tage op	to pick up / take up	V	1	tager op|tog op|taget op	
at tage ud	to go out / take out	V	1	tager ud|tog ud|taget ud	
at tale sandt	to tell the truth	V	1	taler sandt|talte sandt|talt sandt	
at tilbede	to worship	V	4	tilbeder|tilbad|tilbedt	
at tildele	to assign / award	V	4	tildeler|tildelte|tildelt	
at tilpasse sig	to adapt	V	3	tilpasser sig|tilpassede sig|tilpasset sig	
at tilstræbe	to strive for	V	4	tilstræber|tilstræbte|tilstræbt	
at tolerere	to tolerate	V	4	tolererer|tolererede|tolereret	
at trodse	to defy	V	4	trodser|trodsede|trodset	
at træde tilbage	to step down / resign	V	2	træder tilbage|trådte tilbage|trådt tilbage	
at træffe en beslutning	to make a decision	V	2	træffer en beslutning|traf en beslutning|truffet en beslutning	
at tyde	to interpret	V	3	tyder|tydede|tydet	
at udbetale	to pay out	V	4	udbetaler|udbetalte|udbetalt	
at udelade	to leave out	V	4	udelader|udelod|udeladt	
at udgå	to be dropped / originate	V	4	udgår|udgik|udgået	
at udløbe	to expire	V	4	udløber|udløb|udløbet	
at udmærke sig	to excel	V	1	udmærker sig|udmærkede sig|udmærket sig	
at udsende	to broadcast / send out	V	4	udsender|udsendte|udsendt	
at udveksle	to exchange	V	4	udveksler|udvekslede|udvekslet	
at undertrykke	to suppress / oppress	V	4	undertrykker|undertrykte|undertrykt	
at vade	to wade	V	4	vader|vadede|vadet	
at variere	to vary	V	4	varierer|varierede|varieret	
at vaske sig	to wash (oneself)	V	2	vasker sig|vaskede sig|vasket sig	
at vedkende sig	to acknowledge	V	4	vedkender sig|vedkendte sig|vedkendt sig	
at vedrøre	to concern	V	4	vedrører|vedrørte|vedrørt	
at veksle	to exchange (money)	V	4	veksler|vekslede|vekslet	
at verificere	to verify	V	4	verificerer|verificerede|verificeret	
at værne om	to protect / safeguard	V	4	værner om|værnede om|værnet om	
at yde	to provide / perform	V	4	yder|ydede|ydet	
at ytre	to express / utter	V	4	ytrer|ytrede|ytret	
at æde	to eat (animals)	V	2	æder|åd|ædt	
at ændre sig	to change	V	1	ændrer sig|ændrede sig|ændret sig	
at øse	to scoop / pour	V	2	øser|øste|øst	
at angribe	to attack	V	1	angriber|angreb|angrebet	
at barbere	to shave	V	2	barberer|barberede|barberet	
at dø	to die	V	1	dør|døde|død	
at eksplodere	to explode	V	2	eksploderer|eksploderede|eksploderet	
at filme	to film	V	2	filmer|filmede|filmet	
at forlade	to leave	V	1	forlader|forlod|forladt	
at fortælle	to tell	V	1	fortæller|fortalte|fortalt	
at hedde	to be called	V	1	hedder|hed|heddet	
at lide	to suffer / like	V	1	lider|led|lidt	
at plyndre	to plunder / loot	V	2	plyndrer|plyndrede|plyndret	
at putte	to put	V	2	putter|puttede|puttet	
at rense	to clean	V	2	renser|rensede|renset	
at skille	to separate	V	1	skiller|skilte|skilt	
at slappe af	to relax	V	2	slapper af|slappede af|slappet af	
at sluge	to swallow	V	2	sluger|slugte|slugt	
at smelte	to melt	V	2	smelter|smeltede|smeltet	
at sparke	to kick	V	2	sparker|sparkede|sparket	
at sy	to sew	V	2	syr|syede|syet	
at tørre	to dry	V	2	tørrer|tørrede|tørret	
at være med	to take part / be in on it	V	1	er med|var med|været med	
at gå ned	to go down	V	1	går ned|gik ned|gået ned	
at gå op	to go up	V	1	går op|gik op|gået op	
at gå hjem	to go home	V	1	går hjem|gik hjem|gået hjem	
at gå rundt	to walk around	V	1	går rundt|gik rundt|gået rundt	
at gå igennem	to go through	V	1	går igennem|gik igennem|gået igennem	
at gå tilbage	to go back	V	1	går tilbage|gik tilbage|gået tilbage	
at komme hjem	to come home	V	1	kommer hjem|kom hjem|kommet hjem	
at komme forbi	to come by	V	1	kommer forbi|kom forbi|kommet forbi	
at komme op	to come up / get up	V	1	kommer op|kom op|kommet op	
at komme ned	to come down	V	1	kommer ned|kom ned|kommet ned	
at løbe ind i	to run into	V	1	løber ind i|løb ind i|løbet ind i	
at løbe efter	to run after	V	1	løber efter|løb efter|løbet efter	
at køre forbi	to drive past	V	1	kører forbi|kørte forbi|kørt forbi	
at køre hjem	to drive home	V	1	kører hjem|kørte hjem|kørt hjem	
at sætte på	to put on	V	1	sætter på|satte på|sat på	
at sætte ind	to put in / deposit	V	1	sætter ind|satte ind|sat ind	
at sætte i gang	to start / launch	V	1	sætter i gang|satte i gang|sat i gang	
at stille op	to line up / run (for office)	V	1	stiller op|stillede op|stillet op	
at tage af sted	to set off	V	1	tager af sted|tog af sted|taget af sted	
at tage fri	to take time off	V	1	tager fri|tog fri|taget fri	
at tage på ferie	to go on vacation	V	2	tager på ferie|tog på ferie|taget på ferie	
at tage et billede	to take a picture	V	1	tager et billede|tog et billede|taget et billede	
at give besked	to let someone know	V	1	giver besked|gav besked|givet besked	
at få besked	to be notified	V	1	får besked|fik besked|fået besked	
at få fri	to get off (work / school)	V	1	får fri|fik fri|fået fri	
at få travlt	to get busy	V	1	får travlt|fik travlt|fået travlt	
at få tid	to find time	V	1	får tid|fik tid|fået tid	
at få hjælp	to get help	V	1	får hjælp|fik hjælp|fået hjælp	
at få lyst til	to feel like	V	1	får lyst til|fik lyst til|fået lyst til	
at holde pause	to take a break	V	1	holder pause|holdt pause|holdt pause	
at holde ferie	to be on vacation	V	2	holder ferie|holdt ferie|holdt ferie	
at holde fest	to throw a party	V	1	holder fest|holdt fest|holdt fest	
at holde styr på	to keep track of	V	1	holder styr på|holdt styr på|holdt styr på	
at holde sig i form	to stay in shape	V	1	holder sig i form|holdt sig i form|holdt sig i form	
at holde op med	to stop doing	V	1	holder op med|holdt op med|holdt op med	
at lægge planer	to make plans	V	1	lægger planer|lagde planer|lagt planer	
at lave sjov	to joke around	V	1	laver sjov|lavede sjov|lavet sjov	
at lave lektier	to do homework	V	3	laver lektier|lavede lektier|lavet lektier	
at lave om	to change / redo	V	1	laver om|lavede om|lavet om	
at lave en fejl	to make a mistake	V	1	laver en fejl|lavede en fejl|lavet en fejl	
at gøre klar	to get ready	V	1	gør klar|gjorde klar|gjort klar	
at gøre færdig	to finish	V	1	gør færdig|gjorde færdig|gjort færdig	
at gøre indtryk	to make an impression	V	3	gør indtryk|gjorde indtryk|gjort indtryk	
at gøre noget ved	to do something about	V	1	gør noget ved|gjorde noget ved|gjort noget ved	
at se efter	to look for / check	V	1	ser efter|så efter|set efter	
at se op til	to look up to	V	1	ser op til|så op til|set op til	
at se ned på	to look down on	V	1	ser ned på|så ned på|set ned på	
at se bort fra	to disregard	V	2	ser bort fra|så bort fra|set bort fra	
at se tilbage	to look back	V	1	ser tilbage|så tilbage|set tilbage	
at høre om	to hear about	V	1	hører om|hørte om|hørt om	
at høre fra	to hear from	V	1	hører fra|hørte fra|hørt fra	
at tale med	to talk to	V	1	taler med|talte med|talt med	
at snakke om	to talk about	V	1	snakker om|snakkede om|snakket om	
at spørge om	to ask about	V	1	spørger om|spurgte om|spurgt om	
at svare igen	to talk back	V	1	svarer igen|svarede igen|svaret igen	
at skrive til	to write to	V	1	skriver til|skrev til|skrevet til	
at læse om	to read about	V	1	læser om|læste om|læst om	
at tænke sig om	to think carefully	V	1	tænker sig om|tænkte sig om|tænkt sig om	
at vente på	to wait for	V	1	venter på|ventede på|ventet på	
at passe til	to go with / suit	V	1	passer til|passede til|passet til	
at passe ind	to fit in	V	1	passer ind|passede ind|passet ind	
at ringe til	to call (someone)	V	1	ringer til|ringede til|ringet til	
at betale for	to pay for	V	1	betaler for|betalte for|betalt for	
at spare på	to save on	V	3	sparer på|sparede på|sparet på	
at stemme på	to vote for	V	1	stemmer på|stemte på|stemt på	
at kæmpe for	to fight for	V	1	kæmper for|kæmpede for|kæmpet for	
at arbejde med	to work with	V	1	arbejder med|arbejdede med|arbejdet med	
at arbejde på	to work on	V	1	arbejder på|arbejdede på|arbejdet på	
at interessere	to interest	V	1	interesserer|interesserede|interesseret	
at vænne sig af med	to get out of the habit of	V	3	vænner sig af med|vænnede sig af med|vænnet sig af med	
at melde afbud	to cancel (not attend)	V	4	melder afbud|meldte afbud|meldt afbud	
at melde sig syg	to call in sick	V	2	melder sig syg|meldte sig syg|meldt sig syg	
at sove længe	to sleep in	V	1	sover længe|sov længe|sovet længe	
at blive hjemme	to stay home	V	1	bliver hjemme|blev hjemme|blevet hjemme	
at blive væk	to stay away / go missing	V	1	bliver væk|blev væk|blevet væk	
at blive enige	to agree	V	2	bliver enige|blev enige|blevet enige	
at blive træt	to get tired	V	1	bliver træt|blev træt|blevet træt	
at blive bange	to get scared	V	1	bliver bange|blev bange|blevet bange	
at blive overrasket	to be surprised	V	2	bliver overrasket|blev overrasket|blevet overrasket	
at blive til	to become / turn into	V	1	bliver til|blev til|blevet til	
at ende med	to end up with	V	1	ender med|endte med|endt med	
at starte på	to start on	V	1	starter på|startede på|startet på	
at begynde på	to begin on	V	1	begynder på|begyndte på|begyndt på	
at fortsætte med	to continue with	V	1	fortsætter med|fortsatte med|fortsat med	
at hjælpe med	to help with	V	1	hjælper med|hjalp med|hjulpet med	
at lade som om	to pretend	V	1	lader som om|lod som om|ladet som om	
at være vild med	to be crazy about	V	1	er vild med|var vild med|været vild med	
at være træt af	to be tired of	V	1	er træt af|var træt af|været træt af	
at være i tvivl	to be in doubt	V	1	er i tvivl|var i tvivl|været i tvivl	
at være på vej	to be on one's way	V	1	er på vej|var på vej|været på vej	
at være væk	to be gone	V	1	er væk|var væk|været væk	
at være syg	to be sick	V	1	er syg|var syg|været syg	
at have det sjovt	to have fun	V	1	har det sjovt|havde det sjovt|haft det sjovt	
at have mulighed for	to have the opportunity to	V	1	har mulighed for|havde mulighed for|haft mulighed for	
at have tid til	to have time for	V	1	har tid til|havde tid til|haft tid til	
at have fødselsdag	to have a birthday	V	1	har fødselsdag|havde fødselsdag|haft fødselsdag	
at have ansvar for	to be responsible for	V	1	har ansvar for|havde ansvar for|haft ansvar for	
at have noget imod	to mind / object to	V	1	har noget imod|havde noget imod|haft noget imod	
at afkøle	to cool down	V	4	afkøler|afkølede|afkølet	
at afslå	to decline / refuse	V	4	afslår|afslog|afslået	
at afbøde	to mitigate	V	4	afbøder|afbødede|afbødet	
at afkræfte	to disprove	V	4	afkræfter|afkræftede|afkræftet	
at aflaste	to relieve (a burden)	V	4	aflaster|aflastede|aflastet	
at aflægge	to pay (a visit) / take (an oath)	V	4	aflægger|aflagde|aflagt	
at afmontere	to dismantle	V	4	afmonterer|afmonterede|afmonteret	
at afsætte	to set aside / sell	V	4	afsætter|afsatte|afsat	
at afværge	to avert	V	4	afværger|afværgede|afværget	
at anerkende	to recognize / acknowledge	V	4	anerkender|anerkendte|anerkendt	
at anlægge	to construct / file (a lawsuit)	V	4	anlægger|anlagde|anlagt	
at appellere	to appeal	V	4	appellerer|appellerede|appelleret	
at bagatellisere	to downplay	V	4	bagatelliserer|bagatelliserede|bagatelliseret	
at balancere	to balance	V	4	balancerer|balancerede|balanceret	
at bearbejde	to process / work on	V	4	bearbejder|bearbejdede|bearbejdet	
at bedømme	to judge / assess	V	4	bedømmer|bedømte|bedømt	
at begunstige	to favor	V	4	begunstiger|begunstigede|begunstiget	
at beherske	to master / control	V	4	behersker|beherskede|behersket	
at belære	to lecture (someone)	V	4	belærer|belærte|belært	
at berige	to enrich	V	4	beriger|berigede|beriget	
at beskadige	to damage	V	4	beskadiger|beskadigede|beskadiget	
at beslutte sig	to decide	V	2	beslutter sig|besluttede sig|besluttet sig	
at bestræbe sig	to strive	V	4	bestræber sig|bestræbte sig|bestræbt sig	
at betale tilbage	to pay back	V	1	betaler tilbage|betalte tilbage|betalt tilbage	
at betegne	to denote / describe	V	4	betegner|betegnede|betegnet	
at bevæge	to move	V	2	bevæger|bevægede|bevæget	
at bistå	to assist	V	4	bistår|bistod|bistået	
at blotlægge	to expose	V	4	blotlægger|blotlagde|blotlagt	
at brænde ud	to burn out	V	1	brænder ud|brændte ud|brændt ud	
at bygge på	to build on / add on	V	2	bygger på|byggede på|bygget på	
at dække over	to cover up	V	2	dækker over|dækkede over|dækket over	
at drage	to draw (a conclusion) / go	V	2	drager|drog|draget	
at efterkomme	to comply with	V	4	efterkommer|efterkom|efterkommet	
at efterspørge	to demand / ask for	V	4	efterspørger|efterspurgte|efterspurgt	
at engagere sig	to get involved	V	4	engagerer sig|engagerede sig|engageret sig	
at fastsætte	to fix / set	V	4	fastsætter|fastsatte|fastsat	
at forankre	to anchor	V	4	forankrer|forankrede|forankret	
at forbeholde	to reserve	V	4	forbeholder|forbeholdt|forbeholdt	
at fordoble	to double	V	4	fordobler|fordoblede|fordoblet	
at fordybe sig	to immerse oneself	V	4	fordyber sig|fordybede sig|fordybet sig	
at forenkle	to simplify	V	4	forenkler|forenklede|forenklet	
at forføre	to seduce	V	4	forfører|forførte|forført	
at forkorte	to shorten	V	4	forkorter|forkortede|forkortet	
at formidle	to convey / mediate	V	4	formidler|formidlede|formidlet	
at forpligte	to commit / oblige	V	4	forpligter|forpligtede|forpligtet	
at forskyde	to shift / postpone	V	4	forskyder|forskød|forskudt	
at forstærke	to reinforce	V	4	forstærker|forstærkede|forstærket	
at fortie	to conceal / keep quiet about	V	4	fortier|fortav|fortiet	
at fremkomme	to emerge / appear	V	4	fremkommer|fremkom|fremkommet	
at fremlægge	to present	V	4	fremlægger|fremlagde|fremlagt	
at fritage	to exempt	V	4	fritager|fritog|fritaget	
at fuldende	to complete	V	4	fuldender|fuldendte|fuldendt	
at genoverveje	to reconsider	V	4	genovervejer|genovervejede|genovervejet	
at gennemskue	to see through	V	4	gennemskuer|gennemskuede|gennemskuet	
at godtage	to accept	V	4	godtager|godtog|godtaget	
at harmonere	to harmonize	V	4	harmonerer|harmonerede|harmoneret	
at hævde sig	to assert oneself	V	3	hævder sig|hævdede sig|hævdet sig	
at iagttage	to observe	V	4	iagttager|iagttog|iagttaget	
at igangsætte	to initiate	V	4	igangsætter|igangsatte|igangsat	
at illustrere	to illustrate	V	4	illustrerer|illustrerede|illustreret	
at implementere	to implement	V	4	implementerer|implementerede|implementeret	
at indbyde	to invite	V	4	indbyder|indbød|indbudt	
at indfri	to fulfill / redeem	V	4	indfrier|indfriede|indfriet	
at indgive	to submit / file	V	4	indgiver|indgav|indgivet	
at indkøbe	to purchase	V	4	indkøber|indkøbte|indkøbt	
at indskrænke	to restrict	V	4	indskrænker|indskrænkede|indskrænket	
at indstille sig på	to prepare for / adjust to	V	4	indstiller sig på|indstillede sig på|indstillet sig på	
at intensivere	to intensify	V	4	intensiverer|intensiverede|intensiveret	
at isolere	to isolate / insulate	V	3	isolerer|isolerede|isoleret	
at kategorisere	to categorize	V	4	kategoriserer|kategoriserede|kategoriseret	
at klassificere	to classify	V	4	klassificerer|klassificerede|klassificeret	
at kompensere	to compensate	V	4	kompenserer|kompenserede|kompenseret	
at komplicere	to complicate	V	2	komplicerer|komplicerede|kompliceret	
at koordinere	to coordinate	V	4	koordinerer|koordinerede|koordineret	
at kortlægge	to map	V	4	kortlægger|kortlagde|kortlagt	
at kvalificere	to qualify	V	4	kvalificerer|kvalificerede|kvalificeret	
at legitimere	to legitimize / show ID	V	4	legitimerer|legitimerede|legitimeret	
at lempe	to ease / relax (rules)	V	4	lemper|lempede|lempet	
at lovgive	to legislate	V	4	lovgiver|lovgav|lovgivet	
at modbevise	to disprove	V	4	modbeviser|modbeviste|modbevist	
at modvirke	to counteract	V	4	modvirker|modvirkede|modvirket	
at nedbryde	to break down	V	4	nedbryder|nedbrød|nedbrudt	
at nedkæmpe	to defeat / suppress	V	4	nedkæmper|nedkæmpede|nedkæmpet	
at omformulere	to rephrase	V	4	omformulerer|omformulerede|omformuleret	
at omgå	to bypass / get around	V	4	omgår|omgik|omgået	
at omstrukturere	to restructure	V	4	omstrukturerer|omstrukturerede|omstruktureret	
at opfange	to pick up / catch	V	4	opfanger|opfangede|opfanget	
at opgøre	to calculate / settle	V	4	opgør|opgjorde|opgjort	
at ophæve	to repeal / lift	V	4	ophæver|ophævede|ophævet	
at oplære	to train	V	4	oplærer|oplærte|oplært	
at opprioritere	to prioritize higher	V	4	opprioriterer|opprioriterede|opprioriteret	
at optrappe	to escalate	V	4	optrapper|optrappede|optrappet	
at overkomme	to overcome / manage	V	4	overkommer|overkom|overkommet	
at overrække	to hand over / present	V	4	overrækker|overrakte|overrakt	
at overskue	to get an overview of	V	4	overskuer|overskuede|overskuet	
at overtræde	to violate	V	4	overtræder|overtrådte|overtrådt	
at pålægge	to impose	V	4	pålægger|pålagde|pålagt	
at påberåbe sig	to invoke	V	4	påberåber sig|påberåbte sig|påberåbt sig	
at rationalisere	to rationalize	V	4	rationaliserer|rationaliserede|rationaliseret	
at rehabilitere	to rehabilitate	V	4	rehabiliterer|rehabiliterede|rehabiliteret	
at respondere	to respond	V	4	responderer|responderede|responderet	
at rådføre sig	to consult	V	4	rådfører sig|rådførte sig|rådført sig	
at sammenkalde	to convene	V	4	sammenkalder|sammenkaldte|sammenkaldt	
at skærpe	to sharpen / tighten	V	4	skærper|skærpede|skærpet	
at slå igennem	to break through	V	1	slår igennem|slog igennem|slået igennem	
at slå ud	to knock out	V	1	slår ud|slog ud|slået ud	
at specialisere sig	to specialize	V	4	specialiserer sig|specialiserede sig|specialiseret sig	
at stadfæste	to confirm / uphold	V	4	stadfæster|stadfæstede|stadfæstet	
at stimulere	to stimulate	V	4	stimulerer|stimulerede|stimuleret	
at stræbe	to strive	V	4	stræber|stræbte|stræbt	
at supplere	to supplement	V	4	supplerer|supplerede|suppleret	
at søge efter	to search for	V	2	søger efter|søgte efter|søgt efter	
at tilbagekalde	to recall / revoke	V	4	tilbagekalder|tilbagekaldte|tilbagekaldt	
at tilbagevise	to refute	V	4	tilbageviser|tilbageviste|tilbagevist	
at tilskynde	to encourage	V	4	tilskynder|tilskyndede|tilskyndet	
at tilsidesætte	to disregard / override	V	4	tilsidesætter|tilsidesatte|tilsidesat	
at transportere	to transport	V	4	transporterer|transporterede|transporteret	
at tvivle på	to doubt	V	2	tvivler på|tvivlede på|tvivlet på	
at udbygge	to expand / extend	V	4	udbygger|udbyggede|udbygget	
at udfase	to phase out	V	4	udfaser|udfasede|udfaset	
at udforme	to design / draft	V	4	udformer|udformede|udformet	
at udgrave	to excavate	V	4	udgraver|udgravede|udgravet	
at udstede	to issue	V	4	udsteder|udstedte|udstedt	
at udstille	to exhibit	V	4	udstiller|udstillede|udstillet	
at udvælge	to select	V	3	udvælger|udvalgte|udvalgt	
at underholde	to entertain	V	4	underholder|underholdt|underholdt	
at underkaste sig	to submit to	V	4	underkaster sig|underkastede sig|underkastet sig	
at underminere	to undermine	V	4	underminerer|underminerede|undermineret	
at vende sig	to turn around	V	1	vender sig|vendte sig|vendt sig	
at videreføre	to continue	V	4	viderefører|videreførte|videreført	
at videregive	to pass on	V	4	videregiver|videregav|videregivet	
at visualisere	to visualize	V	4	visualiserer|visualiserede|visualiseret	
at ændre på	to change (something)	V	1	ændrer på|ændrede på|ændret på	
et hus	a house	N	1		
en bil	a car	N	1		
en by	a town	N	1		
et land	a country	N	1		
en verden	a world	N	1		
en gade	a street	N	1		
en vej	a road	N	1		
et hjem	a home	N	1		
en dør	a door	N	1		
et vindue	a window	N	1		
et bord	a table	N	1		
en stol	a chair	N	1		
en seng	a bed	N	1		
et skab	a cupboard	N	1		
et gulv	a floor	N	1		
et loft	a ceiling / attic	N	2		
en væg	a wall	N	2		
et tag	a roof	N	1		
en have	a garden	N	1		
en skov	a forest	N	1		
en sø	a lake	N	1		
et hav	a sea	N	1		
en strand	a beach	N	2		
et bjerg	a mountain	N	2		
en bro	a bridge	N	2		
en park	a park	N	2		
en butik	a shop	N	2		
et marked	a market	N	3		
et kontor	an office	N	1		
en skole	a school	N	1		
et universitet	a university	N	2		
et sygehus	a hospital	N	3		
en kirke	a church	N	2		
et museum	a museum	N	2		
et bibliotek	a library	N	2		
en restaurant	a restaurant	N	2		
en café	a café	N	3		
et hotel	a hotel	N	1		
en lufthavn	an airport	N	2		
en station	a station	N	2		
et tog	a train	N	1		
en bus	a bus	N	2		
et fly	a plane	N	1		
et skib	a ship	N	1		
en cykel	a bicycle	N	2		
penge	money	N	1		
en krone	a crown (currency)	N	2		
en regning	a bill	N	2		
en pris	a price	N	1		
en tid	a time	N	1		
en dag	a day	N	1		
en uge	a week	N	1		
en måned	a month	N	1		
et år	a year	N	1		
en time	an hour	N	1		
et minut	a minute	N	1		
et sekund	a second	N	1		
en morgen	a morning	N	1		
en aften	an evening	N	1		
en nat	a night	N	1		
en sommer	a summer	N	2		
en vinter	a winter	N	2		
et forår	a spring	N	2		
et efterår	an autumn	N	2		
vejr	weather	N	2		
en sol	a sun	N	1		
en måne	a moon	N	2		
en stjerne	a star	N	2		
en himmel	a sky	N	2		
en sky	a cloud	N	2		
regn	rain	N	2		
sne	snow	N	2		
vind	wind	N	1		en
luft	air	N	1		
vand	water	N	1		
ild	fire	N	1		
jord	earth / soil	N	1		
en sten	a stone	N	1		
et træ	a tree / wood	N	1		
en blomst	a flower	N	2		
græs	grass	N	2		
et dyr	an animal	N	1		
en hund	a dog	N	1		
en kat	a cat	N	1		
en fugl	a bird	N	2		
en fisk	a fish	N	1		
en hest	a horse	N	1		
en ko	a cow	N	2		
en gris	a pig	N	2		
et får	a sheep	N	1		
en mus	a mouse	N	2		
et navn	a name	N	1		
et ord	a word	N	1		
et sprog	a language	N	2		
en bog	a book	N	1		
en avis	a newspaper	N	2		
et blad	a magazine	N	2		
et brev	a letter	N	1		
en historie	a story / history	N	1		
en idé	an idea	N	1		
et spørgsmål	a question	N	1		
et svar	an answer	N	1		
et problem	a problem	N	1		
en løsning	a solution	N	2		
en grund	a reason	N	1		
en måde	a way / manner	N	1		
et sted	a place	N	1		
en retning	a direction	N	2		
en side	a page / side	N	1		
en del	a part	N	1		
et stykke	a piece	N	1		
en ting	a thing	N	1		
en sag	a matter / case	N	1		
en person	a person	N	1		
et menneske	a human being	N	1		
et folk	a people	N	1		
et samfund	a society	N	3		
en regering	a government	N	2		
en politik	a policy	N	2		
en lov	a law	N	1		
en ret	a right / dish	N	1		
et job	a job	N	1		
et firma	a company	N	2		
en virksomhed	a business	N	2		
en chef	a boss	N	1		
en kollega	a colleague	N	2		
et møde	a meeting	N	1		
en aftale	an appointment / agreement	N	1		
en plan	a plan	N	1		
et mål	a goal	N	1		
en drøm	a dream	N	1		
håb	hope	N	1		et
frygt	fear	N	1		en
glæde	joy	N	1		en
sorg	sorrow / grief	N	2		en
kærlighed	love	N	1		en
et venskab	a friendship	N	3		
en familie	a family	N	1		
en ven	a friend	N	1		
en fjende	an enemy	N	2		
en gæst	a guest	N	2		
en nabo	a neighbor	N	3		
en fremmed	a stranger	N	2		
et arbejde	a job / work	N	1		
en arbejdsgiver	an employer	N	4		
en ekspert	an expert	N	3		
en amatør	an amateur	N	4		
en begynder	a beginner	N	1		
en veteran	a veteran	N	4		
en repræsentant	a representative	N	4		
en talsperson	a spokesperson	N	4		
en deltager	a participant	N	3		
en tilhænger	a supporter	N	4		
en kritiker	a critic	N	4		
en beundrer	an admirer	N	3		
en autoritet	an authority	N	3		
en myndighed	an authority/agency	N	4		
en embedsmand	a civil servant	N	4		
en iværksætter	an entrepreneur	N	4		
en ejer	an owner	N	1		
et par	a couple / a pair	N	1		
en chance	a chance	N	1		
en plads	a place / room / square	N	1		
en rest	a remainder / leftover	N	1		
et nummer	a number	N	1		
en masse	a lot / a mass	N	1		
en kæmpe	a giant	N	1		
en tjeneste	a favor / service	N	1		
et spor	a track / trace / clue	N	1		
en stemme	a voice / vote	N	1		
en kontakt	a contact / switch	N	1		
et tegn	a sign	N	1		
adgang	access / entry	N	1		en
et hul	a hole	N	1		
en form	a form / shape	N	1		
en kontrol	a control / check	N	1		
et tilfælde	a case / coincidence	N	1		
en oplysning	a piece of information	N	1		
et skud	a shot	N	3		
et område	an area	N	1		
et skridt	a step	N	1		
en situation	a situation	N	1		
et uheld	an accident / bad luck	N	1		
en mester	a master / champion	N	3		
en mission	a mission	N	2		
et slag	a blow / battle	N	2		
ballade	trouble / fuss	N	1		en
et skilt	a sign (board)	N	2		
en type	a type / guy	N	1		
et bud	an offer / bid / command	N	2		
et system	a system	N	2		
information	information	N	2		en
en flok	a flock / crowd	N	2		
et bånd	a band / ribbon / tape / bond	N	2		
en omgang	a round / lap	N	2		
en tilstand	a condition / state	N	2		
en kugle	a bullet / ball	N	2		
udstyr	equipment	N	2		et
beskyttelse	protection	N	2		en
en advarsel	a warning	N	2		
en bund	a bottom	N	2		
en service	a service	N	2		
en kilde	a source / spring	N	2		
et brud	a break / breach	N	2		
et punkt	a point (spot)	N	2		
en model	a model	N	2		
en lyd	a sound	N	1		
en status	a status	N	3		
en knibe	a fix / tight spot	N	3		
et trin	a step	N	3		
en dækning	a cover / coverage	N	3		
en katastrofe	a disaster	N	3		
en bevægelse	a movement	N	3		
et væsen	a creature / being	N	3		
en favorit	a favorite	N	3		
udkig	lookout	N	2		et
en sæk	a sack	N	3		
en base	a base	N	3		
et materiale	a material	N	3		
et middel	a means / remedy	N	3		
et tip	a tip	N	3		
en lugt	a smell	N	1		
et bind	a volume / bandage	N	3		
en baggrund	a background	N	3		
et metal	a metal	N	3		
en eksplosion	an explosion	N	3		
et skrig	a scream	N	3		
besvær	trouble / hassle	N	2		et
stilhed	silence	N	2		en
larm	noise	N	2		en
et stød	a shock / jolt	N	3		
et symbol	a symbol	N	3		
en zone	a zone	N	3		
et lag	a layer	N	1		
en forsyning	a supply	N	3		
en kiste	a chest / coffin	N	3		
en ændring	a change	N	3		
en pil	an arrow / willow	N	3		
et varsel	a notice / warning	N	3		
et reb	a rope	N	3		
en rækkevidde	a range / reach	N	3		
jern	iron	N	2		et
en belønning	a reward	N	3		
en plade	a plate / record	N	3		
et slagsmål	a fight	N	3		
en proces	a process	N	3		
et glimt	a glimpse / gleam	N	3		
en snor	a string / cord	N	3		
en begivenhed	an event	N	3		
en besiddelse	a possession	N	3		
et knep	a trick	N	3		
en titel	a title	N	3		
en mine	a mine / facial expression	N	1		
en bagside	a back / downside	N	3		
vedkommende	the person concerned	N	3		
en blanding	a mixture	N	3		
et udbrud	an outbreak / outburst	N	3		
en hændelse	an incident	N	3		
en gift	a poison	N	1		
en pind	a stick	N	3		
en sektion	a section	N	3		
en kvalitet	a quality	N	3		
assistance	assistance	N	2		en
støj	noise	N	2		en
en spids	a tip / point	N	3		
en nål	a needle	N	3		
et vilkår	a condition / term	N	3		
en prik	a dot	N	3		
et bidrag	a contribution	N	3		
en genstand	an object	N	3		
en figur	a figure	N	3		
en væske	a liquid / fluid	N	3		
bly	lead (metal)	N	2		et
et fodspor	a footprint	N	3		
et snit	a cut / average	N	3		
et anlæg	a facility / plant / stereo	N	3		
en dusør	a reward (bounty)	N	3		
design	design	N	2		et
et felt	a field	N	3		
ly	shelter	N	1		et
en streg	a line / stroke	N	3		
en kerne	a core / kernel / seed	N	3		
en kombination	a combination	N	3		
en lænke	a chain	N	4		
en krog	a hook / corner	N	3		
en godkendelse	an approval	N	3		
en praksis	a practice	N	4		
en overflade	a surface	N	3		
en procedure	a procedure	N	4		
tømmer	timber	N	2		et
en åbning	an opening	N	4		
et fund	a find / discovery	N	1		
småting	small things / trifles	N	4		pl
opsyn	supervision	N	2		et
en kæde	a chain	N	4		
en anbefaling	a recommendation	N	4		
plastik	plastic	N	2		en
et brag	a bang / crash	N	2		
en fælde	a trap	N	2		
en kuvert	an envelope	N	4		
et frimærke	a stamp	N	4		
et postkort	a postcard	N	4		
en notesbog	a notebook	N	4		
en tusch	a marker	N	4		
tape	tape	N	2		en
lim	glue	N	2		en
en elastik	a rubber band	N	4		
en nøglering	a key ring	N	4		
en lommelygte	a flashlight	N	4		
en tændstik	a match	N	3		
en lighter	a lighter	N	4		
et askebæger	an ashtray	N	4		
en balje	a tub	N	4		
en tønde	a barrel	N	2		
en plastikpose	a plastic bag	N	4		
en mulepose	a tote bag	N	4		
en dukke	a doll	N	2		
en klods	a block (toy) / brick	N	4		
en ballon	a balloon	N	4		
en gynge	a swing	N	4		
en rutsjebane	a slide / roller coaster	N	4		
en sandkasse	a sandbox	N	4		
en barnevogn	a baby carriage / stroller	N	4		
en klapvogn	a stroller	N	4		
en ble	a diaper	N	4		
en sut	a pacifier	N	3		
en sutteflaske	a baby bottle	N	4		
en hagesmæk	a bib	N	4		
en autostol	a car seat	N	4		
en cykellås	a bike lock	N	4		
en cykelpumpe	a bike pump	N	4		
en punktering	a flat tire / puncture	N	4		
en lygte	a light / lamp (bike, street)	N	4		
en gadelygte	a streetlight	N	4		
en kantsten	a curb	N	4		
et højhus	a high-rise	N	4		
en skyskraber	a skyscraper	N	4		
en boligblok	an apartment block	N	4		
en fabrik	a factory	N	2		
et værksted	a workshop / garage	N	2		
en gård	a farm / courtyard	N	2		
en baggård	a backyard	N	4		
en lade	a barn	N	1		
en traktor	a tractor	N	4		
en mølle	a mill	N	4		
et fyrtårn	a lighthouse	N	4		
en kaj	a quay / dock	N	4		
en mole	a pier	N	4		
en robåd	a rowboat	N	4		
en sejlbåd	a sailboat	N	4		
en kano	a canoe	N	3		
et anker	an anchor	N	4		
en redningsvest	a life jacket	N	4		
en maskine	a machine	N	2		
et apparat	a device / appliance	N	4		
et stik	a plug / sting	N	2		
en sikring	a fuse	N	4		
en måler	a meter / gauge	N	4		
et termometer	a thermometer	N	4		
en kikkert	a pair of binoculars	N	4		
en lup	a magnifying glass	N	4		
en globus	a globe	N	4		
en rulletrappe	an escalator	N	4		
en ende	an end	N	1		
en inderside	an inside	N	4		
en yderside	an outside	N	4		
en række	a row / series	N	2		
en bunke	a pile	N	3		
en stak	a stack	N	1		
en klump	a lump	N	4		
en oversigt	an overview	N	4		
en tabel	a table (chart)	N	4		
et diagram	a chart / diagram	N	4		
en plet	a stain / spot	N	2		
en revne	a crack	N	4		
en ridse	a scratch	N	4		
en bule	a dent / bump	N	4		
en fold	a fold	N	4		
en knude	a knot	N	4		
en løkke	a loop	N	4		
en spiral	a spiral	N	4		
et ekko	an echo	N	4		
en stank	a stench	N	3		
mørke	darkness	N	1		et
damp	steam	N	3		en
røg	smoke	N	1		en
en gnist	a spark	N	4		
en nødudgang	an emergency exit	N	4		
en brandalarm	a fire alarm	N	4		
en brandslukker	a fire extinguisher	N	4		
førstehjælp	first aid	N	3		en
et alarmnummer	an emergency number	N	4		
et center	a center	N	2		
en gruppe	a group	N	1		
guld	gold	N	1		et
hjælp	help	N	1		en
et pulver	a powder	N	2		
et råd	a piece of advice	N	1		
en byggeplads	a construction site	N	4		
en kran	a crane	N	4		
et stillads	a scaffolding	N	4		
en gravko	an excavator	N	4		
en alarmklokke	an alarm bell	N	4		
stor	big	A	1		
lille	small	A	1		
lang	long	A	1		
kort	short	A	1		
høj	tall / high	A	1		
lav	low	A	1		
tyk	thick / fat	A	2		
tynd	thin	A	3		
bred	wide	A	4		
smal	narrow	A	4		
dyb	deep	A	2		
ny	new	A	1		
gammel	old	A	1		
ung	young	A	1		
god	good	A	1		
dårlig	bad	A	1		
rigtig	correct / real	A	1		
forkert	wrong	A	1		
let	easy / light	A	1		
svær	difficult	A	2		
tung	heavy	A	3		
hurtig	fast	A	1		
langsom	slow	A	2		
varm	warm	A	1		
kold	cold	A	2		
tør	dry	A	1		
våd	wet	A	2		
ren	clean	A	1		
beskidt	dirty	A	2		
smuk	beautiful	A	1		
grim	ugly	A	2		
pæn	nice / neat	A	2		
sød	sweet / cute	A	1		
sur	sour / grumpy	A	1		
bitter	bitter	A	3		
rig	rich	A	2		
fattig	poor	A	2		
dyr	expensive	A	1		
billig	cheap	A	3		
fri	free	A	1		
optaget	busy / occupied	A	1		
træt	tired	A	1		
vågen	awake	A	2		
sulten	hungry	A	1		
tørstig	thirsty	A	2		
mæt	full / satisfied	A	2		
syg	sick	A	1		
rask	healthy / recovered	A	2		
stærk	strong	A	1		
svag	weak	A	2		
glad	happy	A	1		
ked af det	sad	A	1		
vred	angry	A	1		
bange	afraid	A	1		
nervøs	nervous	A	1		
rolig	calm	A	1		
stille	quiet	A	1		
højlydt	loud	A	4		
venlig	kind / friendly	A	1		
uhøflig	rude	A	4		
ærlig	honest	A	1		
utrolig	unbelievable	A	2		
sikker	sure / safe	A	1		
usikker	unsure	A	3		
vigtig	important	A	1		
interessant	interesting	A	1		
kedelig	boring	A	2		
sjov	fun	A	1		
morsom	funny / amusing	A	3		
alvorlig	serious	A	2		
enkel	simple	A	3		
kompliceret	complicated	A	2		
klar	ready / clear	A	1		
færdig	finished / done	A	1		
åben	open	A	1		
lukket	closed	A	1		
tom	empty	A	1		
fuld	full	A	1		
mørk	dark	A	2		
lys	light / bright	A	1		
farverig	colorful	A	4		
hvid	white	A	1		
sort	black	A	1		
rød	red	A	1		
blå	blue	A	1		
grøn	green	A	2		
gul	yellow	A	2		
grå	gray	A	2		
brun	brown	A	2		
lige	straight / equal	A	1		
skæv	crooked	A	3		
flot	handsome / nice-looking	A	1		
fantastisk	fantastic	A	1		
forfærdelig	terrible	A	2		
heldig	lucky	A	1		
uheldig	unlucky	A	3		
populær	popular	A	3		
berømt	famous	A	2		
ukendt	unknown	A	2		
speciel	special	A	2		
normal	normal	A	2		
mærkelig	strange	A	3		
typisk	typical	A	2		
muligt	possible	A	1		
umuligt	impossible	A	1		
nødvendig	necessary	A	3		
passende	suitable	A	2		
praktisk	practical	A	3		
moderne	modern	A	2		
gammeldags	old-fashioned	A	2		
orange	orange	A	2		
lilla	purple	A	3		
lyserød	pink	A	4		
lyseblå	light blue	A	4		
mørkeblå	dark blue	A	4		
rund	round	A	4		
firkantet	square-shaped	A	4		
stribet	striped	A	4		
ternet	checkered / plaid	A	4		
ensfarvet	solid-colored	A	4		
betydelig	significant	A	4		
tilstrækkelig	sufficient	A	4		
upassende	inappropriate	A	3		
rimelig	reasonable	A	3		
urimelig	unreasonable	A	4		
effektiv	efficient	A	3		
ineffektiv	inefficient	A	4		
kompleks	complex	A	4		
tydelig	clear	A	4		
utydelig	unclear	A	4		
konkret	concrete	A	4		
abstrakt	abstract	A	4		
åbenlys	obvious	A	4		
uundgåelig	inevitable	A	4		
afgørende	decisive	A	3		
unødvendig	unnecessary	A	4		
frivillig	voluntary	A	3		
obligatorisk	mandatory	A	4		
midlertidig	temporary	A	3		
permanent	permanent	A	3		
konstant	constant	A	2		
stabil	stable	A	3		
ustabil	unstable	A	3		
tålmodig	patient	A	3		
utålmodig	impatient	A	4		
uærlig	dishonest	A	4		
mistænksom	suspicious	A	4		
naiv	naive	A	3		
fordomsfri	unbiased	A	4		
fordomsfuld	prejudiced	A	4		
solid	solid	A	4		
skrøbelig	fragile	A	4		
holdbar	durable	A	4		
slidt	worn	A	3		
intakt	intact	A	3		
beskadiget	damaged	A	4		
defekt	defective	A	4		
fejlfri	flawless	A	4		
original	original	A	3		
ægte	genuine	A	1		
falsk	fake	A	2		
autentisk	authentic	A	4		
tidssvarende	up to date	A	4		
forældet	outdated	A	4		
upopulær	unpopular	A	4		
almindelig	ordinary	A	2		
usædvanlig	unusual	A	3		
ekstraordinær	extraordinary	A	4		
bemærkelsesværdig	remarkable	A	4		
ubetydelig	insignificant	A	4		
relevant	relevant	A	3		
irrelevant	irrelevant	A	4		
hel	whole / entire	A	1		
samme	same	A	1		
tæt	close / tight	A	1		
død	dead	A	1		
egen	own	A	1		
dum	stupid	A	1		
rar	nice / kind	A	2		
tidlig	early	A	2		
værre	worse	A	1		
værd	worth	A	1		
kær	dear	A	3		
anderledes	different	A	1		
travl	busy	A	3		
skidt	bad / crappy	A	1		
skør	crazy	A	1		
gal	mad / crazy / wrong	A	1		
fed	fat / cool	A	1		
levende	alive / living	A	1		
ødelagt	broken / ruined	A	1		
løs	loose	A	1		
forskellig	different	A	2		
enig	in agreement	A	1		
interesseret	interested	A	1		
særlig	special / particular	A	1		
såret	hurt / wounded	A	1		
parat	ready	A	1		
dygtig	skilled / capable	A	1		
smart	smart	A	1		
fyldt	full / filled	A	1		
ældre	older / elderly	A	1		
sindssyg	insane	A	3		
sej	tough / cool	A	2		
frisk	fresh	A	1		
korrekt	correct	A	1		
skyldig	guilty	A	2		
uskyldig	innocent	A	2		
lokal	local	A	3		
privat	private	A	2		
tosset	silly / crazy	A	2		
tilfreds	satisfied / content	A	2		
involveret	involved	A	2		
forvirret	confused	A	2		
blind	blind	A	2		
fælles	common / shared	A	2		
sexet	sexy	A	2		
imponerende	impressive	A	2		
latterlig	ridiculous	A	3		
personlig	personal	A	3		
uskadt	unhurt	A	2		
vidunderlig	wonderful	A	2		
nøgen	naked	A	2		
ligegyldig	indifferent / unimportant	A	4		
teknisk	technical	A	2		
hemmelig	secret	A	2		
frygtelig	terrible	A	2		
romantisk	romantic	A	2		
flink	kind / nice	A	2		
villig	willing	A	2		
indre	inner	A	2		
mistænkt	suspected	A	2		
glimrende	excellent	A	2		
officiel	official	A	4		
yngre	younger	A	2		
stakkels	poor (pitiful)	A	1		
fysisk	physical	A	2		
professionel	professional	A	2		
simpel	simple	A	3		
strålende	brilliant / radiant	A	3		
udsat	exposed / postponed	A	3		
menneskelig	human	A	3		
fjollet	silly	A	3		
elendig	miserable / terrible	A	3		
bevæbnet	armed	A	3		
kriminel	criminal	A	3		
sædvanlig	usual	A	3		
ordentlig	proper / decent	A	3		
modsat	opposite	A	3		
ulækker	disgusting	A	4		
magisk	magical	A	3		
ældst	oldest	A	4		
fortabt	lost	A	3		
blød	soft	A	3		
kommende	upcoming / future	A	3		
naturlig	natural	A	3		
klam	gross / clammy	A	3		
nuværende	current / present	A	3		
civil	civilian / civil	A	3		
central	central	A	3		
nøjagtig	exact / accurate	A	3		
aktiv	active	A	3		
nyttig	useful	A	3		
siddende	sitting / seated	A	3		
uhyggelig	creepy / scary	A	3		
genial	brilliant	A	3		
følgende	following	A	3		
mystisk	mysterious	A	3		
afhængig	dependent / addicted	A	3		
total	total	A	3		
fascinerende	fascinating	A	3		
enorm	enormous	A	3		
enestående	unique / outstanding	A	3		
kvik	quick / bright	A	3		
ædru	sober	A	3		
komplet	complete	A	3		
evig	eternal	A	3		
flad	flat	A	3		
opmærksom	attentive / aware	A	3		
manglende	missing / lacking	A	3		
overraskende	surprising	A	3		
intelligent	intelligent	A	3		
ydre	outer / exterior	A	3		
offentlig	public	A	3		
storartet	magnificent	A	3		
afdød	deceased	A	4		
negativ	negative	A	3		
diskret	discreet	A	3		
åndssvag	idiotic	A	3		
tragisk	tragic	A	3		
nuttet	cute	A	3		
mægtig	mighty / powerful	A	3		
spærret	blocked / closed	A	3		
ledig	vacant / available / unemployed	A	3		
usynlig	invisible	A	3		
retfærdig	fair / just	A	3		
positiv	positive	A	3		
sandsynlig	probable / likely	A	4		
gylden	golden	A	4		
uventet	unexpected	A	3		
indviklet	complicated	A	3		
voldsom	violent / intense	A	3		
risikabel	risky	A	4		
overordnet	superior / overall	A	4		
værdig	worthy / dignified	A	3		
registreret	registered	A	3		
dødelig	deadly / mortal	A	3		
voldelig	violent	A	3		
oprindelig	original	A	4		
overbevisende	convincing	A	3		
uenig	in disagreement	A	3		
begrænset	limited	A	3		
udelukket	ruled out / excluded	A	3		
ironisk	ironic	A	3		
stiv	stiff	A	3		
pragtfuld	splendid	A	3		
lovende	promising	A	3		
standard	standard	A	3		
ubehagelig	unpleasant	A	4		
omgivet	surrounded	A	3		
bevidst	conscious / deliberate	A	3		
forrige	previous / last	A	3		
behagelig	comfortable / pleasant	A	4		
forgiftet	poisoned	A	3		
absurd	absurd	A	3		
adskilt	separated	A	3		
skarp	sharp	A	3		
grov	coarse / rude / gross	A	3		
stram	tight	A	3		
ynkelig	pathetic	A	3		
barsk	harsh	A	3		
værdifuld	valuable	A	3		
global	global	A	3		
forvirrende	confusing	A	3		
æret	honored / dear	A	4		
elegant	elegant	A	3		
kritisk	critical	A	3		
informeret	informed	A	3		
dramatisk	dramatic	A	3		
kraftig	strong / powerful / heavy	A	3		
yngst	youngest	A	4		
køn	pretty / sex (gender)	A	2		
misforstået	misunderstood	A	3		
forbløffende	astonishing	A	3		
avanceret	advanced	A	3		
magtfuld	powerful	A	3		
fremtidig	future	A	4		
indlysende	obvious	A	3		
isoleret	isolated	A	3		
vanskelig	difficult	A	3		
unik	unique	A	3		
såkaldt	so-called	A	4		
sølle	measly / pathetic	A	3		
placeret	placed / located	A	3		
foruroligende	disturbing / alarming	A	3		
ufattelig	incredible / inconceivable	A	4		
meningsløs	meaningless	A	4		
fuldført	completed	A	3		
grundlæggende	basic / fundamentally	A	3		
tavs	silent	A	3		
pervers	perverted	A	4		
plat	vulgar / cheesy	A	3		
storslået	grand / magnificent	A	3		
tiltrækkende	attractive	A	3		
intern	internal	A	4		
blokeret	blocked	A	3		
uvidende	ignorant / unaware	A	3		
forståelig	understandable	A	4		
stinkende	stinking	A	3		
ultimativ	ultimate	A	4		
øjeblikkelig	immediate	A	3		
ubevæbnet	unarmed	A	3		
snu	cunning	A	3		
suspenderet	suspended	A	3		
sløret	blurred / veiled	A	3		
overvældende	overwhelming	A	3		
fuldkommen	perfect / completely	A	3		
omfattende	extensive	A	3		
fortrolig	confidential / familiar	A	4		
pudsig	funny / odd	A	4		
daglig	daily	A	4		
dødbringende	deadly	A	3		
tåbelig	foolish	A	4		
reserveret	reserved	A	3		
dyrebar	precious	A	4		
beruset	drunk / intoxicated	A	4		
anonym	anonymous	A	4		
ædel	noble	A	4		
fredelig	peaceful	A	4		
førende	leading	A	4		
brutal	brutal	A	4		
streng	strict	A	4		
chokerende	shocking	A	4		
skinnende	shiny	A	4		
ubrugelig	useless	A	4		
mistænkelig	suspicious	A	4		
talentfuld	talented	A	4		
teoretisk	theoretical	A	4		
udødelig	immortal	A	4		
egnet	suitable	A	4		
uacceptabel	unacceptable	A	4		
blodig	bloody	A	4		
fjendtlig	hostile	A	4		
realistisk	realistic	A	4		
herlig	wonderful / lovely	A	4		
aktuel	current / topical	A	4		
akut	acute / urgent	A	4		
alternativ	alternative	A	3		
anstændig	decent	A	4		
attraktiv	attractive	A	4		
behjælpelig	helpful	A	4		
bekvem	convenient / comfortable	A	4		
beslægtet	related	A	4		
betydningsfuld	significant	A	4		
brugbar	usable / useful	A	4		
bæredygtig	sustainable	A	4		
dagligdags	everyday	A	4		
dedikeret	dedicated	A	4		
detaljeret	detailed	A	4		
dynamisk	dynamic	A	4		
eksisterende	existing	A	4		
enkelt	single / simple	A	1		
ens	identical / alike	A	1		
entusiastisk	enthusiastic	A	4		
eventuel	possible / any	A	4		
fast	fixed / firm / permanent	A	1		
fjern	distant / remote	A	2		
forbudt	forbidden	A	2		
formel	formal	A	3		
fremmed	foreign / strange	A	2		
frodig	lush	A	4		
fyldig	full / rich (flavor)	A	4		
gennemsnitlig	average	A	4		
gennemsigtig	transparent	A	4		
glat	smooth / slippery	A	2		
grundig	thorough	A	4		
gyldig	valid	A	4		
hyppig	frequent	A	4		
ideel	ideal	A	4		
identisk	identical	A	4		
individuel	individual	A	4		
kendt	known / famous	A	1		
langvarig	long-lasting	A	4		
lignende	similar	A	2		
lydløs	silent	A	4		
lysende	bright / luminous	A	4		
maksimal	maximum	A	4		
markant	marked / distinctive	A	4		
materiel	material	A	4		
meningsfuld	meaningful	A	4		
minimal	minimal	A	4		
mulig	possible	A	2		
mærkbar	noticeable	A	4		
neutral	neutral	A	4		
nøgtern	sober / matter-of-fact	A	4		
objektiv	objective	A	4		
oplagt	obvious / in good form	A	4		
oprigtig	sincere	A	4		
primær	primary	A	4		
problematisk	problematic	A	4		
robust	robust	A	4		
rå	raw / crude	A	2		
sammenlignelig	comparable	A	4		
skadelig	harmful	A	4		
slank	slim	A	4		
specifik	specific	A	4		
spids	pointed / sharp	A	4		
subjektiv	subjective	A	4		
synlig	visible	A	4		
særegen	distinctive	A	4		
tilgængelig	available / accessible	A	4		
traditionel	traditional	A	4		
uafhængig	independent	A	4		
udmærket	excellent / fine	A	1		
uendelig	infinite / endless	A	4		
uformel	informal	A	4		
ugyldig	invalid	A	4		
umulig	impossible	A	2		
varig	lasting	A	4		
vellykket	successful	A	4		
væsentlig	essential / significant	A	4		
ekstrem	extreme	A	4		
hjælpeløs	helpless	A	4		
håbefuld	hopeful	A	4		
kostbar	costly / precious	A	4		
larmende	noisy	A	4		
livlig	lively	A	4		
sjusket	sloppy	A	4		
spiselig	edible	A	4		
træg	sluggish	A	4		
uforudsigelig	unpredictable	A	4		
uundværlig	indispensable	A	4		
velkendt	well-known	A	4		
værdiløs	worthless	A	4		
ældgammel	ancient	A	4		
øde	deserted	A	3		
ansvarsfuld	responsible	A	4		
bekymrende	worrying	A	4		
blandet	mixed	A	3		
fremragende	excellent	A	2		
irrationel	irrational	A	4		
misvisende	misleading	A	4		
sammensat	composite / complex	A	4		
tilfældig	random / accidental	A	2		
tvivlsom	doubtful	A	4		
vedvarende	persistent / renewable	A	4		
vild med	crazy about	A	1		
glad for	fond of / happy with	A	1		
god til	good at	A	1		
dårlig til	bad at	A	1		
vant til	used to	A	2		
bange for	afraid of	A	1		
stolt af	proud of	A	1		
sur på	angry with	A	1		
vred på	angry at	A	1		
jaloux på	jealous of	A	2		
ked af	sorry about	A	1		
tilfreds med	satisfied with	A	2		
færdig med	finished with	A	1		
enig med	in agreement with	A	1		
afhængig af	dependent on	A	3		
opmærksom på	aware of	A	3		
bedre	better	A	1		
bedst	best	A	1		
dejlig	lovely / nice	A	1		
farlig	dangerous	A	1		
fin	fine / nice / fancy	A	1		
hård	hard	A	1		
hyggelig	cozy / nice	A	2		
i stykker	broken	A	1		
interesseret i	interested in	A	1		
klog	wise / clever	A	1		
længst	longest / the longest time	A	2		
nem	easy	A	2		
nær	near	A	1		
ond	evil / bad	A	1		
perfekt	perfect	A	1		
sjælden	rare	A	2		
spændende	exciting	A	1		
størst	biggest	A	4		
super	super / great	A	2		
tilpas	comfortable / suitable	A	2		
underlig	strange / weird	A	2		
vanvittig	crazy / insane	A	2		
vild	wild	A	1		
værst	worst	A	3		
yndlings-	favorite ...	A	4		
økologisk	organic	A	2		
anstrengende	strenuous / tiring	A	4		
anvendelig	applicable / usable	A	4		
begavet	gifted / intelligent	A	4		
bekendt	familiar / known	A	2		
berettiget	justified / entitled	A	4		
besværlig	troublesome	A	4		
betænkelig	doubtful / worrying	A	4		
blank	shiny / blank	A	4		
brændende	burning	A	3		
dristig	bold / daring	A	4		
dybtgående	thorough / profound	A	4		
dødkedelig	deadly boring	A	4		
eftertragtet	sought-after	A	4		
ejendommelig	peculiar	A	4		
eksklusiv	exclusive	A	4		
fantasifuld	imaginative	A	4		
festlig	festive	A	4		
fiktiv	fictional	A	4		
fordelagtig	advantageous	A	4		
forgængelig	perishable / transient	A	4		
forhastet	hasty	A	4		
forkælet	spoiled	A	4		
forladt	abandoned	A	2		
forsømt	neglected	A	4		
forståelsesfuld	understanding	A	4		
fortjent	deserved	A	2		
fremtrædende	prominent	A	4		
frygtløs	fearless	A	4		
fyldestgørende	satisfactory	A	4		
fængslende	captivating	A	4		
gennemført	well done / consistent	A	4		
glødende	glowing / passionate	A	4		
grænseløs	boundless	A	4		
gådefuld	mysterious	A	4		
hektisk	hectic	A	4		
hemmelighedsfuld	secretive	A	4		
hjemlig	homely / domestic	A	4		
hovedsagelig	main / principal	A	4		
højtidelig	solemn	A	4		
indbydende	inviting	A	4		
indflydelsesrig	influential	A	4		
iøjnefaldende	conspicuous	A	4		
klodset	clumsy	A	4		
koncentreret	concentrated / focused	A	4		
kortvarig	short-lived	A	4		
langtrukken	long-winded	A	4		
levedygtig	viable	A	4		
lidenskabelig	passionate	A	4		
ligeværdig	equal	A	4		
lovpligtig	mandatory by law	A	4		
lydig	obedient	A	4		
lysegrøn	light green	A	4		
mørkegrøn	dark green	A	4		
malerisk	picturesque	A	4		
mangelfuld	deficient / inadequate	A	4		
modstandsdygtig	resilient	A	4		
nedslående	disheartening	A	4		
nervepirrende	nerve-wracking	A	4		
næringsrig	nutritious	A	4		
omhyggelig	careful / meticulous	A	4		
omstændelig	elaborate / long-winded	A	4		
opfindsom	inventive	A	4		
oprørsk	rebellious	A	4		
overdreven	exaggerated	A	4		
overfladisk	superficial	A	4		
overfyldt	overcrowded	A	4		
overlegen	superior	A	4		
overmodig	overconfident	A	4		
overskuelig	manageable / clear	A	4		
paradoksal	paradoxical	A	4		
passiv	passive	A	4		
problemfri	problem-free	A	4		
påfaldende	striking	A	4		
påtrængende	pushy / pressing	A	4		
rastløs	restless	A	4		
rystende	shocking / shaking	A	4		
sammenhængende	coherent	A	4		
selvmodsigende	contradictory	A	4		
skeptisk	skeptical	A	4		
skræmmende	frightening	A	2		
skuffende	disappointing	A	4		
smagløs	tasteless	A	4		
smertelig	painful	A	4		
snavset	dirty	A	4		
spartansk	spartan	A	4		
spinkel	slender / frail	A	4		
spirituel	spiritual	A	4		
sporty	sporty	A	4		
standhaftig	steadfast	A	4		
stemningsfuld	atmospheric	A	4		
stormfuld	stormy	A	4		
succesfuld	successful	A	4		
tankefuld	thoughtful	A	4		
tankeløs	thoughtless	A	4		
tidskrævende	time-consuming	A	4		
tilfredsstillende	satisfying	A	4		
tilgivelig	forgivable	A	4		
tillidsfuld	trusting	A	4		
tomhændet	empty-handed	A	4		
tvetydig	ambiguous	A	4		
tvungen	forced	A	4		
uanstændig	indecent	A	4		
ubegribelig	incomprehensible	A	4		
ubekymret	carefree	A	4		
ubelejlig	inconvenient	A	4		
ubestemt	indefinite / vague	A	4		
uduelig	incompetent	A	4		
uerfaren	inexperienced	A	4		
uforglemmelig	unforgettable	A	4		
ulydig	disobedient	A	4		
umoden	immature	A	4		
undvigende	evasive	A	4		
uovervindelig	invincible	A	4		
upraktisk	impractical	A	4		
urealistisk	unrealistic	A	4		
uskarp	blurry	A	4		
utaknemmelig	ungrateful	A	4		
utilstrækkelig	inadequate	A	4		
uvant	unaccustomed / unfamiliar	A	4		
uvedkommende	irrelevant / unauthorized	A	4		
varsom	cautious	A	4		
velbegrundet	well-founded	A	4		
veldrevet	well-run	A	4		
velfortjent	well-deserved	A	4		
velhavende	wealthy	A	4		
velholdt	well-kept	A	4		
velklædt	well-dressed	A	4		
velopdragen	well-behaved	A	4		
vidtrækkende	far-reaching	A	4		
vindende	winning	A	4		
vittig	witty	A	4		
værdsat	appreciated	A	4		
ærefuld	honorable	A	4		
ærgerrig	ambitious	A	4		
ødelæggende	destructive	A	4		
ønskelig	desirable	A	4		
åndelig	spiritual / mental	A	4		
årvågen	alert / vigilant	A	4		
forestående	upcoming / impending	A	4		
jeg	I	O	1		
du	you (one person)	O	1		
han	he	O	1		
hun	she	O	1		
den	it (en-word) / the	O	1		
det	it / that / the	O	1		
vi	we	O	1		
I	you (plural)	O	1		
de	they	O	1		
mig	me	O	1		
dig	you (object)	O	1		
ham	him	O	1		
hende	her	O	1		
os	us	O	1		
jer	you (plural, object)	O	1		
dem	them	O	1		
sig	himself / herself / itself / themselves	O	1		
min	my / mine (en-word)	O	1		
mit	my / mine (et-word)	O	1		
mine	my / mine (plural)	O	1		
din	your / yours (en-word)	O	1		
dit	your / yours (et-word)	O	1		
dine	your / yours (plural)	O	1		
hans	his	O	1		
hendes	her / hers	O	1		
dens	its (en-word)	O	1		
dets	its (et-word)	O	2		
vores	our / ours	O	1		
jeres	your / yours (plural)	O	1		
deres	their / theirs	O	1		
sin	his / her / its own (en-word)	O	1		
sit	his / her / its own (et-word)	O	1		
sine	his / her / its own (plural)	O	1		
denne	this (en-word)	O	1		
dette	this (et-word)	O	1		
disse	these	O	1		
der	there / who / which	O	1		
her	here	O	1		
ikke	not	O	1		
noget	something / some / anything	O	1		
nogen	someone / anyone / any	O	1		
nogle	some / a few	O	1		
ingen	no one / no / none	O	1		
intet	nothing / no (et-word)	O	1		
ingenting	nothing	O	1		
alle	everyone / all	O	1		
alt	everything / all	O	1		
al	all (en-word)	O	1		
bare	just / only	O	1		
mere	more	O	1		
mest	most	O	1		
igen	again	O	1		
tilbage	back	O	1		
sammen	together	O	1		
sådan	like that / such	O	1		
væk	away / gone	O	1		
gang	time (occasion) / walk	O	1		
mange	many	O	1		
stadig	still	O	1		
virkelig	really	O	1		
fint	fine / nicely	O	1		
gerne	gladly / would like to	O	1		
vel	I suppose / surely	O	1		
flere	more (in number) / several	O	1		
hver	each / every	O	1		
først	first / not until	O	1		
engang	once / some day	O	1		
faktisk	actually	O	1		
begge	both	O	1		
hinanden	each other	O	1		
heller	either (in "not either")	O	1		
hellere	rather	O	1		
nogensinde	ever	O	1		
helst	preferably / rather	O	1		
tidligere	earlier / former	O	1		
mindre	less / smaller	O	1		
præcis	exactly / precise	O	1		
hvert	each / every (et-word)	O	1		
endelig	finally / by all means	O	1		
oppe	up (there)	O	1		
derude	out there	O	1		
derinde	in there	O	1		
herinde	in here	O	1		
desværre	unfortunately	O	1		
blot	merely / just	O	1		
afsted	off / away	O	1		
hertil	here (to this place) / to this	O	1		
overhovedet	at all	O	1		
enhver	anyone / every	O	1		
netop	exactly / just	O	1		
alting	everything	O	1		
naturligvis	of course	O	1		
midt	in the middle	O	1		
egentlig	actually / really	O	1		
overalt	everywhere	O	1		
derovre	over there	O	1		
dengang	back then	O	1		
endda	even	O	1		
åbenbart	apparently	O	1		
især	especially	O	1		
mindst	least / at least	O	1		
ovenpå	upstairs	O	1		
derfra	from there	O	1		
dernede	down there	O	1		
derefter	after that	O	1		
deroppe	up there	O	1		
herfra	from here	O	1		
derhen	(to) there	O	1		
evigt	forever	O	1		
personligt	personally	O	1		
ekstra	extra	O	1		
ganske	quite / fairly	O	1		
fuldstændig	completely	O	1		
absolut	absolutely	O	1		
herude	out here	O	1		
herhen	(to) here	O	1		
halvdelen	half (of it)	O	1		
derhjemme	at home	O	1		
totalt	totally	O	2		
næppe	hardly / barely	O	2		
seneste	latest / most recent	O	2		
visse	certain (some)	O	2		
muligvis	possibly	O	2		
bestemt	definitely / certain	O	1		
direkte	directly / direct	O	1		
cirka	approximately	O	2		
dobbelt	double	O	2		
lettere	easier / lighter / slightly	O	2		
forfra	from the beginning	O	2		
ligefrem	downright / straightforward	O	2		
nylig	recently	O	2		
heldigvis	fortunately	O	2		
imens	meanwhile	O	2		
nærmest	almost / nearest	O	2		
stadigvæk	still	O	2		
indeni	inside	O	2		
officielt	officially	O	2		
forhåbentlig	hopefully	O	2		
sandsynligvis	probably	O	2		
temmelig	rather / fairly	O	2		
tydeligvis	obviously	O	2		
galt	wrong / bad	O	1		
højst	at most / highly	O	2		
sagtens	easily / surely	O	2		
yderst	extremely / outermost	O	2		
simpelthen	simply	O	2		
sommetider	sometimes	O	2		
afgjort	decided / definitely	O	3		
tilsyneladende	apparently	O	3		
yderligere	further / additional	O	3		
ligeså	just as	O	3		
garanteret	guaranteed	O	3		
i øvrigt	by the way / moreover	O	3		
rigeligt	plenty	O	3		
uhyre	immensely / monster	O	3		
megen	much	O	3		
omvendt	reverse / the other way around	O	3		
sandelig	indeed / truly	O	3		
hvorfra	from where	O	3		
fortsat	continued / still	O	3		
desto	the (more…) / all the	O	3		
snarere	rather	O	3		
alverden	the whole world / all sorts	O	3		
bagud	behind (in time/score)	O	3		
nødig	reluctantly ("vil nødig" = would rather not)	O	3		
offentligt	publicly	O	3		
i gang	going / underway	O	1		
øverst	at the top	O	3		
sådanne	such (plural)	O	3		
tilfældigt	randomly / by chance	O	3		
formentlig	presumably	O	3		
hermed	herewith / hereby	O	3		
tilfældigvis	by chance	O	3		
ethvert	any / every (et-word)	O	3		
enormt	enormously	O	3		
omgående	immediately	O	3		
vældig	very / mighty	O	3		
nøje	closely / carefully	O	3		
ekstremt	extremely	O	3		
grundigt	thoroughly	O	3		
forgæves	in vain	O	3		
således	thus / like this	O	3		
indefra	from the inside	O	3		
udefra	from outside	O	3		
adskillige	several	O	3		
bagfra	from behind	O	3		
bogstaveligt	literally	O	3		
nødvendigvis	necessarily	O	3		
nøjagtigt	exactly	O	3		
kvit	even / quits	O	3		
halvvejs	halfway	O	3		
samtlige	all (every single one)	O	3		
færre	fewer	O	3		
baglæns	backwards	O	3		
fortroligt	confidentially	O	3		
omsider	at last / finally	O	3		
ligeud	straight ahead / straight out	O	3		
opad	upward	O	3		
indimellem	now and then	O	3		
positivt	positively	O	3		
nedad	downward	O	3		
inderst	innermost / deep down	O	3		
skråt	diagonally / at an angle	O	3		
hidtil	so far / until now	O	3		
kraftigt	strongly / heavily	O	3		
stramt	tightly	O	3		
knapt	barely / scarcely	O	3		
fremover	from now on	O	3		
tværtimod	on the contrary	O	3		
atter	again	O	3		
udelukkende	exclusively	O	3		
trygt	safely	O	3		
forude	ahead	O	3		
forud	ahead / in advance	O	3		
omtrent	about / approximately	O	3		
derimod	on the other hand	O	3		
skarpt	sharply	O	3		
forrest	at the front	O	3		
til fælles	in common	O	2		
med forsæt	on purpose	O	3		
utallige	countless	O	3		
følelsesmæssigt	emotionally	O	3		
mentalt	mentally	O	3		
specifikt	specifically	O	3		
lokalt	locally	O	3		
sågar	even	O	4		
nogenlunde	fairly / reasonably	O	4		
anonymt	anonymously	O	4		
foreløbig	for the time being / preliminary	O	4		
aldeles	entirely / quite	O	4		
endeligt	definitively	O	4		
på forhånd	in advance	O	4		
udenad	by heart	O	4		
ellers	otherwise / or else	O	1		
nedenunder	below / downstairs	O	2		
sidenhen	since then / later on	O	4		
somme tider	sometimes	O	3		
tilmed	moreover	O	4		
tilsammen	together / in total	O	4		
trods alt	after all	O	2		
vist	probably / I think	O	1		
vistnok	apparently / I believe	O	4		
øjensynligt	apparently	O	4		
bogstavelig talt	literally	O	4		
dernæst	next / then	O	4		
derudover	in addition	O	4		
endvidere	furthermore	O	4		
fortrinsvis	preferably	O	4		
generelt	generally	O	4		
gradvist	gradually	O	4		
hovedsageligt	mainly	O	4		
jævnligt	regularly	O	4		
løbende	continuously / ongoing	O	4		
oftest	most often	O	4		
primært	primarily	O	4		
relativt	relatively	O	4		
umiddelbart	immediately / at first sight	O	4		
utroligt	incredibly	O	1		
ganske vist	admittedly	O	1		
ikke desto mindre	nevertheless	O	3		
i stedet	instead	O	1		
ligeledes	likewise	O	4		
navnlig	especially / in particular	O	4		
så at sige	so to speak	O	1		
under alle omstændigheder	in any case	O	3		
hvilket	which (et-word)	O	1		
hvilke	which (plural)	O	1		
indenfor	inside	O	1		
udenfor	outside	O	1		
man	one / you (general)	O	1		
nemt	easily	O	1		
nødt til	have to / forced to	O	1		
slut	over / finished	O	1		
som helst	at all / any (whatever)	O	1		
enkeltvis	one by one	O	4		
forholdsvis	relatively	O	4		
i	in	C	1		
på	on	C	1		
til	to	C	1		
fra	from	C	1		
med	with	C	1		
uden	without	C	1		
for	for	C	1		
om	about / around	C	1		
over	over	C	1		
under	under	C	1		
ved	by / at	C	1		
hos	at someone's place	C	1		
mellem	between	C	1		
gennem	through	C	1		
imod	against	C	1		
efter	after	C	1		
før	before	C	1		
siden	since	C	1		
indtil	until	C	1		
mens	while	C	1		
da	when (past)	C	1		
når	when (general/future)	C	1		
hvis	if	C	1		
fordi	because	C	1		
så	so / then	C	1		
men	but	C	1		
og	and	C	1		
eller	or	C	1		
derfor	therefore	C	1		
altså	thus / so	C	1		
dog	however	C	1		
alligevel	nevertheless	C	1		
desuden	furthermore	C	2		
også	also	C	1		
kun	only	C	1		
både…og	both…and	C	4		
enten…eller	either…or	C	4		
hverken…eller	neither…nor	C	4		
selv	even / self	C	1		
næsten	almost	C	1		
helt	completely	C	1		
lidt	a little	C	1		
meget	very / a lot	C	1		
nok	enough	C	1		
hvor	where	C	1		
hvorfor	why	C	1		
hvordan	how	C	1		
hvornår	when (question)	C	1		
hvem	who	C	1		
hvad	what	C	1		
hvilken	which	C	1		
op	up	C	1		
ned	down	C	1		
ind	in (direction)	C	1		
ud	out (direction)	C	1		
hen	over / toward	C	1		
forbi	past / by	C	1		
omkring	around	C	1		
skønt	although	C	1		
medmindre	unless	C	1		
forudsat at	provided that	C	4		
i tilfælde af	in case of	C	1		
i mangel af	for lack of	C	3		
som følge af	as a result of	C	1		
i kraft af	by virtue of	C	1		
med hensyn til	regarding	C	2		
angående	concerning	C	2		
bortset fra	apart from	C	1		
ud over	besides	C	1		
ligesom	just like	C	1		
hvorimod	whereas	C	4		
hvorved	whereby	C	4		
hvorefter	after which	C	4		
som	who / which / that / as	C	1		
end	than	C	1		
bag	behind	C	1		
igennem	through	C	1		
foran	in front of	C	1		
uanset	regardless of / no matter	C	1		
ifølge	according to	C	1		
hverken	neither	C	1		
enten	either	C	1		
overfor	opposite / across from	C	2		
trods	despite	C	2		
imellem	between / in between	C	2		
undtagen	except	C	2		
udover	besides / beyond	C	2		
via	via	C	2		
eftersom	since / because	C	2		
såsom	such as	C	3		
samt	as well as	C	3		
inklusive	including	C	3		
vedrørende	concerning	C	3		
iblandt	among	C	3		
hinsides	beyond	C	3		
foruden	besides / apart from	C	4		
bagom	behind	C	4		
blandt	among	C	1		
dels ... dels	partly ... partly	C	4		
efterhånden som	as (gradually)	C	3		
endskønt	although	C	4		
fremfor	rather than	C	4		
hvorvidt	whether	C	4		
i og med	since / given that	C	1		
idet	as / since	C	4		
jo ... desto	the ... the	C	3		
langs	along	C	3		
ovenover	above	C	4		
som om	as if	C	1		
så længe	as long as	C	1		
så snart	as soon as	C	1		
så vidt	as far as	C	2		
hellere end	rather than	C	1		
både ... og	both ... and	C	1		
bagved	behind	C	2		
ved siden af	next to	C	1		
hej	hi	P	1		
farvel	goodbye	P	1		
godmorgen	good morning	P	1		
godaften	good evening	P	2		
godnat	good night	P	1		
tak	thanks	P	1		
tak for det	thanks for that	P	1		
selv tak	you're welcome	P	1		
undskyld	sorry / excuse me	P	1		
det gør ikke noget	it's ok / no problem	P	1		
hvordan går det?	how's it going?	P	1		
det går godt	it's going well	P	1		
hvad hedder du?	what's your name?	P	1		
jeg hedder…	my name is…	P	4		
hvor kommer du fra?	where are you from?	P	1		
jeg kommer fra…	I'm from…	P	4		
hvor gammel er du?	how old are you?	P	1		
jeg forstår ikke	I don't understand	P	1		
kan du gentage det?	can you repeat that?	P	3		
tal langsomt	speak slowly	P	1		
hvad betyder det?	what does that mean?	P	1		
det ved jeg ikke	I don't know	P	1		
det tror jeg ikke	I don't think so	P	1		
måske	maybe	P	1		
selvfølgelig	of course	P	1		
det er lige meget	it doesn't matter	P	1		
hvor meget koster det?	how much does it cost?	P	1		
må jeg få regningen?	may I have the bill?	P	3		
værsgo	here you go	P	1		
god fornøjelse	enjoy	P	1		
held og lykke	good luck	P	1		
tillykke	congratulations	P	1		
vi ses	see you	P	1		
vi tales ved	talk soon	P	3		
pas på dig selv	take care	P	1		
god weekend	have a good weekend	P	2		
god appetit	bon appétit	P	3		
hvad så?	what's up?	P	1		
det er lige det	that's exactly it	P	1		
i det store hele	all in all	P	1		
det kommer an på	it depends	P	1		
sådan er det bare	that's just how it is	P	1		
tag det roligt	take it easy / calm down	P	1		
hold op	stop it	P	1		
lad være	don't / stop	P	1		
kom nu	come on	P	1		
vent lidt	wait a bit	P	1		
skynd dig	hurry up	P	1		
pas på	watch out / be careful	P	1		
det er synd	that's a shame	P	2		
sikke noget	what a thing / wow	P	1		
hold da op	wow / whoa	P	1		
er du sikker?	are you sure?	P	1		
jeg er enig	I agree	P	1		
jeg er uenig	I disagree	P	3		
det giver mening	that makes sense	P	1		
det giver ikke mening	that doesn't make sense	P	1		
i mellemtiden	in the meantime	P	3		
med det samme	right away	P	1		
lidt efter lidt	little by little	P	1		
i hvert fald	in any case / at least	P	1		
for eksempel	for example	P	1		
med andre ord	in other words	P	1		
det vil sige	that is to say	P	1		
på trods af	despite	P	2		
på grund af	because of	P	1		
selvom	even though	P	1		
i stedet for	instead of	P	1		
i forhold til	in relation to	P	1		
fra tid til anden	from time to time	P	1		
en gang imellem	once in a while	P	2		
det kan man ikke vide	you never know	P	1		
lad os se	let's see	P	1		
det håber jeg	I hope so	P	1		
det tror jeg	I think so	P	1		
stort set	basically	P	1		
i det mindste	at least	P	1		
hvis jeg var dig	if I were you	P	1		
at være enig	to agree	P	1	er enig|var enig|været enig	
at være uenig	to disagree	P	3	er uenig|var uenig|været uenig	
at modsige	to contradict	P	4	modsiger|modsagde|modsagt	
at understøtte	to support	P	4	understøtter|understøttede|understøttet	
at bestride	to dispute	P	4	bestrider|bestred|bestridt	
at retfærdiggøre	to justify	P	4	retfærdiggør|retfærdiggjorde|retfærdiggjort	
at understrege	to emphasize	P	4	understreger|understregede|understreget	
at antyde	to imply	P	3	antyder|antydede|antydet	
at konkludere	to conclude	P	4	konkluderer|konkluderede|konkluderet	
at generalisere	to generalize	P	4	generaliserer|generaliserede|generaliseret	
at sammenligne	to compare	P	3	sammenligner|sammenlignede|sammenlignet	
at modstille	to contrast	P	4	modstiller|modstillede|modstillet	
at vurdere	to evaluate	P	4	vurderer|vurderede|vurderet	
at kritisere	to criticize	P	4	kritiserer|kritiserede|kritiseret	
at rose	to praise	P	2	roser|roste|rost	
efter min mening	in my opinion	P	1		
på den ene side	on one hand	P	1		
på den anden side	on the other hand	P	1		
i modsætning til	in contrast to	P	3		
alt i alt	all in all	P	1		
kort sagt	in short	P	1		
at slå to fluer med et smæk	to kill two birds with one stone	P	3		
at tage tyren ved hornene	to take the bull by the horns	P	4		
at falde med næsen i smøret	to fall into a lucky opportunity	P	4		
at have en finger med i spillet	to be involved in something	P	2		
at gå over åen efter vand	to make things unnecessarily complicated	P	4		
at kaste håndklædet i ringen	to throw in the towel	P	4		
at være ude i god tid	to be well ahead of time	P	1		
at stikke en kæp i hjulet	to throw a wrench in the works	P	4		
at tage skeen i den anden hånd	to change one's approach	P	4		
at have hjertet på rette sted	to have one's heart in the right place	P	2		
at gøre en dyd af nødvendigheden	to make a virtue of necessity	P	4		
at være på bar bund	to be at a total loss	P	3		
at ramme plet	to hit the mark	P	3		
at gå agurk	to go crazy	P	4		
at tale udenom	to beat around the bush	P	2		
ja	yes	P	1		
nej	no	P	1		
jo	yes (answering a negative question) / you know	P	1		
nå	well / oh	P	1		
jamen	but / well	P	1		
javel	I see / very well	P	1		
nemlig	exactly / you see	P	1		
venligst	please (formal)	P	1		
forresten	by the way	P	2		
vrøvl	nonsense	P	2		et
goddag	good day / hello (formal)	P	1		
hallo	hello	P	1		
hvabehar	pardon? / excuse me?	P	2		
tja	well (hesitating)	P	1		
gudskelov	thank God	P	2		
jaså	is that so	P	2		
glædelig jul	merry Christmas	P	2		
hold kæft	shut up	P	1		
pyt	never mind	P	2		
davs	hi	P	2		
hejsa	hi there	P	2		
jøsses	gosh	P	2		
bravo	bravo	P	2		
halløj	hey / hello there	P	2		
pjat	nonsense	P	2		et
møg	muck / crap	P	2		et
hurra	hooray	P	3		
velbekomme	enjoy (your meal) / you're welcome (after a meal)	P	3		
nuvel	well now	P	3		
uha	oh dear	P	4		
det går fint	it's going fine	P	1		
hvad laver du?	what are you doing?	P	1		
hyggeligt at møde dig	nice to meet you	P	1		
i lige måde	likewise / same to you	P	1		
tak for mad	thanks for the meal	P	1		
tak for i dag	thanks for today	P	1		
tak for sidst	thanks for last time	P	1		
ingen årsag	don't mention it	P	2		
mange tak	thank you very much	P	1		
tusind tak	thanks a lot	P	1		
undskyld mig	excuse me	P	1		
ingen problemer	no problem	P	1		
det er i orden	it's okay	P	1		
hvad hedder det på dansk?	what is that called in Danish?	P	3		
taler du engelsk?	do you speak English?	P	1		
lidt langsommere, tak	a bit slower, please	P	3		
hvor er toilettet?	where is the restroom?	P	1		
hvad koster det?	how much does it cost?	P	1		
jeg vil gerne have	I would like	P	1		
må jeg bede om regningen?	may I have the bill?	P	3		
kan jeg betale med kort?	can I pay by card?	P	1		
skal vi ikke bare...?	shall we just...?	P	1		
god tur	have a good trip	P	1		
god bedring	get well soon	P	4		
godt nytår	happy New Year	P	3		
god påske	happy Easter	P	4		
tillykke med fødselsdagen	happy birthday	P	3		
hav en god dag	have a good day	P	1		
på gensyn	see you again	P	4		
vi snakkes	talk to you later	P	3		
ses i morgen	see you tomorrow	P	1		
hej med dig	hi there / bye	P	1		
det lyder godt	that sounds good	P	1		
det er fint med mig	that's fine with me	P	1		
det er en god idé	that's a good idea	P	1		
det er rigtigt	that's right	P	1		
det passer	that's true	P	1		
det passer ikke	that's not true	P	1		
for pokker	darn it	P	1		
for søren	oh dear / goodness	P	3		
av	ouch	P	2		
føj	yuck	P	3		
nå ja	oh right	P	1		
nå men	well then	P	1		
okay så	okay then	P	1		
sikke en dag	what a day	P	1		
det var dog utroligt	that's incredible	P	1		
det kan godt være	that may be	P	1		
jeg glæder mig	I'm looking forward to it	P	1		
jeg har det godt	I'm doing well	P	1		
jeg har det skidt	I'm not doing well	P	1		
jeg er ked af det	I'm sorry	P	1		
det er min skyld	it's my fault	P	1		
først og fremmest	first and foremost	P	3		
til gengæld	on the other hand / in return	P	2		
blandt andet	among other things	P	1		
i det hele taget	on the whole / generally	P	1		
i virkeligheden	in reality / actually	P	2		
i princippet	in principle	P	4		
som regel	as a rule / usually	P	2		
for det meste	mostly	P	2		
lige om lidt	in just a moment	P	1		
i gang med	busy with	P	1		
på vej	on the way	P	1		
på tide	about time	P	1		
ud over det	besides that	P	1		
uden tvivl	without a doubt	P	1		
i orden	all right / in order	P	1		
ikke engang	not even	P	1		
ikke endnu	not yet	P	1		
ikke mere	no more / not anymore	P	1		
slet ikke	not at all	P	1		
næsten aldrig	almost never	P	1		
lige meget hvad	no matter what	P	1		
hvad som helst	anything	P	1		
hvem som helst	anyone	P	1		
hvor som helst	anywhere	P	1		
når som helst	anytime	P	1		
hvad med dig?	what about you?	P	1		
hvad er klokken?	what time is it?	P	1		
klokken er fem	it's five o'clock	P	1		
halv tre	half past two	P	1		
kvart over	quarter past	P	3		
kvart i	quarter to	P	3		
at have ret	to be right	P	1	har ret|havde ret|haft ret	
at have lyst til	to feel like / want to	P	1	har lyst til|havde lyst til|haft lyst til	
at have brug for	to need	P	1	har brug for|havde brug for|haft brug for	
at have råd til	to afford	P	1	har råd til|havde råd til|haft råd til	
at have ondt i	to have a pain in	P	1	har ondt i|havde ondt i|haft ondt i	
at have svært ved	to find it hard to	P	1	har svært ved|havde svært ved|haft svært ved	
at have let ved	to find it easy to	P	1	har let ved|havde let ved|haft let ved	
at gøre sit bedste	to do one's best	P	1	gør sit bedste|gjorde sit bedste|gjort sit bedste	
at gøre grin med	to make fun of	P	2	gør grin med|gjorde grin med|gjort grin med	
at gøre en forskel	to make a difference	P	1	gør en forskel|gjorde en forskel|gjort en forskel	
at tage det roligt	to take it easy	P	1	tager det roligt|tog det roligt|taget det roligt	
at tage en beslutning	to make a decision	P	1	tager en beslutning|tog en beslutning|taget en beslutning	
at tage sig tid	to take one's time	P	1	tager sig tid|tog sig tid|taget sig tid	
at give en hånd	to give a hand	P	1	giver en hånd|gav en hånd|givet en hånd	
at få ret	to be proven right	P	1	får ret|fik ret|fået ret	
at få styr på	to get control of / sort out	P	1	får styr på|fik styr på|fået styr på	
at få nok	to have had enough	P	1	får nok|fik nok|fået nok	
at holde ord	to keep one's word	P	1	holder ord|holdt ord|holdt ord	
at holde med	to support (a team / side)	P	1	holder med|holdt med|holdt med	
at slå et smut forbi	to drop by	P	2	slår et smut forbi|slog et smut forbi|slået et smut forbi	
at skifte mening	to change one's mind	P	2	skifter mening|skiftede mening|skiftet mening	
at gå i stå	to come to a standstill	P	1	går i stå|gik i stå|gået i stå	
at gå i panik	to panic	P	2	går i panik|gik i panik|gået i panik	
at gå galt	to go wrong	P	1	går galt|gik galt|gået galt	
at gå som smurt	to go smoothly	P	3	går som smurt|gik som smurt|gået som smurt	
at komme i gang	to get started	P	1	kommer i gang|kom i gang|kommet i gang	
at komme til skade	to get hurt	P	1	kommer til skade|kom til skade|kommet til skade	
at falde i god jord	to go down well	P	1	falder i god jord|faldt i god jord|faldet i god jord	
at tale med store bogstaver	to speak bluntly	P	3		
at feje noget ind under gulvtæppet	to sweep something under the rug	P	4		
at være oppe at køre	to be worked up	P	1		
at gå som katten om den varme grød	to beat around the bush	P	4		
at have en høne at plukke med nogen	to have a bone to pick with someone	P	4		
at stikke en finger i jorden	to take stock / reflect	P	2		
at have is i maven	to keep cool / stay calm	P	2		
at holde tand for tunge	to keep quiet	P	3		
at få kolde fødder	to get cold feet	P	2		
at være på Herrens mark	to be completely lost	P	3		
at snakke om vejret	to make small talk	P	1		
der er ingen ko på isen	there's nothing to worry about	P	3		
det er ikke raketvidenskab	it's not rocket science	P	4		
nu skal du høre	now listen	P	1		
det var på høje tid	it was high time	P	2		
det er hip som hap	it's six of one, half a dozen of the other	P	4		
bedre sent end aldrig	better late than never	P	1		
øvelse gør mester	practice makes perfect	P	3		
man skal ikke skue hunden på hårene	don't judge a book by its cover	P	4		
den tid, den sorg	cross that bridge when we come to it	P	2		
ude af øje, ude af sind	out of sight, out of mind	P	2		
en hilsen	a greeting	P	3		
jeg beklager	I'm sorry (formal)	P	1		
det er	it is / that is	P	1		
det var så lidt	you're welcome / don't mention it	P	1		
jeg hedder ...	my name is ...	P	1		
er det ...?	is it ...?	P	1		
hvordan har du det?	how are you?	P	1		
kan jeg købe ...?	can I buy ...?	P	1		
nederen	a bummer (slang)	P	2		
okay	okay	P	1		
sgu	damn (mild intensifier)	P	1		
sikke	what a ... (exclamation)	P	1		
sov godt	sleep well	P	1		
stop	stop	P	1		
velkommen	welcome	P	1		
wow	wow	P	1		
en / et	one	T	3		
to	two	T	1		
tre	three	T	1		
fire	four	T	1		
fem	five	T	1		
seks	six	T	1		
syv	seven	T	1		
otte	eight	T	1		
ni	nine	T	1		
ti	ten	T	1		
elleve	eleven	T	2		
tolv	twelve	T	2		
tretten	thirteen	T	3		
fjorten	fourteen	T	2		
femten	fifteen	T	2		
seksten	sixteen	T	3		
sytten	seventeen	T	3		
atten	eighteen	T	3		
nitten	nineteen	T	3		
tyve	twenty	T	2		
tredive	thirty	T	2		
fyrre	forty	T	2		
halvtreds	fifty	T	2		
tres	sixty	T	3		
halvfjerds	seventy	T	3		
firs	eighty	T	3		
halvfems	ninety	T	3		
hundrede	hundred	T	2		
tusind	thousand	T	1		
million	million	T	1		
første	first	T	1		
anden	second	T	1		
tredje	third	T	1		
fjerde	fourth	T	2		
femte	fifth	T	2		
sidste	last	T	1		
mandag	Monday	T	2		
tirsdag	Tuesday	T	2		
onsdag	Wednesday	T	2		
torsdag	Thursday	T	2		
fredag	Friday	T	2		
lørdag	Saturday	T	2		
søndag	Sunday	T	2		
januar	January	T	2		
februar	February	T	2		
marts	March	T	2		
april	April	T	2		
maj	May	T	2		
juni	June	T	2		
juli	July	T	2		
august	August	T	2		
september	September	T	2		
oktober	October	T	2		
november	November	T	2		
december	December	T	2		
i dag	today	T	1		
i morgen	tomorrow	T	1		
i går	yesterday	T	1		
nu	now	T	1		
senere	later	T	1		
snart	soon	T	1		
altid	always	T	1		
aldrig	never	T	1		
nogle gange	sometimes	T	1		
ofte	often	T	1		
sjældent	rarely	T	2		
tidligt	early	T	1		
sent	late	T	1		
klokken	the clock / o'clock	T	1		
halv	half	T	1		
kvart	quarter	T	2		
en weekend	a weekend	T	2		
en ferie	a vacation	T	1		
en fødselsdag	a birthday	T	1		
et øjeblik	a moment	T	1		
en periode	a period	T	2		
øjeblikkeligt	immediately	T	2		
straks	right away	T	1		
længe	for a long time	T	1		
endnu	yet / still	T	1		
allerede	already	T	1		
nul	zero	T	2		
i sidste ende	in the end	T	1		
i første omgang	at first	T	2		
efterhånden	gradually	T	2		
pludselig	suddenly	T	1		
i forvejen	in advance	T	2		
bagefter	afterwards	T	1		
undervejs	along the way	T	2		
indtil videre	so far	T	1		
fra nu af	from now on	T	1		
indtil nu	until now	T	1		
for evigt	forever	T	1		
lejlighedsvis	occasionally	T	3		
regelmæssigt	regularly	T	3		
af og til	now and then	T	1		
samtidig	simultaneously	T	2		
forinden	beforehand	T	3		
efterfølgende	subsequently	T	2		
i fremtiden	in the future	T	1		
i fortiden	in the past	T	2		
nutildags	nowadays	T	3		
en cirkel	a circle	T	2		
et kvadrat	a square	T	3		
en trekant	a triangle	T	2		
en firkant	a rectangle	T	3		
en linje	a line	T	2		
en kant	an edge	T	2		
et hjørne	a corner	T	2		
en længde	a length	T	3		
en bredde	a width	T	3		
en højde	a height	T	2		
en dybde	a depth	T	2		
en vægt	a weight	T	2		
et rumfang	a volume	T	3		
en diameter	a diameter	T	3		
en afstand	a distance	T	2		
en vinkel	an angle	T	2		
en procent	a percentage	T	1		
en brøk	a fraction	T	3		
et gennemsnit	an average	T	3		
en mængde	an amount	T	2		
et tidspunkt	a point in time	T	1		
en alder	an age	T	1		
en fortid	a past	T	2		
midnat	midnight	T	2		en
en evighed	an eternity	T	2		
en milliard	a billion	T	2		
et århundrede	a century	T	2		
tusindvis	thousands	T	2		
et daggry	a dawn	T	2		
et antal	a number (amount)	T	2		
en sæson	a season	T	2		
et døgn	a day (24 hours)	T	2		
et dusin	a dozen	T	2		
en dato	a date (calendar)	T	2		
en livstid	a lifetime	T	2		
en liter	a liter	T	2		
en stund	a while	T	2		
halvanden	one and a half	T	3		
et gram	a gram	T	2		
et nytår	a New Year	T	2		
månedsvis	for months	T	3		
timevis	for hours	T	3		
ugevis	for weeks	T	3		
en afslutning	an ending / conclusion	T	2		
en mil	a (Danish) mile / 10 km	T	2		
dagligt	daily	T	3		
dagevis	for days	T	3		
et årti	a decade	T	2		
årlig	annual	T	4		
en håndfuld	a handful	T	2		
ottende	eighth	T	4		
et kilo	a kilo	T	2		
en deciliter	a deciliter	T	4		
turkis	turquoise	T	4		
beige	beige	T	4		
sølv	silver	T	2		et
et rektangel	a rectangle	T	4		
en centimeter	a centimeter	T	2		
en kilometer	a kilometer	T	1		
en halvdel	a half	T	1		
en fjerdedel	a quarter	T	3		
en tredjedel	a third	T	2		
et ciffer	a digit	T	3		
niende	ninth	T	4		
tiende	tenth	T	4		
to gange	twice	T	1		
en halv time	half an hour	T	1		
et årstal	a year (date)	T	4		
sommertid	daylight saving time	T	3		en
nutiden	the present	T	4		
i nat	tonight / last night	T	1		
i aften	this evening	T	1		
i eftermiddag	this afternoon	T	2		
i weekenden	this weekend / on weekends	T	2		
om morgenen	in the morning	T	2		
om aftenen	in the evening	T	1		
om natten	at night	T	1		
om ugen	per week	T	1		
om året	per year	T	2		
hver dag	every day	T	1		
en gang om ugen	once a week	T	1		
for tiden	at the moment	T	1		
lige nu	right now	T	1		
for længe siden	a long time ago	T	1		
for nylig	recently	T	2		
i tide	in time	T	1		
til tiden	on time	T	1		
hele tiden	all the time	T	1		
dagen efter	the day after	T	1		
ugen efter	the week after	T	1		
at tage tid	to take time	T	1	tager tid|tog tid|taget tid	
at komme for sent	to be late	T	1	kommer for sent|kom for sent|kommet for sent	
at nå det	to make it (in time)	T	1	når det|nåede det|nået det	
at have travlt	to be busy	T	1	har travlt|havde travlt|haft travlt	
at have god tid	to have plenty of time	T	1	har god tid|havde god tid|haft god tid	
at stille uret	to set the clock	T	2	stiller uret|stillede uret|stillet uret	
en begyndelse	a beginning	T	2		
en eftermiddag	an afternoon	T	2		
enogtyve	twenty-one	T	3		
femogtredive	thirty-five	T	3		
fireogtyve	twenty-four	T	3		
en fremtid	a future	T	1		
en hverdag	a weekday / everyday life	T	3		
i aftes	last night / yesterday evening	T	1		
i år	this year	T	1		
i forgårs	the day before yesterday	T	2		
i morges	this morning (earlier today)	T	1		
i overmorgen	the day after tomorrow	T	2		
en meter	a meter	T	1		
om lidt	in a little while	T	1		
sidst	last / lastly	T	1		
sjette	sixth	T	2		
syvende	seventh	T	2		
en slutning	an ending	T	2		
et tal	a number	T	1		
til sidst	finally / in the end	T	1		
en efterårsdag	an autumn day	T	4		
en forårsdag	a spring day	T	3		
en sommerdag	a summer day	T	3		
en vinterdag	a winter day	T	4		
en regnvejrsdag	a rainy day	T	3		
en ugedag	a day of the week	T	4		
elvte	eleventh	T	4		
tolvte	twelfth	T	3		
tyvende	twentieth	T	4		
hundrededel	hundredth (fraction)	T	4		
en sommernat	a summer night	T	4		
en vinternat	a winter night	T	4		
et kvartal	a quarter (of a year)	T	3		
et halvår	a half year	T	4		
et skudår	a leap year	T	4		
en tidsplan	a schedule	T	2		
et tidsrum	a period of time	T	3		
tidspres	time pressure	T	3		et
en yndlingsfarve	a favorite color	T	3		
en mor	a mother	F	1		
en far	a father	F	1		
forældre	parents	F	1		
et barn	a child	F	1		
en søn	a son	F	1		
en datter	a daughter	F	1		
en bror	a brother	F	1		
en søster	a sister	F	1		
en bedstemor	a grandmother	F	2		
en bedstefar	a grandfather	F	2		
et barnebarn	a grandchild	F	2		
en tante	an aunt	F	1		
en onkel	an uncle	F	1		
en fætter	a male cousin	F	2		
en kusine	a female cousin	F	2		
en nevø	a nephew	F	2		
en niece	a niece	F	2		
en mand	a husband / man	F	1		
en kone	a wife	F	1		
en ægtefælle	a spouse	F	3		
en kæreste	a girlfriend / boyfriend	F	1		
en veninde	a female friend	F	2		
en bekendt	an acquaintance	F	2		
en svigermor	a mother-in-law	F	2		
en svigerfar	a father-in-law	F	2		
en stedmor	a stepmother	F	3		
en stedfar	a stepfather	F	2		
en tvilling	a twin	F	2		
en baby	a baby	F	1		
en voksen	an adult	F	2		
en teenager	a teenager	F	2		
en dreng	a boy	F	1		
en pige	a girl	F	1		
en kvinde	a woman	F	1		
en forfatter	an author	F	2		
en læge	a doctor	F	1		
en sygeplejerske	a nurse	F	2		
en lærer	a teacher	F	1		
en elev	a pupil	F	2		
en studerende	a student	F	2		
en professor	a professor	F	1		
en advokat	a lawyer	F	1		
en politibetjent	a police officer	F	2		
en brandmand	a firefighter	F	2		
en sælger	a salesperson	F	1		
en kunde	a customer	F	2		
en chauffør	a driver	F	2		
en kok	a chef	F	2		
en tjener	a waiter	F	1		
en håndværker	a craftsman	F	3		
en ingeniør	an engineer	F	2		
en programmør	a programmer	F	3		
en kunstner	an artist	F	2		
en musiker	a musician	F	2		
en skuespiller	an actor	F	2		
en journalist	a journalist	F	2		
en præst	a priest	F	2		
en soldat	a soldier	F	1		
en bonde	a farmer	F	2		
en fisker	a fisherman	F	2		
en direktør	a director / CEO	F	2		
en statsminister	a prime minister	F	2		
en borgmester	a mayor	F	2		
en turist	a tourist	F	2		
et medlem	a member	F	2		
en leder	a leader	F	1		
en medarbejder	an employee	F	2		
en pensionist	a retiree	F	3		
et kærlighedsforhold	a romantic relationship	F	3		
en date	a date	F	1		
et ægteskab	a marriage	F	1		
en skilsmisse	a divorce	F	2		
en forlovelse	an engagement	F	3		
et bryllup	a wedding	F	1		
et jubilæum	an anniversary	F	3		
en fest	a party	F	1		
en invitation	an invitation	F	2		
en vært	a host	F	2		
et selskab	a company/gathering	F	1		
en underordnet	a subordinate	F	3		
en misforståelse	a misunderstanding	F	2		
et skænderi	an argument	F	2		
en forsoning	a reconciliation	F	3		
en undskyldning	an apology	F	2		
en tilgivelse	a forgiveness	F	2		
en loyalitet	a loyalty	F	2		
en flirt	a flirt	F	2		
en eks	an ex	F	2		
en gensidighed	a mutuality	F	3		
en fortrolighed	an intimacy	F	3		
sladder	gossip	F	2		en
et rygte	a rumor	F	2		
en fyr	a guy	F	1		
en herre	a gentleman / lord	F	1		
en knægt	a lad / kid	F	1		
en dame	a lady	F	1		
en frøken	a miss / young lady	F	1		
en kammerat	a buddy / comrade	F	1		
et kys	a kiss	F	1		
en partner	a partner	F	1		
en hustru	a wife (formal)	F	2		
en affære	an affair	F	2		
en jomfru	a virgin / maiden	F	2		
et kram	a hug	F	2		
single	single	F	2		
en tøs	a girl / lass	F	2		
forlovet	engaged (to marry)	F	2		
et knus	a hug	F	2		
en barndom	a childhood	F	2		
en ægtemand	a husband	F	2		
kvindelig	female	F	3		
et kompliment	a compliment	F	2		
en forfader	an ancestor	F	3		
lesbisk	lesbian	F	3		
en barnepige	a nanny / babysitter	F	2		
en enke	a widow	F	2		
en afsked	a farewell	F	2		
en babysitter	a babysitter	F	2		
en gut	a guy / lad	F	2		
en besøgende	a visitor	F	2		
en bryllupsdag	a wedding anniversary	F	2		
manerer	manners	F	3		pl
søskende	siblings	F	3		pl
opdraget	brought up / well-mannered	F	3		
en forælder	a parent	F	2		
en bryllupsrejse	a honeymoon	F	2		
en arving	an heir	F	2		
en ekskæreste	an ex (boyfriend/girlfriend)	F	2		
en slægtning	a relative	F	2		
ungdom	youth	F	2		en
en elskerinde	a mistress	F	2		
en ledsager	a companion / escort	F	2		
en moster	an aunt (mother's sister)	F	2		
en faster	an aunt (father's sister)	F	2		
en morbror	an uncle (mother's brother)	F	3		
en farbror	an uncle (father's brother)	F	3		
en eksmand	an ex-husband	F	2		
en svoger	a brother-in-law	F	2		
en svigerinde	a sister-in-law	F	3		
adopteret	adopted	F	4		
en forlover	a best man / maid of honor	F	2		
omsorg	care	F	2		en
enlig	single / solitary	F	4		
en polterabend	a bachelor / bachelorette party	F	2		
forældreløs	orphaned	F	4		
mandlig	male	F	4		
en blondine	a blonde	F	2		
at kramme	to hug	F	4	krammer|krammede|krammet	
en mormor	a grandmother (mother's mother)	F	2		
en farmor	a grandmother (father's mother)	F	2		
en morfar	a grandfather (mother's father)	F	2		
en farfar	a grandfather (father's father)	F	2		
bedsteforældre	grandparents	F	4		pl
en oldemor	a great-grandmother	F	3		
en oldefar	a great-grandfather	F	3		
svigerforældre	parents-in-law	F	4		pl
en svigersøn	a son-in-law	F	2		
en svigerdatter	a daughter-in-law	F	3		
en halvbror	a half-brother	F	3		
en halvsøster	a half-sister	F	3		
en storebror	a big brother	F	2		
en storesøster	a big sister	F	3		
en lillebror	a little brother	F	2		
en lillesøster	a little sister	F	2		
et spædbarn	an infant	F	3		
et småbarn	a toddler	F	4		
en samlever	a live-in partner	F	4		
en slægt	a family line / lineage	F	2		
et fornavn	a first name	F	2		
et efternavn	a last name	F	2		
et mellemnavn	a middle name	F	2		
et kælenavn	a nickname	F	2		
en fødselsdato	a date of birth	F	3		
at blive gift	to get married	F	1	bliver gift|blev gift|blevet gift	
at blive skilt	to get divorced	F	1	bliver skilt|blev skilt|blevet skilt	
at date	to date	F	1	dater|datede|datet	
at gå fra hinanden	to break up	F	1	går fra hinanden|gik fra hinanden|gået fra hinanden	
at forlove sig	to get engaged	F	2	forlover sig|forlovede sig|forlovet sig	
at få et barn	to have a baby	F	1	får et barn|fik et barn|fået et barn	
at passe børn	to babysit	F	1	passer børn|passede børn|passet børn	
at vokse op	to grow up	F	2	vokser op|voksede op|vokset op	
at komme godt ud af det med	to get along with	F	1	kommer godt ud af det med|kom godt ud af det med|kommet godt ud af det med	
at blive venner	to become friends	F	1	bliver venner|blev venner|blevet venner	
at hilse på	to say hello to / meet	F	2	hilser på|hilste på|hilst på	
at tage sig af	to take care of	F	1	tager sig af|tog sig af|taget sig af	
at fylde år	to have a birthday	F	2	fylder år|fyldte år|fyldt år	
gift	married	F	1		
ugift	unmarried	F	4		
fraskilt	divorced	F	4		
voksen	grown-up	F	2		
en opvækst	an upbringing	F	3		
et besøg	a visit	F	1		
en værtinde	a hostess	F	3		
en brudgom	a groom	F	3		
en brudepige	a bridesmaid	F	3		
en vielsesring	a wedding ring	F	2		
en forlovelsesring	an engagement ring	F	3		
et løfte	a promise	F	2		
et afslag	a refusal / rejection	F	3		
en barndomsven	a childhood friend	F	3		
en omgangskreds	a circle of friends	F	3		
ros	praise	F	1		en
en løgn	a lie	F	1		
et svigt	a betrayal / letdown	F	2		
et kærlighedsbrev	a love letter	F	3		
en crush	a crush	F	3		
romantik	romance	F	2		en
en tiltrækning	an attraction	F	3		
et ægtepar	a married couple	F	3		
et kærestepar	a couple (dating)	F	4		
en enlig forsørger	a single parent	F	4		
en plejefamilie	a foster family	F	3		
et plejebarn	a foster child	F	3		
en adoption	an adoption	F	3		
en familiefest	a family party	F	3		
en generationskløft	a generation gap	F	4		
et samvær	a time together / custody visit	F	3		
et samliv	a life together	F	4		
forældremyndighed	custody (parental)	F	3		en
en opdragelse	an upbringing	F	3		
børnepasning	childcare	F	3		en
en dagplejer	a childminder	F	4		
en babyalarm	a baby monitor	F	4		
en graviditetstest	a pregnancy test	F	3		
en termin	a due date / term	F	3		
en navngivning	a naming	F	4		
et gudbarn	a godchild	F	4		
en gudmor	a godmother	F	3		
en gudfar	a godfather	F	3		
at tale ud	to talk things through	F	1	taler ud|talte ud|talt ud	
at holde et løfte	to keep a promise	F	2	holder et løfte|holdt et løfte|holdt et løfte	
at bryde et løfte	to break a promise	F	2	bryder et løfte|brød et løfte|brudt et løfte	
at blive uvenner	to fall out	F	4	bliver uvenner|blev uvenner|blevet uvenner	
at slutte fred	to make peace	F	2	slutter fred|sluttede fred|sluttet fred	
at sige undskyld	to say sorry	F	1	siger undskyld|sagde undskyld|sagt undskyld	
at holde sammen	to stick together	F	1	holder sammen|holdt sammen|holdt sammen	
at flytte sammen	to move in together	F	1	flytter sammen|flyttede sammen|flyttet sammen	
at gå ud med	to go out with	F	1	går ud med|gik ud med|gået ud med	
at falde for	to fall for	F	1	falder for|faldt for|faldet for	
at være kærester	to be dating	F	2	er kærester|var kærester|været kærester	
at fri	to propose	F	1	frier|friede|friet	
at holde i hånd	to hold hands	F	1	holder i hånd|holdt i hånd|holdt i hånd	
at tage hensyn	to be considerate	F	2	tager hensyn|tog hensyn|taget hensyn	
at gå på nerverne	to get on someone's nerves	F	3	går på nerverne|gik på nerverne|gået på nerverne	
at gøre det forbi	to end it (a relationship)	F	1	gør det forbi|gjorde det forbi|gjort det forbi	
trofast	faithful	F	4		
utro	unfaithful	F	2		
forstående	understanding	F	4		
tolerant	tolerant	F	4		
beskyttende	protective	F	4		
nærværende	present / attentive	F	4		
fraværende	absent / absent-minded	F	4		
sladderagtig	gossipy	F	4		
snakkesalig	chatty	F	4		
diplomatisk	diplomatic	F	4		
et familiemedlem	a family member	F	3		
en husmor	a housewife	F	3		
et naboskab	a neighborhood relationship	F	4		
en storfamilie	an extended family	F	4		
en vennegruppe	a group of friends	F	4		
et familiebillede	a family photo	F	4		
et fødested	a birthplace	F	3		
et samtaleemne	a topic of conversation	F	3		
mad	food	D	1		
morgenmad	breakfast	D	1		en
frokost	lunch	D	1		en
aftensmad	dinner	D	2		en
et måltid	a meal	D	2		
brød	bread	D	1		et
rugbrød	rye bread	D	3		et
smør	butter	D	2		
ost	cheese	D	2		en
mælk	milk	D	2		
fløde	cream	D	2		en
et æg	an egg	D	1		
kød	meat	D	1		
oksekød	beef	D	3		
svinekød	pork	D	3		
kylling	chicken (meat)	D	2		en
en pølse	a sausage	D	2		
laks	salmon	D	2		en
en reje	a shrimp	D	3		
ris	rice	D	2		
pasta	pasta	D	2		
en kartoffel	a potato	D	2		
en grøntsag	a vegetable	D	2		
en gulerod	a carrot	D	3		
et løg	an onion	D	1		
hvidløg	garlic	D	2		et
en tomat	a tomato	D	2		
en agurk	a cucumber	D	3		
en salat	a salad / lettuce	D	2		
en frugt	a fruit	D	2		
et æble	an apple	D	2		
en banan	a banana	D	2		
en appelsin	an orange	D	2		
en citron	a lemon	D	2		
et jordbær	a strawberry	D	2		
en vindrue	a grape	D	3		
en pære	a pear	D	3		
en nød	a nut	D	1		
en mandel	an almond	D	3		
en suppe	a soup	D	2		
en sovs	a sauce / gravy	D	2		
et krydderi	a spice	D	3		
peber	pepper	D	3		
sukker	sugar	D	2		
honning	honey	D	2		
syltetøj	jam	D	3		
en kage	a cake	D	2		
is	ice cream / ice	D	1		en
chokolade	chocolate	D	2		en
slik	candy	D	2		
en kiks	a biscuit	D	2		
juice	juice	D	2		en
en sodavand	a soda	D	2		
en øl	a beer	D	1		
en vin	a wine	D	1		
kaffe	coffee	D	1		en
te	tea	D	1		en
en drik	a drink	D	1		
et glas	a glass	D	1		
en kop	a cup	D	1		
en tallerken	a plate	D	2		
en skål	a bowl	D	1		
en ske	a spoon	D	1		
en gaffel	a fork	D	2		
en kniv	a knife	D	2		
en serviet	a napkin	D	2		
en opskrift	a recipe	D	2		
en ingrediens	an ingredient	D	3		
en smag	a taste	D	2		
lækker	delicious	D	1		
at tilberede	to prepare (food)	D	3	tilbereder|tilberedte|tilberedt	
at stege	to fry / roast	D	2	steger|stegte|stegt	
at koge	to boil	D	2	koger|kogte|kogt	
at bage	to bake	D	2	bager|bagte|bagt	
at grille	to grill	D	3	griller|grillede|grillet	
at skære	to cut	D	2	skærer|skar|skåret	
at rive	to grate	D	2	river|rev|revet	
at blande	to mix	D	2	blander|blandede|blandet	
at smage	to taste	D	2	smager|smagte|smagt	
at servere	to serve	D	2	serverer|serverede|serveret	
at bestille	to order	D	2	bestiller|bestilte|bestilt	
drikkepenge	a tip (money)	D	2		pl
en vegetar	a vegetarian	D	2		
en veganer	a vegan	D	3		
en allergi	an allergy	D	2		
appetit	appetite	D	2		en
skål	cheers	D	1		
franskbrød	white bread	D	3		et
en bolle	a bun	D	2		
en pandekage	a pancake	D	3		
risengrød	rice porridge	D	3		en
en frikadelle	a meatball	D	3		
leverpostej	liver pâté	D	3		en
rødgrød	red berry pudding	D	3		en
en snaps	a schnapps	D	3		
en rødvin	a red wine	D	2		
en hvidvin	a white wine	D	3		
et fadøl	a draft beer	D	3		
knækbrød	crispbread	D	3		et
müsli	muesli	D	3		en
yoghurt	yogurt	D	2		en
spegepølse	salami	D	3		en
et smørrebrød	an open sandwich	D	3		
en portion	a portion	D	2		
en gryde	a pot	D	3		
en pande	a pan	D	2		
et menukort	a menu	D	3		
en forret	a starter	D	3		
en hovedret	a main course	D	3		
en dessert	a dessert	D	2		
en duft	a smell	D	2		
en konsistens	a texture	D	3		
krydret	spicy	D	3		
mild	mild	D	2		
mættende	filling	D	3		
vegetarisk	vegetarian	D	3		
vegansk	vegan	D	3		
en bagning	a baking	D	3		
en stegning	a frying	D	3		
en kogning	a boiling	D	3		
en middag	a dinner / noon	D	1		
en whisky	a whisky	D	2		
champagne	champagne	D	2		en
sprut	booze	D	2		et
tyggegummi	chewing gum	D	2		et
en bøf	a steak / beef patty	D	2		
en kalkun	a turkey	D	2		
en småkage	a cookie / biscuit	D	2		
gin	gin	D	2		en
popcorn	popcorn	D	2		en
en skinke	a ham	D	2		
en snack	a snack	D	3		
et krus	a mug	D	2		
en teske	a teaspoon	D	3		
en spiseske	a tablespoon	D	4		
en dug	a tablecloth	D	3		
en bradepande	a roasting pan	D	4		
en bageplade	a baking tray	D	4		
et skærebræt	a cutting board	D	4		
en øse	a ladle	D	2		
et piskeris	a whisk	D	3		
en dåseåbner	a can opener	D	3		
en proptrækker	a corkscrew	D	3		
en termokande	a thermos	D	3		
en kaffemaskine	a coffee maker	D	3		
en elkedel	an electric kettle	D	4		
en brødrister	a toaster	D	3		
en mikroovn	a microwave	D	3		
rester	leftovers	D	3		pl
en brunch	a brunch	D	2		
drikkevarer	drinks / beverages	D	4		pl
kakao	cocoa / hot chocolate	D	2		en
saft	cordial / squash	D	3		en
et rundstykke	a bread roll	D	4		
et wienerbrød	a Danish pastry	D	3		
en kanelsnegl	a cinnamon roll	D	4		
en lagkage	a layer cake	D	3		
en vaffel	a waffle	D	3		
en æbleskive	an æbleskive (round Danish pancake)	D	4		
piskefløde	whipping cream	D	3		en
creme fraiche	crème fraîche	D	3		en
et spejlæg	a fried egg	D	3		
røræg	scrambled eggs	D	3		et
havregryn	oatmeal / rolled oats	D	4		pl
grød	porridge	D	3		en
cornflakes	cornflakes	D	4		pl
marmelade	marmalade / jam	D	3		en
pålæg	cold cuts / sandwich toppings	D	3		et
en hotdog	a hot dog	D	2		
en burger	a burger	D	2		
en pizza	a pizza	D	2		
nudler	noodles	D	4		pl
kartofler	potatoes	D	3		pl
pommes frites	French fries	D	4		pl
en sandwich	a sandwich	D	2		
lammekød	lamb (meat)	D	3		et
hakket oksekød	ground beef	D	3		et
flæskesteg	roast pork	D	3		en
bacon	bacon	D	2		en
torsk	cod	D	3		en
tun	tuna	D	2		en
sild	herring	D	2		en
rejer	shrimp	D	4		pl
en musling	a mussel / clam	D	3		
en hummer	a lobster	D	2		
en krabbe	a crab	D	3		
skaldyr	shellfish	D	4		pl
grøntsager	vegetables	D	4		pl
en peberfrugt	a bell pepper	D	4		
en squash	a zucchini	D	3		
en aubergine	an eggplant	D	3		
broccoli	broccoli	D	3		en
blomkål	cauliflower	D	3		en
kål	cabbage	D	3		en
spinat	spinach	D	3		en
ærter	peas	D	4		pl
bønner	beans	D	2		pl
majs	corn	D	2		en
en porre	a leek	D	4		
selleri	celery	D	3		en
en rødbede	a beet	D	3		
en champignon	a mushroom	D	3		
en avocado	an avocado	D	3		
en oliven	an olive	D	3		
en lime	a lime	D	2		
en blomme	a plum / yolk	D	3		
en fersken	a peach	D	3		
en abrikos	an apricot	D	3		
et kirsebær	a cherry	D	2		
et hindbær	a raspberry	D	3		
et blåbær	a blueberry	D	3		
et solbær	a blackcurrant	D	4		
en melon	a melon	D	3		
en vandmelon	a watermelon	D	3		
en ananas	a pineapple	D	3		
en mango	a mango	D	3		
en kiwi	a kiwi	D	3		
en rosin	a raisin	D	3		
en jordnød	a peanut	D	3		
en hasselnød	a hazelnut	D	3		
en valnød	a walnut	D	3		
salt	salt	D	2		et
mel	flour	D	2		et
gær	yeast	D	3		en
bagepulver	baking powder	D	3		et
olie	oil	D	2		en
olivenolie	olive oil	D	3		en
eddike	vinegar	D	3		en
sennep	mustard	D	2		en
ketchup	ketchup	D	2		en
mayonnaise	mayonnaise	D	3		en
remoulade	remoulade (Danish relish sauce)	D	3		en
dressing	dressing	D	3		en
krydderier	spices	D	4		pl
kanel	cinnamon	D	3		en
vanilje	vanilla	D	3		en
persille	parsley	D	3		en
dild	dill	D	3		en
purløg	chives	D	3		et
basilikum	basil	D	3		en
karry	curry	D	3		en
chili	chili	D	2		en
ingefær	ginger	D	3		en
lakrids	licorice	D	3		en
en flødebolle	a chocolate-covered marshmallow treat	D	4		
chips	chips / crisps	D	3		pl
et takeaway	a takeaway	D	3		
et bageri	a bakery	D	3		
en grønthandler	a greengrocer	D	4		
en kantine	a canteen / cafeteria	D	3		
en madvogn	a food truck	D	4		
en grill	a grill / barbecue	D	2		
at lave mad	to cook	D	1	laver mad|lavede mad|lavet mad	
at riste	to toast / roast	D	4	rister|ristede|ristet	
at hakke	to chop / mince	D	4	hakker|hakkede|hakket	
at skrælle	to peel	D	4	skræller|skrællede|skrællet	
at piske	to whisk / whip	D	4	pisker|piskede|pisket	
at røre rundt	to stir	D	1	rører rundt|rørte rundt|rørt rundt	
at krydre	to season	D	4	krydrer|krydrede|krydret	
at smøre	to spread / butter	D	2	smører|smurte|smurt	
at dække bord	to set the table	D	2	dækker bord|dækkede bord|dækket bord	
at tage af bordet	to clear the table	D	1	tager af bordet|tog af bordet|taget af bordet	
at skænke	to pour (a drink)	D	4	skænker|skænkede|skænket	
at nippe	to sip	D	4	nipper|nippede|nippet	
at tygge	to chew	D	4	tygger|tyggede|tygget	
at mætte	to fill (up) / satisfy	D	4	mætter|mættede|mættet	
at skåle	to toast (with drinks)	D	3	skåler|skålede|skålet	
velsmagende	tasty	D	4		
saltet	salted	D	4		
kogt	boiled	D	4		
stegt	fried / roasted	D	3		
bagt	baked	D	4		
sprød	crispy	D	4		
mør	tender	D	4		
mager	lean / skinny	D	4		
glutenfri	gluten-free	D	4		
laktosefri	lactose-free	D	4		
hjemmelavet	homemade	D	4		
færdiglavet	ready-made	D	4		
frossen	frozen	D	4		
en karton	a carton	D	3		
en krukke	a jar	D	3		
en skive	a slice	D	3		
en klat	a dollop / blob	D	3		
en knivspids	a pinch	D	4		
en spisning	a meal / dinner (event)	D	3		
en madkasse	a lunch box	D	3		
en vandflaske	a water bottle	D	3		
en kaffekop	a coffee cup	D	3		
et vinglas	a wine glass	D	3		
en ølflaske	a beer bottle	D	4		
en tekande	a teapot	D	4		
en kaffekande	a coffee pot	D	4		
en sukkerskål	a sugar bowl	D	4		
en saltbøsse	a salt shaker	D	4		
en peberkværn	a pepper mill	D	4		
en smørkniv	a butter knife	D	4		
en osteskærer	a cheese slicer	D	4		
en brødkniv	a bread knife	D	4		
et æggebæger	an egg cup	D	4		
en kagerulle	a rolling pin	D	4		
en blender	a blender	D	3		
en røremaskine	a stand mixer	D	4		
en airfryer	an air fryer	D	4		
en pølsevogn	a hot dog stand	D	3		
en grillbar	a fast-food grill	D	3		
en pizzeria	a pizzeria	D	3		
et konditori	a pastry shop / café	D	4		
en vinbar	a wine bar	D	4		
et værtshus	a pub	D	3		
en bodega	a local bar (Danish)	D	3		
et bryggeri	a brewery	D	3		
en drink	a drink (cocktail)	D	1		
et shot	a shot	D	2		
en frugtsalat	a fruit salad	D	4		
en risalamande	a Danish rice pudding with almonds	D	3		
en æblekage	an apple dessert	D	4		
en koldskål	a cold buttermilk dessert	D	4		
en kammerjunker	a small Danish cookie	D	4		
en brunsviger	a Funen brown-sugar cake	D	4		
en hindbærsnitte	a raspberry slice (pastry)	D	4		
en romkugle	a rum ball	D	4		
stegt flæsk	fried pork belly	D	3		et
en tartelet	a tartlet (vol-au-vent)	D	4		
en hakkebøf	a hamburger steak	D	4		
boller i karry	meatballs in curry sauce	D	4		pl
en medisterpølse	a Danish pork sausage	D	4		
en rullepølse	a rolled pork sausage (cold cut)	D	4		
en fiskefrikadelle	a fish cake	D	4		
en rejemad	a shrimp open sandwich	D	4		
en æggemad	an egg open sandwich	D	4		
en ostemad	a cheese sandwich	D	3		
en toast	a toasted sandwich	D	2		
en wrap	a wrap	D	4		
en smoothie	a smoothie	D	3		
en milkshake	a milkshake	D	3		
kakaomælk	chocolate milk	D	3		en
skummetmælk	skim milk	D	3		en
letmælk	low-fat milk	D	3		en
sødmælk	whole milk	D	3		en
kærnemælk	buttermilk	D	3		en
ymer	ymer (Danish soured milk)	D	3		en
skyr	skyr	D	3		en
smøreost	cream cheese	D	3		en
flødeost	cream cheese	D	3		en
hytteost	cottage cheese	D	3		en
mozzarella	mozzarella	D	3		en
parmesan	parmesan	D	3		en
feta	feta	D	3		en
havremælk	oat milk	D	3		en
sojamælk	soy milk	D	3		en
tofu	tofu	D	3		en
linser	lentils	D	4		pl
kikærter	chickpeas	D	4		pl
quinoa	quinoa	D	3		en
bulgur	bulgur	D	3		en
couscous	couscous	D	3		en
en tortilla	a tortilla	D	4		
en pita	a pita	D	3		
en baguette	a baguette	D	4		
en croissant	a croissant	D	3		
en muffin	a muffin	D	3		
en donut	a donut	D	3		
en cheesecake	a cheesecake	D	3		
en brownie	a brownie	D	3		
flormelis	powdered sugar	D	3		et
rørsukker	cane sugar	D	3		et
sirup	syrup	D	3		en
nødder	nuts	D	3		pl
tørret frugt	dried fruit	D	2		en
fuldkorn	whole grain	D	3		et
en madplan	a meal plan	D	4		
en madvare	a food product	D	4		
alkohol	alcohol	D	2		en
brunede kartofler	caramelized potatoes	D	3		pl
et bær	a berry	D	1		
flæsk	pork (belly)	D	3		et
gluten	gluten	D	3		et
havre	oats	D	3		en
en kødbolle	a meatball (dumpling)	D	3		
en livret	a favorite dish	D	2		
en madpakke	a packed lunch	D	3		
en menu	a menu	D	2		
spaghetti	spaghetti	D	2		en
gløgg	mulled wine	D	3		en
en fastelavnsbolle	a Shrovetide bun	D	4		
en fødselsdagskage	a birthday cake	D	3		
at faste	to fast	D	3	faster|fastede|fastet	
appelsinjuice	orange juice	D	3		en
en bid	a bite	D	2		
en chokoladekage	a chocolate cake	D	3		
en fødevare	a food item	D	3		
hvedemel	wheat flour	D	3		et
en kaffeautomat	a coffee machine (vending)	D	4		
en kagedej	a cake batter	D	4		
en dej	a dough	D	3		
en madkultur	a food culture	D	4		
en søndagsmiddag	a Sunday dinner	D	4		
et kaffebord	a coffee table (with cake)	D	4		
en krydderurt	a herb	D	4		
et spisested	an eatery	D	3		
madspild	food waste	D	3		et
en madrest	a food scrap	D	3		
et kaffefilter	a coffee filter	D	4		
en tepose	a tea bag	D	3		
et sugerør	a drinking straw	D	3		
en frysepose	a freezer bag	D	4		
madpapir	sandwich paper	D	3		et
sølvpapir	aluminum foil	D	3		et
bagepapir	baking paper	D	3		et
husholdningsfilm	cling film	D	3		en
en køkkenvægt	a kitchen scale	D	4		
et målebæger	a measuring cup	D	4		
en si	a sieve / strainer	D	1		
et dørslag	a colander	D	4		
et rivejern	a grater	D	4		
en skrællekniv	a peeler	D	4		
en stegepande	a frying pan	D	3		
en kasserolle	a saucepan	D	4		
et fad	a dish (serving)	D	1		
et ildfast fad	an ovenproof dish	D	4		
en muffinform	a muffin tin	D	4		
en kageform	a cake tin	D	4		
en termokop	a travel mug	D	4		
en vandkaraffel	a water carafe	D	4		
en isterning	an ice cube	D	3		
en flaskeåbner	a bottle opener	D	4		
en morgenkaffe	a morning coffee	D	3		
en eftermiddagskaffe	an afternoon coffee	D	4		
en frugtskål	a fruit bowl	D	4		
en brødkurv	a bread basket	D	4		
bestik	cutlery	D	3		et
porcelæn	china / porcelain	D	3		et
en morgenmadsbuffet	a breakfast buffet	D	4		
en buffet	a buffet	D	3		
en vinliste	a wine list	D	4		
en børnemenu	a kids' menu	D	4		
en dagens ret	a dish of the day	D	2		
en hovedingrediens	a main ingredient	D	4		
en yndlingsret	a favorite dish	D	3		
en kødspiser	a meat eater	D	4		
en restaurantgæst	a restaurant guest	D	4		
en madanmelder	a food critic	D	4		
en smagsprøve	a taste / sample	D	3		
saftevand	diluted cordial	D	3		en
en isvaffel	an ice cream cone	D	3		
en sodavandsis	a popsicle	D	4		
en slikpind	a lollipop	D	4		
en pebernød	a small Christmas spice cookie	D	4		
en vaniljekrans	a vanilla butter cookie	D	4		
en honningkage	a honey cake / gingerbread	D	4		
en brunkage	a Danish spice cookie	D	4		
en klejne	a Christmas cruller	D	4		
en kransekage	a marzipan ring cake	D	4		
marcipan	marzipan	D	3		en
nougat	nougat	D	3		en
en karamel	a caramel	D	3		
en lejlighed	an apartment	H	1		
et værelse	a room	H	1		
et soveværelse	a bedroom	H	2		
et badeværelse	a bathroom	H	2		
et køkken	a kitchen	H	2		
en stue	a living room	H	2		
en entré	a hallway	H	3		
en altan	a balcony	H	3		
en kælder	a basement	H	2		
en garage	a garage	H	2		
en nøgle	a key	H	1		
en lås	a lock	H	1		
en lampe	a lamp	H	2		
et ur	a clock / watch	H	2		
et spejl	a mirror	H	2		
et gardin	a curtain	H	2		
et tæppe	a rug / blanket	H	2		
en pude	a pillow	H	2		
en dyne	a duvet	H	3		
et håndklæde	a towel	H	2		
sæbe	soap	H	2		
shampoo	shampoo	H	3		
en tandbørste	a toothbrush	H	2		
tandpasta	toothpaste	H	3		
et toilet	a toilet	H	2		
et badekar	a bathtub	H	2		
en bruser	a shower	H	3		
en vask	a sink	H	2		
et komfur	a stove	H	3		
en ovn	an oven	H	2		
et køleskab	a fridge	H	2		
en fryser	a freezer	H	2		
en opvaskemaskine	a dishwasher	H	3		
en vaskemaskine	a washing machine	H	3		
en tørretumbler	a dryer	H	3		
en støvsuger	a vacuum cleaner	H	3		
affald	trash	H	2		
en skraldespand	a trash can	H	2		
en kost	a broom	H	1		
en moppe	a mop	H	3		
en stikkontakt	an outlet	H	3		
en fjernbetjening	a remote control	H	2		
et tv	a TV	H	1		
en radio	a radio	H	2		
en computer	a computer	H	1		
en telefon	a phone	H	1		
en oplader	a charger	H	3		
et møbel	a piece of furniture	H	3		
en reol	a bookshelf	H	3		
et skrivebord	a desk	H	2		
en sofa	a sofa	H	2		
en lænestol	an armchair	H	3		
en trappe	a staircase / stairs	H	2		
en elevator	an elevator	H	2		
en postkasse	a mailbox	H	3		
husleje	rent	H	2		
forsikring	insurance	H	2		
et abonnement	a subscription	H	3		
internet	internet	H	2		
wifi	wifi	H	3		
en husholdning	a household	H	3		
et gøremål	a chore	H	3		
et indkøb	a purchase	H	2		
en indkøbsliste	a shopping list	H	3		
at feje	to sweep	H	2	fejer|fejede|fejet	
at stryge	to iron	H	3	stryger|strøg|strøget	
tøj	clothes	H	1		
en lyspære	a lightbulb	H	3		
en alarm	an alarm	H	2		
et vækkeur	an alarm clock	H	3		
en kalender	a calendar	H	2		
en seddel	a note	H	2		
en liste	a list	H	1		
en pose	a bag	H	2		
en kurv	a basket	H	2		
en flaske	a bottle	H	2		
en dåse	a can	H	2		
en pakke	a package	H	1		
en æske	a box	H	2		
en taske	a bag / purse	H	1		
en rygsæk	a backpack	H	2		
en paraply	an umbrella	H	2		
en bolig	a home/residence	H	2		
en villa	a detached house	H	2		
en udlejer	a landlord	H	3		
en lejer	a tenant	H	2		
et depositum	a deposit	H	3		
en lejekontrakt	a lease	H	3		
en ejendom	a property	H	2		
en ejendomsmægler	a real estate agent	H	2		
et boligmarked	a housing market	H	3		
et lån	a loan	H	1		
et realkreditlån	a mortgage	H	3		
en renovering	a renovation	H	3		
en ombygning	a remodel	H	3		
en flytning	a move	H	3		
en flyttekasse	a moving box	H	3		
et byggeri	a construction	H	3		
en terrasse	a terrace	H	3		
en indretning	an interior design	H	3		
en vedligeholdelse	a maintenance	H	3		
en rengøring	a cleaning	H	2		
en støvsugning	a vacuuming	H	3		
en opvask	a dishwashing	H	3		
en tøjvask	a laundry	H	3		
en strygning	an ironing	H	3		
en oprydning	a tidying up	H	3		
en affaldssortering	a waste sorting	H	3		
en madlavning	a cooking	H	2		
en græsslåning	a lawn mowing	H	3		
en snerydning	a snow removal	H	3		
en reparation	a repair	H	3		
et rengøringsmiddel	a cleaning product	H	3		
en gulvvask	a floor washing	H	3		
en vinduespudsning	a window cleaning	H	3		
en sengeredning	a bed-making	H	3		
en støvning	a dusting	H	3		
en ventetid	a wait time	H	2		
en kø	a queue	H	2		
en åbningstid	an opening hour	H	3		
en lukketid	a closing time	H	3		
en ombytning	an exchange	H	3		
en returnering	a return	H	3		
en garanti	a warranty	H	2		
en undtagelse	an exception	H	2		
en betingelse	a condition	H	2		
et krav	a requirement	H	2		
en tilladelse	a permission	H	1		
et forbud	a ban	H	2		
et rum	a room / space	H	1		
strøm	electricity / current	H	2		en
en mur	a wall (outer)	H	2		
et rør	a pipe / tube / receiver	H	1		
en hytte	a cabin / hut	H	2		
et værktøj	a tool	H	2		
en port	a gate	H	2		
en post	a mail / post	H	2		
støv	dust	H	2		et
ejendele	belongings	H	3		pl
sengetid	bedtime	H	2		en
et ærinde	an errand	H	2		
en indgang	an entrance	H	2		
en spand	a bucket	H	2		
et nabolag	a neighborhood	H	2		
skrald	garbage	H	2		et
en rutine	a routine	H	2		
en livsstil	a lifestyle	H	2		
et hegn	a fence	H	2		
elektricitet	electricity	H	2		en
et brusebad	a shower	H	2		
en hoveddør	a front door	H	2		
en sal	a hall	H	2		
en saks	a pair of scissors	H	2		
en økse	an axe	H	2		
snavs	dirt	H	2		et
at vaske op	to do the dishes	H	2	vasker op|vaskede op|vasket op	
at tørre af	to wipe / dry (dishes)	H	2	tørrer af|tørrede af|tørret af	
et rækkehus	a terraced house / townhouse	H	4		
et sommerhus	a summer house / cottage	H	2		
en husleje	a rent	H	2		
en opgang	a stairwell / entrance	H	3		
et loftsrum	an attic room	H	4		
en gang	a hallway / corridor	H	1		
et børneværelse	a children's room	H	3		
et gæsteværelse	a guest room	H	3		
et skur	a shed	H	2		
en carport	a carport	H	4		
en indkørsel	a driveway	H	3		
en dørklokke	a doorbell	H	3		
et håndtag	a handle	H	2		
en vindueskarm	a windowsill	H	3		
en persienne	a blind (window)	H	4		
en radiator	a radiator	H	3		
en lyskontakt	a light switch	H	4		
en elpære	a light bulb	H	4		
en loftslampe	a ceiling light	H	4		
et stearinlys	a candle	H	2		
en lysestage	a candlestick	H	3		
et sofabord	a coffee table	H	3		
et spisebord	a dining table	H	3		
en hylde	a shelf	H	2		
en kommode	a chest of drawers	H	3		
en skuffe	a drawer	H	2		
et klædeskab	a wardrobe	H	3		
en knage	a coat hook	H	4		
et lagen	a sheet	H	3		
et dynebetræk	a duvet cover	H	4		
et pudebetræk	a pillowcase	H	4		
en madras	a mattress	H	2		
en vugge	a cradle	H	3		
en køjeseng	a bunk bed	H	3		
en natlampe	a bedside lamp	H	4		
en plakat	a poster	H	3		
en potteplante	a houseplant	H	4		
en vase	a vase	H	3		
en håndvask	a sink (bathroom)	H	3		
en vandhane	a faucet / tap	H	3		
balsam	conditioner	H	3		en
en deodorant	a deodorant	H	3		
en kam	a comb	H	2		
en hårbørste	a hairbrush	H	3		
en føntørrer	a hairdryer	H	4		
en barbermaskine	a razor / shaver	H	3		
toiletpapir	toilet paper	H	2		et
en vatpind	a cotton swab	H	3		
et tørrestativ	a drying rack	H	4		
vasketøj	laundry	H	2		et
vaskepulver	laundry detergent	H	3		et
et strygejern	an iron	H	3		
et strygebræt	an ironing board	H	4		
en fejebakke	a dustpan	H	4		
en klud	a cloth / rag	H	3		
opvaskemiddel	dish soap	H	3		et
en skraldepose	a garbage bag	H	4		
en container	a container	H	2		
en stige	a ladder	H	2		
en hammer	a hammer	H	2		
en skrue	a screw	H	2		
et søm	a nail	H	2		
en tang	a pair of pliers / seaweed	H	2		
et målebånd	a tape measure	H	3		
maling	paint	H	2		en
tapet	wallpaper	H	3		et
et gulvtæppe	a carpet	H	3		
en flise	a tile	H	4		
en ventilator	a fan	H	3		
en emhætte	a cooker hood	H	4		
en kogeplade	a hotplate	H	4		
en plæne	a lawn	H	3		
en græsslåmaskine	a lawnmower	H	3		
en rive	a rake	H	2		
en skovl	a shovel	H	2		
en vandkande	a watering can	H	4		
en haveslange	a garden hose	H	4		
et bed	a flower bed	H	1		
en hæk	a hedge	H	3		
en låge	a gate (small)	H	2		
husarbejde	housework	H	3		et
at gøre rent	to clean	H	1	gør rent|gjorde rent|gjort rent	
at støvsuge	to vacuum	H	4	støvsuger|støvsugede|støvsuget	
at vaske gulv	to mop the floor	H	4	vasker gulv|vaskede gulv|vasket gulv	
at vaske tøj	to do laundry	H	2	vasker tøj|vaskede tøj|vasket tøj	
at folde	to fold	H	4	folder|foldede|foldet	
at hænge op	to hang up	H	1	hænger op|hængte op|hængt op	
at rede seng	to make the bed	H	2	reder seng|redte seng|redt seng	
at lufte ud	to air out	H	4	lufter ud|luftede ud|luftet ud	
at tage skraldet ud	to take out the trash	H	3	tager skraldet ud|tog skraldet ud|taget skraldet ud	
at vande	to water	H	1	vander|vandede|vandet	
at slå græs	to mow the lawn	H	2	slår græs|slog græs|slået græs	
at luge	to weed	H	4	luger|lugede|luget	
at plante	to plant	H	2	planter|plantede|plantet	
at bore	to drill	H	4	borer|borede|boret	
at skrue	to screw	H	2	skruer|skruede|skruet	
at låse	to lock	H	1	låser|låste|låst	
at låse op	to unlock	H	1	låser op|låste op|låst op	
at banke på	to knock	H	2	banker på|bankede på|banket på	
at ringe på	to ring the doorbell	H	1	ringer på|ringede på|ringet på	
at flytte ind	to move in	H	1	flytter ind|flyttede ind|flyttet ind	
at flytte ud	to move out	H	1	flytter ud|flyttede ud|flyttet ud	
at indrette	to furnish / decorate	H	4	indretter|indrettede|indrettet	
at renovere	to renovate	H	4	renoverer|renoverede|renoveret	
at stå op	to get up	H	1	står op|stod op|stået op	
at gå i seng	to go to bed	H	1	går i seng|gik i seng|gået i seng	
at falde i søvn	to fall asleep	H	1	falder i søvn|faldt i søvn|faldet i søvn	
at tage bad	to take a shower	H	1	tager bad|tog bad|taget bad	
at børste tænder	to brush teeth	H	4	børster tænder|børstede tænder|børstet tænder	
at klæde sig på	to get dressed	H	2	klæder sig på|klædte sig på|klædt sig på	
at klæde sig af	to get undressed	H	2	klæder sig af|klædte sig af|klædt sig af	
at barbere sig	to shave	H	4	barberer sig|barberede sig|barberet sig	
at rede håret	to comb one's hair	H	2	reder håret|redte håret|redt håret	
at sminke sig	to put on makeup	H	4	sminker sig|sminkede sig|sminket sig	
at handle ind	to go grocery shopping	H	2	handler ind|handlede ind|handlet ind	
at snooze	to snooze	H	4	snoozer|snoozede|snoozet	
at sove over sig	to oversleep	H	1	sover over sig|sov over sig|sovet over sig	
at få besøg	to have visitors	H	1	får besøg|fik besøg|fået besøg	
rodet	messy	H	2		
ryddelig	tidy	H	4		
møbleret	furnished	H	4		
lun	warm / cozy	H	4		
kølig	cool	H	4		
fugtig	damp / humid	H	4		
støjende	noisy	H	4		
rummelig	spacious	H	4		
trang	cramped	H	4		
en boligforening	a housing association	H	4		
en andelsbolig	a cooperative apartment	H	4		
en ejerlejlighed	a condominium	H	3		
en lejebolig	a rental home	H	4		
et kollegium	a student dormitory	H	3		
en husstand	a household	H	3		
en opslagstavle	a bulletin board	H	3		
en brugsanvisning	a user manual	H	3		
en indflytning	a move-in	H	4		
en køkkenrulle	a roll of paper towels	H	3		
en opvaskebørste	a dish brush	H	4		
et viskestykke	a dish towel	H	4		
en grydelap	a pot holder	H	4		
et køkkenur	a kitchen timer	H	4		
et spisekammer	a pantry	H	3		
et bryggers	a utility room	H	4		
et vaskerum	a laundry room	H	3		
en tørresnor	a clothesline	H	4		
en klemme	a clothespin / clip	H	2		
en bøjle	a hanger / brace	H	3		
et skohorn	a shoehorn	H	4		
en dørmåtte	a doormat	H	3		
et paraplystativ	an umbrella stand	H	4		
en brevsprække	a mail slot	H	4		
en røgalarm	a smoke alarm	H	4		
en sikringsboks	a fuse box	H	4		
en varmepumpe	a heat pump	H	4		
fjernvarme	district heating	H	3		en
en elregning	an electricity bill	H	3		
en vandregning	a water bill	H	4		
et strømstik	a power plug	H	4		
en forlængerledning	an extension cord	H	3		
en stikdåse	a power strip	H	4		
et natbord	a nightstand	H	3		
en sengegavl	a headboard	H	4		
en skammel	a stool	H	3		
en havestol	a garden chair	H	4		
en parasol	a parasol	H	3		
grillkul	charcoal	H	4		pl
en tøjkurv	a laundry basket	H	4		
en boremaskine	a drill	H	3		
et bræt	a board	H	2		
en børste	a brush	H	2		
en etage	a floor (story)	H	2		
et fjernsyn	a television	H	2		
gør det selv	do it yourself	H	1		
hjemme	at home	H	1		
hjem	home (direction)	H	1		
et køkkenbord	a kitchen table / counter	H	3		
en ledning	a cord / cable	H	2		
en planke	a plank	H	3		
en skruetrækker	a screwdriver	H	3		
en skorsten	a chimney	H	3		
en tagrende	a gutter	H	4		
en facade	a facade	H	3		
et fundament	a foundation	H	3		
isolering	insulation	H	3		en
en mursten	a brick	H	2		
en dørkarm	a door frame	H	4		
en rude	a window pane	H	2		
en lampeskærm	a lampshade	H	4		
en plaid	a throw blanket	H	4		
en sovesofa	a sofa bed	H	3		
en vaskekælder	a laundry room (in basement)	H	4		
et fællesvaskeri	a shared laundry room	H	4		
en vicevært	a caretaker / janitor	H	3		
et bad	a bath / shower	H	1		
et vaskeri	a laundromat	H	3		
et kvarter	a neighborhood	H	2		
en boligkarré	a city block	H	4		
et husnummer	a house number	H	4		
et postnummer	a postal code	H	3		
en etagebolig	an apartment building	H	4		
en brandtrappe	a fire escape	H	3		
en tagterrasse	a roof terrace	H	4		
en gårdhave	a courtyard garden	H	4		
en balkon	a balcony	H	2		
en dekoration	a decoration	H	3		
en mikrobølgeovn	a microwave oven	H	3		
en barneseng	a crib	H	4		
belysning	lighting	H	3		en
en bogreol	a bookcase	H	4		
en bordplade	a tabletop / countertop	H	4		
en gadedør	a street door	H	4		
en hushjælp	a domestic helper	H	3		
en husregel	a house rule	H	4		
en morgenrutine	a morning routine	H	4		
en aftenrutine	an evening routine	H	4		
pladsmangel	lack of space	H	3		en
en spisestue	a dining room	H	3		
et hobbyrum	a hobby room	H	4		
barberskum	shaving foam	H	3		et
en badevægt	a bathroom scale	H	4		
en bademåtte	a bath mat	H	4		
et bruseforhæng	a shower curtain	H	4		
en toiletbørste	a toilet brush	H	4		
et tandkrus	a toothbrush cup	H	4		
et medicinskab	a medicine cabinet	H	3		
en rejse	a trip / journey	R	1		
et pas	a passport	R	1		
et visum	a visa	R	4		
en billet	a ticket	R	2		
bagage	luggage	R	2		
en kuffert	a suitcase	R	3		
en taxa	a taxi	R	2		
en metro	a metro	R	4		
en færge	a ferry	R	2		
en motorcykel	a motorcycle	R	3		
en motorvej	a motorway	R	3		
en sti	a path	R	3		
et kort	a map	R	1		
en afgang	a departure	R	3		
en ankomst	an arrival	R	3		
en forsinkelse	a delay	R	3		
en gate	a gate	R	4		
en perron	a platform	R	4		
en pilot	a pilot	R	2		
en stewardesse	a flight attendant	R	4		
en destination	a destination	R	4		
en grænse	a border	R	2		
told	customs	R	4		
et vandrehjem	a hostel	R	4		
en campingplads	a campsite	R	4		
et telt	a tent	R	3		
en sovepose	a sleeping bag	R	4		
et bagagerum	a trunk	R	4		
et sæde	a seat	R	3		
en sikkerhedssele	a seatbelt	R	4		
en tank	a tank	R	1		
benzin	petrol	R	2		
diesel	diesel	R	4		
en tankstation	a gas station	R	4		
parkering	parking	R	4		
en p-plads	a parking spot	R	4		
trafik	traffic	R	3		
et trafiklys	a traffic light	R	4		
et fortov	a sidewalk	R	4		
en fodgænger	a pedestrian	R	4		
en rundkørsel	a roundabout	R	4		
et kryds	an intersection	R	3		
en adresse	an address	R	2		
et kompas	a compass	R	2		
en rute	a route	R	3		
en udflugt	an excursion	R	4		
en seværdighed	an attraction	R	4		
en guide	a guide	R	3		
en reservation	a reservation	R	4		
en afrejse	a departure (trip)	R	4		
en hjemrejse	a return trip	R	4		
jetlag	jet lag	R	4		
en souvenir	a souvenir	R	4		
en landsby	a village	R	2		
en hovedstad	a capital city	R	4		
en region	a region	R	4		
en kyst	a coast	R	3		
en ø	an island	R	2		
en halvø	a peninsula	R	4		
en fjord	a fjord	R	4		
en dal	a valley	R	2		
en slette	a plain	R	3		
en rejseplan	an itinerary	R	4		
en aflysning	a cancellation	R	4		
en boardingpas	a boarding pass	R	4		
en toldkontrol	a customs check	R	4		
en ambassade	an embassy	R	3		
en rejseforsikring	a travel insurance policy	R	4		
en vaccination	a vaccination	R	4		
en tidszone	a time zone	R	4		
en lokalbefolkning	a local population	R	4		
et vandrerhjem	a hostel	R	4		
en udlejningsbil	a rental car	R	4		
en tur	a trip / turn	R	1		
et dæk	a tire / deck	R	2		
en lift	a lift (ride)	R	2		
en fart	a speed	R	1		
en kurs	a course (direction) / exchange rate	R	2		
ombord	on board	R	2		
øst	east	R	2		
en motor	an engine	R	2		
en helikopter	a helicopter	R	3		
nordpå	northward	R	3		
en lastbil	a truck	R	3		
et kørekort	a driver's license	R	3		
et sving	a turn / curve	R	3		
en udsigt	a view / prospect	R	3		
brændstof	fuel	R	2		et
et motel	a motel	R	3		
et hjul	a wheel	R	3		
en hastighed	a speed	R	3		
en besætning	a crew	R	3		
sydpå	southward	R	3		
sydlig	southern	R	4		
nordlig	northern	R	4		
et rat	a steering wheel	R	4		
en udgang	an exit	R	3		
i udlandet	abroad	R	3		
en passager	a passenger	R	3		
et ophold	a stay	R	3		
et fartøj	a vessel / craft	R	3		
et køretøj	a vehicle	R	3		
en bilulykke	a car accident	R	3		
en varevogn	a van	R	3		
en landing	a landing	R	3		
en parkeringsplads	a parking space / lot	R	3		
en koordinat	a coordinate	R	3		
en reception	a reception (desk)	R	3		
en suite	a suite	R	3		
vestpå	westward	R	3		
en færd	a journey / conduct	R	3		
vestlig	western	R	4		
en rejsende	a traveler	R	3		
parkeret	parked	R	3		
østpå	eastward	R	4		
en gyde	an alley	R	4		
en lobby	a lobby	R	4		
en last	a cargo / vice	R	3		
en ubåd	a submarine	R	4		
en weekendtur	a weekend trip	R	4		
en turistattraktion	a tourist attraction	R	4		
et landkort	a map	R	4		
en guidebog	a guidebook	R	4		
håndbagage	carry-on luggage	R	3		en
en flybillet	a plane ticket	R	4		
en returbillet	a return ticket	R	4		
en enkeltbillet	a one-way ticket	R	4		
et rejsekort	a travel card (Danish transit card)	R	4		
en køreplan	a timetable	R	4		
et check-in	a check-in	R	4		
en sikkerhedskontrol	a security check	R	4		
en flyrejse	a flight (trip)	R	4		
en landingsbane	a runway	R	4		
en vinduesplads	a window seat	R	4		
en midtergang	an aisle	R	4		
en togstation	a train station	R	4		
en hovedbanegård	a central station	R	4		
et S-tog	an S-train (Copenhagen commuter train)	R	4		
en letbane	a light rail	R	4		
en sporvogn	a tram	R	4		
et busstoppested	a bus stop	R	4		
en buschauffør	a bus driver	R	4		
en havn	a harbor / port	R	2		
et krydstogt	a cruise	R	4		
en elbil	an electric car	R	4		
en knallert	a moped	R	4		
en scooter	a scooter	R	4		
en ladcykel	a cargo bike	R	4		
en cykelsti	a bike lane	R	4		
en cykelhjelm	a bike helmet	R	4		
en landevej	a country road	R	4		
et lyskryds	an intersection with traffic lights	R	4		
et fodgængerfelt	a crosswalk	R	4		
en omkørsel	a detour	R	4		
en ladestander	a charging station	R	4		
en parkeringsbøde	a parking ticket	R	4		
en fartbøde	a speeding ticket	R	4		
et enkeltværelse	a single room	R	4		
et dobbeltværelse	a double room	R	4		
et nøglekort	a key card	R	4		
en overnatning	an overnight stay	R	4		
en storby	a big city	R	4		
en forstad	a suburb	R	4		
en bydel	a district / part of town	R	4		
et torv	a (market) square	R	4		
en gågade	a pedestrian street	R	4		
et tårn	a tower	R	3		
et monument	a monument	R	4		
en statue	a statue	R	4		
et springvand	a fountain	R	4		
en katedral	a cathedral	R	4		
et galleri	a gallery	R	4		
en forlystelsespark	an amusement park	R	4		
et akvarium	an aquarium	R	4		
en strandpromenade	a beach promenade	R	4		
en bænk	a bench	R	4		
en legeplads	a playground	R	4		
et offentligt toilet	a public restroom	R	3		
et konsulat	a consulate	R	4		
et posthus	a post office	R	4		
en brandstation	a fire station	R	4		
at gå en tur	to go for a walk	R	1	går en tur|gik en tur|gået en tur	
at tage toget	to take the train	R	2	tager toget|tog toget|taget toget	
at tage bussen	to take the bus	R	2	tager bussen|tog bussen|taget bussen	
at stå af	to get off	R	1	står af|stod af|stået af	
at stige på	to get on (a vehicle)	R	2	stiger på|steg på|steget på	
at stige af	to get off (a vehicle)	R	2	stiger af|steg af|steget af	
at lande	to land	R	1	lander|landede|landet	
at lette	to take off (plane)	R	2	letter|lettede|lettet	
at checke ind	to check in	R	4	checker ind|checkede ind|checket ind	
at checke ud	to check out	R	4	checker ud|checkede ud|checket ud	
at pakke ud	to unpack	R	2	pakker ud|pakkede ud|pakket ud	
at booke	to book	R	4	booker|bookede|booket	
at reservere	to reserve	R	3	reserverer|reserverede|reserveret	
at aflyse	to cancel	R	3	aflyser|aflyste|aflyst	
at nå toget	to catch the train	R	2	når toget|nåede toget|nået toget	
at parkere	to park	R	3	parkerer|parkerede|parkeret	
at tanke	to refuel	R	1	tanker|tankede|tanket	
at overhale	to overtake	R	4	overhaler|overhalede|overhalet	
at krydse	to cross	R	3	krydser|krydsede|krydset	
at fare vild	to get lost	R	1	farer vild|for vild|faret vild	
at finde vej	to find one's way	R	1	finder vej|fandt vej|fundet vej	
at spørge om vej	to ask for directions	R	1	spørger om vej|spurgte om vej|spurgt om vej	
at sejle	to sail	R	2	sejler|sejlede|sejlet	
at pendle	to commute	R	4	pendler|pendlede|pendlet	
at udforske	to explore	R	2	udforsker|udforskede|udforsket	
at blaffe	to hitchhike	R	4	blaffer|blaffede|blaffet	
til højre	to the right	R	1		
til venstre	to the left	R	1		
rundt om hjørnet	around the corner	R	2		
langt væk	far away	R	1		
forsinket	delayed	R	2		
aflyst	cancelled	R	3		
fuldt booket	fully booked	R	4		
udenlands	abroad	R	4		
indenlandsk	domestic	R	4		
en ankomsthal	an arrivals hall	R	4		
en kørsel	a drive / trip	R	4		
en togbillet	a train ticket	R	4		
en busbillet	a bus ticket	R	4		
et månedskort	a monthly pass	R	4		
et ungdomskort	a youth travel pass	R	4		
et klippekort	a punch card	R	4		
en billetautomat	a ticket machine	R	4		
en billetkontrollør	a ticket inspector	R	4		
en kontrolafgift	a penalty fare	R	4		
en togfører	a train conductor	R	4		
en lokomotivfører	a train driver	R	4		
en endestation	a terminus / last stop	R	4		
en mellemlanding	a layover	R	4		
et flyselskab	an airline	R	4		
et boardingkort	a boarding pass	R	4		
et bagagebånd	a baggage carousel	R	4		
hittegods	lost and found	R	3		et
et rejsebureau	a travel agency	R	4		
et sommerhusområde	a summer house area	R	4		
en badestrand	a bathing beach	R	4		
en livredder	a lifeguard	R	4		
solcreme	sunscreen	R	3		en
en isbod	an ice cream stand	R	4		
en båd	a boat	R	1		
en banegård	a railway station	R	3		
et centrum	a center (of town)	R	2		
en hjelm	a helmet	R	2		
højre	right (side)	R	1		
venstre	left (side)	R	1		
i nærheden	nearby	R	1		
en kro	an inn	R	2		
langt fra	far from	R	1		
nord	north	R	2		
syd	south	R	2		
vest	west	R	2		
et stoppested	a stop (bus)	R	3		
en tunnel	a tunnel	R	2		
tæt på	close to	R	1		
en vogn	a wagon / cart	R	2		
en afkørsel	an exit (highway)	R	4		
en tilkørsel	an on-ramp	R	4		
en motorcyklist	a motorcyclist	R	4		
en cyklist	a cyclist	R	4		
en bilist	a motorist	R	4		
en passagerfærge	a passenger ferry	R	4		
vejarbejde	roadworks	R	3		et
en fartgrænse	a speed limit	R	4		
et fartkamera	a speed camera	R	4		
en sele	a seat belt / harness	R	4		
en airbag	an airbag	R	4		
en bagagebærer	a luggage rack / bike rack	R	4		
en forrude	a windshield	R	4		
en vinduesvisker	a windshield wiper	R	4		
en kofanger	a bumper	R	4		
en nummerplade	a license plate	R	4		
en udstødning	an exhaust	R	4		
et gear	a gear	R	3		
en kobling	a clutch	R	4		
en speeder	an accelerator	R	4		
en bremse	a brake	R	4		
et blinklys	a turn signal	R	4		
en forlygte	a headlight	R	4		
en baglygte	a taillight	R	4		
en reservedel	a spare part	R	4		
en køreprøve	a driving test	R	4		
en køreskole	a driving school	R	4		
en kørelærer	a driving instructor	R	4		
et postkontor	a post office	R	4		
porto	postage	R	3		en
et autoværksted	a car repair shop	R	4		
en bilvask	a car wash	R	4		
et parkeringshus	a parking garage	R	4		
en parkeringsautomat	a parking meter	R	4		
en parkeringsvagt	a parking attendant	R	4		
en P-skive	a parking disc	R	4		
en cykelparkering	a bike parking	R	4		
en fodgængerzone	a pedestrian zone	R	4		
et gadekryds	a street corner / junction	R	4		
et udsigtspunkt	a viewpoint	R	4		
en havnepromenade	a harbor promenade	R	4		
en havnebus	a harbor bus	R	4		
en kanalrundfart	a canal tour	R	4		
en benzinstation	a gas station	R	4		
en bilnøgle	a car key	R	4		
en brandbil	a fire truck	R	4		
en dagsrejse	a day trip	R	4		
en fiskerby	a fishing village	R	4		
en flyvetid	a flight time	R	4		
en hovedgade	a main street	R	4		
en kystby	a coastal town	R	4		
en rundvisning	a guided tour	R	4		
en skraldebil	a garbage truck	R	4		
en togrejse	a train journey	R	4		
en udenrigsrejse	a trip abroad	R	4		
et cykelstativ	a bike rack	R	4		
et feriested	a holiday resort	R	4		
et hotelværelse	a hotel room	R	4		
et pasfoto	a passport photo	R	4		
et rejsemål	a destination	R	4		
et udflugtsmål	a destination for an outing	R	4		
et vejskilt	a road sign	R	4		
blæst	windy	W	4		
en storm	a storm	W	2		
et tordenvejr	a thunderstorm	W	4		
lyn	lightning	W	2		et
torden	thunder	W	2		en
tåge	fog	W	2		en
frost	frost	W	2		en
is (frozen water)	ice	W	4		
varme	heat	W	2		
kulde	cold (noun)	W	4		
en temperatur	a temperature	W	2		
grader	degrees	W	2		
et klima	a climate	W	4		
en årstid	a season	W	2		
skyet	cloudy	W	3		
solrigt	sunny	W	4		
regnfuldt	rainy	W	4		
fugtigt	humid	W	4		
en regnbue	a rainbow	W	4		
et blad (leaf)	a leaf	W	4		
en rod	a root	W	1		
en gren	a branch	W	4		
en plante	a plant	W	2		
et frø	a seed	W	3		
en busk	a bush	W	4		
en mark	a field	W	1		
en eng	a meadow	W	4		
en bakke	a hill	W	2		
en klippe	a cliff / rock	W	2		
en flod	a river	W	2		
en å	a stream	W	2		
en bølge	a wave	W	2		
sand	sand	W	2		
et insekt	an insect	W	3		
en bi	a bee	W	3		
en sommerfugl	a butterfly	W	4		
en myre	an ant	W	4		
en edderkop	a spider	W	4		
en flue	a fly	W	2		
en myg	a mosquito	W	4		
en orm	a worm	W	3		
en slange	a snake	W	3		
en frø	a frog	W	3		
en skildpadde	a turtle	W	4		
en ræv	a fox	W	4		
en ulv	a wolf	W	2		
en bjørn	a bear	W	2		
en hjort	a deer	W	4		
et egern	a squirrel	W	2		
en kanin	a rabbit	W	3		
en rotte	a rat	W	3		
dug	dew	W	4		
hagl	hail	W	3		
et snefnug	a snowflake	W	4		
en solnedgang	a sunset	W	2		
en solopgang	a sunrise	W	3		
en skygge	a shadow	W	3		
en ørken	a desert	W	3		
en vulkan	a volcano	W	3		
en gletsjer	a glacier	W	4		
et jordskælv	an earthquake	W	3		
biodiversitet	biodiversity	W	4		
en udryddelse	an extinction	W	4		
en emission	an emission	W	4		
en klode	a planet	W	4		
forurening	pollution	W	4		
genbrug	recycling	W	4		
bæredygtighed	sustainability	W	4		
en ressource	a resource	W	4		
energi	energy	W	2		
et landskab	a landscape	W	4		
en art	a species	W	3		
et økosystem	an ecosystem	W	4		
klimaforandring	climate change	W	4		
en drivhuseffekt	a greenhouse effect	W	4		
en naturkatastrofe	a natural disaster	W	4		
en oversvømmelse	a flood	W	4		
en tørke	a drought	W	4		
en skovbrand	a wildfire	W	4		
en byge	a shower	W	4		
isslag	black ice / freezing rain	W	3		et
en solskoldning	a sunburn	W	4		
en brise	a breeze	W	4		
en kuling	a gale	W	4		
fugtighed	humidity	W	4		
en varmebølge	a heatwave	W	4		
en brand	a fire (blaze)	W	2		
en planet	a planet	W	2		
et univers	a universe	W	2		
en rede	a nest	W	3		
en hule	a cave	W	3		
en hale	a tail	W	3		
en tiger	a tiger	W	3		
ilt	oxygen	W	2		en
en jungle	a jungle	W	3		
et horn	a horn	W	3		
en klo	a claw	W	4		
en abe	a monkey / ape	W	2		
et kredsløb	a circuit / circulation	W	3		
aske	ash	W	2		en
en haj	a shark	W	3		
biologisk	biological	W	4		
kvæg	cattle	W	2		et
et miljø	an environment	W	3		
en tyr	a bull	W	3		
en svans	a tail	W	3		
en dråbe	a drop	W	3		
en løve	a lion	W	3		
en flamme	a flame	W	4		
en hvalp	a puppy	W	3		
mudder	mud	W	2		et
et æsel	a donkey	W	3		
stråling	radiation	W	2		en
en skabning	a creature	W	3		
et bæst	a beast	W	3		
et skind	a skin / hide	W	3		
kul	coal	W	2		et
et rovdyr	a predator	W	3		
dagslys	daylight	W	2		et
en galakse	a galaxy	W	4		
en svamp	a mushroom / fungus	W	2		
en bugt	a bay	W	4		
en bæk	a brook	W	4		
en mose	a bog / marsh	W	4		
en klit	a sand dune	W	4		
en regnskov	a rainforest	W	4		
en horisont	a horizon	W	4		
tidevand	tide	W	2		et
ler	clay	W	2		et
en rose	a rose	W	2		
en tulipan	a tulip	W	4		
en mælkebøtte	a dandelion	W	4		
en solsikke	a sunflower	W	4		
en frugtplantage	an orchard	W	4		
en bøg	a beech	W	2		
en eg	an oak	W	1		
en birk	a birch	W	4		
en gran	a spruce / fir	W	3		
et fyrretræ	a pine tree	W	4		
klimaforandringer	climate change	W	4		pl
en orkan	a hurricane	W	4		
en tornado	a tornado	W	4		
en vejrudsigt	a weather forecast	W	4		
solskin	sunshine	W	2		et
en regnbyge	a rain shower	W	4		
støvregn	drizzle	W	3		en
slud	sleet	W	3		en
en snemand	a snowman	W	4		
en istap	an icicle	W	4		
et lavtryk	a low-pressure system	W	4		
en fuldmåne	a full moon	W	4		
en komet	a comet	W	4		
solrig	sunny	W	4		
overskyet	overcast	W	4		
regnfuld	rainy	W	4		
blæsende	windy	W	4		
diset	hazy	W	4		
frostklar	crisp and frosty	W	4		
hed	hot	W	1		
lummer	muggy	W	4		
iskold	ice-cold	W	4		
at regne	to rain	W	2	regner|regnede|regnet	
at sne	to snow	W	2	sner|sneede|sneet	
at blæse	to blow	W	2	blæser|blæste|blæst	
at tø	to thaw	W	1	tør|tøede|tøet	
at lyne	to flash with lightning	W	3	lyner|lynede|lynet	
at tordne	to thunder	W	3	tordner|tordnede|tordnet	
at hagle	to hail	W	4	hagler|haglede|haglet	
at klare op	to clear up	W	1	klarer op|klarede op|klaret op	
at blomstre	to bloom	W	4	blomstrer|blomstrede|blomstret	
at visne	to wither	W	4	visner|visnede|visnet	
et husdyr	a domestic animal / pet	W	4		
en killing	a kitten	W	4		
en hamster	a hamster	W	4		
et marsvin	a guinea pig / porpoise	W	4		
en guldfisk	a goldfish	W	4		
en papegøje	a parrot	W	4		
en ged	a goat	W	3		
et lam	a lamb	W	2		
en kalv	a calf	W	4		
en høne	a hen	W	4		
en hane	a rooster / tap	W	4		
en and	a duck	W	1		
en gås	a goose	W	4		
en svane	a swan	W	3		
en due	a pigeon / dove	W	4		
en måge	a seagull	W	4		
en krage	a crow	W	4		
en ugle	an owl	W	3		
en ørn	an eagle	W	4		
en stork	a stork	W	4		
en spurv	a sparrow	W	4		
en solsort	a blackbird	W	4		
et rådyr	a roe deer	W	4		
en elg	a moose / elk	W	3		
et pindsvin	a hedgehog	W	4		
en grævling	a badger	W	4		
en hare	a hare	W	2		
en flagermus	a bat	W	4		
en tudse	a toad	W	4		
et firben	a lizard	W	4		
en krokodille	a crocodile	W	4		
en elefant	an elephant	W	2		
en giraf	a giraffe	W	4		
en zebra	a zebra	W	4		
en kamel	a camel	W	3		
en leopard	a leopard	W	4		
en gorilla	a gorilla	W	4		
en isbjørn	a polar bear	W	3		
en pingvin	a penguin	W	4		
en sæl	a seal	W	4		
en hval	a whale	W	4		
en delfin	a dolphin	W	4		
en blæksprutte	an octopus / squid	W	4		
en vandmand	a jellyfish	W	4		
en søstjerne	a starfish	W	4		
en hveps	a wasp	W	4		
en mariehøne	a ladybug	W	4		
en snegl	a snail / slug	W	3		
en flåt	a tick	W	4		
en bille	a beetle	W	3		
en pote	a paw	W	4		
en vinge	a wing	W	3		
et næb	a beak	W	3		
en fjer	a feather	W	1		
en finne	a fin	W	4		
et gevir	a set of antlers	W	4		
en stald	a stable	W	2		
et bur	a cage	W	3		
at gø	to bark	W	1	gør|gøede|gøet	
at mjave	to meow	W	4	mjaver|mjavede|mjavet	
at kvidre	to chirp	W	4	kvidrer|kvidrede|kvidret	
at summe	to buzz	W	3	summer|summede|summet	
at lufte hunden	to walk the dog	W	4	lufter hunden|luftede hunden|luftet hunden	
en energikilde	an energy source	W	4		
vedvarende energi	renewable energy	W	3		en
vindenergi	wind power	W	3		en
solenergi	solar power	W	3		en
en vindmølle	a wind turbine / windmill	W	4		
et solpanel	a solar panel	W	4		
et kraftværk	a power plant	W	4		
atomkraft	nuclear power	W	3		en
naturgas	natural gas	W	3		en
CO2	CO2 / carbon dioxide	W	3		en
et udslip	an emission / leak	W	4		
global opvarmning	global warming	W	2		en
plastikaffald	plastic waste	W	3		et
en genbrugsstation	a recycling center	W	4		
et atom	an atom	W	3		
et gen	a gene	W	3		
DNA	DNA	W	2		et
solsystemet	the solar system	W	4		
en astronaut	an astronaut	W	4		
en raket	a rocket	W	4		
tyngdekraft	gravity	W	2		en
et grundstof	a chemical element	W	4		
brint	hydrogen	W	3		en
kulstof	carbon	W	3		et
kobber	copper	W	3		et
stål	steel	W	2		et
aluminium	aluminum	W	3		et
papir	paper	W	2		et
pap	cardboard	W	2		et
gummi	rubber	W	2		et
beton	concrete	W	2		en
marmor	marble	W	3		et
en måling	a measurement	W	4		
et verdenshav	an ocean	W	4		
Atlanterhavet	the Atlantic Ocean	W	4		
Stillehavet	the Pacific Ocean	W	4		
Østersøen	the Baltic Sea	W	4		
Nordsøen	the North Sea	W	3		
en verdensdel	a continent	W	4		
et kontinent	a continent	W	4		
Afrika	Africa	W	2		
Asien	Asia	W	2		
Nordamerika	North America	W	4		
Sydamerika	South America	W	4		
Australien	Australia	W	3		
Antarktis	Antarctica	W	4		
en vandpyt	a puddle	W	4		
en pyt	a puddle	W	2		
en brønd	a well	W	2		
et bælt	a strait (e.g. Storebælt)	W	2		
en kraft	a force / power	W	1		
et kæledyr	a pet	W	2		
lava	lava	W	3		en
mos	moss / mash	W	3		et
natur	nature	W	2		en
nordlys	northern lights	W	3		et
en okse	an ox	W	3		
rav	amber	W	2		et
en solcelle	a solar cell	W	3		
et svin	a pig / swine	W	1		
en ælling	a duckling	W	3		
et landbrug	an agriculture / a farm	W	4		
en afgrøde	a crop	W	4		
en høst	a harvest	W	4		
hvede	wheat	W	3		en
rug	rye	W	3		en
byg	barley	W	3		en
raps	rapeseed	W	3		en
en halmballe	a straw bale	W	4		
halm	straw	W	3		en
hø	hay	W	3		et
gødning	fertilizer / manure	W	3		en
en plov	a plow	W	4		
en mejetærsker	a combine harvester	W	4		
en frugthave	an orchard	W	4		
en køkkenhave	a vegetable garden	W	4		
et drivhus	a greenhouse	W	4		
en kolonihave	an allotment garden	W	4		
et blomsterbed	a flower bed	W	4		
en frøpose	a seed packet	W	4		
en stikling	a cutting (plant)	W	4		
en potte	a pot (plant)	W	4		
en trillebør	a wheelbarrow	W	4		
en beskæresaks	(a pair of) pruning shears	W	4		
en spade	a spade	W	3		
ukrudt	weeds	W	3		et
kompost	compost	W	3		en
et bistade	a beehive	W	4		
en biavler	a beekeeper	W	4		
en fåreflok	a flock of sheep	W	4		
en hønsegård	a chicken yard	W	4		
en kostald	a cowshed	W	4		
en svinestald	a pigsty	W	4		
et føl	a foal	W	1		
en pony	a pony	W	4		
en hingst	a stallion	W	4		
en hoppe	a mare	W	2		
en sadel	a saddle	W	4		
en hov	a hoof	W	1		
en manke	a mane	W	4		
en vædder	a ram	W	4		
en tyrekalv	a bull calf	W	4		
fjerkræ	poultry	W	3		et
vildt	game (wild animals)	W	1		et
en fiskestang	a fishing rod	W	4		
en madding	a bait	W	4		
en ål	an eel	W	4		
en rødspætte	a plaice	W	4		
en makrel	a mackerel	W	4		
en ørred	a trout	W	4		
en gedde	a pike	W	4		
en aborre	a perch	W	4		
en østers	an oyster	W	4		
en muslingeskal	a seashell	W	4		
et vandfald	a waterfall	W	4		
en dam	a pond	W	1		
et vådområde	a wetland	W	4		
en hede	a heath / moor	W	4		
en skovsti	a forest path	W	4		
en lysning	a clearing	W	4		
et krat	a thicket	W	4		
en bregne	a fern	W	4		
et siv	a reed	W	4		
en åkande	a water lily	W	4		
en hyld	an elder (tree)	W	3		
en hyldeblomst	an elderflower	W	4		
en brændenælde	a stinging nettle	W	4		
en tidsel	a thistle	W	4		
en kløver	a clover	W	4		
en vissen blomst	a withered flower	W	4		
en knop	a bud	W	4		
et kronblad	a petal	W	4		
en torn	a thorn	W	4		
en kogle	a pine cone	W	4		
et agern	an acorn	W	4		
en kastanje	a chestnut	W	4		
løvfald	autumn leaf fall	W	4		et
en årring	a tree ring	W	4		
et naturområde	a nature area	W	4		
en nationalpark	a national park	W	4		
et fredet område	a protected area	W	4		
en naturvejleder	a nature guide	W	4		
en fugletur	a birdwatching trip	W	4		
en shelter	a shelter (open hut)	W	4		
et fuglekvidder	a birdsong	W	4		
en fugleunge	a baby bird	W	4		
en trækfugl	a migratory bird	W	4		
en flok fugle	a flock of birds	W	3		
en sværm	a swarm	W	4		
en hvalros	a walrus	W	4		
en ren	a reindeer	W	1		
en bæver	a beaver	W	4		
en odder	an otter	W	4		
en mår	a marten	W	4		
en muldvarp	a mole (animal)	W	4		
en spidsmus	a shrew	W	4		
en hugorm	an adder / viper	W	4		
en snog	a grass snake	W	4		
en salamander	a salamander	W	4		
en græshoppe	a grasshopper	W	4		
en guldsmed	a dragonfly	W	4		
en humlebi	a bumblebee	W	4		
en larve	a caterpillar / larva	W	4		
en kakerlak	a cockroach	W	4		
en loppe	a flea	W	4		
en lus	a louse	W	4		
en sølvfisk	a silverfish	W	4		
et spindelvæv	a spiderweb	W	4		
en myretue	an anthill	W	4		
en fodring	a feeding (time)	W	4		
et hundehalsbånd	a dog collar	W	4		
en hundekurv	a dog bed	W	4		
en kattebakke	a litter box	W	4		
et foder	a feed / pet food	W	4		
en kæledyrsforsikring	a pet insurance policy	W	4		
lyng	heather	W	3		en
bark	bark (tree)	W	3		en
en atmosfære	an atmosphere	W	4		
en bølgelængde	a wavelength	W	4		
en dyreart	an animal species	W	4		
en planteskole	a nursery (plants)	W	4		
en sandstrand	a sandy beach	W	4		
en hedebølge	a heat wave	W	4		
en kuldebølge	a cold spell	W	4		
en snestorm	a snowstorm	W	4		
et skybrud	a cloudburst	W	4		
en stormflod	a storm surge	W	4		
regnvejr	rainy weather	W	3		et
solskinsvejr	sunny weather	W	3		et
gråvejr	gray / overcast weather	W	3		et
en vejrmelding	a weather report	W	4		
en varmerekord	a temperature record	W	4		
et solhverv	a solstice	W	4		
mørketid	the dark season (winter)	W	3		en
en gadekat	a stray cat	W	4		
en hundelufter	a dog walker	W	4		
en hundeejer	a dog owner	W	4		
kattemad	cat food	W	3		en
hundemad	dog food	W	3		en
en fuglekasse	a birdhouse	W	4		
et foderbræt	a bird feeder	W	4		
en akvariefisk	an aquarium fish	W	4		
en dyreven	an animal lover	W	4		
et dyreinternat	an animal shelter	W	4		
dyrevelfærd	animal welfare	W	3		en
en krop	a body	B	1		
et hoved	a head	B	1		
hår	hair	B	1		et
et ansigt	a face	B	1		
et øje	an eye	B	1		
et øre	an ear	B	2		
en næse	a nose	B	2		
en mund	a mouth	B	1		
en tand	a tooth	B	2		
en tunge	a tongue	B	2		
en hals	a throat / neck	B	2		
en skulder	a shoulder	B	3		
en arm	an arm	B	1		
en albue	an elbow	B	4		
en hånd	a hand	B	1		
en finger	a finger	B	2		
et bryst	a chest	B	2		
en mave	a stomach	B	2		
en ryg	a back	B	1		
et ben	a leg / bone	B	1		
et knæ	a knee	B	2		
en fod	a foot	B	1		
en tå	a toe	B	4		
et hjerte	a heart	B	1		
en lunge	a lung	B	4		
hud	skin	B	2		
en muskel	a muscle	B	4		
en knogle	a bone	B	4		
blod	blood	B	1		
en hjerne	a brain	B	1		
en nerve	a nerve	B	4		
en sygdom	a disease	B	2		
en smerte	a pain	B	1		
en hovedpine	a headache	B	3		
en mavepine	a stomachache	B	4		
en feber	a fever	B	3		
en forkølelse	a cold (illness)	B	4		
en hoste	a cough	B	4		
influenza	the flu	B	2		en
medicin	medicine	B	1		en
en pille	a pill	B	3		
en recept	a prescription	B	4		
en tandlæge	a dentist	B	2		
en klinik	a clinic	B	4		
en ambulance	an ambulance	B	2		
en skadestue	an ER	B	3		
en operation	a surgery	B	2		
en undersøgelse	an examination	B	3		
et symptom	a symptom	B	3		
en diagnose	a diagnosis	B	4		
en behandling	a treatment	B	2		
helbred	health	B	3		
sund	healthy	B	2		
usund	unhealthy	B	4		
motion	exercise	B	4		
træning	training / exercise	B	2		en
en diæt	a diet	B	4		
søvn	sleep	B	1		
træthed	tiredness	B	4		
stress	stress	B	3		
angst	anxiety	B	3		
en graviditet	a pregnancy	B	4		
en fødsel	a birth	B	3		
en vaccine	a vaccine	B	4		
et plaster	a band-aid	B	4		
en bandage	a bandage	B	4		
en krykke	a crutch	B	4		
en kørestol	a wheelchair	B	4		
briller	glasses	B	3		
en kontaktlinse	a contact lens	B	4		
et høreapparat	a hearing aid	B	4		
et smil	a smile	B	2		
en latter	a laugh	B	3		
et blik	a look	B	2		
en gestus	a gesture	B	4		
et nik	a nod	B	4		
en krammer	a hug	B	4		
et håndtryk	a handshake	B	4		
en gaben	a yawn	B	4		
et suk	a sigh	B	4		
en grimasse	a grimace	B	4		
en tåre	a tear	B	4		
en rødmen	a blush	B	4		
en rysten	a shiver	B	4		
en gys	a shudder	B	4		
en stirren	a stare	B	4		
en doktor	a doctor	B	3		
en patient	a patient	B	2		
et syn	a sight / vision	B	2		
et ar	a scar	B	2		
en nakke	a neck (back of)	B	2		
kræft	cancer	B	3		en
ondt	pain / hurt ("have ondt")	B	1		
en kur	a cure / treatment	B	2		
terapi	therapy	B	2		en
en læbe	a lip	B	4		
en sans	a sense	B	3		
et udseende	an appearance / look	B	3		
et koma	a coma	B	3		
en puls	a pulse	B	3		
bevidstløs	unconscious	B	3		
døv	deaf	B	3		
et hjerteanfald	a heart attack	B	3		
kvalme	nausea	B	2		en
en tatovering	a tattoo	B	3		
seksuel	sexual	B	3		
en psykolog	a psychologist	B	3		
en lidelse	a suffering / disorder	B	3		
medicinsk	medical	B	3		
et organ	an organ	B	3		
et fjæs	a face (colloquial)	B	3		
svimmel	dizzy	B	3		
et ribben	a rib	B	3		
sult	hunger	B	1		en
allergisk	allergic	B	3		
en indånding	an inhalation / breath	B	3		
en terapeut	a therapist	B	3		
en sprøjte	a syringe / sprayer	B	2		
en dosis	a dose	B	3		
pleje	care	B	2		en
en massage	a massage	B	3		
en overdosis	an overdose	B	3		
en frisure	a hairstyle	B	3		
en abort	an abortion / miscarriage	B	3		
karantæne	quarantine	B	2		en
et kranie	a skull	B	3		
et blodtryk	a blood pressure	B	3		
psykisk	mental / psychological	B	3		
sved	sweat	B	2		en
et overskæg	a mustache	B	3		
en kirurg	a surgeon	B	3		
genetisk	genetic	B	3		
et håndled	a wrist	B	3		
et hjertestop	a cardiac arrest	B	3		
en alkoholiker	an alcoholic	B	3		
smertefuld	painful	B	4		
lammet	paralyzed	B	3		
et nødstilfælde	an emergency	B	3		
bedøvet	sedated / numb	B	3		
tømmermænd	a hangover	B	3		pl
bleg	pale	B	3		
et hjerteslag	a heartbeat	B	3		
en infektion	an infection	B	3		
smertestillende	painkillers	B	3		pl
immunitet	immunity	B	2		en
et kondom	a condom	B	3		
en nyre	a kidney	B	3		
skaldet	bald	B	3		
psykiatrisk	psychiatric	B	3		
en hæl	a heel	B	4		
et væv	a tissue / weave	B	4		
blond	blond	B	4		
en blødning	a bleeding	B	4		
en hjernerystelse	a concussion	B	4		
afvænning	rehab / detox	B	2		en
bedring	recovery	B	2		en
en pest	a plague	B	4		
en narkoman	a drug addict	B	4		
forkølet	having a cold	B	4		
inficeret	infected	B	4		
et slagtilfælde	a stroke	B	4		
et skudsår	a gunshot wound	B	4		
en depression	a depression	B	4		
et ansigtsudtryk	a facial expression	B	4		
en bagdel	a behind / bottom	B	4		
en kind	a cheek	B	2		
en hage	a chin	B	3		
en kæbe	a jaw	B	4		
et øjenbryn	an eyebrow	B	4		
en øjenvippe	an eyelash	B	4		
et øjenlåg	an eyelid	B	4		
en strube	a throat	B	4		
en navle	a navel	B	4		
en hofte	a hip	B	4		
en håndflade	a palm	B	4		
en tommelfinger	a thumb	B	4		
en pegefinger	an index finger	B	4		
en negl	a nail (finger / toe)	B	3		
et lår	a thigh	B	2		
en læg	a calf (of the leg)	B	1		
en ankel	an ankle	B	4		
et skæg	a beard	B	2		
en lever	a liver	B	1		
en mavesæk	a stomach (organ)	B	4		
en tarm	an intestine	B	4		
en blære	a bladder / blister	B	4		
et skelet	a skeleton	B	4		
en rygrad	a spine	B	4		
en sene	a tendon	B	4		
en blodåre	a blood vessel / vein	B	4		
et led	a joint	B	1		
en halsbetændelse	a sore throat / strep throat	B	4		
tandpine	toothache	B	3		en
et sår	a wound	B	1		
en forstuvning	a sprain	B	4		
et blåt mærke	a bruise	B	3		
en bums	a pimple	B	3		
et udslæt	a rash	B	4		
astma	asthma	B	3		en
diabetes	diabetes	B	3		en
en betændelse	an inflammation	B	4		
en bakterie	a bacterium	B	4		
en indsprøjtning	an injection	B	4		
et apotek	a pharmacy	B	2		
en praktiserende læge	a general practitioner	B	4		
en jordemoder	a midwife	B	4		
en fysioterapeut	a physiotherapist	B	4		
en blodprøve	a blood test	B	4		
et røntgenbillede	an X-ray image	B	4		
en bivirkning	a side effect	B	4		
en tid hos lægen	a doctor's appointment	B	1		
et sygesikringskort	a health insurance card	B	4		
kontaktlinser	contact lenses	B	4		pl
øm	sore	B	2		
hævet	swollen	B	3		
kvalm	nauseous	B	4		
forstoppet	constipated	B	4		
blødende	bleeding	B	4		
smitsom	contagious	B	4		
at blive syg	to get sick	B	1	bliver syg|blev syg|blevet syg	
at blive rask	to get better	B	2	bliver rask|blev rask|blevet rask	
at hoste	to cough	B	4	hoster|hostede|hostet	
at nyse	to sneeze	B	4	nyser|nøs|nyst	
at kaste op	to throw up	B	2	kaster op|kastede op|kastet op	
at gøre ondt	to hurt	B	1	gør ondt|gjorde ondt|gjort ondt	
at komme sig	to recover	B	1	kommer sig|kom sig|kommet sig	
at helbrede	to cure / heal	B	3	helbreder|helbredte|helbredt	
at trække vejret	to breathe	B	1	trækker vejret|trak vejret|trukket vejret	
at svede	to sweat	B	2	sveder|svedte|svedt	
at gabe	to yawn	B	4	gaber|gabede|gabet	
at hvile sig	to rest	B	2	hviler sig|hvilede sig|hvilet sig	
at motionere	to exercise	B	4	motionerer|motionerede|motioneret	
at løbe en tur	to go for a run	B	1	løber en tur|løb en tur|løbet en tur	
at tage på	to gain weight	B	1	tager på|tog på|taget på	
at tabe sig	to lose weight	B	1	taber sig|tabte sig|tabt sig	
at blive gammel	to grow old	B	1	bliver gammel|blev gammel|blevet gammel	
at nikke	to nod	B	4	nikker|nikkede|nikket	
at ryste på hovedet	to shake one's head	B	3	ryster på hovedet|rystede på hovedet|rystet på hovedet	
at trække på skuldrene	to shrug	B	4	trækker på skuldrene|trak på skuldrene|trukket på skuldrene	
at vinke	to wave	B	4	vinker|vinkede|vinket	
at knibe	to pinch / squint	B	3	kniber|kneb|knebet	
en vagtlæge	an on-call doctor	B	4		
en lægevagt	an after-hours medical service	B	4		
en afhængighed	an addiction / dependence	B	4		
en berøring	a touch	B	4		
en fyldning	a filling	B	4		
en henvisning	a referral / reference	B	4		
et hospital	a hospital	B	1		
sundhed	health	B	2		en
en krampe	a cramp	B	4		
en journal	a medical record	B	3		
en speciallæge	a specialist	B	4		
en øjenlæge	an eye doctor	B	4		
en hudlæge	a dermatologist	B	4		
en børnelæge	a pediatrician	B	4		
en fødegang	a maternity ward	B	4		
en scanning	a scan	B	4		
en ultralydsscanning	an ultrasound scan	B	4		
narkose	anesthesia	B	3		en
en bedøvelse	an anesthetic	B	4		
et sting	a stitch	B	4		
en forbinding	a dressing (wound)	B	4		
en skinne	a splint / rail	B	4		
genoptræning	rehabilitation	B	3		en
en indlæggelse	a hospitalization	B	4		
en udskrivning	a discharge (from hospital)	B	4		
en kronisk sygdom	a chronic illness	B	4		
blodsukker	blood sugar	B	3		et
kolesterol	cholesterol	B	3		et
en blodprop	a blood clot	B	4		
en migræne	a migraine	B	4		
svimmelhed	dizziness	B	3		en
søvnløshed	insomnia	B	3		en
diarré	diarrhea	B	3		en
opkast	vomit	B	3		et
næseblod	nosebleed	B	3		et
snue	a head cold	B	3		en
en halspastil	a throat lozenge	B	4		
en næsespray	a nasal spray	B	4		
en hostesaft	a cough syrup	B	4		
antibiotika	antibiotics	B	4		pl
en salve	an ointment	B	4		
en vitamin	a vitamin	B	4		
et kosttilskud	a dietary supplement	B	4		
en kalorie	a calorie	B	4		
protein	protein	B	3		et
kulhydrat	carbohydrate	B	3		et
fedt	fat	B	1		et
fibre	fiber	B	4		pl
overvægt	overweight / obesity	B	3		en
en sundhedsplejerske	a health visitor	B	4		
mental sundhed	mental health	B	3		en
trivsel	well-being	B	3		en
et handicap	a disability	B	4		
hørelse	hearing	B	3		en
vejrtrækning	breathing	B	2		en
tandtråd	dental floss	B	3		en
en tandbøjle	a brace (teeth)	B	4		
en rynke	a wrinkle	B	4		
en fregne	a freckle	B	4		
et modermærke	a mole	B	4		
en vorte	a wart	B	4		
en hårfarve	a hair color	B	4		
en hestehale	a ponytail	B	4		
en fletning	a braid	B	4		
pandehår	bangs	B	3		et
krøllet	curly	B	4		
lyshåret	fair-haired	B	4		
mørkhåret	dark-haired	B	4		
rødhåret	red-haired	B	4		
buttet	chubby	B	4		
muskuløs	muscular	B	4		
rynket	wrinkled	B	4		
solbrændt	sunburned / tanned	B	4		
tatoveret	tattooed	B	4		
et ansigtstræk	a facial feature	B	4		
en øjenfarve	an eye color	B	4		
et grin	a laugh	B	2		
et gab	a yawn	B	4		
et nys	a sneeze	B	4		
en håndbevægelse	a hand gesture	B	4		
et øjekast	a glance	B	4		
at rødme	to blush	B	4	rødmer|rødmede|rødmet	
at skælve	to tremble	B	4	skælver|skælvede|skælvet	
at hikke	to hiccup	B	4	hikker|hikkede|hikket	
at bøvse	to burp	B	4	bøvser|bøvsede|bøvset	
at klø sig	to scratch oneself	B	3	klør sig|kløede sig|kløet sig	
at strække sig	to stretch	B	4	strækker sig|strakte sig|strakt sig	
at bukke sig	to bend down	B	4	bukker sig|bukkede sig|bukket sig	
at knæle	to kneel	B	4	knæler|knælede|knælet	
at snøfte	to sniff / sniffle	B	4	snøfter|snøftede|snøftet	
at hulke	to sob	B	4	hulker|hulkede|hulket	
at fnise	to giggle	B	4	fniser|fnisede|fniset	
at skraldgrine	to roar with laughter	B	4	skraldgriner|skraldgrinede|skraldgrinet	
at gnave	to gnaw	B	4	gnaver|gnavede|gnavet	
at slikke	to lick	B	3	slikker|slikkede|slikket	
at slanke sig	to diet	B	4	slanker sig|slankede sig|slanket sig	
at få det bedre	to feel better	B	1	får det bedre|fik det bedre|fået det bedre	
at ligge syg	to be ill in bed	B	1	ligger syg|lå syg|ligget syg	
at vaccinere	to vaccinate	B	4	vaccinerer|vaccinerede|vaccineret	
at blive indlagt	to be hospitalized	B	3	bliver indlagt|blev indlagt|blevet indlagt	
at blive udskrevet	to be discharged	B	4	bliver udskrevet|blev udskrevet|blevet udskrevet	
at bestille tid	to make an appointment	B	3	bestiller tid|bestilte tid|bestilt tid	
at tage medicin	to take medicine	B	1	tager medicin|tog medicin|taget medicin	
at meditere	to meditate	B	4	mediterer|mediterede|mediteret	
en middagslur	a nap	B	4		
en lur	a nap	B	3		
et venteværelse	a waiting room	B	4		
en epidemi	an epidemic	B	4		
en pandemi	a pandemic	B	4		
en nattesøvn	a night's sleep	B	4		
en tandlægetid	a dentist appointment	B	4		
en madallergi	a food allergy	B	4		
en nøddeallergi	a nut allergy	B	4		
en pollenallergi	a hay fever	B	4		
høfeber	hay fever	B	3		en
et solstik	a sunstroke	B	4		
en smagsløg	a taste bud	B	4		
en opgave	a task	S	1		
et projekt	a project	S	2		
en deadline	a deadline	S	4		
en rapport	a report	S	2		
en præsentation	a presentation	S	4		
en kontrakt	a contract	S	2		
en løn	a salary	S	2		
en lønseddel	a paystub	S	4		
en sygemelding	a sick note / sick leave	S	4		
en opsigelse	a resignation	S	4		
en ansættelsessamtale	a job interview	S	4		
et cv	a CV	S	3		
en ansøgning	an application	S	4		
en karriere	a career	S	2		
en erfaring	an experience	S	2		
en kvalifikation	a qualification	S	4		
en uddannelse	an education	S	3		
et gymnasium	a high school	S	4		
en folkeskole	a primary school	S	4		
en børnehave	a kindergarten	S	4		
en klasse	a class / classroom	S	1		
en klassekammerat	a classmate	S	4		
en karakter	a grade	S	2		
en eksamen	an exam	S	3		
en prøve	a test / quiz	S	1		
lektier	homework	S	2		
et skema	a schedule	S	4		
et fag	a subject	S	2		
matematik	math	S	2		
dansk	Danish (subject)	S	2		
engelsk	English (subject)	S	1		
geografi	geography	S	3		
fysik	physics	S	2		
kemi	chemistry	S	2		
biologi	biology	S	4		
idræt	PE / sports	S	4		
musik	music	S	1		
kunst	art	S	2		
en pause	a break	S	1		
et frikvarter	a recess / break	S	4		
en skoletaske	a school bag	S	4		
en blyant	a pencil	S	2		
en pen	a pen	S	3		
et viskelæder	an eraser	S	4		
en linjal	a ruler	S	4		
en tavle	a blackboard	S	3		
et whiteboard	a whiteboard	S	4		
et studiekort	a student card	S	4		
et stipendium	a scholarship	S	4		
et studielån	a student loan	S	4		
en afgangseksamen	a final exam	S	4		
et diplom	a diploma	S	4		
en grad	a degree	S	2		
en lektion	a lesson	S	3		
en vikar	a substitute teacher	S	4		
en rektor	a principal	S	3		
en opsparing	a savings	S	4		
en investering	an investment	S	3		
en aktie	a stock/share	S	4		
et budget	a budget	S	4		
en udgift	an expense	S	3		
en indtægt	an income	S	4		
en faktura	an invoice	S	4		
en gæld	a debt	S	1		
en rente	an interest rate	S	4		
en pension	a pension	S	3		
en bonus	a bonus	S	3		
en overførsel	a transfer	S	4		
et kontantbeløb	a cash amount	S	4		
en valuta	a currency	S	4		
en vekselkurs	an exchange rate	S	4		
en bank	a bank	S	1		
et kreditkort	a credit card	S	2		
en transaktion	a transaction	S	4		
en underskrift	a signature	S	3		
et dokument	a document	S	3		
en undervisning	a teaching	S	3		
et pensum	a curriculum	S	4		
en lærebog	a textbook	S	4		
en aflevering	a submission	S	4		
en frist	a deadline	S	4		
en forelæsning	a lecture	S	4		
et kursus	a course	S	2		
et studium	a study program	S	4		
en klasseværelse	a classroom	S	3		
en studiegruppe	a study group	S	4		
en eksaminator	an examiner	S	4		
en vejleder	a supervisor	S	4		
en note	a note	S	4		
en færdighed	a skill	S	4		
en evne	an ability	S	2		
en fremgangsmåde	a procedure	S	4		
en indlæring	a learning process	S	4		
en hukommelse	a memory	S	2		
en koncentration	a concentration	S	4		
en agent	an agent	S	3		
en kaptajn	a captain	S	3		
en betjent	a police officer	S	1		
en oberst	a colonel	S	3		
en general	a general	S	3		
en ordre	an order (command)	S	3		
en vagt	a guard / shift	S	1		
en løjtnant	a lieutenant	S	3		
en sergent	a sergeant	S	3		
en major	a major	S	2		
en sherif	a sheriff	S	2		
et team	a team	S	2		
en afdeling	a department	S	2		
en ansat	an employee	S	2		
en assistent	an assistant	S	2		
en stilling	a position / job	S	2		
en officer	an officer	S	3		
en inspektør	an inspector	S	3		
et skift	a shift / change	S	1		
forskning	research	S	2		en
et emne	a subject / topic	S	3		
en kommandør	a commander	S	3		
en strisser	a cop (slang)	S	3		
en formand	a chairman	S	3		
en korporal	a corporal	S	3		
en rådgiver	an adviser	S	3		
personale	staff	S	2		et
en admiral	an admiral	S	3		
en manager	a manager	S	3		
en kommando	a command	S	3		
et hovedkvarter	a headquarters	S	3		
uddannet	educated / qualified	S	3		
et bogstav	a letter (of the alphabet)	S	3		
en kuglepen	a ballpoint pen	S	3		
en formel	a formula	S	3		
et bureau	an agency / office	S	3		
en rang	a rank	S	3		
latin	Latin	S	2		en
en bartender	a bartender	S	3		
et speciale	a specialty / master's thesis	S	3		
jura	law (the study)	S	2		en
en overbetjent	a police sergeant	S	3		
en fotograf	a photographer	S	3		
en forfremmelse	a promotion	S	3		
arbejdsløs	unemployed	S	3		
en servitrice	a waitress	S	3		
en slagter	a butcher	S	3		
et mandskab	a crew	S	3		
en afløser	a substitute / replacement	S	3		
en instruks	an instruction	S	3		
et kompagni	a company (military / business)	S	3		
pensioneret	retired	S	4		
kvalificeret	qualified	S	4		
kemisk	chemical	S	4		
en fridag	a day off	S	4		
filosofi	philosophy	S	2		en
en studie	a study	S	3		
en mentor	a mentor	S	4		
en mekaniker	a mechanic	S	4		
videnskabelig	scientific	S	4		
at sygemelde sig	to call in sick	S	4	sygemelder sig|sygemeldte sig|sygemeldt sig	
en arbejdsplads	a workplace	S	4		
en stillingsannonce	a job ad	S	4		
en jobsamtale	a job interview	S	4		
en prøvetid	a probation period	S	4		
en fyring	a dismissal	S	4		
arbejdsløshed	unemployment	S	3		en
en lønforhøjelse	a raise	S	4		
barsel	maternity / parental leave	S	3		en
overarbejde	overtime	S	3		et
arbejdstid	working hours	S	3		en
på deltid	part-time	S	4		
på fuldtid	full-time	S	4		
en fagforening	a trade union	S	4		
en leverandør	a supplier	S	4		
en praktikant	an intern	S	4		
en lærling	an apprentice	S	4		
en afdelingsleder	a department manager	S	4		
en frokostpause	a lunch break	S	4		
en kaffepause	a coffee break	S	4		
en printer	a printer	S	4		
en kopimaskine	a copier	S	4		
en hæftemaskine	a stapler	S	4		
en papirclips	a paper clip	S	4		
et visitkort	a business card	S	4		
en vuggestue	a nursery (daycare)	S	4		
en SFO	an after-school club	S	4		
en efterskole	a boarding school (for 14–18-year-olds)	S	4		
en højskole	a folk high school	S	4		
en erhvervsuddannelse	a vocational education	S	4		
en underviser	an instructor	S	2		
et eksamensbevis	a diploma	S	4		
en studentereksamen	a high school diploma	S	4		
en bachelor	a bachelor's degree	S	4		
en ph.d.	a PhD	S	4		
et semester	a semester	S	2		
et fagområde	a field of study	S	4		
billedkunst	art (school subject)	S	3		en
samfundsfag	social studies	S	3		et
et penalhus	a pencil case	S	4		
en lineal	a ruler	S	4		
en lommeregner	a calculator	S	4		
et hæfte	a notebook	S	4		
at søge job	to apply for a job	S	2	søger job|søgte job|søgt job	
at sige op	to resign / quit	S	1	siger op|sagde op|sagt op	
at gå på pension	to retire	S	3	går på pension|gik på pension|gået på pension	
at tjene penge	to earn money	S	1	tjener penge|tjente penge|tjent penge	
at holde møde	to have a meeting	S	1	holder møde|holdt møde|holdt møde	
at holde fri	to take time off	S	1	holder fri|holdt fri|holdt fri	
at have fri	to be off work	S	1	har fri|havde fri|haft fri	
at arbejde hjemmefra	to work from home	S	3	arbejder hjemmefra|arbejdede hjemmefra|arbejdet hjemmefra	
at printe	to print	S	4	printer|printede|printet	
at kopiere	to copy	S	4	kopierer|kopierede|kopieret	
at underskrive	to sign	S	3	underskriver|underskrev|underskrevet	
at delegere	to delegate	S	4	delegerer|delegerede|delegeret	
at gange	to multiply	S	1	ganger|gangede|ganget	
at dividere	to divide	S	4	dividerer|dividerede|divideret	
at lægge sammen	to add up	S	1	lægger sammen|lagde sammen|lagt sammen	
at trække fra	to subtract	S	1	trækker fra|trak fra|trukket fra	
at øve sig	to practice	S	3	øver sig|øvede sig|øvet sig	
at repetere	to review / revise	S	4	repeterer|repeterede|repeteret	
at læse op	to read aloud	S	1	læser op|læste op|læst op	
at slå op	to look up	S	1	slår op|slog op|slået op	
at dumpe	to fail (an exam)	S	4	dumper|dumpede|dumpet	
at tage en uddannelse	to get an education	S	3	tager en uddannelse|tog en uddannelse|taget en uddannelse	
at blive færdig	to finish / graduate	S	1	bliver færdig|blev færdig|blevet færdig	
at række hånden op	to raise one's hand	S	2	rækker hånden op|rakte hånden op|rakt hånden op	
at pjække	to skip school / play hooky	S	4	pjækker|pjækkede|pjækket	
erfaren	experienced	S	4		
kompetent	competent	S	4		
produktiv	productive	S	4		
selvstændig	self-employed / independent	S	4		
faglig	professional / academic	S	4		
akademisk	academic	S	4		
et erhverv	a profession	S	4		
en arkitekt	an architect	S	4		
en økonom	an economist	S	4		
en bankrådgiver	a bank adviser	S	4		
en kassedame	a cashier	S	4		
en frisør	a hairdresser	S	2		
en bager	a baker	S	2		
en landmand	a farmer	S	3		
en tømrer	a carpenter	S	4		
en murer	a bricklayer	S	4		
en elektriker	an electrician	S	4		
en blikkenslager	a plumber	S	4		
en maler	a painter	S	3		
en gartner	a gardener	S	4		
en lastbilchauffør	a truck driver	S	4		
et postbud	a mail carrier	S	4		
en politimand	a policeman	S	3		
en pædagog	a daycare / youth worker	S	4		
en socialrådgiver	a social worker	S	4		
en sosu-assistent	a health care assistant	S	4		
en videnskabsmand	a scientist	S	2		
en designer	a designer	S	4		
en oversætter	a translator	S	4		
en konsulent	a consultant	S	4		
en rengøringsassistent	a cleaner	S	4		
en dyrlæge	a veterinarian	S	4		
en apoteker	a pharmacist	S	4		
en bibliotekar	a librarian	S	4		
et jobcenter	a job center	S	4		
en sprogskole	a language school	S	4		
et danskkursus	a Danish course	S	4		
en ansøgningsfrist	an application deadline	S	4		
en blanket	a form	S	4		
en formular	a form	S	4		
en afløsning	a relief / replacement	S	4		
en ansættelse	an employment / hiring	S	4		
en arbejdsdag	a working day	S	4		
en arbejdsopgave	a work task	S	4		
en bedømmelse	an assessment	S	4		
en beregning	a calculation	S	4		
en dannelse	an education / formation	S	4		
en forkortelse	an abbreviation	S	4		
en gennemgang	a review / walkthrough	S	4		
en henvendelse	an inquiry	S	4		
en indkaldelse	a summons / notice	S	4		
en indledning	an introduction	S	4		
en indskrivning	an enrollment	S	4		
en læsning	a reading	S	4		
en rettelse	a correction	S	4		
en tilbagemelding	a feedback / response	S	4		
en tilmelding	a registration / sign-up	S	4		
en udnævnelse	an appointment	S	4		
en vejledning	a guide / guidance	S	2		
et oplæg	a presentation / proposal	S	4		
et udkast	a draft	S	4		
en kontorstol	an office chair	S	4		
datalogi	computer science	S	3		en
et eksperiment	an experiment	S	2		
i skole	at school / to school	S	1		
et institut	an institute	S	3		
et kemikalie	a chemical	S	3		
en ordbog	a dictionary	S	3		
en sekretær	a secretary	S	2		
en syre	an acid	S	2		
en snedker	a joiner / cabinetmaker	S	4		
en smed	a smith	S	1		
en skorstensfejer	a chimney sweep	S	4		
en skraldemand	a garbage collector	S	4		
en taxachauffør	a taxi driver	S	4		
en kassemedarbejder	a cashier	S	4		
en lagerarbejder	a warehouse worker	S	4		
en fabriksarbejder	a factory worker	S	4		
en kontorassistent	an office assistant	S	4		
en receptionist	a receptionist	S	4		
en projektleder	a project manager	S	4		
en udvikler	a developer	S	3		
en dataanalytiker	a data analyst	S	4		
en marketingchef	a marketing manager	S	4		
en HR-medarbejder	an HR employee	S	4		
en jurist	a lawyer (legal professional)	S	4		
en diplomat	a diplomat	S	4		
en kunsthistoriker	an art historian	S	4		
en historiker	a historian	S	4		
en filosof	a philosopher	S	4		
en matematiker	a mathematician	S	4		
en fysiker	a physicist	S	4		
en kemiker	a chemist	S	4		
en biolog	a biologist	S	4		
en tandplejer	a dental hygienist	S	4		
en optiker	an optician	S	4		
en ergoterapeut	an occupational therapist	S	4		
en psykiater	a psychiatrist	S	3		
en kosmetolog	a beautician	S	4		
stavning	spelling	S	3		en
et navneord	a noun	S	4		
et udsagnsord	a verb	S	4		
et tillægsord	an adjective	S	4		
et biord	an adverb	S	4		
et forholdsord	a preposition	S	4		
et stedord	a pronoun	S	4		
et bindeord	a conjunction	S	4		
en bøjning	an inflection	S	4		
nutid	present tense	S	2		en
datid	past tense	S	3		en
førnutid	present perfect	S	3		en
førdatid	past perfect	S	3		en
navnemåde	infinitive	S	3		en
bydeform	imperative	S	3		en
ental	singular	S	3		et
bestemt form	definite form	S	1		en
ubestemt form	indefinite form	S	3		en
et køn	a gender	S	2		
fælleskøn	common gender (en-words)	S	3		et
intetkøn	neuter gender (et-words)	S	3		et
en endelse	an ending (word)	S	4		
et ordsprog	a proverb	S	4		
et fremmedord	a foreign word	S	4		
et synonym	a synonym	S	4		
et modsætningsord	an antonym	S	4		
retskrivning	spelling rules / orthography	S	3		en
tegnsætning	punctuation	S	3		en
et punktum	a period (punctuation)	S	4		
et komma	a comma	S	4		
et spørgsmålstegn	a question mark	S	4		
et udråbstegn	an exclamation mark	S	4		
et kolon	a colon	S	4		
en bindestreg	a hyphen	S	4		
et anførselstegn	a quotation mark	S	4		
et alfabet	an alphabet	S	4		
en vokal	a vowel	S	4		
en konsonant	a consonant	S	4		
en stavelse	a syllable	S	4		
et tryk	a stress (emphasis)	S	2		
en samtaleøvelse	a conversation exercise	S	4		
en lytteøvelse	a listening exercise	S	4		
læseforståelse	reading comprehension	S	3		en
en diktat	a dictation	S	4		
et essay	an essay	S	4		
mundtlig	oral / spoken	S	4		
skriftlig	written	S	4		
flydende	fluent / liquid	S	3		
en studiekammerat	a fellow student	S	4		
en censor	an external examiner	S	4		
et studiejob	a student job	S	4		
et kollegieværelse	a dorm room	S	4		
en læsesal	a reading room	S	4		
et auditorium	an auditorium / lecture hall	S	4		
en campus	a campus	S	4		
et adgangskrav	an admission requirement	S	4		
et karaktergennemsnit	a grade point average	S	4		
en studieplan	a study plan	S	4		
en studieretning	a field of study (high school)	S	4		
en afleveringsfrist	a submission deadline	S	4		
en litteraturliste	a bibliography	S	4		
et citat	a quote	S	4		
en fodnote	a footnote	S	4		
et resumé	a summary	S	4		
et spørgeskema	a questionnaire	S	4		
en graf	a graph	S	4		
en ligning	an equation	S	4		
et decimaltal	a decimal number	S	4		
ulige	odd (number)	S	4		
en radius	a radius	S	4		
et areal	an area	S	4		
en kvadratmeter	a square meter	S	4		
en opgavebog	an exercise book	S	4		
en ordliste	a word list / glossary	S	4		
et kartotekskort	an index card	S	4		
et skoleår	a school year	S	4		
en efterårsferie	an autumn break	S	4		
en vinterferie	a winter break	S	4		
en juleferie	a Christmas vacation	S	4		
en påskeferie	an Easter vacation	S	4		
en skoledag	a school day	S	4		
en madordning	a school meal program	S	4		
en skolegård	a schoolyard	S	4		
en gymnastiksal	a gym (school)	S	4		
et forældremøde	a parent-teacher meeting	S	4		
en skole-hjem-samtale	a parent-teacher conference	S	4		
en lejrskole	a school camp trip	S	4		
en ekskursion	a field trip	S	4		
at lære udenad	to memorize	S	4	lærer udenad|lærte udenad|lært udenad	
at skrive af	to copy (write out)	S	1	skriver af|skrev af|skrevet af	
at gå til eksamen	to take an exam	S	3	går til eksamen|gik til eksamen|gået til eksamen	
at melde sig til	to sign up for	S	2	melder sig til|meldte sig til|meldt sig til	
at søge ind på	to apply to (a school)	S	2	søger ind på|søgte ind på|søgt ind på	
at blive optaget	to be admitted	S	1	bliver optaget|blev optaget|blevet optaget	
at læse til	to study to become	S	1	læser til|læste til|læst til	
at tage noter	to take notes	S	3	tager noter|tog noter|taget noter	
at holde oplæg	to give a presentation	S	4	holder oplæg|holdt oplæg|holdt oplæg	
at runde op	to round up	S	2	runder op|rundede op|rundet op	
at runde ned	to round down	S	2	runder ned|rundede ned|rundet ned	
en skomager	a shoemaker / cobbler	S	4		
en urmager	a watchmaker	S	4		
et cykelbud	a bike courier	S	4		
et madbud	a food delivery person	S	4		
et arkiv	an archive	S	4		
en blok	a notepad / block	S	4		
en dokumentation	a documentation	S	4		
en encyklopædi	an encyclopedia	S	4		
en historiebog	a history book	S	4		
en hjemmeopgave	a homework assignment	S	4		
et leksikon	an encyclopedia	S	4		
et foredrag	a talk / lecture	S	4		
en aftenskole	an evening class	S	4		
en arbejdsbyrde	a workload	S	4		
et arbejdsmiljø	a work environment	S	4		
arbejdskraft	labor / workforce	S	2		en
en daglig leder	a general manager	S	4		
et drømmejob	a dream job	S	4		
en farmaceut	a pharmacist	S	4		
en forretningsrejse	a business trip	S	4		
en fritidsordning	an after-school program	S	4		
en grundskole	a primary school	S	4		
et højskoleophold	a folk high school stay	S	4		
en indretningsarkitekt	an interior designer	S	4		
en jobannonce	a job ad	S	4		
en klasselærer	a class teacher	S	4		
en kontorplads	a desk (workspace)	S	4		
ordblind	dyslexic	S	4		
en papirkurv	a wastepaper basket	S	4		
et personalemøde	a staff meeting	S	4		
en skoletur	a school trip	S	4		
et sommerjob	a summer job	S	4		
sprogkundskaber	language skills	S	4		pl
en studietur	a study trip	S	4		
en ugeplan	a weekly plan	S	4		
et kontorhus	an office building	S	4		
et mødelokale	a meeting room	S	4		
et opholdsrum	a lounge / common room	S	4		
et skolefag	a school subject	S	4		
et studieår	an academic year	S	4		
en køkkenchef	a head chef	S	4		
en kokkeelev	a chef apprentice	S	4		
en opvasker	a dishwasher (person)	S	4		
en barista	a barista	S	4		
en sommelier	a sommelier	S	4		
en hovmester	a head waiter	S	4		
vrede	anger	E	1		en
jalousi	jealousy	E	2		en
skyld	guilt / fault	E	1		en
skam	shame	E	1		en
stolthed	pride	E	2		en
medlidenhed	pity	E	2		en
en overraskelse	a surprise	E	1		
forvirring	confusion	E	2		en
lettelse	relief	E	2		en
ensomhed	loneliness	E	2		en
kedsomhed	boredom	E	3		en
spænding	excitement / tension	E	2		en
ro	calm / peace and quiet	E	1		en
tillid	trust	E	2		en
mistillid	distrust	E	3		en
respekt	respect	E	1		en
tålmodighed	patience	E	2		en
utålmodighed	impatience	E	3		en
mod	courage	E	1		et
fejhed	cowardice	E	3		en
generøsitet	generosity	E	3		en
gerrighed	greed	E	3		en
upålidelig	unreliable	E	4		
pålidelig	reliable	E	3		
doven	lazy	E	4		
flittig	diligent	E	4		
nysgerrig	curious	E	2		
kreativ	creative	E	4		
logisk	logical	E	3		
fornuftig	sensible	E	3		
stædig	stubborn	E	3		
fleksibel	flexible	E	4		
sky	shy	E	2		
udadvendt	outgoing	E	3		
indadvendt	introverted	E	3		
selvsikker	confident	E	4		
ydmyg	humble	E	4		
arrogant	arrogant	E	3		
sympatisk	likeable	E	4		
usympatisk	unlikeable	E	4		
sarkastisk	sarcastic	E	4		
seriøs	serious	E	2		
munter	cheerful	E	4		
gnaven	grumpy	E	4		
optimistisk	optimistic	E	4		
pessimistisk	pessimistic	E	4		
hjælpsom	helpful	E	4		
ansvarlig	responsible	E	2		
uansvarlig	irresponsible	E	4		
loyal	loyal	E	3		
sensitiv	sensitive	E	4		
rationel	rational	E	4		
impulsiv	impulsive	E	4		
energisk	energetic	E	4		
målrettet	goal-oriented	E	4		
en tilfredshed	a satisfaction	E	4		
en utilfredshed	a dissatisfaction	E	4		
en flovhed	an embarrassment	E	4		
en frustration	a frustration	E	4		
en irritation	an irritation	E	4		
en nervøsitet	a nervousness	E	4		
en nysgerrighed	a curiosity	E	3		
en taknemmelighed	a gratitude	E	3		
en medfølelse	a compassion	E	3		
en empati	an empathy	E	4		
en afmagt	a helplessness	E	4		
en skyldfølelse	a guilt	E	4		
en lettet følelse	a sense of relief	E	3		
overvældet	overwhelmed	E	4		
ligeglad	indifferent	E	1		
rørt	touched	E	2		
chokeret	shocked	E	3		
fortvivlet	desperate	E	4		
generøs	generous	E	4		
gerrig	stingy	E	4		
egoistisk	selfish	E	3		
uselvisk	unselfish	E	4		
modig	brave	E	2		
fej	cowardly	E	4		
ambitiøs	ambitious	E	4		
følsom	sensitive	E	3		
hårdhudet	thick-skinned	E	4		
beskeden	modest	E	2		
charmerende	charming	E	3		
irriterende	annoying	E	2		
spontan	spontaneous	E	4		
forsigtig	cautious	E	1		
skødesløs	careless	E	4		
en idiot	an idiot	E	3		
et fjols	a fool	E	3		
en fornøjelse	a pleasure	E	1		
et mareridt	a nightmare	E	2		
panik	panic	E	2		en
en løgner	a liar	E	2		
vanvid	madness	E	2		et
et geni	a genius	E	2		
opførsel	behavior	E	2		en
knust	crushed / heartbroken	E	2		
urolig	uneasy / restless	E	2		
skuffet	disappointed	E	2		
pinlig	embarrassing	E	4		
desperat	desperate	E	2		
en fornemmelse	a feeling / sense	E	2		
imponeret	impressed	E	2		
taknemmelig	grateful	E	2		
had	hatred	E	1		et
et chok	a shock	E	3		
en kujon	a coward	E	3		
ærgerlig	annoying / a shame	E	4		
rasende	furious	E	3		
en psykopat	a psychopath	E	3		
skræmt	scared	E	3		
en svaghed	a weakness	E	3		
fræk	cheeky / naughty	E	3		
en galning	a madman	E	3		
flov	embarrassed	E	3		
paranoid	paranoid	E	3		
trøst	comfort / consolation	E	2		en
humor	humor	E	2		en
tryg	safe / secure	E	3		
ulykkelig	unhappy	E	3		
oprevet	upset	E	3		
genert	shy	E	3		
rystet	shaken	E	3		
lettet	relieved	E	3		
afslappet	relaxed	E	3		
deprimeret	depressed	E	3		
en stakkel	a poor thing	E	3		
en personlighed	a personality	E	3		
en tåbe	a fool	E	3		
en nørd	a nerd	E	3		
sørgelig	sad / pathetic	E	4		
udmattet	exhausted	E	3		
kærlig	loving / affectionate	E	3		
anspændt	tense	E	3		
tiltrukket	attracted	E	3		
ophidset	agitated / excited	E	3		
lidenskab	passion	E	2		en
akavet	awkward	E	3		
sårbar	vulnerable	E	3		
selvtillid	self-confidence	E	2		en
fornærmet	offended	E	3		
ivrig	eager	E	3		
uforskammet	rude / impertinent	E	3		
høflig	polite	E	3		
ærlighed	honesty	E	2		en
et ego	an ego	E	3		
oprørt	upset	E	3		
charme	charm	E	2		en
misundelig	envious	E	3		
troskab	loyalty	E	2		en
håbløs	hopeless	E	4		
venlighed	kindness	E	2		en
begær	desire / lust	E	2		et
sympati	sympathy	E	2		en
inspireret	inspired	E	3		
aggressiv	aggressive	E	3		
deprimerende	depressing	E	3		
beæret	honored	E	3		
tiltro	confidence / trust	E	2		en
en attitude	an attitude	E	3		
distraheret	distracted	E	3		
et temperament	a temper / temperament	E	3		
rørende	touching / moving	E	3		
smigret	flattered	E	4		
galskab	madness	E	2		en
en trang	an urge	E	4		
en stemning	a mood / atmosphere	E	4		
skræk	fear / terror	E	2		en
godhed	goodness	E	2		en
hysterisk	hysterical	E	4		
uartig	naughty	E	4		
en fornærmelse	an insult	E	4		
anger	remorse	E	2		en
lykke	happiness	E	1		en
misundelse	envy	E	3		en
en egenskab	a quality / trait	E	4		
et humør	a mood	E	2		
irriteret	irritated	E	4		
frustreret	frustrated	E	4		
stresset	stressed	E	3		
træt af	tired of / fed up with	E	1		
forventningsfuld	expectant	E	4		
forskrækket	startled	E	4		
rædselsslagen	terrified	E	4		
modløs	discouraged	E	4		
uvenlig	unfriendly	E	4		
gavmild	generous	E	4		
nærig	stingy	E	4		
grådig	greedy	E	4		
selvglad	smug / conceited	E	4		
hidsig	hot-tempered	E	4		
social	social	E	2		
humoristisk	humorous	E	4		
omsorgsfuld	caring	E	4		
hensynsfuld	considerate	E	4		
punktlig	punctual	E	4		
organiseret	organized	E	3		
at føle sig	to feel (a certain way)	E	1	føler sig|følte sig|følt sig	
at glæde sig til	to look forward to	E	1	glæder sig til|glædede sig til|glædet sig til	
at blive vred	to get angry	E	1	bliver vred|blev vred|blevet vred	
at blive glad	to become happy	E	1	bliver glad|blev glad|blevet glad	
at sukke	to sigh	E	2	sukker|sukkede|sukket	
at holde af	to be fond of	E	1	holder af|holdt af|holdt af	
at frygte	to fear	E	2	frygter|frygtede|frygtet	
at være bange for	to be afraid of	E	1	er bange for|var bange for|været bange for	
at stole på	to trust	E	1	stoler på|stolede på|stolet på	
at falde til ro	to calm down	E	1	falder til ro|faldt til ro|faldet til ro	
at gå amok	to go berserk	E	2	går amok|gik amok|gået amok	
at blive forelsket	to fall in love	E	1	bliver forelsket|blev forelsket|blevet forelsket	
at forskrække	to frighten	E	4	forskrækker|forskrækkede|forskrækket	
at glæde	to please / delight	E	1	glæder|glædede|glædet	
at ærgre sig	to be annoyed	E	4	ærgrer sig|ærgrede sig|ærgret sig	
en opmuntring	an encouragement	E	4		
forelsket	in love	E	1		
en følelse	a feeling	E	2		
hygge	coziness / hygge	E	2		en
jaloux	jealous	E	2		
lykkelig	happy	E	1		
trist	sad	E	1		
træls	annoying (Jutland slang)	E	3		
forbavset	astonished	E	4		
forbløffet	amazed	E	4		
misfornøjet	dissatisfied	E	4		
nedtrykt	depressed / down	E	4		
skamfuld	ashamed	E	4		
sørgmodig	sorrowful	E	4		
utilfreds	dissatisfied	E	4		
vemodig	wistful / melancholic	E	4		
en forkærlighed	a fondness / preference	E	4		
adfærd	behavior	E	2		en
gavmildhed	generosity	E	3		en
livsglæde	joy of life / zest for life	E	3		en
en skjorte	a shirt	K	2		
en t-shirt	a t-shirt	K	2		
en bluse	a blouse	K	2		
bukser	pants	K	2		
et par jeans	a pair of jeans	K	2		
en nederdel	a skirt	K	2		
en kjole	a dress	K	1		
en jakke	a jacket	K	2		
en frakke	a coat	K	2		
en sweater	a sweater	K	2		
en trøje	a sweater / jumper	K	2		
underbukser	underwear	K	2		
en bh	a bra	K	2		
sokker	socks	K	2		
sko	shoes	K	1		
støvler	boots	K	2		
sandaler	sandals	K	3		
en hue	a beanie	K	3		
en hat	a hat	K	2		
handsker	gloves	K	2		
et tørklæde	a scarf	K	2		
et bælte	a belt	K	2		
et slips	a tie	K	2		
en pyjamas	a pair of pajamas	K	2		
badetøj	swimwear	K	3		et
en regnjakke	a rain jacket	K	3		
en størrelse	a size	K	2		
en farve	a color	K	2		
et stof	a fabric	K	2		
et mønster	a pattern	K	2		
mode	fashion	K	2		
en stil	a style	K	1		
et smykke	a piece of jewelry	K	3		
en ring	a ring	K	1		
en halskæde	a necklace	K	2		
et armbånd	a bracelet	K	2		
øreringe	earrings	K	2		
en pung	a wallet	K	2		
et prøverum	a fitting room	K	3		
en kvittering	a receipt	K	2		
et tilbud	an offer / deal	K	1		
et udsalg	a sale	K	3		
en rabat	a discount	K	2		
et medlemskab	a membership	K	3		
en betaling	a payment	K	2		
kontant	cash	K	2		
et betalingskort	a payment card	K	3		
byttepenge	change (money)	K	3		
at returnere	to return an item	K	2	returnerer|returnerede|returneret	
at bytte	to exchange	K	2	bytter|byttede|byttet	
en ekspedient	a shop assistant	K	3		
et indkøbscenter	a shopping mall	K	3		
et stormagasin	a department store	K	3		
gratis	free (no cost)	K	1		
en kasse	a box / checkout	K	2		
et jakkesæt	a suit (clothing)	K	2		
en uniform	a uniform	K	2		
en lomme	a pocket	K	2		
undertøj	underwear	K	2		et
en dragt	a suit / costume	K	2		
en knap	a button	K	1		
uld	wool	K	2		en
en parfume	a perfume	K	2		
en tegnebog	a wallet	K	2		
makeup	makeup	K	2		en
en kappe	a cloak / robe	K	2		
en læbestift	a lipstick	K	2		
luksus	luxury	K	2		en
en pels	a fur (coat)	K	2		
en levering	a delivery	K	2		
shorts	shorts	K	4		pl
en vinterjakke	a winter jacket	K	4		
en vest	a vest	K	2		
en hættetrøje	a hoodie	K	3		
en cardigan	a cardigan	K	3		
en polo	a polo shirt	K	2		
en top	a top	K	2		
en undertrøje	an undershirt	K	3		
trusser	panties / briefs	K	3		pl
strømpebukser	tights	K	4		pl
en strømpe	a stocking / sock	K	3		
leggings	leggings	K	4		pl
en badedragt	a swimsuit	K	3		
badebukser	swim trunks	K	4		pl
en bikini	a bikini	K	3		
en morgenkåbe	a bathrobe	K	3		
en kasket	a cap	K	2		
en vante	a mitten	K	3		
en handske	a glove	K	3		
en sko	a shoe	K	1		
en støvle	a boot	K	3		
en gummistøvle	a rubber boot	K	4		
en sneaker	a sneaker	K	4		
en hjemmesko	a slipper	K	3		
en sandal	a sandal	K	3		
en lynlås	a zipper	K	3		
et ærme	a sleeve	K	2		
en krave	a collar	K	3		
et snørebånd	a shoelace	K	3		
en håndtaske	a handbag	K	3		
et armbåndsur	a wristwatch	K	3		
solbriller	sunglasses	K	4		pl
en ørering	an earring	K	2		
bomuld	cotton	K	3		en
silke	silk	K	2		en
læder	leather	K	2		et
denim	denim	K	3		en
polyester	polyester	K	3		en
et mærke	a brand / mark	K	1		
en tøjbutik	a clothing store	K	3		
en skobutik	a shoe store	K	3		
en kiosk	a kiosk / convenience store	K	3		
et loppemarked	a flea market	K	3		
en genbrugsbutik	a secondhand shop	K	3		
en webshop	an online store	K	4		
en indkøbskurv	a shopping basket	K	4		
en indkøbsvogn	a shopping cart	K	3		
en selvbetjeningskasse	a self-checkout	K	4		
et prisskilt	a price tag	K	4		
en returret	a right of return	K	4		
en bytteseddel	a gift receipt	K	4		
et gavekort	a gift card	K	3		
pant	deposit (on bottles)	K	3		en
åbningstider	opening hours	K	4		pl
at shoppe	to shop	K	4	shopper|shoppede|shoppet	
at prøve tøj	to try on clothes	K	1	prøver tøj|prøvede tøj|prøvet tøj	
at tage af	to take off	K	1	tager af|tog af|taget af	
at have på	to wear	K	1	har på|havde på|haft på	
at skifte tøj	to change clothes	K	2	skifter tøj|skiftede tøj|skiftet tøj	
at knappe	to button	K	4	knapper|knappede|knappet	
at lyne op	to unzip	K	3	lyner op|lynede op|lynet op	
at binde snørebånd	to tie shoelaces	K	4	binder snørebånd|bandt snørebånd|bundet snørebånd	
at klæde	to suit (look good on)	K	2	klæder|klædte|klædt	
at betale med kort	to pay by card	K	1	betaler med kort|betalte med kort|betalt med kort	
at købe ind	to buy groceries	K	1	køber ind|købte ind|købt ind	
udsolgt	sold out	K	4		
på tilbud	on sale	K	1		
moderigtig	fashionable	K	4		
prikket	polka-dotted	K	4		
brugt	used / secondhand	K	1		
en bestilling	an order	K	2		
regntøj	rain gear	K	3		et
en flyverdragt	a snowsuit	K	4		
en halsedisse	a neck warmer	K	4		
en bæltetaske	a fanny pack	K	4		
en skuldertaske	a shoulder bag	K	4		
en tøjbøjle	a clothes hanger	K	4		
en dagligvare	a grocery item	K	4		
dagligvarer	groceries	K	4		pl
frostvarer	frozen foods	K	4		pl
en tilbudsavis	a flyer with offers	K	4		
en pantautomat	a bottle return machine	K	4		
en pantbon	a deposit receipt	K	4		
et bonuskort	a loyalty card	K	4		
en bon	a receipt	K	2		
en butiksansat	a store employee	K	4		
en varedeklaration	a list of ingredients / product label	K	4		
en holdbarhedsdato	a best-before date	K	4		
bedst før	best before	K	1		
en boghandel	a bookstore	K	3		
creme	cream (lotion)	K	2		en
en diamant	a diamond	K	2		
en sok	a sock	K	3		
et supermarked	a supermarket	K	2		
en ekspedition	a service / transaction	K	2		
en skranke	a counter	K	3		
et kønummer	a queue number	K	4		
en åbningsdag	an opening day	K	4		
en lukkedag	a closing day	K	4		
et renseri	a dry cleaner's	K	3		
en optikerforretning	an optician's shop	K	4		
en blomsterhandler	a florist	K	3		
en boghandler	a bookseller	K	3		
en isenkræmmer	a hardware store	K	3		
et byggemarked	a DIY store	K	4		
en møbelforretning	a furniture store	K	4		
en elektronikbutik	an electronics store	K	4		
en legetøjsbutik	a toy store	K	3		
en sportsforretning	a sports store	K	4		
en dyrehandel	a pet shop	K	3		
en vinhandel	a wine shop	K	3		
en slikbutik	a candy store	K	3		
en fiskehandler	a fishmonger	K	4		
en ostehandler	a cheese shop	K	4		
en torvehal	a market hall	K	4		
en markedsbod	a market stall	K	4		
en stand	a stand / booth	K	1		
en købmand	a grocer / shopkeeper	K	3		
en sælgerske	a saleswoman	K	4		
en butiksindehaver	a shop owner	K	4		
et vareudvalg	a range of goods	K	4		
et sortiment	an assortment	K	4		
en vare	an item / product	K	2		
en prisforskel	a price difference	K	4		
et prisfald	a price drop	K	4		
en prisstigning	a price increase	K	4		
en betalingsmetode	a payment method	K	4		
MobilePay	MobilePay (Danish mobile payment app)	K	4		
en kontaktløs betaling	a contactless payment	K	4		
en pinkode	a PIN code	K	3		
en afbetaling	an installment	K	3		
fragt	shipping / freight	K	3		en
en leveringstid	a delivery time	K	4		
en pakkeshop	a parcel shop	K	4		
en pakkeboks	a parcel locker	K	4		
en afhentning	a pickup / collection	K	3		
en reklamation	a complaint (faulty item)	K	4		
en indkøbstur	a shopping trip	K	4		
et storindkøb	a big grocery shop	K	4		
et tilbudskatalog	a sale catalog	K	4		
et julesalg	a Christmas sale	K	4		
en vareprøve	a product sample	K	4		
gavepapir	wrapping paper	K	3		et
en gaveindpakning	a gift wrapping	K	4		
en indkøbspose	a shopping bag	K	4		
en frisørsalon	a hair salon	K	3		
en klipning	a haircut	K	3		
en neglesalon	a nail salon	K	4		
en skønhedssalon	a beauty salon	K	3		
et solcenter	a tanning salon	K	4		
et katalog	a catalog	K	3		
et modeshow	a fashion show	K	3		
en cykelhandler	a bike shop	K	4		
en kassebon	a till receipt	K	4		
en pengepung	a purse	K	3		
en vaskeseddel	a care label	K	4		
en tøjstørrelse	a clothing size	K	4		
en skostørrelse	a shoe size	K	3		
en vinterstøvle	a winter boot	K	4		
en sommerkjole	a summer dress	K	4		
en solhat	a sun hat	K	4		
en strikhue	a knitted hat	K	4		
en uldsweater	a wool sweater	K	4		
en butterfly	a bow tie	K	3		
en manchetknap	a cufflink	K	4		
en hårelastik	a hair tie	K	4		
et hårspænde	a hair clip	K	3		
neglelak	nail polish	K	3		en
en mascara	a mascara	K	3		
en ansigtscreme	a face cream	K	4		
en bodylotion	a body lotion	K	4		
en smartphone	a smartphone	M	4		
en tablet	a tablet	M	4		
en skærm	a screen	M	2		
et tastatur	a keyboard	M	4		
en computermus	a computer mouse	M	4		
en hjemmeside	a website	M	2		
en app	an app	M	4		
et program	a program	M	2		
software	software	M	4		
en fil	a file	M	3		
en mappe	a folder	M	3		
et download	a download	M	4		
et upload	an upload	M	4		
et kodeord	a password	M	3		
en bruger	a user	M	1		
en konto	an account	M	3		
en profil	a profile	M	2		
en besked	a message	M	1		
en sms	a text message	M	2		
en email	an email	M	4		
et opkald	a phone call	M	1		
et kamera	a camera	M	2		
et billede	a picture	M	1		
en video	a video	M	2		
en playliste	a playlist	M	4		
streaming	streaming	M	4		
en podcast	a podcast	M	4		
nyheder	news	M	1		
en blog	a blog	M	4		
sociale medier	social media	M	4		
et opslag	a post	M	4		
en kommentar	a comment	M	3		
et like	a like	M	4		
en følger	a follower	M	1		
et hashtag	a hashtag	M	4		
en reklame	an advertisement	M	2		
en opdatering	an update	M	4		
en version	a version	M	3		
en fejl	an error / bug	M	1		
en virus	a virus	M	3		
sikkerhed	security	M	1		
en backup	a backup	M	3		
en server	a server	M	3		
et netværk	a network	M	2		
en router	a router	M	4		
et batteri	a battery	M	3		
opladning	charging	M	4		
et skærmbillede	a screenshot	M	4		
hardware	hardware	M	4		
en robot	a robot	M	3		
kunstig intelligens	artificial intelligence	M	2		en
en artikel	an article	M	3		
en overskrift	a headline	M	4		
en udsendelse	a broadcast	M	4		
en kanal	a channel	M	3		
en serie	a series	M	3		
en afsnit	an episode	M	3		
en instruktør	a director	M	3		
en rolle	a role	M	2		
en anmeldelse	a review	M	4		
en genre	a genre	M	4		
en soundtrack	a soundtrack	M	4		
en sang	a song	M	1		
en tekst	a text	M	2		
et interview	an interview	M	3		
en dokumentar	a documentary	M	4		
en streamingtjeneste	a streaming service	M	4		
en påvirker	an influencer	M	3		
en nyhed	a piece of news	M	1		
en udgivelse	a release	M	4		
en adgangskode	a password	M	4		
en indstilling	a setting	M	3		
et link	a link	M	4		
en browser	a browser	M	4		
en nedbrud	a crash	M	4		
en genstart	a restart	M	4		
en installation	an installation	M	4		
en synkronisering	a sync	M	4		
en enhed	a device	M	2		
en forbindelse	a connection	M	1		
en firewall	a firewall	M	4		
en sikkerhedskopi	a backup	M	4		
et signal	a signal	M	2		
en presse	a press	M	2		
en kopi	a copy	M	2		
en kode	a code	M	2		
et foto	a photo	M	3		
en mobiltelefon	a mobile phone	M	3		
kommunikation	communication	M	2		en
en optagelse	a recording	M	3		
en forside	a front page / front	M	3		
en udgave	an edition / version	M	3		
en opringning	a phone call	M	3		
en episode	an episode	M	3		
et klip	a cut / clip	M	3		
elektrisk	electric	M	3		
en satellit	a satellite	M	3		
et rumskib	a spaceship	M	3		
en laser	a laser	M	3		
automatisk	automatic	M	3		
en skandale	a scandal	M	3		
en database	a database	M	3		
en redaktør	an editor	M	4		
en frekvens	a frequency	M	4		
en radar	a radar	M	4		
en producer	a producer	M	4		
opdateret	updated	M	4		
en bærbar computer	a laptop	M	4		
et headset	a headset	M	4		
høretelefoner	headphones	M	4		pl
en harddisk	a hard drive	M	4		
en USB-nøgle	a USB stick	M	4		
et brugernavn	a username	M	4		
en vedhæftet fil	an attachment	M	4		
en indbakke	an inbox	M	4		
en søgemaskine	a search engine	M	4		
en nyhedsside	a news site	M	4		
et magasin	a magazine	M	4		
en algoritme	an algorithm	M	4		
at tænde for	to turn on	M	1	tænder for|tændte for|tændt for	
at slukke for	to turn off	M	2	slukker for|slukkede for|slukket for	
at genstarte	to restart	M	4	genstarter|genstartede|genstartet	
at logge ind	to log in	M	4	logger ind|loggede ind|logget ind	
at logge ud	to log out	M	4	logger ud|loggede ud|logget ud	
at downloade	to download	M	4	downloader|downloadede|downloadet	
at uploade	to upload	M	4	uploader|uploadede|uploadet	
at installere	to install	M	4	installerer|installerede|installeret	
at opdatere	to update	M	4	opdaterer|opdaterede|opdateret	
at slette	to delete	M	3	sletter|slettede|slettet	
at klikke	to click	M	4	klikker|klikkede|klikket	
at scrolle	to scroll	M	4	scroller|scrollede|scrollet	
at google	to google	M	4	googler|googlede|googlet	
at sende en sms	to text	M	2	sender en sms|sendte en sms|sendt en sms	
at ringe op	to call (phone)	M	1	ringer op|ringede op|ringet op	
at lægge på	to hang up	M	1	lægger på|lagde på|lagt på	
at svare på	to answer / reply to	M	1	svarer på|svarede på|svaret på	
at poste	to post	M	4	poster|postede|postet	
at like	to like (online)	M	4	liker|likede|liket	
at streame	to stream	M	3	streamer|streamede|streamet	
at oplade	to charge	M	4	oplader|opladede|opladet	
at scanne	to scan	M	4	scanner|scannede|scannet	
at programmere	to program	M	2	programmerer|programmerede|programmeret	
at taste	to type / enter	M	4	taster|tastede|tastet	
online	online	M	3		
offline	offline	M	4		
digital	digital	M	4		
trådløs	wireless	M	4		
en nyhedsudsendelse	a news broadcast	M	4		
en debatør	a commentator	M	4		
en kronik	an op-ed (feature article)	M	4		
misinformation	misinformation	M	3		en
en sending	a shipment / broadcast	M	4		
indhold	content	M	2		et
et indlæg	a post / contribution	M	4		
et slagord	a slogan	M	4		
en internetforbindelse	an internet connection	M	4		
bærbar	portable / laptop	M	2		
en højttaler	a speaker	M	4		
en influencer	an influencer	M	3		
en mail	an email	M	2		
et medie	a medium (media outlet)	M	3		
en mikrofon	a microphone	M	2		
en mobil	a mobile phone	M	2		
et net	a net / internet	M	2		
et telefonnummer	a phone number	M	2		
viral	viral	M	3		
en anmelder	a reviewer / critic	M	4		
en annonce	an advertisement	M	4		
en brochure	a brochure	M	4		
en detektor	a detector	M	4		
elektronik	electronics	M	3		en
en emoji	an emoji	M	4		
en føljeton	a serial (story)	M	4		
en karikatur	a caricature	M	4		
en kommentator	a commentator	M	4		
en nyhedsvært	a news anchor	M	4		
et nyhedsbrev	a newsletter	M	4		
en platform	a platform	M	4		
en publikation	a publication	M	4		
en radioavis	a radio news broadcast	M	4		
en redaktion	an editorial office	M	4		
en seer	a viewer	M	4		
en skribent	a writer	M	4		
et talkshow	a talk show	M	4		
en tv-serie	a TV series	M	4		
en tv-kanal	a TV channel	M	4		
en ugeavis	a weekly local paper	M	4		
en undertekst	a subtitle	M	4		
en vejviser	a directory / signpost	M	4		
et videoopkald	a video call	M	4		
en webside	a web page	M	4		
et forlag	a publisher	M	4		
et tv-program	a TV program	M	4		
et underholdningsprogram	an entertainment show	M	4		
en brevkasse	an advice column / mailbox	M	4		
en gratisavis	a free newspaper	M	4		
en lokalavis	a local newspaper	M	4		
et nyhedsprogram	a news program	M	4		
en hensigt	an intention	X	3		
en antagelse	an assumption	X	4		
en betragtning	a consideration	X	3		
en mening	an opinion	X	1		
en holdning	an attitude	X	3		
et synspunkt	a viewpoint	X	4		
en påstand	a claim	X	4		
et argument	an argument	X	4		
en årsag	a reason	X	2		
en konsekvens	a consequence	X	3		
et resultat	a result	X	3		
en mulighed	a possibility	X	1		
en fordel	an advantage	X	2		
en ulempe	a disadvantage	X	4		
en udfordring	a challenge	X	3		
en forskel	a difference	X	1		
en lighed	a similarity	X	4		
et forhold	a relationship	X	1		
en sammenhæng	a connection	X	3		
en betydning	a meaning	X	3		
en tendens	a trend	X	4		
en udvikling	a development	X	3		
en forandring	a change	X	3		
en forbedring	an improvement	X	4		
en forværring	a worsening	X	4		
et formål	a purpose	X	2		
en beslutning	a decision	X	1		
et valg	a choice	X	1		
en handling	an action	X	3		
en indsats	an effort	X	3		
fremgang	progress	X	2		en
et fremskridt	an advance	X	3		
en oplevelse	an experience	X	3		
et indtryk	an impression	X	3		
en vurdering	an assessment	X	3		
en forventning	an expectation	X	3		
en skuffelse	a disappointment	X	3		
en bekymring	a worry	X	3		
en tvivl	a doubt	X	1		
en overbevisning	a conviction	X	4		
en værdi	a value	X	3		
et princip	a principle	X	4		
en teori	a theory	X	2		
et begreb	a concept	X	4		
en påvirkning	an influence	X	4		
en risiko	a risk	X	2		
en fordom	a prejudice	X	4		
en hindring	an obstacle	X	4		
en forhindring	a hurdle	X	4		
en begrænsning	a limitation	X	4		
en mangel	a shortage	X	3		
et underskud	a deficit	X	4		
et overskud	a surplus	X	4		
en nødsituation	an emergency	X	3		
en fejltagelse	a mistake	X	2		
en uenighed	a disagreement	X	4		
en modsætning	a contradiction	X	3		
et kompromis	a compromise	X	4		
et alternativ	an alternative	X	3		
en udvej	a way out	X	2		
en genvej	a shortcut	X	4		
en omvej	a detour	X	4		
en beslutningstager	a decision-maker	X	4		
en igangsætter	an initiator	X	4		
en efterfølger	a successor	X	4		
en forgænger	a predecessor	X	4		
en fortolkning	an interpretation	X	4		
en implikation	an implication	X	4		
en fortaler	an advocate	X	4		
en formidler	a mediator	X	4		
en iagttager	an observer	X	4		
en deltagerliste	a list of participants	X	4		
en prioritet	a priority	X	3		
en dagsorden	an agenda	X	4		
et referat	a summary/minutes	X	4		
en beslutningsproces	a decision-making process	X	4		
en høring	a hearing	X	4		
en afklaring	a clarification	X	4		
en uklarhed	an ambiguity	X	4		
en tvetydighed	an ambiguity	X	4		
en nuance	a nuance	X	4		
en detalje	a detail	X	3		
en helhed	a whole	X	4		
en delmængde	a subset	X	4		
en kategori	a category	X	4		
en klassificering	a classification	X	4		
en rangorden	a ranking	X	4		
en prioritering	a prioritization	X	4		
en tilpasning	an adaptation	X	4		
en tilvænning	an adjustment	X	4		
en overgang	a transition	X	4		
en milepæl	a milestone	X	4		
en fase	a phase	X	3		
et stadie	a stage	X	4		
et niveau	a level	X	2		
en skala	a scale	X	4		
en tærskel	a threshold	X	4		
en grænseværdi	a limit value	X	4		
en variation	a variation	X	4		
en afvigelse	a deviation	X	4		
en uregelmæssighed	an irregularity	X	4		
en sammenhængskraft	a cohesion	X	4		
en balance	a balance	X	3		
en ubalance	an imbalance	X	4		
en ligevægt	an equilibrium	X	4		
en harmoni	a harmony	X	4		
en disharmoni	a discord	X	4		
en modvilje	a reluctance	X	4		
en villighed	a willingness	X	4		
en beredvillighed	a readiness	X	4		
en tøven	a hesitation	X	4		
en beslutsomhed	a determination	X	4		
en vedholdenhed	a persistence	X	4		
en opgivelse	a giving up	X	4		
en genopretning	a recovery	X	4		
en tilbagevenden	a return	X	4		
en tilbagegang	a decline	X	4		
en stagnation	a stagnation	X	4		
en sandhed	a truth	X	1		
fred	peace	X	1		en
held	luck	X	1		et
ære	honor	X	1		en
en sjæl	a soul	X	3		
en vilje	a will	X	1		
et ansvar	a responsibility	X	1		
en hemmelighed	a secret	X	1		
en skæbne	a fate / destiny	X	3		
hævn	revenge	X	3		en
opmærksomhed	attention	X	1		en
nåde	mercy / grace	X	1		en
en succes	a success	X	2		
en virkelighed	a reality	X	2		
et sind	a mind	X	2		
en anelse	a hint / slight idea	X	2		
et forslag	a suggestion / proposal	X	2		
et behov	a need	X	2		
en pointe	a point (of an argument)	X	2		
et hensyn	a consideration	X	2		
en fantasi	an imagination / fantasy	X	2		
en skønhed	a beauty	X	2		
en samvittighed	a conscience	X	2		
alvor	seriousness ("i alvor" = seriously)	X	2		en
en omstændighed	a circumstance	X	3		
en reaktion	a reaction	X	3		
kaos	chaos	X	2		et
fornuft	reason / common sense	X	2		en
ondskab	evil / malice	X	2		en
en mistanke	a suspicion	X	3		
et faktum	a fact	X	3		
en indflydelse	an influence	X	3		
nytte	use / benefit	X	2		en
privatliv	privacy	X	2		et
et motiv	a motive / subject	X	3		
et ry	a reputation	X	3		
et fokus	a focus	X	3		
en forstand	a mind / sense	X	3		
en fiasko	a failure / fiasco	X	3		
bevidsthed	consciousness	X	2		en
en tragedie	a tragedy	X	3		
en vane	a habit	X	3		
et budskab	a message	X	3		
en byrde	a burden	X	3		
tilstedeværelse	presence	X	2		en
en strategi	a strategy	X	3		
en undergang	a downfall / doom	X	3		
en forståelse	an understanding	X	3		
intelligens	intelligence	X	2		en
værdighed	dignity	X	2		en
overlevelse	survival	X	2		en
et potentiale	a potential	X	3		
en effekt	an effect	X	3		
en eksistens	an existence	X	3		
et instinkt	an instinct	X	3		
en gerning	a deed	X	3		
et perspektiv	a perspective	X	3		
moralsk	moral	X	3		
en vision	a vision	X	3		
en moral	a moral / morale	X	3		
et mysterium	a mystery	X	3		
gavn	benefit / use	X	2		en
et gennembrud	a breakthrough	X	3		
dømmekraft	judgment	X	2		en
visdom	wisdom	X	2		en
kendskab	knowledge (of something)	X	2		et
ødelæggelse	destruction	X	2		en
en lærestreg	a lesson (learned the hard way)	X	3		
en opfattelse	a perception / view	X	3		
isolation	isolation	X	2		en
et omdømme	a reputation	X	3		
uskyld	innocence	X	2		en
en inspiration	an inspiration	X	3		
en taktik	a tactic	X	3		
en vanskelighed	a difficulty	X	3		
disciplin	discipline	X	2		en
en ambition	an ambition	X	3		
en virkning	an effect	X	4		
fravær	absence	X	2		et
modgang	adversity	X	2		en
en illusion	an illusion	X	4		
et sammentræf	a coincidence	X	4		
indsigt	insight	X	2		en
barmhjertighed	mercy	X	2		en
logik	logic	X	2		en
kritik	criticism	X	2		en
en anledning	an occasion	X	4		
en definition	a definition	X	3		
en dimension	a dimension	X	4		
en faktor	a factor	X	4		
en forudsætning	a precondition	X	4		
en fortsættelse	a continuation	X	4		
en funktion	a function	X	4		
en kontekst	a context	X	4		
en kontrast	a contrast	X	4		
en norm	a norm	X	4		
en nødvendighed	a necessity	X	4		
en oprindelse	an origin	X	4		
en ordning	an arrangement / scheme	X	4		
en position	a position	X	2		
en sandsynlighed	a probability	X	4		
en struktur	a structure	X	4		
en tanke	a thought	X	2		
en tilgang	an approach	X	4		
en usikkerhed	an uncertainty	X	4		
en valgmulighed	an option	X	4		
viden	knowledge	X	2		en
vækst	growth	X	2		en
et aspekt	an aspect	X	4		
et fænomen	a phenomenon	X	4		
et grundlag	a basis	X	4		
et initiativ	an initiative	X	4		
et kriterium	a criterion	X	4		
et overblik	an overview	X	4		
et samarbejde	a cooperation	X	2		
et standpunkt	a point of view	X	4		
et tema	a theme	X	4		
et udgangspunkt	a starting point	X	4		
et vendepunkt	a turning point	X	4		
et vidnesbyrd	a testimony / evidence	X	4		
et ønske	a wish	X	1		
etik	ethics	X	3		en
fleksibilitet	flexibility	X	3		en
hjælpsomhed	helpfulness	X	3		en
kreativitet	creativity	X	3		en
kundskab	knowledge	X	3		en
livskvalitet	quality of life	X	3		en
mangfoldighed	diversity	X	3		en
motivation	motivation	X	3		en
selvstændighed	independence	X	3		en
sammenhold	solidarity	X	3		et
tryghed	security / safety	X	2		en
uafhængighed	independence	X	3		en
uvidenhed	ignorance	X	2		en
en antydning	a hint	X	4		
en begrundelse	a justification / reason	X	4		
en belastning	a strain / burden	X	4		
en bidragyder	a contributor	X	4		
deltagelse	participation	X	3		en
en drivkraft	a driving force	X	4		
en erindring	a memory / recollection	X	4		
en erkendelse	a realization	X	4		
en fordeling	a distribution	X	4		
en forlængelse	an extension	X	4		
en formidling	a communication / mediation	X	4		
en fornyelse	a renewal	X	4		
en forudsigelse	a prediction	X	4		
en fremstilling	a production / portrayal	X	4		
en fremvisning	a showing / display	X	4		
en indblanding	an interference	X	4		
en inddragelse	an involvement	X	4		
en markering	a marking / demonstration	X	4		
en modtagelse	a reception	X	4		
en omstilling	an adjustment / transition	X	4		
en opbakning	a support / backing	X	4		
en opdeling	a division	X	4		
en opfordring	a call / request	X	4		
en optælling	a count	X	4		
en overvejelse	a consideration	X	4		
planlægning	planning	X	2		en
en sammenligning	a comparison	X	4		
en støtte	a support	X	1		
en tilføjelse	an addition	X	4		
en tolkning	an interpretation	X	4		
en udskiftning	a replacement	X	4		
en udveksling	an exchange	X	4		
et afbræk	an interruption / break	X	4		
et belæg	a basis / evidence	X	4		
et bytte	an exchange / prey	X	2		
et kendetegn	a characteristic	X	4		
et påfund	an idea / invention	X	4		
et sammenstød	a clash / collision	X	4		
et skøn	an estimate / judgment	X	1		
et tilbageslag	a setback	X	4		
et træk	a feature / move / draft	X	1		
et udfald	an outcome	X	4		
et udsagn	a statement	X	4		
et eksempel	an example	X	1		
et liv	a life	X	1		
en udvidelse	an expansion	X	3		
en opsang	a telling-off	X	4		
en sidebemærkning	a side note	X	4		
en synsvinkel	a point of view / angle	X	4		
et sidespor	a digression / sidetrack	X	4		
en afveksling	a variety / change	X	4		
en bedrift	an achievement / feat	X	4		
en begavelse	a talent	X	4		
en straf	a punishment	U	2		
en forpligtelse	an obligation	U	4		
en institution	an institution	U	4		
en minoritet	a minority	U	4		
et flertal	a majority	U	4		
en afstemning	a vote	U	4		
en kultur	a culture	U	2		
en tradition	a tradition	U	2		
en regel	a rule	U	2		
en pligt	a duty	U	2		
en frihed	a freedom	U	2		
en ligestilling	an equality	U	4		
en økonomi	an economy	U	3		
en valgkreds	a constituency	U	4		
en borger	a citizen	U	3		
en organisation	an organization	U	3		
en industri	an industry	U	4		
en handel	a trade / deal	U	2		
en skat	a tax	U	1		
en indkomst	an income	U	4		
fattigdom	poverty	U	2		en
rigdom	wealth	U	2		en
en generation	a generation	U	3		
en befolkning	a population	U	3		
et fællesskab	a community	U	4		
en integration	an integration	U	4		
en identitet	an identity	U	2		
en religion	a religion	U	3		
en ytringsfrihed	a freedom of speech	U	4		
en debat	a debate	U	4		
en konflikt	a conflict	U	4		
en krise	a crisis	U	3		
en protest	a protest	U	3		
en demonstration	a demonstration	U	4		
en rettighed	an entitlement	U	3		
en pligtfølelse	a sense of duty	U	4		
en forbrydelse	a crime	U	2		
en tyveri	a theft	U	3		
et indbrud	a burglary	U	3		
et bedrageri	a fraud	U	4		
en anklage	an accusation	U	3		
en efterforskning	an investigation	U	3		
en anholdelse	an arrest	U	3		
en dom	a verdict	U	2		
en retssag	a court case	U	3		
en dommer	a judge	U	1		
et vidne	a witness	U	1		
et bevis	a proof	U	1		
en fængsel	a prison	U	1		
et offer	a victim	U	1		
en gerningsmand	a perpetrator	U	3		
en fare	a danger	U	1		
et overfald	an assault	U	3		
en trussel	a threat	U	2		
en ulykke	an accident	U	2		
en skade	a damage/injury	U	1		
en redning	a rescue	U	3		
en evakuering	an evacuation	U	4		
et brandvæsen	a fire department	U	4		
et nødopkald	an emergency call	U	4		
en videnskab	a science	U	2		
en forsker	a researcher	U	3		
et forsøg	an experiment	U	1		
en opdagelse	a discovery	U	4		
en opfindelse	an invention	U	4		
en hypotese	a hypothesis	U	4		
en metode	a method	U	3		
en analyse	an analysis	U	3		
data	data	U	2		
en statistik	a statistic	U	4		
en konklusion	a conclusion	U	4		
en teknologi	a technology	U	2		
en innovation	an innovation	U	4		
en opfinder	an inventor	U	4		
et laboratorium	a laboratory	U	3		
en afhandling	a thesis	U	4		
genetik	genetics	U	4		
et molekyle	a molecule	U	4		
en celle	a cell	U	2		
en samtale	a conversation	U	1		
en diskussion	a discussion	U	3		
en forhandling	a negotiation	U	4		
en meddelelse	an announcement	U	3		
en forespørgsel	an inquiry	U	4		
en anmodning	a request	U	3		
en instruktion	an instruction	U	4		
en forklaring	an explanation	U	2		
en beskrivelse	a description	U	3		
en oversættelse	a translation	U	3		
en dialekt	a dialect	U	4		
en accent	an accent	U	3		
en udtale	a pronunciation	U	2		
en grammatik	a grammar	U	4		
et ordforråd	a vocabulary	U	4		
en sætning	a sentence	U	2		
et udtryk	an expression	U	2		
en talemåde	a saying	U	4		
en tolk	an interpreter	U	4		
en tavshed	a silence	U	3		
en høflighed	a politeness	U	4		
en gud	a god	U	1		
politi	police	U	1		et
helvede	hell	U	3		et
et våben	a weapon	U	3		
et lig	a corpse	U	3		
en pistol	a pistol / gun	U	3		
magi	magic	U	3		en
et kors	a cross	U	2		
en majestæt	a majesty	U	2		
en engel	an angel	U	2		
et monster	a monster	U	2		
en ånd	a spirit / ghost	U	2		
en grav	a grave	U	2		
et mirakel	a miracle	U	2		
en begravelse	a funeral	U	2		
en vampyr	a vampire	U	2		
et spøgelse	a ghost	U	2		
kokain	cocaine	U	2		en
en russer	a Russian	U	4		
en dæmon	a demon	U	2		
en julemand	a Santa Claus	U	2		
en bøn	a prayer / request	U	3		
en højhed	a highness	U	3		
en pastor	a pastor	U	3		
en synder	a sinner	U	3		
narko	drugs (slang)	U	2		en
menneskehed	humanity	U	2		en
en race	a race / breed	U	3		
en forbandelse	a curse	U	3		
en jøde	a Jew	U	3		
spansk	Spanish	U	3		
en cigaret	a cigarette	U	3		
et flag	a flag	U	3		
et paradis	a paradise	U	3		
en djævel	a devil	U	3		
en ridder	a knight	U	3		
britisk	British	U	3		
et slot	a castle / palace	U	3		
en velsignelse	a blessing	U	3		
italiensk	Italian	U	3		
en troldmand	a wizard	U	3		
kongelig	royal	U	4		
en legende	a legend	U	3		
frelse	salvation	U	2		en
en kejser	an emperor	U	3		
velgørenhed	charity	U	2		en
et optog	a parade	U	3		
offentlighed	the public	U	2		en
marihuana	marijuana	U	2		en
en stamme	a tribe / trunk	U	3		
en trone	a throne	U	3		
en kirkegård	a cemetery	U	3		
hjemløs	homeless	U	3		
religiøs	religious	U	3		
et rådhus	a town hall	U	3		
et rumvæsen	an alien	U	4		
en pave	a pope	U	3		
en myte	a myth	U	3		
almægtig	almighty	U	4		
dommedag	doomsday / Judgment Day	U	2		en
græsk	Greek	U	3		
Mellemøsten	the Middle East	U	3		
et ritual	a ritual	U	3		
narkotika	narcotics	U	3		pl
en politistation	a police station	U	3		
et spyd	a spear	U	3		
en klokke	a bell	U	1		
jødisk	Jewish	U	3		
svensk	Swedish	U	3		
en frelser	a savior	U	4		
troende	believing / religious	U	4		
et tempel	a temple	U	4		
et palads	a palace	U	4		
en dværg	a dwarf	U	4		
en ceremoni	a ceremony	U	4		
en julegave	a Christmas present	U	4		
en indbygger	an inhabitant	U	4		
en tigger	a beggar	U	4		
indfødt	native	U	4		
fyrværkeri	fireworks	U	2		et
en englænder	an Englishman / English person	U	4		
udenlandsk	foreign	U	4		
et juletræ	a Christmas tree	U	4		
en skik	a custom	U	4		
en højtid	a holiday (religious/major)	U	4		
en helligdag	a public holiday	U	4		
jul	Christmas	U	1		en
juleaften	Christmas Eve	U	2		en
påske	Easter	U	3		en
pinse	Pentecost / Whitsun	U	3		en
fastelavn	Shrovetide (Danish carnival)	U	3		en
sankthans	Midsummer (St. John's Eve)	U	3		en
nytårsaften	New Year's Eve	U	2		en
grundlovsdag	Constitution Day (5 June)	U	3		en
en konfirmation	a confirmation	U	4		
en barnedåb	a christening	U	4		
kristendom	Christianity	U	3		en
islam	Islam	U	3		en
jødedom	Judaism	U	3		en
buddhisme	Buddhism	U	3		en
tro	faith / belief	U	1		en
en moské	a mosque	U	4		
en synagoge	a synagogue	U	4		
en bibel	a bible	U	3		
en synd	a sin	U	2		
et samfundsproblem	a social problem	U	4		
velfærd	welfare	U	3		en
velfærdssamfundet	the welfare state	U	4		
en skatteyder	a taxpayer	U	4		
den offentlige sektor	the public sector	U	3		
sundhedsvæsenet	the healthcare system	U	4		
en forening	an association / club	U	4		
en frivillig	a volunteer	U	3		
middelalderen	the Middle Ages	U	4		
vikingetiden	the Viking Age	U	4		
en viking	a Viking	U	3		
et kongehus	a royal family	U	4		
en prins	a prince	U	2		
en prinsesse	a princess	U	2		
en nationalitet	a nationality	U	4		
et modersmål	a mother tongue	U	4		
en dansker	a Dane	U	3		
en udlænding	a foreigner	U	4		
en nordmand	a Norwegian	U	3		
en svensker	a Swede	U	3		
en tysker	a German	U	3		
en amerikaner	an American	U	3		
Norden	the Nordic countries	U	4		
Skandinavien	Scandinavia	U	3		
Europa	Europe	U	2		
norsk	Norwegian	U	3		
tysk	German	U	2		
fransk	French	U	2		
amerikansk	American	U	2		
europæisk	European	U	4		
nordisk	Nordic	U	3		
kristen	Christian	U	2		
muslimsk	Muslim	U	4		
at tro på	to believe in	U	1	tror på|troede på|troet på	
at døbe	to baptize	U	4	døber|døbte|døbt	
at konfirmere	to confirm (church)	U	4	konfirmerer|konfirmerede|konfirmeret	
Grønland	Greenland	U	3		
Færøerne	the Faroe Islands	U	3		
Sverige	Sweden	U	2		
Norge	Norway	U	2		
Tyskland	Germany	U	2		
Frankrig	France	U	2		
England	England	U	2		
Storbritannien	Great Britain	U	4		
Spanien	Spain	U	3		
Italien	Italy	U	2		
Holland	the Netherlands	U	4		
Polen	Poland	U	4		
Finland	Finland	U	4		
Island	Iceland	U	2		
USA	the USA	U	1		
Kina	China	U	2		
Japan	Japan	U	3		
Indien	India	U	3		
Rusland	Russia	U	2		
Ukraine	Ukraine	U	4		
Tyrkiet	Turkey	U	4		
Grækenland	Greece	U	3		
Jylland	Jutland	U	4		
Sjælland	Zealand	U	4		
Fyn	Funen	U	4		
Bornholm	Bornholm	U	4		
København	Copenhagen	U	3		
Aarhus	Aarhus	U	4		
finsk	Finnish	U	4		
islandsk	Icelandic	U	4		
hollandsk	Dutch	U	4		
polsk	Polish	U	4		
tyrkisk	Turkish	U	4		
arabisk	Arabic	U	2		
kinesisk	Chinese	U	2		
japansk	Japanese	U	2		
russisk	Russian	U	2		
ukrainsk	Ukrainian	U	4		
indisk	Indian	U	4		
afrikansk	African	U	4		
asiatisk	Asian	U	4		
grønlandsk	Greenlandic	U	4		
færøsk	Faroese	U	4		
jysk	Jutlandic	U	4		
en københavner	a Copenhagener	U	4		
en jyde	a Jutlander	U	4		
en fynbo	a person from Funen	U	4		
en franskmand	a Frenchman / French person	U	4		
en italiener	an Italian	U	4		
en spanier	a Spaniard	U	4		
en polak	a Pole	U	4		
en kineser	a Chinese person	U	4		
en japaner	a Japanese person	U	4		
en inder	an Indian (from India)	U	4		
en araber	an Arab	U	4		
en tyrker	a Turk	U	4		
en grønlænder	a Greenlander	U	4		
en islænding	an Icelander	U	4		
en brite	a Brit	U	4		
en europæer	a European	U	4		
en afrikaner	an African	U	4		
en asiat	an Asian	U	4		
et CPR-nummer	a CPR number (Danish personal ID number)	U	4		
et sundhedskort	a health insurance card (yellow card)	U	4		
MitID	MitID (Danish digital ID)	U	4		
e-Boks	e-Boks (digital mailbox for official letters)	U	4		
Borgerservice	Citizen Services (municipal office)	U	4		
Skattestyrelsen	the Danish Tax Agency	U	4		
en venteliste	a waiting list	U	4		
en bosætning	a settlement	U	4		
byplanlægning	urban planning	U	3		en
en fejring	a celebration	U	4		
en indsamling	a collection (fundraiser)	U	4		
en bersærk	a berserker	U	3		
en borg	a castle (fortress)	U	2		
en dronning	a queen	U	2		
en havfrue	a mermaid	U	3		
en heks	a witch	U	2		
hellig	holy	U	2		
historisk	historic / historical	U	2		
en høvding	a chieftain	U	2		
en jætte	a giant (Norse mythology)	U	3		
et kloster	a monastery / convent	U	2		
en konge	a king	U	1		
mexicansk	Mexican	U	2		
en munk	a monk	U	2		
mytologi	mythology	U	3		en
en nisse	a Christmas elf / pixie	U	2		
oldnordisk	Old Norse	U	3		
pynt	decoration(s)	U	3		en
en rune	a rune	U	3		
et skjold	a shield	U	2		
en slave	a slave	U	2		
et sværd	a sword	U	2		
et værk	a work (of art) / plant	U	2		
en æggejagt	an egg hunt	U	3		
en studenterhue	a graduation cap	U	4		
en julefrokost	a Christmas lunch (party)	U	4		
en adventskrans	an Advent wreath	U	4		
et kalenderlys	an Advent calendar candle	U	4		
en pakkekalender	a gift Advent calendar	U	4		
en julesang	a Christmas carol	U	4		
en julestjerne	a poinsettia / Christmas star	U	4		
et påskeæg	an Easter egg	U	4		
en påskefrokost	an Easter lunch	U	4		
et sankthansbål	a Midsummer bonfire	U	4		
en fødselsdagsgave	a birthday present	U	4		
en flagstang	a flagpole	U	4		
en guirlande	a garland / streamer	U	4		
konfetti	confetti	U	3		en
en festtale	a (celebratory) speech	U	4		
en indflyttergave	a housewarming gift	U	4		
en værtindegave	a hostess gift	U	4		
et takkekort	a thank-you card	U	4		
et lykønskningskort	a greeting card	U	4		
en brudekjole	a wedding dress	U	4		
et guldbryllup	a golden wedding anniversary	U	4		
et sølvbryllup	a silver wedding anniversary	U	4		
en mindehøjtidelighed	a memorial service	U	4		
en kondolence	a condolence	U	4		
en gravsten	a gravestone	U	4		
en krans	a wreath	U	4		
en urne	an urn	U	4		
et offentligt rum	a public space	U	3		
arkitektur	architecture	U	3		en
en fællesspisning	a communal dinner	U	4		
en ønskeseddel	a wish list (gifts)	U	4		
en blomsterbuket	a bouquet	U	4		
en byfest	a town festival	U	4		
en festdag	a festive day	U	4		
julepynt	Christmas decorations	U	3		en
en kulturforskel	a cultural difference	U	4		
langfredag	Good Friday	U	3		en
skærtorsdag	Maundy Thursday	U	3		en
påskedag	Easter Sunday	U	3		en
en privatperson	a private individual	U	4		
et hjemland	a home country	U	4		
et ungdomshus	a youth center	U	4		
et åbent hus	an open house	U	2		
en fødselsdagsfest	a birthday party	U	4		
en julemiddag	a Christmas dinner	U	4		
en nytårskur	a New Year's reception	U	4		
fritid	free time	L	3		
en interesse	an interest	L	2		
et talent	a talent	L	2		
en hobby	a hobby	L	3		
en samling	a collection	L	3		
et håndarbejde	a handicraft	L	4		
strikning	knitting	L	4		
syning	sewing	L	4		
et maleri	a painting	L	2		
en tegning	a drawing	L	2		
et fotografi	a photograph	L	4		
en koncert	a concert	L	2		
en udstilling	an exhibition	L	4		
en biograf	a cinema	L	2		
et teater	a theatre	L	2		
en forestilling	a performance	L	2		
en klub	a club	L	2		
en konkurrence	a competition	L	3		
en turnering	a tournament	L	4		
en sejr	a victory	L	2		
et nederlag	a defeat	L	3		
en holdkammerat	a teammate	L	4		
en fanklub	a fan club	L	4		
en tilskuer	a spectator	L	4		
yoga	yoga	L	4		
en meditation	a meditation	L	4		
en vandretur	a hike	L	4		
en cykeltur	a bike ride	L	4		
fiskeri	fishing	L	4		
en jagt	a hunt	L	2		
havearbejde	gardening	L	3		et
en gåtur	a walk	L	4		
et brætspil	a board game	L	4		
et puslespil	a puzzle	L	4		
en gætteleg	a guessing game	L	4		
et håndværk	a craft	L	4		
en øvelse	an exercise	L	3		
en styrke	a strength	L	1		
en udholdenhed	an endurance	L	4		
kondition	fitness	L	4		
et fitnesscenter	a gym	L	4		
en træner	a coach	L	2		
et hold	a team	L	1		
en modstander	an opponent	L	3		
en bane	a field/court	L	2		
en runde	a round	L	2		
en rekord	a record	L	3		
en medalje	a medal	L	3		
en præstation	a performance	L	4		
en opvarmning	a warm-up	L	4		
en udstrækning	a stretch	L	4		
en løbetur	a run	L	4		
en svømmetur	a swim	L	4		
en fodboldkamp	a football match	L	4		
et mesterskab	a championship	L	4		
en spøg	a joke / prank	L	2		
en scene	a stage / scene	L	2		
en maske	a mask	L	2		
publikum	audience	L	2		et
en fan	a fan	L	2		
et trick	a trick	L	2		
legetøj	toys	L	2		et
en drage	a dragon / kite	L	2		
en lejr	a camp	L	2		
et hit	a hit	L	3		
en score	a score	L	2		
en klovn	a clown	L	3		
en dagbog	a diary	L	3		
et skuespil	a play (theater)	L	3		
en vinder	a winner	L	1		
en pool	a pool	L	3		
en aktivitet	an activity	L	3		
et cirkus	a circus	L	3		
skak	chess	L	2		en
en jæger	a hunter	L	3		
en skurk	a villain	L	2		
et væddemål	a bet	L	3		
en vits	a joke	L	3		
et digt	a poem	L	3		
et kostume	a costume	L	3		
et drama	a drama	L	3		
basketball	basketball	L	2		en
odds	odds	L	3		pl
et kor	a choir	L	1		
en vittighed	a joke	L	3		
et kasino	a casino	L	3		
en finale	a final	L	3		
poesi	poetry	L	2		en
et bal	a ball (dance)	L	3		
en optræden	a performance	L	3		
en coach	a coach	L	3		
underholdning	entertainment	L	2		en
et sejl	a sail	L	3		
en gevinst	a prize / winnings	L	3		
en komedie	a comedy	L	3		
en fabel	a fable	L	4		
en pirat	a pirate	L	3		
jazz	jazz	L	2		en
en brik	a piece (game) / tile	L	4		
et forspring	a head start / lead	L	4		
et manuskript	a manuscript / script	L	4		
en natklub	a nightclub	L	4		
en spejder	a scout	L	4		
en bamse	a teddy bear	L	4		
bifald	applause	L	2		et
et album	an album	L	4		
en zoologisk have	a zoo	L	4		
en fritidsaktivitet	a leisure activity	L	4		
sport	sport	L	2		en
en sportsgren	a sport (type)	L	4		
en spiller	a player	L	1		
en kamp	a match / game	L	1		
en pokal	a trophy / cup	L	4		
uafgjort	a draw / tie	L	4		
et stadion	a stadium	L	4		
en svømmehal	a swimming pool (indoor)	L	4		
en idrætshal	a sports hall	L	4		
en ketsjer	a racket	L	4		
et cykelløb	a bike race	L	4		
et maraton	a marathon	L	4		
golf	golf	L	2		en
ishockey	ice hockey	L	3		en
volleyball	volleyball	L	3		en
ridning	horse riding	L	3		en
sejlads	sailing	L	3		en
roning	rowing	L	3		en
kajak	kayaking / a kayak	L	3		en
klatring	climbing	L	3		en
skiløb	skiing	L	3		et
skøjteløb	ice skating	L	3		et
en skøjte	a skate	L	4		
en ski	a ski	L	2		
et kortspil	a card game	L	4		
et computerspil	a computer game	L	4		
en terning	a die / cube	L	4		
en krydsogtværs	a crossword	L	4		
en skulptur	a sculpture	L	4		
en digter	a poet	L	4		
en novelle	a short story	L	4		
en krimi	a crime novel / show	L	4		
en tegneserie	a comic	L	4		
en hovedperson	a main character	L	4		
en melodi	a melody	L	4		
et band	a band	L	2		
et instrument	an instrument	L	4		
en tromme	a drum	L	4		
en trompet	a trumpet	L	4		
en festival	a festival	L	4		
en tegnefilm	a cartoon	L	4		
en opera	an opera	L	4		
en ballet	a ballet	L	3		
en picnic	a picnic	L	4		
en grillfest	a barbecue party	L	4		
at dyrke sport	to do sports	L	3	dyrker sport|dyrkede sport|dyrket sport	
at spille fodbold	to play soccer	L	2	spiller fodbold|spillede fodbold|spillet fodbold	
at dykke	to dive	L	4	dykker|dykkede|dykket	
at ro	to row	L	1	ror|roede|roet	
at padle	to paddle	L	4	padler|padlede|padlet	
at løbe på skøjter	to ice-skate	L	4	løber på skøjter|løb på skøjter|løbet på skøjter	
at stå på ski	to ski	L	4	står på ski|stod på ski|stået på ski	
at score	to score	L	2	scorer|scorede|scoret	
at heppe	to cheer (for a team)	L	4	hepper|heppede|heppet	
at se tv	to watch TV	L	1	ser tv|så tv|set tv	
at gå i biografen	to go to the movies	L	3	går i biografen|gik i biografen|gået i biografen	
at strikke	to knit	L	4	strikker|strikkede|strikket	
at fotografere	to photograph	L	4	fotograferer|fotograferede|fotograferet	
at samle på	to collect	L	2	samler på|samlede på|samlet på	
at more sig	to have fun	L	2	morer sig|morede sig|moret sig	
at gå ud	to go out	L	1	går ud|gik ud|gået ud	
at gå på café	to go to a café	L	3	går på café|gik på café|gået på café	
at feste	to party	L	2	fester|festede|festet	
underholdende	entertaining	L	4		
sportslig	sporty / athletic	L	4		
musikalsk	musical	L	4		
en arrangør	an organizer	L	4		
en fortælling	a story / narrative	L	4		
en opførelse	a construction / performance	L	4		
en skildring	a depiction	L	4		
en hængekøje	a hammock	L	4		
en autograf	an autograph	L	2		
badminton	badminton	L	3		en
et bål	a bonfire / campfire	L	2		
en bold	a ball	L	2		
botanisk have	botanical garden	L	3		en
at cykle	to cycle	L	2	cykler|cyklede|cyklet	
cykling	cycling	L	3		en
en dans	a dance	L	1		
et eventyr	a fairy tale / adventure	L	2		
en film	a film / movie	L	1		
fitness	fitness (gym training)	L	3		et
en fløjte	a flute / whistle	L	2		
fodbold	soccer / football	L	2		en
en fodboldspiller	a soccer player	L	3		
en guitar	a guitar	L	2		
gymnastik	gymnastics	L	2		en
en hal	a hall (sports / large room)	L	2		
håndbold	handball	L	3		en
en joke	a joke	L	2		
et kapitel	a chapter	L	2		
klassisk	classical / classic	L	2		
et klaver	a piano	L	2		
en komiker	a comedian	L	2		
en leg	a game (play)	L	1		
lotto	lottery	L	3		en
en medspiller	a teammate	L	3		
en modspiller	an opponent (in a game)	L	3		
at mime	to mime	L	3	mimer|mimede|mimet	
en pensel	a paintbrush	L	3		
et point	a point (score)	L	2		
rock	rock (music)	L	2		en
en roman	a novel	L	2		
en rytme	a rhythm	L	2		
en sommerferie	a summer vacation	L	3		
et spil	a game	L	1		
svømning	swimming	L	3		en
tennis	tennis	L	2		en
en udklædning	a costume / dress-up	L	3		
en violin	a violin	L	2		
en skuespillerinde	an actress	L	4		
en danser	a dancer	L	2		
en billedhugger	a sculptor	L	4		
en komponist	a composer	L	4		
en dirigent	a conductor	L	4		
en personlig træner	a personal trainer	L	3		
en målmand	a goalkeeper	L	4		
en angriber	a forward / attacker	L	2		
en forsvarsspiller	a defender	L	4		
en anfører	a captain (team)	L	4		
et straffespark	a penalty kick	L	4		
et frispark	a free kick	L	4		
et hjørnespark	a corner kick	L	4		
en offside	an offside	L	4		
en halvleg	a half (of a game)	L	4		
en omkamp	a rematch	L	4		
en landskamp	an international match	L	4		
et landshold	a national team	L	4		
en liga	a league	L	4		
en sæsonbillet	a season ticket	L	4		
et træningspas	a training session	L	4		
en løbesko	a running shoe	L	4		
træningstøj	workout clothes	L	3		et
en yogamåtte	a yoga mat	L	4		
en håndvægt	a dumbbell	L	4		
en kondicykel	an exercise bike	L	4		
et løbebånd	a treadmill	L	4		
styrketræning	strength training	L	3		en
en armbøjning	a push-up	L	4		
en mavebøjning	a sit-up	L	4		
en squat	a squat	L	4		
en sportstaske	a gym bag	L	4		
et omklædningsrum	a locker room	L	4		
en sauna	a sauna	L	4		
en svømmebane	a swimming lane	L	4		
en vippe	a diving board / seesaw	L	4		
en redningskrans	a lifebuoy	L	4		
et vandland	a water park	L	4		
en skøjtebane	an ice rink	L	4		
en bowlinghal	a bowling alley	L	4		
minigolf	mini golf	L	3		en
et escape room	an escape room	L	4		
en quiz	a quiz	L	4		
banko	bingo	L	3		et
en tombola	a raffle	L	4		
et lotteri	a lottery	L	4		
en præmie	a prize	L	4		
en skattejagt	a treasure hunt	L	4		
et kostumebal	a costume party	L	4		
en sammenkomst	a get-together	L	4		
et middagsselskab	a dinner party	L	4		
et sammenskudsgilde	a potluck	L	4		
en havefest	a garden party	L	4		
en studenterfest	a graduation party	L	4		
et bibliotekskort	a library card	L	4		
en udlånstid	a loan period	L	4		
en hundeskov	a dog park	L	4		
et badested	a swimming spot	L	4		
et havnebad	a harbor bath (outdoor pool)	L	4		
en vinterbader	a winter swimmer	L	4		
vinterbadning	winter swimming	L	3		en
en anekdote	an anecdote	L	4		
en bestseller	a bestseller	L	4		
en biografi	a biography	L	4		
en debut	a debut	L	4		
en dialog	a dialogue	L	4		
en digtsamling	a poetry collection	L	4		
et dukketeater	a puppet theater	L	4		
en festsal	a banquet hall	L	4		
en filmstjerne	a film star	L	4		
en fotobog	a photo book	L	4		
en gallerist	a gallery owner	L	4		
en hovedrolle	a leading role	L	4		
en illustration	an illustration	L	4		
jubel	cheering / jubilation	L	3		en
en klassiker	a classic	L	4		
et klimaks	a climax	L	4		
en kunstudstilling	an art exhibition	L	4		
et kunstværk	a work of art	L	4		
litteratur	literature	L	2		en
en lydbog	an audiobook	L	4		
en læser	a reader	L	1		
et ordspil	a pun / wordplay	L	4		
en parodi	a parody	L	4		
en pladespiller	a record player	L	4		
en premiere	a premiere	L	4		
en replik	a line (in a play) / retort	L	4		
en sangtekst	a song lyric	L	4		
en spillefilm	a feature film	L	4		
en spændingsroman	a thriller (novel)	L	4		
en strofe	a stanza	L	4		
en tegner	an illustrator / cartoonist	L	3		
en tekstforfatter	a lyricist / copywriter	L	4		
en tilhører	a listener	L	1		
en titelsang	a theme song	L	4		
et forord	a preface	L	4		
et pseudonym	a pseudonym	L	4		
et repertoire	a repertoire	L	4		
et show	a show	L	2		
et teaterstykke	a stage play	L	4		
et vers	a verse	L	4		
en aftentur	an evening walk	L	4		
en bjergbestigning	a mountain climb	L	4		
en fagbog	a nonfiction book	L	4		
en filmaften	a movie night	L	4		
en fredagsbar	a Friday bar	L	4		
en gåde	a riddle / mystery	L	3		
en musikfestival	a music festival	L	4		
en sommerfest	a summer party	L	4		
en sportsklub	a sports club	L	4		
en strandtur	a trip to the beach	L	4		
et fitnessabonnement	a gym membership	L	4		
et koncerthus	a concert hall	L	4		
et tilholdssted	a hangout / haunt	L	4		
et tidsfordriv	a pastime	L	4		
en yndlingsbog	a favorite book	L	4		
en yndlingsfilm	a favorite movie	L	4		
en yndlingssang	a favorite song	L	4		
en krig	a war	G	2		
et mord	a murder	G	2		
en præsident	a president	G	2		
et angreb	an attack	G	2		
en magt	a power	G	2		
en morder	a murderer	G	2		
en hær	an army	G	2		
vold	violence	G	2		en
et fingeraftryk	a fingerprint	G	2		
en senator	a senator	G	2		
en stat	a state	G	2		
retfærdighed	justice	G	2		en
et forsvar	a defense	G	2		
en spion	a spy	G	2		
en tyv	a thief	G	2		
et røveri	a robbery	G	2		
en kriminalbetjent	a detective	G	3		
en kommissær	a commissioner	G	3		
et militær	a military	G	3		
en flåde	a fleet / navy / raft	G	3		
en modstand	a resistance	G	3		
et gerningssted	a crime scene	G	3		
et drab	a killing / homicide	G	3		
politisk	political	G	3		
en forræder	a traitor	G	3		
en kriminalassistent	a detective sergeant	G	3		
en kanon	a cannon	G	3		
et gevær	a rifle	G	3		
et håndjern	a handcuff	G	3		
en bøde	a fine (penalty)	G	3		
et oprør	a rebellion / uprising	G	3		
en trop	a troop	G	4		
en terrorist	a terrorist	G	3		
et forræderi	a betrayal / treason	G	3		
en guvernør	a governor	G	3		
en anklager	a prosecutor	G	2		
ammunition	ammunition	G	2		en
et alibi	an alibi	G	3		
kriminalitet	crime	G	2		en
en forbryder	a criminal	G	3		
militær	military	G	3		
overvågning	surveillance	G	2		en
national	national	G	3		
en efterforsker	an investigator	G	3		
lovlig	legal	G	4		
en allieret	an ally	G	4		
et gidsel	a hostage	G	3		
et parti	a (political) party / game	G	3		
en detektiv	a detective	G	3		
forstærkning	reinforcement	G	2		en
en kandidat	a candidate	G	3		
international	international	G	3		
en nation	a nation	G	3		
en jury	a jury	G	3		
en kendelse	a ruling / warrant	G	3		
en ambassadør	an ambassador	G	3		
tortur	torture	G	2		en
en tilståelse	a confession	G	3		
en verdenskrig	a world war	G	3		
en minister	a minister	G	3		
selvforsvar	self-defense	G	2		et
en udtalelse	a statement	G	3		
en kaution	a bail / guarantee	G	3		
et distrikt	a district	G	3		
en hersker	a ruler	G	3		
en aftrækker	a trigger	G	3		
varetægt	custody	G	2		en
en bedrager	a fraud / con artist	G	3		
ulovlig	illegal	G	3		
en kidnapning	a kidnapping	G	3		
et testamente	a will (legal) / testament	G	3		
et senat	a senate	G	3		
en kampagne	a campaign	G	3		
en revolution	a revolution	G	3		
FN	the UN	G	3		
en mafia	a mafia	G	3		
en bande	a gang	G	2		
en vicepræsident	a vice president	G	3		
en indsat	an inmate	G	3		
korrupt	corrupt	G	3		
en alliance	an alliance	G	3		
bestikkelse	bribery	G	2		en
et vidneudsagn	a testimony	G	3		
sprængstof	explosives	G	2		et
bevismateriale	evidence	G	2		et
efterlyst	wanted (by police)	G	3		
afpresning	blackmail	G	2		en
eftersøgt	wanted / sought	G	3		
et kup	a coup / heist	G	3		
juridisk	legal	G	3		
et baghold	an ambush	G	3		
en seriemorder	a serial killer	G	3		
en fange	a prisoner	G	3		
et kongerige	a kingdom	G	3		
en røver	a robber	G	3		
en strid	a dispute / conflict	G	3		
et territorium	a territory	G	3		
en patrulje	a patrol	G	3		
en union	a union	G	3		
en afhøring	an interrogation	G	3		
et demokrati	a democracy	G	3		
en tiltalt	a defendant	G	3		
en front	a front	G	3		
et kongresmedlem	a member of Congress	G	3		
en skytte	a shooter / marksman	G	3		
en svindler	a swindler	G	3		
en erklæring	a declaration / statement	G	3		
en besættelse	an occupation / obsession	G	3		
et missil	a missile	G	3		
et skydevåben	a firearm	G	3		
krudt	gunpowder	G	2		et
et forhør	an interrogation / hearing	G	3		
en statsadvokat	a public prosecutor	G	3		
en granat	a grenade	G	3		
dødsstraf	death penalty	G	2		en
en afgørelse	a decision / ruling	G	3		
et forlig	a settlement	G	4		
en revolver	a revolver	G	4		
en straffeattest	a criminal record	G	4		
et imperium	an empire	G	4		
en flygtning	a refugee	G	4		
et bedrag	a deception / fraud	G	3		
en sammensværgelse	a conspiracy	G	4		
en snigskytte	a sniper	G	4		
Folketinget	the Danish Parliament	G	4		
en politiker	a politician	G	3		
en vælger	a voter	G	2		
en kommune	a municipality	G	4		
et statsborgerskab	a citizenship	G	4		
en opholdstilladelse	a residence permit	G	4		
en arbejdstilladelse	a work permit	G	4		
en indvandrer	an immigrant	G	4		
et mindretal	a minority	G	4		
et lovforslag	a bill (law)	G	4		
en grundlov	a constitution	G	4		
diskrimination	discrimination	G	3		en
en strejke	a strike	G	4		
en reform	a reform	G	4		
terrorisme	terrorism	G	2		en
en domstol	a court	G	4		
svindel	fraud	G	2		en
EU	the EU	G	4		
demokratisk	democratic	G	4		
liberal	liberal	G	4		
konservativ	conservative	G	4		
socialistisk	socialist	G	4		
radikal	radical	G	4		
at regere	to govern / rule	G	4	regerer|regerede|regeret	
at vedtage	to pass (a law) / adopt	G	4	vedtager|vedtog|vedtaget	
at demonstrere	to demonstrate	G	4	demonstrerer|demonstrerede|demonstreret	
at strejke	to strike	G	4	strejker|strejkede|strejket	
at debattere	to debate	G	4	debatterer|debatterede|debatteret	
at beskylde	to accuse	G	4	beskylder|beskyldte|beskyldt	
at anklage	to charge / accuse	G	2	anklager|anklagede|anklaget	
at vidne	to testify	G	2	vidner|vidnede|vidnet	
at frifinde	to acquit	G	4	frifinder|frifandt|frifundet	
at bryde loven	to break the law	G	2	bryder loven|brød loven|brudt loven	
at melde til politiet	to report to the police	G	2	melder til politiet|meldte til politiet|meldt til politiet	
at integrere	to integrate	G	4	integrerer|integrerede|integreret	
indfødsret	citizenship	G	3		en
en indfødsretsprøve	a citizenship test	G	4		
en medborgerskabsprøve	a civics test	G	4		
en meningsmåling	an opinion poll	G	4		
et folketingsvalg	a general election	G	4		
et kommunalvalg	a local election	G	4		
en folkeafstemning	a referendum	G	4		
en koalition	a coalition	G	4		
en opposition	an opposition	G	4		
et regeringsparti	a governing party	G	4		
et støtteparti	a supporting party	G	4		
en finanslov	a national budget (Finance Act)	G	4		
et udspil	a proposal / initiative	G	4		
en lobbyist	a lobbyist	G	4		
et ministerium	a ministry	G	4		
en styrelse	an agency (government)	G	4		
en forvaltning	an administration	G	4		
en ombudsmand	an ombudsman	G	4		
en retsstat	a state governed by law	G	4		
pressefrihed	freedom of the press	G	3		en
menneskerettigheder	human rights	G	4		pl
en flygtningestrøm	a flow of refugees	G	4		
en asylansøger	an asylum seeker	G	4		
udlændingepolitik	immigration policy	G	3		en
klimapolitik	climate policy	G	3		en
en sanktion	a sanction	G	4		
en traktat	a treaty	G	4		
et topmøde	a summit	G	4		
NATO	NATO	G	4		
en udenrigsminister	a foreign minister	G	4		
en statsleder	a head of state	G	4		
et diktatur	a dictatorship	G	4		
en diktator	a dictator	G	4		
en invasion	an invasion	G	4		
en våbenhvile	a ceasefire	G	4		
en fredsaftale	a peace agreement	G	4		
nødhjælp	emergency aid	G	3		en
en bekendtgørelse	an announcement / regulation	G	4		
en beskyldning	an accusation	G	4		
en bestemmelse	a provision / rule	G	4		
lovgivning	legislation	G	3		en
en ophævelse	an abolition / cancellation	G	4		
en redegørelse	an account / report	G	4		
en regulering	a regulation / adjustment	G	4		
et tiltag	an initiative / measure	G	4		
et værn	a defense / protection	G	4		
en bombe	a bomb	G	2		
en stemmeseddel	a ballot	G	4		
en befrielse	a liberation	G	4		
en dollar	a dollar	Y	3		
en forretning	a business / shop	Y	2		
en klient	a client	Y	2		
et pund	a pound	Y	2		
et salg	a sale	Y	3		
en formue	a fortune	Y	3		
en andel	a share / portion	Y	3		
et lager	a warehouse / stock	Y	3		
en cent	a cent	Y	3		
en bestyrelse	a board (of directors)	Y	3		
en arv	an inheritance	Y	3		
en branche	an industry / line of business	Y	3		
en sektor	a sector	Y	3		
et beløb	an amount (of money)	Y	3		
økonomisk	economic / financial	Y	3		
en ledelse	a management / leadership	Y	3		
et produkt	a product	Y	3		
en mønt	a coin	Y	3		
en erstatning	a compensation / replacement	Y	3		
et regnskab	an accounts / accounting	Y	3		
kredit	credit	Y	2		en
et pengeskab	a safe	Y	3		
et forskud	an advance (payment)	Y	3		
konkurs	bankrupt / bankruptcy	Y	3		
en fortjeneste	a profit / merit	Y	3		
en auktion	an auction	Y	3		
en revisor	an accountant (auditor)	Y	4		
småpenge	small change	Y	4		pl
en sum	a sum	Y	4		
en bankkonto	a bank account	Y	4		
en hæveautomat	an ATM	Y	4		
et dankort	a Dankort (Danish debit card)	Y	4		
moms	VAT / sales tax	Y	3		en
en forsikring	an insurance	Y	3		
en butikskæde	a store chain	Y	4		
en konkurrent	a competitor	Y	4		
en omsætning	a turnover / revenue	Y	4		
inflation	inflation	Y	3		en
at spare op	to save up	Y	3	sparer op|sparede op|sparet op	
at skylde	to owe	Y	1	skylder|skyldte|skyldt	
at betale af	to pay off	Y	1	betaler af|betalte af|betalt af	
at hæve penge	to withdraw money	Y	3	hæver penge|hævede penge|hævet penge	
at overføre penge	to transfer money	Y	4	overfører penge|overførte penge|overført penge	
at bruge penge	to spend money	Y	1	bruger penge|brugte penge|brugt penge	
en årsopgørelse	an annual tax statement	Y	4		
en forskudsopgørelse	a preliminary income assessment	Y	4		
et skattekort	a tax card	Y	4		
et fradrag	a deduction	Y	4		
boligstøtte	housing benefit	Y	3		en
SU	Danish student grant	Y	2		en
dagpenge	unemployment benefits	Y	4		pl
kontanthjælp	social welfare benefit	Y	3		en
en a-kasse	an unemployment insurance fund	Y	4		
et gebyr	a fee	Y	4		
en stigning	a rise / increase	Y	4		
et fald	a fall / drop	Y	1		
en nedgang	a decline	Y	4		
en recession	a recession	Y	4		
boligmarkedet	the housing market	Y	4		
en huspris	a house price	Y	4		
en rentestigning	an interest rate rise	Y	4		
en nationalbank	a central bank	Y	4		
en aktiekurs	a share price	Y	4		
et aktieselskab	a public limited company	Y	4		
et anpartsselskab	a private limited company	Y	4		
en startup	a startup	Y	4		
en fusion	a merger	Y	4		
et opkøb	an acquisition / buyout	Y	4		
eksport	export	Y	3		en
import	import	Y	3		en
en forbruger	a consumer	Y	4		
forbrug	consumption	Y	3		et
efterspørgsel	demand	Y	3		en
et udbud	a supply / tender	Y	4		
en markedsandel	a market share	Y	4		
en målgruppe	a target group	Y	4		
kundeservice	customer service	Y	3		en
en klage	a complaint	Y	3		
en tilbagebetaling	a refund / repayment	Y	4		
en afgift	a tax / duty / fee	Y	4		
en bevilling	a grant	Y	4		
en bygherre	a developer (building)	Y	4		
en forhøjelse	an increase	Y	4		
en godtgørelse	a reimbursement	Y	4		
en nedskæring	a cutback	Y	4		
en omkostning	a cost	Y	4		
en omlægning	a restructuring	Y	4		
en opgørelse	a statement / count	Y	4		
en udbetaling	a payment / payout	Y	4		
et udbytte	a yield / benefit	Y	4		
en euro	a euro	Y	2		
en filial	a branch (office)	Y	4		
en bundlinje	a bottom line	Y	4		
en forhandler	a dealer / retailer	Y	3		
en gennemsnitsløn	an average salary	Y	4		
lommepenge	pocket money	Y	4		pl
et forsikringsselskab	an insurance company	Y	4		`;

// Built once at startup from WORD_DATA: the starter deck grouped by
// category (same shape the rest of the app has always used), plus a
// lookup from Danish text to its level / verb forms / hidden gender.
const STARTER_WORDS = {};
const WORD_META = {};
Object.values(WORD_CATEGORY_NAMES).forEach((name) => (STARTER_WORDS[name] = []));
WORD_DATA.split("\n").forEach((line) => {
  const [da, en, code, level, forms, gender] = line.split("\t");
  if (!da || !en) return;
  const catName = WORD_CATEGORY_NAMES[code] || "Common Nouns";
  STARTER_WORDS[catName].push([da, en]);
  WORD_META[da.trim().toLowerCase()] = { level: Number(level) || 0, forms: forms || "", gender: gender || "" };
});

// Looks up level / verb forms for any word card whose Danish text is in
// the built-in list — including a card the person added themselves that
// happens to match — so filters and the verb drill work for those too.
function wordMetaFor(front) {
  return WORD_META[(front || "").trim().toLowerCase()] || null;
}

const STARTER_GRAMMAR = [
  {
    name: "En/et gender",
    explanation:
      "Danish nouns are either 'common gender' (using en) or 'neuter' (using et) — there's no reliable rule for which is which, so each noun's gender has to be learned along with the word itself. It affects the indefinite article, the definite ending, and how adjectives agree with the noun.",
    examples: [
      ["en kop", "a cup"],
      ["et bord", "a table"],
      ["en stol", "a chair"],
    ],
  },
  {
    name: "Definite articles as a suffix",
    explanation:
      "Unlike English 'the', Danish usually shows definiteness by adding an ending onto the noun itself rather than using a separate word. En-words add -en, et-words add -et.",
    examples: [
      ["hunden", "the dog"],
      ["huset", "the house"],
      ["bilen", "the car"],
    ],
  },
  {
    name: "V2 word order (verb-second)",
    explanation:
      "In a Danish main clause, the finite (conjugated) verb has to be the second grammatical element, no matter what comes first. If something other than the subject starts the sentence — like a time expression — the subject and verb swap places compared to how English would order them.",
    examples: [
      ["Jeg går i skole i dag.", "I go to school today."],
      ["I dag går jeg i skole.", "Today I go to school."],
      ["I morgen skal vi rejse.", "Tomorrow we will travel."],
    ],
  },
  {
    name: "Negation with ikke",
    explanation:
      "In a main clause, 'ikke' (not) comes right after the finite verb. In a subordinate clause — one starting with a word like 'at', 'fordi', or 'hvis' — 'ikke' moves to before the finite verb instead.",
    examples: [
      ["Jeg forstår ikke.", "I don't understand."],
      ["Han sagde, at han ikke forstod.", "He said that he didn't understand."],
      ["Hvis du ikke kommer, ringer jeg.", "If you don't come, I'll call."],
    ],
  },
  {
    name: "Modal verbs + bare infinitive",
    explanation:
      "After a modal verb like kan, skal, vil, or må, the following verb is a plain infinitive with no 'at' (Danish's equivalent of 'to'). Most other verbs that take an infinitive DO require 'at' before it.",
    examples: [
      ["Jeg kan svømme.", "I can swim."],
      ["Jeg vil prøve at svømme.", "I want to try to swim."],
      ["Du skal huske det.", "You must remember it."],
    ],
  },
  {
    name: "Adjective agreement",
    explanation:
      "Danish adjectives change their ending depending on the noun they describe: no extra ending before a common-gender singular noun, -t before a neuter singular noun, and -e before any plural noun or in the definite form.",
    examples: [
      ["en stor hund", "a big dog"],
      ["et stort hus", "a big house"],
      ["store huse", "big houses"],
    ],
  },
  {
    name: "Plural noun patterns",
    explanation:
      "Most Danish nouns form their plural with -er or -e, and a smaller group don't change at all. Which pattern a given noun follows isn't fully predictable, so it's usually learned alongside the word itself.",
    examples: [
      ["en bil, biler", "a car, cars"],
      ["et æble, æbler", "an apple, apples"],
      ["et hus, huse", "a house, houses"],
    ],
  },
  {
    name: "Present tense has one form for every subject",
    explanation:
      "Danish verbs don't change based on who's doing the action — jeg, du, han, vi, I, and de all use the exact same verb form in the present tense. This is simpler than English, which changes for 'he/she/it'.",
    examples: [
      ["jeg går", "I go"],
      ["han går", "he goes"],
      ["de går", "they go"],
    ],
  },
  {
    name: "Personal pronouns: subject vs. object",
    explanation:
      "Like English 'I' vs 'me', most Danish personal pronouns have a different form depending on whether they're the subject or the object of a verb — including after a preposition. Den and det ('it') are the exception: they stay the same either way.",
    examples: [
      ["Jeg kan se dig.", "I can see you."],
      ["Hun elsker ham.", "She loves him."],
      ["Giv mig bogen.", "Give me the book."],
    ],
  },
  {
    name: "Simple past of regular verbs",
    explanation:
      "Most Danish verbs form the past tense by adding -ede or -te to the verb stem — which ending a given verb takes isn't fully predictable, so it's learned along with the verb. As in the present tense, there's no change based on who's doing the action.",
    examples: [
      ["jeg elskede", "I loved"],
      ["hun talte", "she talked"],
      ["de arbejdede", "they worked"],
    ],
  },
  {
    name: "Present perfect: har vs. er",
    explanation:
      "Danish forms the present perfect ('have done') with har plus the past participle, just like English 'have'. A smaller group of verbs — mostly ones about motion or a change of state, like rejse and blive — use er instead.",
    examples: [
      ["Jeg har spist.", "I have eaten."],
      ["Hun er rejst til Paris.", "She has traveled to Paris."],
      ["Vejret er blevet bedre.", "The weather has gotten better."],
    ],
  },
  {
    name: "Double definiteness with adjectives",
    explanation:
      "A definite noun normally just takes an -en/-et ending. But as soon as an adjective describes it, Danish also adds a separate word in front — den for common gender, det for neuter, de for plural — on top of the adjective's own -e ending and the noun's definite form.",
    examples: [
      ["den store hund", "the big dog"],
      ["det store hus", "the big house"],
      ["de store huse", "the big houses"],
    ],
  },
  {
    name: "Comparing adjectives: -ere and -est",
    explanation:
      "Most Danish adjectives form the comparative with -ere and the superlative with -est. A handful of common ones are irregular and change shape entirely, and longer adjectives use mere ('more') and mest ('most') in front instead of an ending.",
    examples: [
      ["sød, sødere, sødest", "sweet, sweeter, sweetest"],
      ["god, bedre, bedst", "good, better, best"],
      ["mere spændende", "more exciting"],
    ],
  },
  {
    name: "Word order after fordi, hvis, når, at",
    explanation:
      "In a subordinate clause — one introduced by a word like at, fordi, hvis, når, or da — the verb doesn't jump to second position the way it does in a main clause. Instead the subject comes right after the conjunction, and an adverb like ikke goes before the verb rather than after it.",
    examples: [
      ["..., fordi jeg ikke har tid.", "..., because I don't have time."],
      ["Jeg ringer, hvis du ikke kommer.", "I'll call if you don't come."],
      ["Han spurgte, hvornår vi rejser.", "He asked when we're traveling."],
    ],
  },
  {
    name: "Giving commands: the imperative",
    explanation:
      "To tell someone to do something, drop the final -e from the infinitive — that's the whole command form, with no separate ending for one person versus several. A few common short verbs, like være, drop even more than just the -e.",
    examples: [
      ["Luk døren!", "Close the door!"],
      ["Kom nu!", "Come on!"],
      ["Vær forsigtig.", "Be careful."],
    ],
  },
  {
    name: "Der er — 'there is/are'",
    explanation:
      "Danish uses der er for both English 'there is' and 'there are' — and unlike English, it never changes for number, so the same der er covers one thing or a hundred.",
    examples: [
      ["Der er en kat i haven.", "There's a cat in the garden."],
      ["Der er mange mennesker her.", "There are many people here."],
      ["Der er ikke mere mælk.", "There isn't any more milk."],
    ],
  },
  {
    name: "Lægge/ligge, sætte/sidde, stille/stå",
    explanation:
      "Danish keeps a strict split that English blurs: use the first verb in each pair when something is actively being put somewhere (it takes an object), and the second verb when something is simply already positioned there (no object) — the same distinction as English 'lay' vs 'lie', applied three times over.",
    examples: [
      ["Jeg lægger bogen på bordet.", "I put the book on the table."],
      ["Bogen ligger på bordet.", "The book is lying on the table."],
      ["Han sætter sig ned.", "He sits himself down."],
    ],
  },
  {
    name: "Possessive pronouns: min, mit, mine",
    explanation:
      "Like adjectives, several Danish possessive pronouns change form to match the noun they go with: one form for common-gender nouns, one for neuter, and one for anything plural. Min/din/sin follow this three-way pattern; vores, jeres, and deres don't change at all.",
    examples: [
      ["min bil", "my car"],
      ["mit hus", "my house"],
      ["mine bøger", "my books"],
    ],
  },
];

// Shared by the auto-seed on first launch and the manual "Add starter
// vocabulary" button in Library — builds only what's not already present.
// Deterministic across every device, forever, as long as the Danish text
// doesn't change — this is what makes "starred this starter word" mergeable
// between devices instead of colliding on random per-device IDs.
function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9æøå]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stableStarterId(front) {
  return "starter:" + slugify(front);
}

// One-time migration for existing users: re-points any card using one of
// the old, since-consolidated category names at the surviving category,
// then drops the now-empty old ones. Returns null if this user has none
// of the old categories (nothing to do), so the caller can skip writing.
function migrateConsolidatedCategories(cards, categories) {
  let changed = false;
  let newCategories = categories;
  let newCards = cards;

  Object.entries(CATEGORY_MERGE_MAP).forEach(([oldName, newName]) => {
    const oldCat = newCategories.find((c) => c.name === oldName);
    if (!oldCat) return; // this user never had that old category
    const survivor = newCategories.find((c) => c.name === newName);
    if (!survivor) {
      // Extremely unlikely (the anchor category should already exist for
      // anyone who has the absorbed one), but handle it defensively by
      // just renaming the old category in place instead of losing it.
      newCategories = newCategories.map((c) => (c.id === oldCat.id ? { ...c, name: newName } : c));
      changed = true;
      return;
    }
    if (newCards.some((c) => c.category === oldCat.id)) {
      newCards = newCards.map((c) => (c.category === oldCat.id ? { ...c, category: survivor.id } : c));
    }
    newCategories = newCategories.filter((c) => c.id !== oldCat.id);
    changed = true;
  });

  return changed ? { cards: newCards, categories: newCategories } : null;
}

// Fixes an already-seeded card in place when its Danish text or
// translation matches one of the corrections above, so a user who
// already has the old (incorrect) version gets it updated rather than
// ending up with both the old and the corrected word side by side.
function migrateVocabCorrections(cards) {
  let changed = false;
  let newCards = cards.map((card) => {
    if (card.type !== "word") return card;
    const frontFix = VOCAB_CORRECTIONS[card.front];
    const backFix = VOCAB_TRANSLATION_CORRECTIONS[card.front];
    if (frontFix === undefined && backFix === undefined) return card;
    changed = true;
    return { ...card, front: frontFix !== undefined ? frontFix : card.front, back: backFix !== undefined ? backFix : card.back };
  });

  // A correction can occasionally land on text that already matches a
  // different existing card (e.g. a corrected word turns out to already
  // exist elsewhere in the deck) — collapse any such duplicates into
  // one, merging known/starred status so neither side loses progress.
  if (changed) {
    const seen = new Map();
    const deduped = [];
    for (const card of newCards) {
      const key = card.type + ":" + card.front.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, deduped.length);
        deduped.push(card);
      } else {
        const idx = seen.get(key);
        const existing = deduped[idx];
        deduped[idx] = { ...existing, known: existing.known || card.known, starred: existing.starred || card.starred };
      }
    }
    newCards = deduped;
  }

  return changed ? newCards : null;
}

// Keeps every word card's level / verb forms in sync with the built-in
// list (so a later re-levelling reaches existing decks too). Only touches
// those three fields — known / starred / ignored progress is never
// changed. Returns null when nothing needed updating.
function applyWordMeta(cards) {
  let changed = false;
  const next = cards.map((card) => {
    if (card.type !== "word") return card;
    const meta = wordMetaFor(card.front);
    if (!meta) return card;
    if (card.level === meta.level && (card.forms || "") === meta.forms && (card.gender || "") === meta.gender) return card;
    changed = true;
    return { ...card, level: meta.level, forms: meta.forms, gender: meta.gender };
  });
  return changed ? next : null;
}

function buildStarterAdditions(existingCategories, existingFrontsSet) {
  const existingCatNames = new Set(existingCategories.map((c) => c.name.toLowerCase()));
  const newCategories = Object.keys(STARTER_WORDS)
    .filter((name) => !existingCatNames.has(name.toLowerCase()))
    .map((name) => ({ id: uid(), name, custom: false }));
  // "Grammar Lessons" should always exist too, even on the rare chance
  // it's somehow missing (categories were reset, imported without it, etc).
  if (!existingCatNames.has("grammar lessons") && !newCategories.some((c) => c.name.toLowerCase() === "grammar lessons")) {
    newCategories.push({ id: "grammar-lessons", name: "Grammar Lessons", custom: false });
  }
  const combinedCategories = [...existingCategories, ...newCategories];
  const nameToId = {};
  combinedCategories.forEach((c) => {
    nameToId[c.name.toLowerCase()] = c.id;
  });

  const seen = new Set(existingFrontsSet);
  const newCards = [];
  Object.entries(STARTER_WORDS).forEach(([catName, list]) => {
    list.forEach(([da, en]) => {
      const key = da.trim().toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const meta = wordMetaFor(da) || {};
      newCards.push({
        id: stableStarterId(da),
        type: "word",
        front: da,
        back: en,
        category: nameToId[catName.toLowerCase()],
        starter: true,
        level: meta.level || 0,
        forms: meta.forms || "",
        gender: meta.gender || "",
      });
    });
  });

  const grammarLessonsId = nameToId["grammar lessons"];
  STARTER_GRAMMAR.forEach((point) => {
    const key = point.name.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    newCards.push({
      id: stableStarterId(point.name),
      type: "grammar",
      front: point.name,
      back: point.explanation,
      category: grammarLessonsId,
      examples: point.examples.map(([da, en]) => ({ da, en })),
      starter: true,
    });
  });

  return { newCategories, newCards, combinedCategories };
}

// ---------- generic helpers ----------

// Shared between the Study and Library "explore related words" popups.
// A small, carefully-vetted set of common Danish irregular verbs and
// modals with their principal parts (infinitive, present, past, past
// participle). Deliberately conservative — only verbs whose forms I'm
// genuinely confident about, not an exhaustive list. When the word-
// insight feature is asked about one of these, these verified forms are
// handed to the AI as given facts to use rather than left for it to
// recall (and possibly get subtly wrong) on its own each time — the AI's
// job becomes explaining/using them naturally, not inventing them.
const IRREGULAR_VERBS = {
  være: { present: "er", past: "var", participle: "været" },
  have: { present: "har", past: "havde", participle: "haft" },
  gøre: { present: "gør", past: "gjorde", participle: "gjort" },
  gå: { present: "går", past: "gik", participle: "gået" },
  stå: { present: "står", past: "stod", participle: "stået" },
  få: { present: "får", past: "fik", participle: "fået" },
  give: { present: "giver", past: "gav", participle: "givet" },
  tage: { present: "tager", past: "tog", participle: "taget" },
  komme: { present: "kommer", past: "kom", participle: "kommet" },
  se: { present: "ser", past: "så", participle: "set" },
  vide: { present: "ved", past: "vidste", participle: "vidst" },
  sige: { present: "siger", past: "sagde", participle: "sagt" },
  ligge: { present: "ligger", past: "lå", participle: "ligget" },
  sidde: { present: "sidder", past: "sad", participle: "siddet" },
  drikke: { present: "drikker", past: "drak", participle: "drukket" },
  sove: { present: "sover", past: "sov", participle: "sovet" },
  finde: { present: "finder", past: "fandt", participle: "fundet" },
  skrive: { present: "skriver", past: "skrev", participle: "skrevet" },
  bede: { present: "beder", past: "bad", participle: "bedt" },
  blive: { present: "bliver", past: "blev", participle: "blevet" },
  falde: { present: "falder", past: "faldt", participle: "faldet" },
  holde: { present: "holder", past: "holdt", participle: "holdt" },
  løbe: { present: "løber", past: "løb", participle: "løbet" },
  synge: { present: "synger", past: "sang", participle: "sunget" },
  trække: { present: "trækker", past: "trak", participle: "trukket" },
  vinde: { present: "vinder", past: "vandt", participle: "vundet" },
  flyve: { present: "flyver", past: "fløj", participle: "fløjet" },
  slå: { present: "slår", past: "slog", participle: "slået" },
  lade: { present: "lader", past: "lod", participle: "ladet" },
  kunne: { present: "kan", past: "kunne", participle: "kunnet" },
  skulle: { present: "skal", past: "skulle", participle: "skullet" },
  ville: { present: "vil", past: "ville", participle: "villet" },
  måtte: { present: "må", past: "måtte", participle: "måttet" },
};

// A card's front might be a bare infinitive ("gå") or "at "-prefixed
// ("at forklare") depending on when it was added — normalize before
// looking up, and return a ready-to-use fact string for the AI prompt,
// or an empty string when the word isn't in the table.
function irregularVerbFactsHint(front) {
  if (!front) return "";
  const bare = front.trim().replace(/^at\s+/i, "").toLowerCase();
  const entry = IRREGULAR_VERBS[bare];
  if (!entry) return "";
  return (
    " Verified principal forms for this verb — state these exact forms, do not alter or re-derive them: infinitive \"" +
    bare +
    "\", present \"" +
    entry.present +
    "\", past \"" +
    entry.past +
    "\", past participle \"" +
    entry.participle +
    "\"."
  );
}

// A small, carefully-vetted set of common Danish nouns whose plural form
// doesn't follow the routine -er/-e pattern — deliberately conservative,
// covering only the irregular plurals I'm genuinely confident about,
// mostly family terms and a few common body-part/object nouns. As with
// the verb table above, these are handed to the AI as verified facts
// rather than left for it to derive on its own each time.
const IRREGULAR_PLURALS = {
  barn: { indefPlural: "børn", defPlural: "børnene" },
  mand: { indefPlural: "mænd", defPlural: "mændene" },
  fod: { indefPlural: "fødder", defPlural: "fødderne" },
  rod: { indefPlural: "rødder", defPlural: "rødderne" },
  far: { indefPlural: "fædre", defPlural: "fædrene" },
  mor: { indefPlural: "mødre", defPlural: "mødrene" },
  bror: { indefPlural: "brødre", defPlural: "brødrene" },
  datter: { indefPlural: "døtre", defPlural: "døtrene" },
  søster: { indefPlural: "søstre", defPlural: "søstrene" },
  øje: { indefPlural: "øjne", defPlural: "øjnene" },
  bog: { indefPlural: "bøger", defPlural: "bøgerne" },
  nat: { indefPlural: "nætter", defPlural: "nætterne" },
  hånd: { indefPlural: "hænder", defPlural: "hænderne" },
};

// A card's front might carry a gender article ("en bog") or be bare
// ("bog") depending on how it's stored — normalize before looking up.
function irregularPluralFactsHint(front) {
  if (!front) return "";
  const bare = front.trim().replace(/^(en|et)\s+/i, "").toLowerCase();
  const entry = IRREGULAR_PLURALS[bare];
  if (!entry) return "";
  return (
    " Verified plural forms for this noun — state these exact forms, do not alter or re-derive them: indefinite plural \"" +
    entry.indefPlural +
    "\", definite plural \"" +
    entry.defPlural +
    "\"."
  );
}

const WORD_INSIGHT_SYSTEM_PROMPT =
  "A Danish learner tapped a word or short phrase on their flashcard because they want to understand it more deeply. Respond with concrete example forms, never abstract grammatical labels on their own — show the word in use rather than naming the category it belongs to. " +
  "For a noun: give exactly these four forms in this order, each a short natural phrase with its English translation: indefinite singular, definite singular, indefinite plural, definite plural — e.g. \"en person\"/\"a person\", \"personen\"/\"the person\", \"personer\"/\"people\", \"personerne\"/\"the people\". If it has no natural plural, still give four forms where sensible, or fewer if a form genuinely doesn't exist — never invent one, and say so plainly in the explanation instead. " +
  "For a verb: give infinitive, present tense, past tense, and (when it reads naturally) present perfect, each as a short subject+verb example with its translation — e.g. \"at have\"/\"to have\", \"jeg har\"/\"I have\", \"jeg havde\"/\"I had\", \"jeg har haft\"/\"I have had\". " +
  "For an adjective: give its three agreement forms (common gender, neuter, plural/definite), each in a short phrase — e.g. \"en stor bil\"/\"a big car\", \"et stort hus\"/\"a big house\", \"store biler\"/\"big cars\". " +
  "For a preposition, adverb, or other word that doesn't inflect: instead give 2-3 short example phrases showing it in real use, each with its translation. " +
  "Then write a short explanation in plain English, 2-4 sentences, covering anything genuinely useful the forms alone don't already show — irregularities, usage notes, common mixups with a similar word. If the forms already say everything worth saying, keep the explanation to one brief sentence rather than padding it. Always finish the last sentence completely — never trail off. " +
  'Respond ONLY with JSON, no other text: {"forms": [{"da": "...", "en": "..."}], "explanation": "..."} — 3-4 entries in forms for nouns/verbs/adjectives, 2-3 for other word types.';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}


// AI responses sometimes use **bold**/*italic* markdown even when asked
// for plain text — rendered raw, that looks like broken output rather
// than a real answer. This renders just those two, nothing fancier.
function renderInlineMarkdown(text) {
  if (!text) return text;
  const parts = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[2] !== undefined) parts.push(<strong key={key++}>{match[2]}</strong>);
    else if (match[3] !== undefined) parts.push(<em key={key++}>{match[3]}</em>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

// Uses the browser's own built-in text-to-speech (Web Speech API) — no
// network call, no AI involved, works offline. A prior attempt at
// pronunciation generated audio via an AI call instead, which had
// reliability problems and was removed; this is a completely different,
// much simpler mechanism that's been a mature, well-supported browser
// feature (including in Safari) for years.
// The camera-capture button only makes sense where there's an actual
// camera to open — on desktop, the capture="environment" attribute is
// simply ignored and falls back to the same file picker as "choose a
// photo", making a separate button redundant and confusing there.
function isMobileDevice() {
  return typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
}

function speechSupported() {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}
function pickDanishVoice() {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("da")) || null;
}
function speakDanish(text) {
  if (!text || !speechSupported()) return false;
  window.speechSynthesis.cancel(); // stop anything already playing first
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "da-DK";
  const voice = pickDanishVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
  return true;
}

function parseJSONLoose(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const body = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(body);
}

// Defensive cleanup for translation results: even with explicit prompt
// instructions not to, models occasionally echo both languages (e.g.
// "en hest / a horse" when only "a horse" was asked for). If that exact
// pattern shows up, keep just the actual answer after the last slash.
function cleanTranslation(text) {
  if (!text) return text;
  const parts = text.split(/\s*\/\s*/);
  return parts.length > 1 ? parts[parts.length - 1].trim() : text.trim();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

// ============================================================
// AI backends
// Two interchangeable ways to run the AI features: a small model
// running entirely in your browser (WebGPU, no key, free, but
// noticeably weaker at Danish), or your own Anthropic API key
// (higher quality, small per-use cost). You choose in AI settings
// in the Chat tab. Photo import always needs the API key, since
// reading images needs a much bigger model than a "very small" one.
// ============================================================

const LOCAL_MODEL_OPTIONS = [
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 0.5B — recommended on phones (~500MB)" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B — better quality, needs more memory (~1GB)" },
];
const LOCAL_MODEL_ID = LOCAL_MODEL_OPTIONS[0].id;

let localEnginePromise = null;
let localEngineModelId = null;

async function getLocalEngine(onProgress, modelId) {
  const targetModel = modelId || LOCAL_MODEL_ID;
  // If a different model was previously loaded, a fresh engine is needed
  // rather than reusing the cached one for the wrong model.
  if (localEnginePromise && localEngineModelId !== targetModel) {
    localEnginePromise = null;
  }
  if (!localEnginePromise) {
    localEngineModelId = targetModel;
    localEnginePromise = (async () => {
      if (typeof navigator === "undefined" || !navigator.gpu) {
        throw new Error("WEBGPU_UNSUPPORTED");
      }
      let webllm;
      try {
        webllm = await import("https://esm.run/@mlc-ai/web-llm");
      } catch (e) {
        throw new Error("LOCAL_MODEL_LOAD_FAILED");
      }
      let engine;
      let lastError;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          engine = await webllm.CreateMLCEngine(targetModel, {
            initProgressCallback: (report) => {
              if (onProgress) onProgress(report);
            },
          });
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          if (attempt === 0) await new Promise((r) => setTimeout(r, 1500)); // brief pause before one retry
        }
      }
      if (lastError) {
        // Surface the real reason (usually a network/download failure
        // reaching Hugging Face) instead of a bare generic message.
        throw new Error("LOCAL_MODEL_LOAD_FAILED: " + (lastError && lastError.message ? lastError.message : lastError));
      }
      return engine;
    })().catch((e) => {
      localEnginePromise = null; // allow retrying later
      throw e;
    });
  }
  return localEnginePromise;
}

async function callLocalText(system, userText, opts) {
  const history = (opts && opts.history) || [];
  const onProgress = opts && opts.onProgress;
  const engine = await getLocalEngine(onProgress);
  // Small local models follow a normal conversational system prompt much
  // less reliably than Gemini/Claude — they'll sometimes just answer in
  // English instead of actually producing Danish. Spelling this out in
  // blunt, repeated, explicit terms measurably helps smaller models
  // comply, even though it reads as redundant for a stronger model.
  const reinforcedSystem =
    system +
    " IMPORTANT: When asked for Danish, you must write actual Danish words and sentences — never just repeat or rephrase the English. Double-check that any Danish text you produce is genuinely Danish before responding.";
  const messages = [{ role: "system", content: reinforcedSystem }, ...history, { role: "user", content: userText }];
  const reply = await engine.chat.completions.create({ messages });
  return reply.choices[0].message.content;
}

async function buildHeaders() {
  // anthropic-version is required by the API on every request, regardless
  // of how auth is handled — omitting it inside Claude (where auth is
  // otherwise automatic) was causing every call to fail.
  const headers = { "Content-Type": "application/json", "anthropic-version": "2023-06-01" };
  if (!inClaudeApp()) {
    const key = await storeGet("anthropicApiKey");
    if (!key) throw new Error("MISSING_API_KEY");
    headers["x-api-key"] = key;
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  return headers;
}

// Fetches and parses JSON, retrying once if the server answers 200 OK with
// a body that's empty or unparsable — a transient hiccup (from either
// Anthropic's or Google's side, or an intermediary) seen occasionally even
// on a successful-looking response. Reading as text first (rather than
// res.json() directly) also avoids an opaque Safari-specific crash when
// the body genuinely isn't JSON, so a real failure always comes with the
// actual response content instead of a dead end.
// Claude's own consumer usage limit (hit when running inside Claude via
// the person's session, not a separate API key) has its own response
// shape that doesn't match Anthropic API's normal {error:{message}}
// format — without this, it fell straight through to a raw, unreadable
// JSON dump in the UI. Detect it specifically and surface a real,
// timed message instead; anything else keeps the previous fallback.
function describeApiFailure(res, data) {
  if (data && data.type === "exceeded_limit" && data.resetsAt) {
    const resetStr = new Date(data.resetsAt * 1000).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
    return new Error("USAGE_LIMIT_REACHED: " + resetStr);
  }
  return new Error("Request failed (" + res.status + "): " + (data?.error?.message || JSON.stringify(data).slice(0, 180)));
}

async function fetchAndParse(url, options) {
  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts - 1;
    let res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      if (!isLastAttempt) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw new Error("NETWORK_ERROR: " + (e && e.message ? e.message : e));
    }
    let text;
    try {
      text = await res.text();
    } catch (e) {
      text = "";
    }
    if (res.ok && !text.trim() && !isLastAttempt) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      continue; // empty 200 body — usually transient, worth retrying
    }
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      if (!isLastAttempt) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue; // unparsable body — worth retrying
      }
      throw new Error("RESPONSE_NOT_JSON: " + (text ? text.slice(0, 180) : "(empty response)"));
    }
    if (res.ok && !text.trim()) {
      throw new Error("RESPONSE_NOT_JSON: (empty response)");
    }
    return { res, data };
  }
}

async function callClaudeText(system, userText, opts) {
  const maxTokens = (opts && opts.maxTokens) || 1500;
  const history = (opts && opts.history) || [];
  const headers = await buildHeaders();
  const { res, data } = await fetchAndParse("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system,
      messages: [...history, { role: "user", content: userText }],
    }),
  });
  if (!res.ok) throw describeApiFailure(res, data);
  const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!reply.trim()) throw new Error("RESPONSE_NOT_JSON: (empty response)");
  return reply;
}

async function callClaudeImage(system, userText, base64, mediaType, maxTokens) {
  const headers = await buildHeaders();
  const { res, data } = await fetchAndParse("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens || 1500,
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: userText },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw describeApiFailure(res, data);
  const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!reply.trim()) throw new Error("RESPONSE_NOT_JSON: (empty response)");
  return reply;
}

// Google Gemini's free tier — no credit card, callable directly from a
// browser. Meaningfully better than the local model, still a notch below
// Claude for nuanced grammar. Also handles Photo import for free, since
// Gemini Flash is multimodal (the local model isn't).
const GEMINI_MODEL_ID = "gemini-flash-latest";

async function geminiHeaders() {
  const key = await storeGet("geminiApiKey");
  if (!key) throw new Error("MISSING_GEMINI_KEY");
  return { "Content-Type": "application/json", "x-goog-api-key": key };
}

function toGeminiHistory(history) {
  return (history || []).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

async function geminiGenerate(headers, body) {
  let res, data;
  try {
    ({ res, data } = await fetchAndParse(
      "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL_ID + ":generateContent",
      { method: "POST", headers, body: JSON.stringify(body) }
    ));
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg.indexOf("NETWORK_ERROR") === 0) throw new Error("GEMINI_NETWORK_ERROR: " + msg.replace("NETWORK_ERROR: ", ""));
    throw e;
  }
  if (!res.ok) {
    if (res.status === 429) throw new Error("RATE_LIMITED");
    if (res.status === 401 || res.status === 403) throw new Error("GEMINI_AUTH_ERROR");
    throw describeApiFailure(res, data);
  }
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}

async function callGeminiText(system, userText, opts) {
  const maxTokens = (opts && opts.maxTokens) || 1500;
  const history = (opts && opts.history) || [];
  const headers = await geminiHeaders();
  return geminiGenerate(headers, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [...toGeminiHistory(history), { role: "user", parts: [{ text: userText }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  });
}

async function callGeminiImage(system, userText, base64, mediaType, maxTokens) {
  const headers = await geminiHeaders();
  return geminiGenerate(headers, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      { role: "user", parts: [{ inlineData: { mimeType: mediaType, data: base64 } }, { text: userText }] },
    ],
    generationConfig: { maxOutputTokens: maxTokens || 1500 },
  });
}

// Chrome's built-in on-device Translator API (Chrome 138+, desktop only —
// not available on mobile, and not on Safari/Firefox/Edge either, since
// it's tied to Chrome's own bundled on-device model, not a general web
// standard). An entirely optional, opt-in extra: when enabled and
// available, it powers just the Translate button, with zero network call
// and zero cost. Everything else in the app still uses whichever main AI
// engine is configured, since this API only translates — it can't do the
// freeform reasoning Sentence analysis, Extract text, Chat, or Photo need.
function chromeTranslatorSupported() {
  return typeof self !== "undefined" && "Translator" in self;
}

function chromeLanguageDetectorSupported() {
  return typeof self !== "undefined" && "LanguageDetector" in self;
}

async function chromeTranslatorAvailability(sourceLanguage, targetLanguage) {
  if (!chromeTranslatorSupported()) return "unavailable";
  try {
    return await Translator.availability({ sourceLanguage, targetLanguage });
  } catch (e) {
    return "unavailable";
  }
}

// Detects whether the input is Danish or English using Chrome's on-device
// Language Detector API (when available), then translates it with the
// on-device Translator API in the correct direction — both fully local.
async function translateWithChromeTranslator(text, onProgress) {
  if (!chromeTranslatorSupported()) throw new Error("CHROME_TRANSLATOR_UNSUPPORTED");
  let sourceLanguage = "da";
  if (chromeLanguageDetectorSupported()) {
    try {
      const detectorAvailability = await LanguageDetector.availability();
      if (detectorAvailability !== "unavailable") {
        const detector = await LanguageDetector.create();
        const results = await detector.detect(text);
        const top = results && results[0];
        if (top && String(top.detectedLanguage || "").toLowerCase().startsWith("en")) sourceLanguage = "en";
      }
    } catch (e) {
      // Detection failing just means we fall back to assuming Danish —
      // translation itself still proceeds normally.
    }
  }
  const targetLanguage = sourceLanguage === "da" ? "en" : "da";
  const translator = await Translator.create({
    sourceLanguage,
    targetLanguage,
    monitor(m) {
      if (onProgress) m.addEventListener("downloadprogress", (e) => onProgress(e.loaded));
    },
  });
  const translation = await translator.translate(text);
  return sourceLanguage === "da" ? { da: text, en: translation } : { da: translation, en: text };
}

async function callOllamaText(system, userText, opts) {
  const maxTokens = (opts && opts.maxTokens) || 1500;
  const history = (opts && opts.history) || [];
  let config;
  try {
    const raw = await storeGet("ollamaConfig");
    config = raw ? JSON.parse(raw) : null;
  } catch (e) {
    config = null;
  }
  if (!config || !config.url || !config.model) throw new Error("MISSING_OLLAMA_CONFIG");
  const messages = [{ role: "system", content: system }, ...history, { role: "user", content: userText }];
  let res;
  try {
    // Ollama's OpenAI-compatible endpoint — needs OLLAMA_ORIGINS set on
    // their end to accept a request from this page's origin at all.
    res = await fetch(config.url + "/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, messages, max_tokens: maxTokens }),
    });
  } catch (e) {
    throw new Error("OLLAMA_UNREACHABLE");
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error("OLLAMA_ERROR: " + res.status + (bodyText ? " " + bodyText.slice(0, 200) : ""));
  }
  const data = await res.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("OLLAMA_ERROR: empty response");
  return content;
}

async function getAIEngine() {
  // An explicit choice (e.g. switching to Gemini as a fallback) always
  // wins — Claude's own model is only the zero-setup default when nothing
  // has been chosen yet.
  const v = await storeGet("aiEngine");
  if (v === "local" || v === "api" || v === "gemini" || v === "ollama") return v;
  if (inClaudeApp()) return "api";
  return null;
}

async function callAI(system, userText, opts) {
  const engine = await getAIEngine();
  if (engine === "local") return callLocalText(system, userText, opts);
  if (engine === "gemini") return callGeminiText(system, userText, opts);
  if (engine === "api") return callClaudeText(system, userText, opts);
  if (engine === "ollama") return callOllamaText(system, userText, opts);
  throw new Error("NO_ENGINE_CHOSEN");
}

function apiErrorMessage(e) {
  const msg = e && e.message;
  if (msg === "MISSING_API_KEY") return "Add your Anthropic API key in AI settings to use this.";
  if (msg === "MISSING_GEMINI_KEY") return "Add your free Google Gemini API key in AI settings to use this.";
  if (msg === "RATE_LIMITED") return "Gemini's free tier limits how many requests per minute — wait a bit and try again.";
  if (msg === "GEMINI_AUTH_ERROR") return "Gemini rejected the API key — double-check it was copied correctly in AI settings (no extra spaces or missing characters).";
  if (msg && msg.indexOf("GEMINI_NETWORK_ERROR") === 0)
    return "Couldn't reach Google's servers (" + msg.replace("GEMINI_NETWORK_ERROR: ", "") + "). Check your connection and try again.";
  if (msg && msg.indexOf("NETWORK_ERROR") === 0)
    return "Couldn't reach the server (" + msg.replace("NETWORK_ERROR: ", "") + "). Check your connection and try again.";
  if (msg && msg.indexOf("RESPONSE_NOT_JSON") === 0)
    return "Got an unexpected response instead of an answer (" + msg.replace("RESPONSE_NOT_JSON: ", "") + "). Try again — if it keeps happening, this is worth reporting.";
  if (msg === "NO_ENGINE_CHOSEN") return "Choose an AI option in AI settings first.";
  if (msg === "MISSING_OLLAMA_CONFIG") return "Set up your Ollama address and model name in AI settings to use this.";
  if (msg === "TRANSLATION_DIDNT_HAPPEN") return "Didn't get an actual translation back — try again.";
  if (msg === "OLLAMA_UNREACHABLE")
    return "Couldn't reach Ollama — make sure it's running on this computer, and that you started it with OLLAMA_ORIGINS=* so this page is allowed to connect.";
  if (msg && msg.indexOf("OLLAMA_ERROR") === 0) return "Ollama returned an error (" + msg.replace("OLLAMA_ERROR: ", "") + "). Check the model name is exactly right and try again.";
  if (msg === "WEBGPU_UNSUPPORTED")
    return "Your browser doesn't support the local model (needs WebGPU — try a recent Chrome or Edge), or switch to API key mode in AI settings.";
  if (msg === "LOCAL_MODEL_LOAD_FAILED") return "Couldn't load the local model. Check your connection, or switch to API key mode in AI settings.";
  if (msg && msg.indexOf("LOCAL_MODEL_LOAD_FAILED") === 0)
    return "Couldn't load the local model (" + msg.replace("LOCAL_MODEL_LOAD_FAILED: ", "") + "). Check your connection, try a smaller model, or switch to API key mode in AI settings.";
  if (msg && msg.indexOf("USAGE_LIMIT_REACHED") === 0)
    return (
      "You've reached your usage limit for using Claude inside this app right now. It resets " +
      msg.replace("USAGE_LIMIT_REACHED: ", "") +
      " — try again after that, or add your own Anthropic API key in AI settings to keep going without waiting."
    );
  return "Something went wrong (" + (msg || "unknown error") + "). Try again.";
}

// A handful of error codes mean "this AI option isn't working right now" —
// for those specifically, offer a quick way to switch rather than just
// leaving the person stuck waiting. Matched against the already-formatted
// text so every call site can reuse this without threading raw error
// objects through extra state.
function isSwitchableAIError(message) {
  return !!message && /AI settings|free tier limits|rejected the API key|doesn't support the local model|Couldn't load the local model|reach Ollama/i.test(message);
}

function AIErrorNote({ message, onOpenSettings }) {
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

// ---------- shared UI bits ----------

const inputStyle = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  fontSize: 16,
  background: "#FFFFFF",
};
const iconBtn = { border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: 6, display: "flex" };

function smallBtn(bg) {
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

const rowCheck = { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, cursor: "pointer" };

// Every popup in the app (word-insight, ask-a-word, AI settings, backup)
// uses this: a simple centered overlay, sized to the viewport with its
// own internal scroll. Deliberately NOT anchored to wherever it was
// triggered from — anchored positioning kept getting cut off in some
// real environments (especially with the keyboard open, where the
// trigger's on-screen position keeps shifting under it) despite several
// attempts to compute it dynamically. A fixed, centered box can't be
// clipped by anything and doesn't need to track a moving target.
function CenteredOverlay({ onClose, children, maxWidth = 420 }) {
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

function Pill({ children, color, active, onClick }) {
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

function EmptyState({ icon: IconCmp, title, body }) {
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

function SectionTitle({ children }) {
  return <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 400, margin: 0 }}>{children}</h2>;
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function CategoryPicker({ categories, value, onChange, allowAll, allowNew, onAddCategory }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function confirmAdd() {
    if (!name.trim()) {
      setAdding(false);
      return;
    }
    const id = onAddCategory(name);
    onChange(id);
    setName("");
    setAdding(false);
  }

  if (adding) {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmAdd();
            if (e.key === "Escape") setAdding(false);
          }}
          placeholder="New category name"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={confirmAdd} style={smallBtn("var(--fjord)")}>
          Add
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setAdding(true);
          return;
        }
        onChange(e.target.value);
      }}
      style={{ ...inputStyle, appearance: "auto", color: "var(--ink)" }}
    >
      {allowAll && <option value="all">All categories</option>}
      {!allowAll && !value && <option value="" disabled>Choose a category</option>}
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      {allowNew && <option value="__new__">+ New category…</option>}
    </select>
  );
}

// Level dropdown shared by Study and Library. Cards the person added that
// aren't in the built-in list have no level, so they only show under
// "All levels".
function LevelPicker({ value, onChange }) {
  return (
    <select
      value={String(value)}
      onChange={(e) => onChange(e.target.value === "all" ? "all" : Number(e.target.value))}
      aria-label="Level"
      style={{ ...inputStyle, appearance: "auto", color: "var(--ink)", width: "auto", flexShrink: 0 }}
    >
      <option value="all">All levels</option>
      {LEVELS.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name} ({l.cefr})
        </option>
      ))}
    </select>
  );
}

// ============================================================
// Main app
// ============================================================

export default function DanishFlashcards() {
  const [loaded, setLoaded] = useState(false);
  const [cards, setCards] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [tab, setTab] = useState("study");
  const degradedWarned = useRef(false);
  const [toast, setToast] = useState(null);
  const [engine, setEngine] = useState(undefined);
  const [showSettings, setShowSettings] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [backupReminder, setBackupReminder] = useState(false);
  const [autoBackupDue, setAutoBackupDue] = useState(false);

  const refreshEngine = useCallback(() => {
    getAIEngine().then((e) => setEngine(e));
  }, []);

  useEffect(() => {
    (async () => {
      const e = await getAIEngine();
      // getAIEngine() already defaults to "api" inside Claude when nothing
      // has been explicitly chosen — an explicit choice (e.g. switching to
      // Gemini) still takes priority over that default.
      setEngine(e);
    })();
  }, []);

  // Best-effort request that the browser treat this site's storage as
  // "persistent" — i.e. not eligible for automatic clearing under
  // storage pressure or (on some browsers) prolonged inactivity. Silently
  // does nothing on browsers that don't support the API; genuinely helps
  // on the ones that do.
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }, []);

  // Two tiers of nudge: when automatic backups are on for this device, a
  // shorter interval and an auto-opening prompt that only needs one tap
  // to complete (real "automatic" here still needs a tap — navigator.share
  // requires a genuine user gesture and can't be triggered silently).
  // When off, the original gentle, dismissible, longer-interval banner.
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      const hasProgress = cards.some((c) => c.known || c.starred || !c.starter);
      if (!hasProgress) return;
      let firstUsedAt = await storeGet("firstUsedAt");
      if (!firstUsedAt) {
        firstUsedAt = Date.now().toString();
        storeSet("firstUsedAt", firstUsedAt).catch(() => {});
      }
      const lastBackupAt = await storeGet("lastBackupAt");
      const autoOn = (await storeGet("autoBackupEnabled")) === "true";
      const now = Date.now();
      const referencePoint = Number(lastBackupAt || firstUsedAt);

      // Nothing changed since the last backup → no reason to make another
      // copy (and another file to clean up).
      const lastFingerprint = await storeGet("lastBackupFingerprint");
      if (lastBackupAt && lastFingerprint && lastFingerprint === backupFingerprint(cards, categories)) return;

      if (autoOn) {
        const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
        if (now - referencePoint > ONE_WEEK) setAutoBackupDue(true);
        return;
      }

      const snoozedUntil = await storeGet("backupReminderSnoozedUntil");
      if (snoozedUntil && now < Number(snoozedUntil)) return;
      const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000;
      if (now - referencePoint > TWO_WEEKS) setBackupReminder(true);
    })();
  }, [loaded]);

  function dismissBackupReminder() {
    setBackupReminder(false);
    const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
    storeSet("backupReminderSnoozedUntil", (Date.now() + ONE_WEEK).toString()).catch(() => {});
  }

  async function runAutoBackup() {
    setAutoBackupDue(false);
    await performBackupExport(cards, categories, showToast);
  }

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    (async () => {
      let c = [];
      let cat = DEFAULT_CATEGORIES;
      try {
        const raw = await storeGet("cards");
        if (raw) c = unpackCards(JSON.parse(raw));
      } catch (e) {}
      try {
        const raw = await storeGet("categories");
        if (raw) cat = JSON.parse(raw);
      } catch (e) {}

      // One-time cleanup for anyone who already has the old confusing
      // empty default categories saved — safe to drop only if nothing
      // actually uses them, so real cards are never orphaned.
      if (cat.some((cg) => LEGACY_EMPTY_CATEGORY_IDS.includes(cg.id))) {
        const usedIds = new Set(c.map((card) => card.category));
        const cleaned = cat.filter((cg) => !LEGACY_EMPTY_CATEGORY_IDS.includes(cg.id) || usedIds.has(cg.id));
        if (cleaned.length !== cat.length) {
          cat = cleaned;
          await persistWithRetry("categories", JSON.stringify(cat));
        }
      }

      // One-time migration: starter cards seeded before stable IDs existed
      // have random per-device IDs — realign them to the deterministic
      // scheme so this device's data can eventually merge cleanly with
      // any other device's, instead of the same word colliding under two
      // different IDs forever.
      let idsMigrated = false;
      const claimedStableIds = new Set();
      c = c.map((card) => {
        if (card.starter) {
          const stableId = stableStarterId(card.front);
          // Guard against a rare pre-existing accidental duplicate (two
          // starter cards with the same front, from before duplicate
          // detection existed) — only the first claims the stable id,
          // so we never produce two cards sharing one id.
          if (!claimedStableIds.has(stableId)) {
            claimedStableIds.add(stableId);
            if (card.id !== stableId) {
              idsMigrated = true;
              return { ...card, id: stableId };
            }
          }
        }
        return card;
      });

      // One-time migration: re-point any card using one of the old,
      // since-consolidated category names (from before the vocabulary
      // buildout's many thin categories were merged down) at the
      // surviving category.
      let consolidationMigrated = false;
      const consolidationResult = migrateConsolidatedCategories(c, cat);
      if (consolidationResult) {
        c = consolidationResult.cards;
        cat = consolidationResult.categories;
        consolidationMigrated = true;
      }

      // One-time migration: fix any already-seeded card whose Danish text
      // or translation had a since-corrected accuracy issue.
      let vocabCorrected = false;
      const correctionResult = migrateVocabCorrections(c);
      if (correctionResult) {
        c = correctionResult;
        vocabCorrected = true;
      }

      // Attach level + verb forms to every word card that's in the list.
      let metaApplied = false;
      const metaResult = applyWordMeta(c);
      if (metaResult) {
        c = metaResult;
        metaApplied = true;
      }

      // Starter vocabulary should always just be complete — no manual
      // button, no visible prompt. This quietly tops up anything missing,
      // whether that's a first-ever launch with nothing yet, or an
      // existing deck from before a later vocabulary expansion.
      const existingFronts = new Set(c.map((card) => card.front.trim().toLowerCase()));
      const { newCards, combinedCategories } = buildStarterAdditions(cat, existingFronts);
      if (newCards.length > 0 || idsMigrated || consolidationMigrated || vocabCorrected || metaApplied) {
        cat = combinedCategories;
        c = [
          ...c,
          ...newCards.map((card) => ({
            id: uid(),
            createdAt: Date.now(),
            notes: "",
            examples: [],
            starred: false,
            known: false,
            ...card,
          })),
        ];
        await persistWithRetry("categories", JSON.stringify(cat));
        await persistWithRetry("cards", JSON.stringify(c));
      }

      setCards(c);
      setCategories(cat);
      setLoaded(true);
    })();
  }, []);

  const persistCards = useCallback(
    async (next) => {
      setCards(next);
      const result = await persistWithRetry("cards", JSON.stringify(next));
      if (!result.ok) showToast("Couldn't save (" + result.error + ")");
      return result;
    },
    [showToast]
  );

  const persistCategories = useCallback(
    async (next) => {
      setCategories(next);
      const result = await persistWithRetry("categories", JSON.stringify(next));
      if (!result.ok) showToast("Couldn't save categories (" + result.error + ")");
      return result;
    },
    [showToast]
  );

  const addCategory = useCallback(
    (name) => {
      const trimmed = (name || "").trim();
      if (!trimmed) return null;
      const existing = categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) return existing.id;
      const id = uid();
      persistCategories([...categories, { id, name: trimmed, custom: true }]);
      return id;
    },
    [categories, persistCategories]
  );

  // Wholesale replace, for restoring an exported backup — bypasses the
  // normal incremental add/duplicate-check path since a restore should
  // just put back exactly what was exported.
  const replaceAllData = useCallback(
    async (newCards, newCategories) => {
      const catResult = await persistCategories(newCategories);
      const cardResult = await persistCards(newCards);
      return catResult.ok && cardResult.ok;
    },
    [persistCategories, persistCards]
  );

  const addCards = useCallback(
    async (newCards) => {
      // Central choke point for every card-adding feature (manual, Chat,
      // Sentence, Translate, Photo) — guarding here means a malformed AI
      // response anywhere can never crash the app, just gets silently
      // skipped instead of producing a card with a missing word. Also
      // where duplicates get caught — matched on the Danish side, case-
      // and whitespace-insensitive, against both the existing deck and
      // other cards in this same batch.
      const existingFronts = new Map(cards.map((c) => [c.front.trim().toLowerCase(), c.id]));
      const seenInBatch = new Set();
      const duplicateFronts = [];
      const touchedExistingIds = new Set();
      const stamped = newCards
        .filter((c) => c && c.front != null && c.back != null && String(c.front).trim() && String(c.back).trim())
        .filter((c) => {
          const key = String(c.front).trim().toLowerCase();
          if (existingFronts.has(key) || seenInBatch.has(key)) {
            duplicateFronts.push(String(c.front).trim());
            // Trying to add a word that's already in the deck is a clear
            // signal the learner wants to prioritize it right now — treat
            // the existing card the same way a freshly-added one is
            // treated below, so it cycles in soon rather than being
            // silently dropped with no other effect.
            const existingId = existingFronts.get(key);
            if (existingId) touchedExistingIds.add(existingId);
            return false;
          }
          seenInBatch.add(key);
          return true;
        })
        .map((c) => ({
          id: uid(),
          createdAt: Date.now(),
          notes: "",
          examples: [],
          starred: false,
          known: false,
          recentTouch: Date.now(),
          ...c,
          front: String(c.front).trim(),
          back: String(c.back).trim(),
        }));
      if (stamped.length === 0 && touchedExistingIds.size === 0) {
        if (duplicateFronts.length > 0) {
          showToast(
            duplicateFronts.length === 1
              ? '"' + duplicateFronts[0] + '" is already in your deck — can\'t add'
              : duplicateFronts.length + " of these are already in your deck — can't add"
          );
        } else {
          showToast("Couldn't add — missing word or translation");
        }
        return;
      }
      const withTouches = touchedExistingIds.size > 0 ? cards.map((c) => (touchedExistingIds.has(c.id) ? { ...c, recentTouch: Date.now() } : c)) : cards;
      if (stamped.length === 0) {
        // Nothing new to add, but existing cards were touched — persist
        // that and let the learner know their existing card was
        // prioritized instead, rather than staying silent about it.
        const result = await persistCards(withTouches);
        if (result.ok) {
          showToast(
            duplicateFronts.length === 1
              ? '"' + duplicateFronts[0] + '" is already in your deck — moved it up for review'
              : duplicateFronts.length + " already in your deck — moved them up for review"
          );
        }
        return;
      }
      // Wait for the save to actually succeed before claiming it did —
      // showing "Card added" regardless of whether it persisted was
      // actively misleading. persistCards shows its own failure toast,
      // so on failure we simply don't also claim success.
      const result = await persistCards([...stamped, ...withTouches]);
      if (result.ok) {
        let msg = stamped.length === 1 ? "Card added" : stamped.length + " cards added";
        if (duplicateFronts.length > 0) {
          msg += " (" + duplicateFronts.length + (duplicateFronts.length === 1 ? " already in deck, moved up for review" : " already in deck, moved up for review") + ")";
        }
        if (result.degraded && !degradedWarned.current) {
          degradedWarned.current = true;
          msg += result.memoryOnly
            ? " — but only for this session, this artifact's storage isn't available"
            : " — to this browser only, this artifact's storage isn't available";
        }
        showToast(msg);
      }
    },
    [cards, persistCards, showToast]
  );

  const updateCard = useCallback(
    (id, patch) => {
      persistCards(cards.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    [cards, persistCards]
  );

  const deleteCard = useCallback(
    async (id) => {
      const result = await persistCards(cards.filter((c) => c.id !== id));
      if (result.ok) {
        let msg = "Card deleted";
        if (result.degraded && !degradedWarned.current) {
          degradedWarned.current = true;
          msg += result.memoryOnly
            ? " — but only for this session, this artifact's storage isn't available"
            : " — to this browser only, this artifact's storage isn't available";
        }
        showToast(msg);
      }
    },
    [cards, persistCards, showToast]
  );

  if (!loaded) {
    return (
      <Shell>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "#8A8577" }}>
          <Icon.Loader2 className="spin" size={20} style={{ marginRight: 8 }} />
          <span style={{ fontFamily: "var(--sans)", fontSize: 14 }}>Loading your deck…</span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div>
        <Header
          onOpenSettings={() => setShowSettings((s) => !s)}
          onOpenBackup={() => setShowBackup((s) => !s)}
          settingsOpen={showSettings}
          backupOpen={showBackup}
        />
        {autoBackupDue && (
          <CenteredOverlay onClose={() => setAutoBackupDue(false)} maxWidth={340}>
            <div style={{ textAlign: "center" }}>
              <Icon.Download size={22} color="var(--fjord)" style={{ marginBottom: 8 }} />
              <div style={{ fontFamily: "var(--serif)", fontSize: 17, marginBottom: 6 }}>Time for your backup</div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>
                Automatic backups are on for this device. One tap saves your current progress.
              </div>
              <button onClick={runAutoBackup} style={{ ...smallBtn("var(--fjord)"), width: "100%", padding: "10px", fontSize: 14 }}>
                Back up now
              </button>
            </div>
          </CenteredOverlay>
        )}
        {backupReminder && (
          <div
            style={{
              margin: "0 18px 14px",
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--card)",
              border: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Icon.Download size={15} color="var(--fjord)" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>
              Haven't backed up in a while — your progress only lives on this device until you do.
            </span>
            <button
              onClick={() => {
                setShowBackup(true);
                setBackupReminder(false);
              }}
              style={{ ...smallBtn("var(--fjord)"), padding: "6px 12px", fontSize: 12, flexShrink: 0 }}
            >
              Back up
            </button>
            <button
              onClick={dismissBackupReminder}
              aria-label="Dismiss"
              style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: 4, flexShrink: 0, display: "flex" }}
            >
              <Icon.X size={14} />
            </button>
          </div>
        )}
        {showSettings && (
          <CenteredOverlay onClose={() => setShowSettings(false)}>
            <AISettingsPanel
              onClose={(chosenEngine) => {
                setShowSettings(false);
                if (chosenEngine) {
                  // Trust what was just chosen in this session rather than
                  // re-reading storage, which can be unreliable in restricted
                  // preview contexts (e.g. iOS Quick Look) even right after a
                  // successful write.
                  setEngine(chosenEngine);
                } else {
                  refreshEngine();
                }
              }}
            />
          </CenteredOverlay>
        )}
        {showBackup && (
          <CenteredOverlay onClose={() => setShowBackup(false)}>
            <BackupPanel cards={cards} categories={categories} replaceAllData={replaceAllData} showToast={showToast} onClose={() => setShowBackup(false)} />
          </CenteredOverlay>
        )}
      </div>
      <div style={{ padding: "0 16px calc(96px + env(safe-area-inset-bottom, 0px))" }}>
        {tab === "study" && <StudyView cards={cards} categories={categories} updateCard={updateCard} onOpenSettings={() => setShowSettings(true)} showToast={showToast} engine={engine} />}
        {tab === "library" && (
          <LibraryView
            cards={cards}
            categories={categories}
            updateCard={updateCard}
            deleteCard={deleteCard}
            persistCategories={persistCategories}
            addCards={addCards}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
        {tab === "add" && <AddCardView categories={categories} addCategory={addCategory} addCards={addCards} onOpenSettings={() => setShowSettings(true)} />}
        {tab === "chat" && (
          <ChatView
            categories={categories}
            addCategory={addCategory}
            addCards={addCards}
            showToast={showToast}
            engine={engine}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
      </div>
      <TabBar tab={tab} setTab={setTab} />
      {toast && <Toast msg={toast} />}
    </Shell>
  );
}

// ---------- shell / chrome ----------

function Shell({ children }) {
  return (
    <div
      className="app-shell"
      style={{
        "--ink": "#23272A",
        "--paper": "#EFEEE8",
        "--card": "#FBFAF7",
        "--line": "#DCD8CD",
        "--rust": "#A1432E",
        "--fjord": "#4C6B65",
        "--sage": "#7C9473",
        "--terracotta": "#C1653F",
        "--muted": "#8A8577",
        "--serif": "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
        "--sans": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: "var(--paper)",
        color: "var(--ink)",
        maxWidth: 480,
        margin: "0 auto",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        .app-shell {
          /* 100vh is unreliable on mobile Safari, which doesn't account
             for its own dynamic address bar; 100dvh does. Listed both —
             browsers that don't understand dvh simply ignore that line
             and keep the vh fallback above it. */
          min-height: 100vh;
          min-height: 100dvh;
          /* Keeps content clear of the notch/status bar and home
             indicator on devices with safe-area insets (this is what
             viewport-fit=cover needs to be paired with to avoid content
             sitting under the notch instead of around it). */
          padding-top: env(safe-area-inset-top, 0px);
          padding-bottom: env(safe-area-inset-bottom, 0px);
          padding-left: env(safe-area-inset-left, 0px);
          padding-right: env(safe-area-inset-right, 0px);
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes cardEnterNext { from { opacity: 0.25; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes cardEnterBack { from { opacity: 0.25; transform: translateX(-14px); } to { opacity: 1; transform: translateX(0); } }
        .card-enter-next { animation: cardEnterNext 0.4s ease-out; }
        .card-enter-back { animation: cardEnterBack 0.4s ease-out; }
        @keyframes popoverIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .popover { animation: popoverIn 0.16s ease-out; box-shadow: 0 10px 28px rgba(35,39,42,0.16); }
        @keyframes backdropFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .popover-backdrop { animation: backdropFadeIn 0.16s ease-out; }
        * { box-sizing: border-box; }
        html, body { overscroll-behavior-x: none; }
        input, textarea, select { font-family: var(--sans); }
        input:focus, textarea:focus, select:focus { outline: 2px solid var(--fjord); outline-offset: 1px; }
        button:focus-visible { outline: 2px solid var(--fjord); outline-offset: 2px; }
        ::placeholder { color: #ADA898; }
      `}</style>
      {children}
    </div>
  );
}

function Header({ onOpenSettings, onOpenBackup, settingsOpen, backupOpen }) {
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
        </div>
      </div>
    </div>
  );
}

function TabBar({ tab, setTab }) {
  const items = [
    { id: "study", label: "Study", icon: Icon.GraduationCap },
    { id: "library", label: "Library", icon: Icon.Layers },
    { id: "add", label: "Add", icon: Icon.Plus },
    { id: "chat", label: "Assistant", icon: Icon.MessageCircle },
  ];
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 480,
        background: "var(--card)",
        borderTop: "1px solid var(--line)",
        display: "flex",
        padding: "7px 4px calc(9px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {items.map(({ id, label, icon: IconCmp }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "6px 2px",
              cursor: "pointer",
              color: active ? "var(--rust)" : "#A8A395",
            }}
          >
            <IconCmp size={20} strokeWidth={active ? 2.1 : 1.7} />
            <span style={{ fontFamily: "var(--sans)", fontSize: 11 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Toast({ msg }) {
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

// ---------- Study ----------

function StudyView({ cards, categories, updateCard, onOpenSettings, showToast, engine }) {
  const [catFilter, setCatFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all"); // "all" | 1 | 2 | 3 | 4
  // Verb drill: when on, verb cards sometimes ask for a tense instead of
  // the translation. Remembered on this device.
  const [verbDrill, setVerbDrill] = useState(false);
  const [poolModes, setPoolModes] = useState([]);
  useEffect(() => {
    storeGet("verbDrill").then((v) => setVerbDrill(v === "true")).catch(() => {});
  }, []);
  function toggleVerbDrill() {
    const next = !verbDrill;
    setVerbDrill(next);
    storeSet("verbDrill", next ? "true" : "false").catch(() => {});
  }
  const [starredOnly, setStarredOnly] = useState(false);
  const [unknownOnly, setUnknownOnly] = useState(true);
  const [langDir, setLangDir] = useState("da-first"); // da-first | en-first
  const [flipped, setFlipped] = useState(false);
  const [idx, setIdx] = useState(0);
  const [sessionKey, setSessionKey] = useState(0);
  const [poolIds, setPoolIds] = useState([]);
  const [slideDir, setSlideDir] = useState("next");
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(null); // null | "left" | "right"
  const gesture = useRef({ startX: 0, startY: 0, active: false });

  // The card's two faces are absolutely positioned (required for the 3D
  // flip), which means the container never naturally grows to fit taller
  // content on its own. So instead: measure the CONTENT itself (an inner,
  // normally-flowing wrapper — never absolutely positioned, so its own
  // size is always driven by its own content, not by whatever height the
  // card currently happens to be) and size the card from that measurement
  // plus a fixed clearance. Measuring the outer face box directly doesn't
  // work: scrollHeight on an already-sized box can detect when content
  // needs MORE room (overflow) but can't detect when it needs LESS —
  // if a short card follows a tall one, scrollHeight just reports the
  // leftover box height, not the smaller size the new content actually
  // needs, and the card never shrinks back down.
  //
  // V_CLEARANCE/H_CLEARANCE are each applied identically on both sides
  // (top=bottom, left=right) and the icons sit at the same offset in all
  // four corners — so the content block's center is always exactly the
  // card's center, which by simple rectangle geometry is equidistant
  // from all four corners by construction, not by tuning pixel values.
  const V_CLEARANCE = 56;
  const H_CLEARANCE = 50;
  const frontContentRef = useRef(null);
  const backContentRef = useRef(null);
  const [cardHeight, setCardHeight] = useState(220);
  useLayoutEffect(() => {
    const visible = flipped ? backContentRef.current : frontContentRef.current;
    if (visible) setCardHeight(Math.max(220, visible.scrollHeight + V_CLEARANCE * 2));
  });

  // Word-insight popup — cached per card so revisiting one in the same
  // session doesn't re-spend a request.
  const [insightFor, setInsightFor] = useState(null);
  const [insightCache, setInsightCache] = useState({});
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

  // Ask-about-this-word popup — a free-form follow-up question about
  // whichever card is currently showing.
  const [askFor, setAskFor] = useState(null);
  const [askQuestion, setAskQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState("");
  const [askModification, setAskModification] = useState(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState("");

  // The session's card order is frozen when it starts (or when a filter
  // changes) so marking a card known mid-session doesn't yank it out from
  // under you — it just turns the badge green. Future sessions won't
  // include it.
  useEffect(() => {
    const filtered = cards.filter((c) => {
      if (c.ignored) return false;
      // Grammar cards only ever live in the Grammar Lessons category, so
      // picking that category from the dropdown is itself the "opt in"
      // — no separate toggle needed. Any other category selection (or
      // "all") keeps them out by default.
      if (c.type === "grammar" && catFilter !== "grammar-lessons") return false;
      if (unknownOnly && c.known) return false;
      if (catFilter !== "all" && c.category !== catFilter) return false;
      if (levelFilter !== "all" && c.level !== levelFilter) return false;
      if (starredOnly && !c.starred) return false;
      return true;
    });
    // Starred cards, and cards touched recently (just added, or an
    // attempted duplicate-add signaling "I want to prioritize this"),
    // get extra copies in the pool so they naturally come up more often
    // within a session, rather than at the same rate as everything else.
    // Recency fades after a few days rather than staying elevated forever
    // — it's a temporary nudge, not a permanent priority the way starred
    // is. Take the higher of the two rather than stacking them, so a
    // card that's both doesn't balloon to an extreme repeat count.
    const RECENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const ids = [];
    filtered.forEach((c) => {
      const isRecent = c.recentTouch && now - c.recentTouch < RECENT_WINDOW_MS;
      const copies = Math.max(c.starred ? 3 : 1, isRecent ? 3 : 1);
      for (let i = 0; i < copies; i++) ids.push(c.id);
    });
    // Shuffle so each session (and each "Restart session") is a fresh
    // order, rather than always working through the deck in the same
    // sequence it happens to be stored in.
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setPoolIds(ids);
    setPoolModes(ids.map((id) => pickDrillMode(cards.find((c) => c.id === id))));
    setIdx(0);
    setFlipped(false);
    setDragX(0);
    setExiting(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catFilter, levelFilter, starredOnly, unknownOnly, verbDrill, sessionKey]);

  // With the verb drill on, roughly half of verb cards ask for one tense
  // (picked at random) instead of the translation, so the tenses come up
  // mixed in with everything else rather than as a separate exercise.
  function pickDrillMode(card) {
    if (!verbDrill || !card || !card.forms) return null;
    if (Math.random() < 0.5) return null;
    return ["present", "past", "participle"][Math.floor(Math.random() * 3)];
  }

  const current = cards.find((c) => c.id === poolIds[idx]);
  const drillMode = current && current.forms ? poolModes[idx] || null : null;
  const drillParts = current && current.forms ? current.forms.split("|") : [];
  const DRILL_LABEL = { present: "Present tense", past: "Past tense", participle: "Past participle (har / er …)" };
  const drillAnswer = drillMode ? drillParts[{ present: 0, past: 1, participle: 2 }[drillMode]] || "" : "";
  // Scoped to the current filter selection (category, starred, and the
  // same grammar-inclusion rule the pool itself uses) so switching to
  // Grammar Lessons shows progress within that category, not a leftover
  // number from the whole deck. Deliberately NOT scoped to unknownOnly —
  // that filter controls session contents, but progress should still be
  // visible even while looking at the unknown-only view. Computed fresh
  // from live cards every render, so it auto-updates immediately.
  const inProgressScope = (c) => {
    if (c.ignored) return false;
    if (c.type === "grammar" && catFilter !== "grammar-lessons") return false;
    if (catFilter !== "all" && c.category !== catFilter) return false;
    if (levelFilter !== "all" && c.level !== levelFilter) return false;
    if (starredOnly && !c.starred) return false;
    return true;
  };
  const knownWordCount = cards.filter((c) => inProgressScope(c) && c.known).length;
  const scopeTotal = cards.filter(inProgressScope).length;
  // Rough level estimate from how many built-in words are marked known —
  // a friendly guide, not a test score.
  const knownListWords = cards.filter((c) => c.type === "word" && c.known && c.level).length;
  const estimatedLevel =
    knownListWords >= 5000 ? "Fluent (C1–C2)" : knownListWords >= 3000 ? "Advanced (B2–C1)" : knownListWords >= 1500 ? "Intermediate (B1)" : "Basic (A1–A2)";
  // Grammar cards store an English name in front, not Danish — speaking
  // that mangles English phonetically instead of pronouncing anything
  // real. Use the first example's genuine Danish sentence instead.
  // Grammar cards are lesson names/explanations, not something meant to
  // be pronounced — no speaker icon for those at all, unlike word/sentence
  // cards where the Danish text is exactly what a speaker button is for.
  const currentSpeakableText = current && current.type !== "grammar" ? current.front : null;

  // Once a swipe (or a Back/Next tap) commits to leaving, the card
  // animates fully off-screen first, and only once that's visibly
  // finished do we actually advance to the next card underneath.
  useEffect(() => {
    if (!exiting) return;
    const t = setTimeout(() => {
      setSlideDir(exiting === "left" ? "next" : "back");
      setFlipped(false);
      setIdx((i) => {
        if (exiting === "left") return i + 1 < poolIds.length ? i + 1 : poolIds.length;
        return i > 0 ? i - 1 : 0;
      });
      setDragX(0);
      setExiting(null);
    }, 280);
    return () => clearTimeout(t);
  }, [exiting, poolIds.length]);

  function requestNext() {
    if (exiting) return;
    setExiting("left");
  }

  function requestBack() {
    if (exiting) return;
    setExiting("right");
  }

  // Left/right arrow keys navigate cards on desktop, matching the Back/Next
  // buttons. Skipped while typing in a text field (e.g. the "ask about
  // this word" box) so arrow keys there move the cursor as expected.
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") requestNext();
      else if (e.key === "ArrowLeft") requestBack();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function onGestureStart(clientX, clientY) {
    if (exiting) return;
    gesture.current = { startX: clientX, startY: clientY, active: true };
    setDragging(true);
  }

  function onGestureMove(clientX, clientY) {
    if (!gesture.current.active) return;
    const dx = clientX - gesture.current.startX;
    const dy = clientY - gesture.current.startY;
    if (Math.abs(dx) > Math.abs(dy)) setDragX(dx);
  }

  function onGestureEnd() {
    if (!gesture.current.active) return;
    gesture.current.active = false;
    setDragging(false);
    const dx = dragX;
    const threshold = 70;
    if (Math.abs(dx) < 6) {
      // Barely moved — a tap, not a swipe. Flip the card.
      setDragX(0);
      setFlipped((f) => !f);
      return;
    }
    if (dx <= -threshold) setExiting("left");
    else if (dx >= threshold) setExiting("right");
    else setDragX(0); // didn't clear the threshold — snap back
  }

  async function openInsight(card) {
    setInsightFor(card.id);
    setInsightError("");
    if (insightCache[card.id]) return; // already fetched this session
    setInsightLoading(true);
    try {
      const reply = await callAI(
        WORD_INSIGHT_SYSTEM_PROMPT,
        'Danish word or phrase: "' + card.front + '"' + (card.back ? " (means: " + card.back + ")" : "") + irregularVerbFactsHint(card.front) + irregularPluralFactsHint(card.front),
        { maxTokens: 700 }
      );
      const parsed = parseJSONLoose(reply);
      setInsightCache((prev) => ({ ...prev, [card.id]: { forms: parsed.forms || [], explanation: (parsed.explanation || "").trim() } }));
    } catch (e) {
      setInsightError(apiErrorMessage(e));
    } finally {
      setInsightLoading(false);
    }
  }

  function openAsk(card) {
    setAskFor(card.id);
    setAskQuestion("");
    setAskAnswer("");
    setAskModification(null);
    setAskError("");
  }

  async function submitAsk() {
    if (!askQuestion.trim()) return;
    const card = cards.find((c) => c.id === askFor);
    if (!card) return;
    setAskLoading(true);
    setAskError("");
    setAskModification(null);
    try {
      const reply = await callAI(
        "You're a Danish tutor helping with a single flashcard a learner is studying. They'll either ask a genuine question about it, or ask you to modify the card itself — e.g. \"give me the present tense\", \"make this plural\", \"change to past tense\", \"fix the translation\" — work out which from their wording. " +
          "For a genuine question: answer directly in the reply field, 1-3 short sentences — never more than that, and never pad the answer with extra context they didn't ask for. Write in plain flowing prose only: no headers, no bullet points, no numbered lists, no markdown formatting. Leave newFront and newBack as empty strings. " +
          "For a modification request: work out the new Danish text and its natural English translation, and put them in newFront and newBack — keep the same conventions the original card used (e.g. keep a noun's en/et article if the original had one, omit it if the original didn't). Leave reply as an empty string, or at most a short one-line confirmation.",
        'The flashcard is: "' +
          card.front +
          '" (means: ' +
          card.back +
          '), type: ' +
          card.type +
          '. Their message: "' +
          askQuestion.trim() +
          '"\n\nRespond ONLY with JSON, no other text: {"reply": "...", "newFront": "...", "newBack": "..."} — use empty strings for whichever don\'t apply.',
        { maxTokens: 300 }
      );
      const parsed = parseJSONLoose(reply);
      setAskAnswer((parsed.reply || "").trim());
      if (parsed.newFront && parsed.newFront.trim()) {
        setAskModification({ front: parsed.newFront.trim(), back: (parsed.newBack || "").trim() });
      }
    } catch (e) {
      setAskError(apiErrorMessage(e));
    } finally {
      setAskLoading(false);
    }
  }

  function applyAskModification() {
    if (!askModification || !askFor) return;
    updateCard(askFor, { front: askModification.front, back: askModification.back });
    setAskModification(null);
    setAskAnswer("");
    setAskFor(null);
    showToast("Card updated");
  }

  function restartWith(mode) {
    const sessionCards = poolIds.map((id) => cards.find((c) => c.id === id)).filter(Boolean);
    let ids;
    if (mode === "unknown") ids = sessionCards.filter((c) => !c.known).map((c) => c.id);
    else if (mode === "starred") ids = sessionCards.filter((c) => c.starred).map((c) => c.id);
    else ids = sessionCards.map((c) => c.id); // "all"
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setPoolIds(ids);
    setIdx(0);
    setFlipped(false);
    setDragX(0);
    setExiting(null);
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={Icon.GraduationCap}
        title="No cards yet"
        body="Load the starter vocabulary from Library, or add your own from the Add tab or Chat, then come back here to study."
      />
    );
  }

  const sessionCards = poolIds.map((id) => cards.find((c) => c.id === id)).filter(Boolean);
  // Starred cards can appear multiple times in the pool (by design, so
  // they cycle in more often) — de-duplicate before counting so the
  // session-end summary reflects distinct cards, not raw pool entries.
  const uniqueSessionCards = [...new Map(sessionCards.map((c) => [c.id, c])).values()];
  const knownNowCount = uniqueSessionCards.filter((c) => c.known).length;
  const stillUnknownCount = uniqueSessionCards.length - knownNowCount;
  const starredInSessionCount = uniqueSessionCards.filter((c) => c.starred).length;

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <CategoryPicker categories={categories} value={catFilter} onChange={setCatFilter} allowAll />
          </div>
          <LevelPicker value={levelFilter} onChange={setLevelFilter} />
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => setUnknownOnly(!unknownOnly)}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: "1.6px solid " + (unknownOnly ? "#9B87A8" : "#C9C4B6"),
                background: unknownOnly ? "#9B87A8" : "transparent",
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)" }}>Unknown</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => setStarredOnly(!starredOnly)}>
            <StarIcon size={13} filled={starredOnly} color={starredOnly ? "#C9A66B" : "#C9C4B6"} />
            <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)" }}>Starred</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={toggleVerbDrill} title="Verb cards sometimes ask for a tense instead of the translation">
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 3,
                border: "1.6px solid " + (verbDrill ? "var(--fjord)" : "#C9C4B6"),
                background: verbDrill ? "var(--fjord)" : "transparent",
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)" }}>Verb tenses</span>
          </div>
          <button
            onClick={() => setLangDir(langDir === "da-first" ? "en-first" : "da-first")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              border: "1px solid var(--line)",
              background: "var(--card)",
              borderRadius: 999,
              padding: "6px 13px",
              fontFamily: "var(--sans)",
              fontSize: 13,
              whiteSpace: "nowrap",
              color: "var(--muted)",
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            {langDir === "da-first" ? (
              <>
                <span style={{ color: "var(--terracotta)" }}>Dansk</span> → <span style={{ fontStyle: "italic" }}>English</span>
              </>
            ) : (
              <>
                <span style={{ fontStyle: "italic" }}>English</span> → <span style={{ color: "var(--terracotta)" }}>Dansk</span>
              </>
            )}
            <Icon.RotateCcw size={11} />
          </button>
        </div>
      </div>

      {!current ? (
        <div style={{ textAlign: "center", padding: "40px 10px" }}>
          <Icon.Check size={26} color="var(--fjord)" style={{ marginBottom: 8 }} />
          <div style={{ fontFamily: "var(--sans)", fontSize: 15, fontWeight: 600 }}>
            {poolIds.length === 0 ? "Nothing left to study here" : "Session complete"}
          </div>
          <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            {poolIds.length === 0
              ? "Everything in this view is marked known, or try a different filter."
              : knownNowCount + " known · " + stillUnknownCount + " still to review"}
          </div>
          {poolIds.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 16 }}>
              {stillUnknownCount > 0 && (
                <button onClick={() => restartWith("unknown")} style={smallBtn("var(--rust)")}>
                  Re-review unknown
                </button>
              )}
              {starredInSessionCount > 0 && (
                <button onClick={() => restartWith("starred")} style={smallBtn("var(--fjord)")}>
                  Re-review starred
                </button>
              )}
              <button onClick={() => restartWith("all")} style={smallBtn("#8A8577")}>
                Re-review all
              </button>
            </div>
          )}
          <button
            onClick={() => setSessionKey((k) => k + 1)}
            style={{
              marginTop: 10,
              border: "none",
              background: "none",
              color: "var(--muted)",
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              margin: "10px auto 0",
            }}
          >
            <Icon.RotateCcw size={12} />
            Start a fresh session
          </button>
        </div>
      ) : (
        <>
          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 8, display: "flex", gap: 16 }}>
            <span>
              Card {idx + 1} of {poolIds.length}
            </span>
            <span>
              <span style={{ color: "var(--sage)", fontWeight: 700 }}>{knownWordCount}</span> of {scopeTotal} known
            </span>
            {levelFilter === "all" && catFilter === "all" && knownListWords > 0 && (
              <span style={{ marginLeft: "auto" }}>Your level: about {estimatedLevel}</span>
            )}
          </div>
          <div
            key={current.id}
            className={slideDir === "back" ? "card-enter-back" : "card-enter-next"}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              onGestureStart(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => onGestureMove(e.clientX, e.clientY)}
            onPointerUp={onGestureEnd}
            onPointerCancel={onGestureEnd}
            style={{
              position: "relative",
              borderRadius: 14,
              border: "1px solid var(--line)",
              background: "var(--card)",
              height: cardHeight,
              maxHeight: "70vh",
              overflowY: cardHeight > window.innerHeight * 0.7 ? "auto" : "visible",
              touchAction: "pan-y",
              cursor: "pointer",
              userSelect: "none",
              transform:
                "translateX(" + (exiting ? (exiting === "left" ? -420 : 420) : dragX) + "px) rotate(" + dragX / 28 + "deg)",
              opacity: exiting ? 0 : 1 - Math.min(Math.abs(dragX) / 260, 0.45),
              transition: dragging ? "none" : "transform 0.28s ease, opacity 0.28s ease, height 0.2s ease",
            }}
          >
            <CheckBadgeIcon
              size={17}
              filled={!!current.known}
              style={{ position: "absolute", top: 14, right: 14, zIndex: 2, cursor: "pointer" }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                updateCard(current.id, { known: !current.known });
              }}
            />
            <StarIcon
              size={17}
              filled={!!current.starred}
              color={current.starred ? "var(--rust)" : "#C9C4B6"}
              style={{ position: "absolute", top: 14, left: 14, zIndex: 2, cursor: "pointer" }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                updateCard(current.id, { starred: !current.starred });
              }}
            />
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openAsk(current);
              }}
              aria-label="Ask about this word"
              style={{ position: "absolute", bottom: 14, right: 14, zIndex: 2, border: "none", background: "none", color: "#C9C4B6", cursor: "pointer", padding: 0, display: "flex" }}
            >
              <Icon.HelpCircle size={17} />
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openInsight(current);
              }}
              aria-label="Explore related words"
              style={{ position: "absolute", bottom: 14, left: 14, zIndex: 2, border: "none", background: "none", color: "#C9C4B6", cursor: "pointer", padding: 0, display: "flex" }}
            >
              <Icon.Lightbulb size={17} />
            </button>

            <div style={{ perspective: 1200 }}>
              <div
                style={{
                  position: "relative",
                  height: cardHeight,
                  width: "100%",
                  transformStyle: "preserve-3d",
                  transition: "transform 0.5s",
                  transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                {/* Front face — shows Danish or English first depending on the direction toggle.
                    Outer div just centers the inner content block within the full card (both
                    axes) — that's what guarantees the block's center coincides with the card's
                    center, and therefore stays equidistant from all four corner icons. */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backfaceVisibility: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div ref={frontContentRef} style={{ width: "100%", boxSizing: "border-box", padding: "0 " + H_CLEARANCE + "px" }}>
                    {drillMode ? (
                      <div style={{ textAlign: "center", width: "100%" }}>
                        <div style={{ fontFamily: "var(--sans)", fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--fjord)", marginBottom: 8 }}>
                          {DRILL_LABEL[drillMode]}
                        </div>
                        <div style={{ fontFamily: "var(--serif)", fontSize: 28, lineHeight: 1.35, color: "var(--terracotta)" }}>{current.front}</div>
                        <div style={{ fontFamily: "var(--sans)", fontStyle: "italic", fontSize: 14, color: "var(--sage)", marginTop: 6 }}>{current.back}</div>
                      </div>
                    ) : (
                      langDir === "da-first" ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%" }}>
                        <div style={{ fontFamily: "var(--serif)", fontSize: current.type === "word" ? 30 : 21, lineHeight: 1.35, color: "var(--terracotta)", textAlign: "center" }}>
                          {current.front}
                        </div>
                        {speechSupported() && currentSpeakableText && (
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              speakDanish(currentSpeakableText);
                            }}
                            aria-label="Pronounce this"
                            style={{ border: "none", background: "none", color: "var(--terracotta)", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
                          >
                            <Icon.Volume2 size={20} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontFamily: "var(--sans)",
                          fontStyle: "italic",
                          fontSize: current.type === "word" ? 26 : 18,
                          lineHeight: 1.4,
                          color: "var(--sage)",
                          width: "100%",
                          textAlign: current.type === "grammar" ? "left" : "center",
                        }}
                      >
                        {current.back}
                      </div>
                    )
                    )}
                  </div>
                </div>

                {/* Back face — the other language, plus notes/examples. Same centering approach. */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    ref={backContentRef}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "0 " + H_CLEARANCE + "px",
                    }}
                  >
                    {drillMode ? (
                      <div style={{ textAlign: "center", width: "100%" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                          <div style={{ fontFamily: "var(--serif)", fontSize: 30, lineHeight: 1.35, color: "var(--terracotta)" }}>{drillAnswer}</div>
                          {speechSupported() && (
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                speakDanish(drillAnswer);
                              }}
                              aria-label="Pronounce this"
                              style={{ border: "none", background: "none", color: "var(--terracotta)", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
                            >
                              <Icon.Volume2 size={20} />
                            </button>
                          )}
                        </div>
                        <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", marginTop: 10, lineHeight: 1.6 }}>
                          {current.front} · {drillParts[0]} · {drillParts[1]} · {drillParts[2]}
                        </div>
                      </div>
                    ) : (
                      langDir === "da-first" ? (
                      <div
                        style={{
                          fontFamily: "var(--sans)",
                          fontStyle: "italic",
                          fontSize: current.type === "word" ? 26 : 18,
                          lineHeight: 1.4,
                          color: "var(--sage)",
                          width: "100%",
                          textAlign: current.type === "grammar" ? "left" : "center",
                        }}
                      >
                        {current.back}
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%" }}>
                        <div style={{ fontFamily: "var(--serif)", fontSize: current.type === "word" ? 30 : 21, lineHeight: 1.35, color: "var(--terracotta)", textAlign: "center" }}>
                          {current.front}
                        </div>
                        {speechSupported() && currentSpeakableText && (
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              speakDanish(currentSpeakableText);
                            }}
                            aria-label="Pronounce this"
                            style={{ border: "none", background: "none", color: "var(--terracotta)", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
                          >
                            <Icon.Volume2 size={20} />
                          </button>
                        )}
                      </div>
                    )
                    )}
                    {current.notes && (
                    <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", marginTop: 8, textAlign: current.type === "grammar" ? "left" : "center" }}>{current.notes}</div>
                  )}
                  {current.examples && current.examples.length > 0 && (
                    <div style={{ marginTop: 12, width: "100%", textAlign: "left" }}>
                      {current.examples.slice(0, 3).map((ex, i) => (
                        <div key={i} style={{ fontFamily: "var(--sans)", fontSize: 12.5, lineHeight: 1.5, marginBottom: 4 }}>
                          <span style={{ color: "var(--terracotta)" }}>{ex.da}</span>
                          <span style={{ color: "var(--sage)", fontStyle: "italic" }}> — {ex.en}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "center" }}>
            <button
              onClick={requestBack}
              style={{
                border: "1px solid var(--line)",
                background: "var(--card)",
                color: "var(--ink)",
                borderRadius: 999,
                padding: "11px 30px",
                fontFamily: "var(--sans)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Back
            </button>
            <button
              onClick={requestNext}
              style={{
                border: "1px solid var(--line)",
                background: "var(--card)",
                color: "var(--ink)",
                borderRadius: 999,
                padding: "11px 30px",
                fontFamily: "var(--sans)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Next
            </button>
          </div>
          <div style={{ textAlign: "center", fontFamily: "var(--sans)", fontSize: 11, color: "#B8B3A5", marginTop: 8 }}>
            Swipe the card left or right, or use the buttons
          </div>
        </>
      )}

      {insightFor && (
        <CenteredOverlay onClose={() => setInsightFor(null)} maxWidth={380}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--terracotta)" }}>
              {cards.find((c) => c.id === insightFor)?.front}
            </div>
            <button onClick={() => setInsightFor(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          {insightLoading ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <Icon.Loader2 className="spin" size={20} color="var(--muted)" />
            </div>
          ) : insightError ? (
            <AIErrorNote message={insightError} onOpenSettings={onOpenSettings} />
          ) : (
            <div style={{ background: "var(--paper)", borderRadius: 8, padding: "12px 14px", fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.6 }}>
              {insightCache[insightFor]?.forms?.length > 0 && (
                <div style={{ marginBottom: insightCache[insightFor]?.explanation ? 12 : 0 }}>
                  {insightCache[insightFor].forms.map((f, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <span style={{ color: "var(--terracotta)" }}>{f.da}</span>
                      <span style={{ color: "var(--sage)", fontStyle: "italic" }}> — {f.en}</span>
                    </div>
                  ))}
                </div>
              )}
              {insightCache[insightFor]?.explanation && <div style={{ whiteSpace: "pre-wrap" }}>{renderInlineMarkdown(insightCache[insightFor].explanation)}</div>}
            </div>
          )}
        </CenteredOverlay>
      )}

      {askFor && (
        <CenteredOverlay onClose={() => setAskFor(null)} maxWidth={380}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--terracotta)" }}>
              Ask about "{cards.find((c) => c.id === askFor)?.front}"
            </div>
            <button onClick={() => setAskFor(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.4 }}>
            Ask anything about this word, or tell me how to modify the card — e.g. "give me the present tense" or "make this plural".
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitAsk()}
              placeholder='e.g. "make this plural"'
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={submitAsk} disabled={askLoading || !askQuestion.trim()} style={smallBtn("var(--fjord)")}>
              {askLoading ? <Icon.Loader2 size={14} className="spin" /> : <Icon.Send size={14} />}
            </button>
          </div>
          {askError && <AIErrorNote message={askError} onOpenSettings={onOpenSettings} />}
          {askAnswer && (
            <div style={{ background: "var(--paper)", borderRadius: 8, padding: "12px 14px", fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: askModification ? 10 : 0 }}>
              {renderInlineMarkdown(askAnswer)}
            </div>
          )}
          {askModification && (
            <div style={{ background: "var(--paper)", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>
                Suggested update
              </div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 14, marginBottom: 12 }}>
                <span style={{ color: "var(--terracotta)" }}>{askModification.front}</span>
                {askModification.back && (
                  <>
                    {" "}
                    — <span style={{ color: "var(--sage)", fontStyle: "italic" }}>{askModification.back}</span>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={applyAskModification} style={{ ...smallBtn("var(--rust)"), flex: 1, padding: "8px", fontSize: 13 }}>
                  Update this card
                </button>
                <button onClick={() => setAskModification(null)} style={{ ...smallBtn("#A8A395"), flex: 1, padding: "8px", fontSize: 13 }}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </CenteredOverlay>
      )}
    </div>
  );
}


function LibraryView({ cards, categories, updateCard, deleteCard, persistCategories, addCards, onOpenSettings }) {
  const [catFilter, setCatFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [knownFilter, setKnownFilter] = useState("all"); // all | known | unknown
  const [originFilter, setOriginFilter] = useState("all"); // all | mine | starter
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [sortDir, setSortDir] = useState("asc"); // asc | desc
  const [showFilters, setShowFilters] = useState(false);
  const [insightFor, setInsightFor] = useState(null);
  const [insightCache, setInsightCache] = useState({});
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

  const activeFilterCount =
    (catFilter !== "all" ? 1 : 0) +
    (levelFilter !== "all" ? 1 : 0) +
    (typeFilter !== "all" ? 1 : 0) +
    (starredOnly ? 1 : 0) +
    (knownFilter !== "all" ? 1 : 0) +
    (originFilter !== "all" ? 1 : 0);

  function clearFilters() {
    setCatFilter("all");
    setLevelFilter("all");
    setTypeFilter("all");
    setStarredOnly(false);
    setKnownFilter("all");
    setOriginFilter("all");
  }

  const filtered = cards.filter((c) => {
    if (catFilter !== "all" && c.category !== catFilter) return false;
    if (levelFilter !== "all" && c.level !== levelFilter) return false;
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
    if (starredOnly && !c.starred) return false;
    if (knownFilter === "known" && !c.known) return false;
    if (knownFilter === "unknown" && c.known) return false;
    if (originFilter === "mine" && c.starter) return false;
    if (originFilter === "starter" && !c.starter) return false;
    if (query && !(c.front + c.back).toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const [englishFirst, setEnglishFirst] = useState(false);

  // "en"/"et" are grammatical-gender articles Danish nouns are stored
  // with (e.g. "en hund"), and "a"/"an" are their English equivalents
  // (e.g. "a dog") — strip whichever applies, then skip past any other
  // leading non-letter characters (like the stray "/" in a card whose
  // front is literally "en / et"), so both the sort order and the
  // letter grouping agree on the same real first letter instead of one
  // of them being thrown off by punctuation.
  const sortKey = (word) => {
    const stripped = word.replace(/^(en|et|an?)\s+/i, "").trim();
    const match = stripped.match(/[a-zA-ZæøåÆØÅ].*/s);
    return match ? match[0] : stripped;
  };
  const sortField = (c) => (englishFirst ? c.back : c.front);
  const sorted = [...filtered].sort((a, b) => {
    const cmp = sortKey(sortField(a)).localeCompare(sortKey(sortField(b)), englishFirst ? "en" : "da");
    return sortDir === "desc" ? -cmp : cmp;
  });

  // Grouped into a collapsible A-Z (or Z-A) index — much less overwhelming
  // to scroll through 1000+ cards than one long flat list. Danish's extra
  // letters (æ, ø, å) sort after z, so they end up their own groups at
  // the appropriate end depending on direction — that's correct Danish
  // collation, not a bug, even though it can look surprising coming from
  // English alphabetical order.
  const letterOf = (word) => {
    const key = sortKey(word);
    return key ? key[0].toUpperCase() : "#";
  };
  const groups = [];
  for (const c of sorted) {
    const letter = letterOf(sortField(c));
    const last = groups[groups.length - 1];
    if (last && last.letter === letter) last.cards.push(c);
    else groups.push({ letter, cards: [c] });
  }
  const [expandedLetters, setExpandedLetters] = useState(new Set());
  function toggleLetter(letter) {
    setExpandedLetters((prev) => {
      const next = new Set(prev);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return next;
    });
  }

  const knownCount = cards.filter((c) => c.type === "word" && c.known).length;
  const unknownCount = cards.filter((c) => c.type === "word" && !c.known).length;

  async function openInsight(card) {
    setInsightFor(card.id);
    setInsightError("");
    if (insightCache[card.id]) return;
    setInsightLoading(true);
    try {
      const reply = await callAI(
        WORD_INSIGHT_SYSTEM_PROMPT,
        'Danish word or phrase: "' + card.front + '"' + (card.back ? " (means: " + card.back + ")" : "") + irregularVerbFactsHint(card.front) + irregularPluralFactsHint(card.front),
        { maxTokens: 700 }
      );
      const parsed = parseJSONLoose(reply);
      setInsightCache((prev) => ({ ...prev, [card.id]: { forms: parsed.forms || [], explanation: (parsed.explanation || "").trim() } }));
    } catch (e) {
      setInsightError(apiErrorMessage(e));
    } finally {
      setInsightLoading(false);
    }
  }

  return (
    <div>
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Icon.Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your deck"
          style={{ ...inputStyle, padding: "9px 10px 9px 32px" }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setShowFilters((s) => !s)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid " + (activeFilterCount > 0 ? "var(--fjord)" : "var(--line)"),
            background: activeFilterCount > 0 ? "#EEF2F0" : "var(--card)",
            borderRadius: 999,
            padding: "7px 14px",
            fontFamily: "var(--sans)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          <Icon.Layers size={13} />
          Filters
          {activeFilterCount > 0 && (
            <span
              style={{
                background: "var(--fjord)",
                color: "#FBFAF7",
                borderRadius: 999,
                minWidth: 18,
                height: 18,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                padding: "0 5px",
              }}
            >
              {activeFilterCount}
            </span>
          )}
          {showFilters ? <Icon.ChevronUp size={13} /> : <Icon.ChevronDown size={13} />}
        </button>
        <button
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            border: "1px solid var(--line)",
            background: "var(--card)",
            borderRadius: 999,
            padding: "7px 14px",
            fontFamily: "var(--sans)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          {sortDir === "asc" ? "A–Z" : "Z–A"}
          {sortDir === "asc" ? <Icon.ArrowDown size={12} /> : <Icon.ArrowUp size={12} />}
        </button>
        <button
          onClick={() => setEnglishFirst((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            border: "1px solid var(--line)",
            background: "var(--card)",
            borderRadius: 999,
            padding: "7px 13px",
            fontFamily: "var(--sans)",
            fontSize: 13,
            whiteSpace: "nowrap",
            color: "var(--muted)",
            cursor: "pointer",
          }}
        >
          {englishFirst ? (
            <>
              <span style={{ fontStyle: "italic" }}>English</span> → <span style={{ color: "var(--terracotta)" }}>Dansk</span>
            </>
          ) : (
            <>
              <span style={{ color: "var(--terracotta)" }}>Dansk</span> → <span style={{ fontStyle: "italic" }}>English</span>
            </>
          )}
          <Icon.RotateCcw size={11} />
        </button>
      </div>

      {showFilters && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Level</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <Pill color="var(--fjord)" active={levelFilter === "all"} onClick={() => setLevelFilter("all")}>
              All levels
            </Pill>
            {LEVELS.map((l) => (
              <Pill key={l.id} color="var(--fjord)" active={levelFilter === l.id} onClick={() => setLevelFilter(levelFilter === l.id ? "all" : l.id)}>
                {l.name}
              </Pill>
            ))}
          </div>

          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Type</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {["all", "word", "sentence", "grammar"].map((t) => (
              <Pill key={t} color="var(--terracotta)" active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                {t === "all" ? "All types" : TYPE_LABEL[t]}
              </Pill>
            ))}
          </div>

          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Progress</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            <Pill color="var(--terracotta)" active={starredOnly} onClick={() => setStarredOnly(!starredOnly)}>
              ★ Starred
            </Pill>
            <Pill color="var(--sage)" active={knownFilter === "known"} onClick={() => setKnownFilter(knownFilter === "known" ? "all" : "known")}>
              Known ({knownCount})
            </Pill>
            <Pill color="var(--fjord)" active={knownFilter === "unknown"} onClick={() => setKnownFilter(knownFilter === "unknown" ? "all" : "unknown")}>
              Unknown ({unknownCount})
            </Pill>
          </div>

          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Category</div>
          <div style={{ marginBottom: 16 }}>
            <CategoryPicker categories={categories} value={catFilter} onChange={setCatFilter} allowAll />
          </div>

          <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Show</div>
          <div style={{ display: "flex", gap: 6, marginBottom: activeFilterCount > 0 ? 16 : 0, flexWrap: "wrap" }}>
            {[
              { id: "all", label: "All cards" },
              { id: "mine", label: "My cards" },
              { id: "starter", label: "Starter vocabulary" },
            ].map((o) => (
              <Pill key={o.id} color="var(--fjord)" active={originFilter === o.id} onClick={() => setOriginFilter(o.id)}>
                {o.label}
              </Pill>
            ))}
          </div>

          {activeFilterCount > 0 && (
            <button onClick={clearFilters} style={smallBtn("#A8A395")}>
              Clear filters
            </button>
          )}
        </div>
      )}

      <div>
        {groups.length === 0 ? (
          <EmptyState icon={Icon.Layers} title="No matching cards" body="Try a different filter, or add new cards from the Add tab or Chat." />
        ) : (
          groups.map((g) => (
            <div key={g.letter} style={{ marginBottom: 8 }}>
              <button
                onClick={() => toggleLetter(g.letter)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  border: "1px solid var(--line)",
                  background: "var(--card)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--terracotta)" }}>{g.letter}</span>
                {expandedLetters.has(g.letter) ? <Icon.ChevronUp size={14} color="var(--muted)" /> : <Icon.ChevronDown size={14} color="var(--muted)" />}
              </button>
              {expandedLetters.has(g.letter) && (
                <div style={{ marginTop: 8 }}>
                  {g.cards.map((c) => (
                    <div key={c.id}>
                      <LibraryRow
                        card={c}
                        categories={categories}
                        editing={editingId === c.id}
                        englishFirst={englishFirst}
                        onEdit={() => setEditingId(editingId === c.id ? null : c.id)}
                        onSave={(patch) => {
                          updateCard(c.id, patch);
                          setEditingId(null);
                        }}
                        onToggleStar={() => updateCard(c.id, { starred: !c.starred })}
                        onToggleKnown={() => updateCard(c.id, { known: !c.known })}
                        onToggleIgnored={() => updateCard(c.id, { ignored: !c.ignored })}
                        onDelete={() => deleteCard(c.id)}
                        onExplore={() => openInsight(c)}
                      />
                      {insightFor === c.id && (
                        <CenteredOverlay onClose={() => setInsightFor(null)} maxWidth={380}>
                          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                            <button onClick={() => setInsightFor(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
                              <Icon.X size={16} />
                            </button>
                          </div>
                          {insightLoading ? (
                            <div style={{ textAlign: "center", padding: "16px 0" }}>
                              <Icon.Loader2 className="spin" size={18} color="var(--muted)" />
                            </div>
                          ) : insightError ? (
                            <AIErrorNote message={insightError} onOpenSettings={onOpenSettings} />
                          ) : (
                            <div style={{ background: "var(--paper)", borderRadius: 8, padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55 }}>
                              {insightCache[insightFor]?.forms?.length > 0 && (
                                <div style={{ marginBottom: insightCache[insightFor]?.explanation ? 10 : 0 }}>
                                  {insightCache[insightFor].forms.map((f, i) => (
                                    <div key={i} style={{ marginBottom: 3 }}>
                                      <span style={{ color: "var(--terracotta)" }}>{f.da}</span>
                                      <span style={{ color: "var(--sage)", fontStyle: "italic" }}> — {f.en}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {insightCache[insightFor]?.explanation && <div style={{ whiteSpace: "pre-wrap" }}>{renderInlineMarkdown(insightCache[insightFor].explanation)}</div>}
                            </div>
                          )}
                        </CenteredOverlay>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div style={{ fontFamily: "var(--sans)", fontSize: 11, color: "#B8B3A5", textAlign: "center", marginTop: 24, lineHeight: 1.5 }}>
        Built-in words were chosen with help from the FrequencyWords list by Hermit Dave (CC BY-SA 4.0). All translations are our own.
      </div>
    </div>
  );
}

function LibraryRow({ card, categories, editing, englishFirst, onEdit, onSave, onToggleStar, onToggleKnown, onToggleIgnored, onDelete, onExplore }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [notes, setNotes] = useState(card.notes || "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const catName = categories.find((c) => c.id === card.category)?.name || "Uncategorized";
  // Grammar cards store an English name in front (e.g. "V2 word order"),
  // not Danish — speaking that through a Danish voice just mangles
  // English phonetically rather than pronouncing anything real. Their
  // examples do contain genuine Danish, so use the first one instead;
  // if there isn't one, there's nothing real to speak, so hide the button.
  const speakableText = card.type === "grammar" ? card.examples && card.examples[0] && card.examples[0].da : card.front;

  if (editing) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
        <input value={front} onChange={(e) => setFront(e.target.value)} style={inputStyle} placeholder="Danish" />
        <input value={back} onChange={(e) => setBack(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} placeholder="English" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, marginTop: 6, minHeight: 50 }} placeholder="Notes (optional)" />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={() => onSave({ front, back, notes })} style={smallBtn("var(--fjord)")}>
            <Icon.Save size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Save
          </button>
          <button onClick={onEdit} style={smallBtn("#A8A395")}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (confirmingDelete) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--rust)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
        <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, color: "var(--ink)", marginBottom: 10 }}>
          Delete <strong>{card.front}</strong>? This can't be undone.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onDelete} style={smallBtn("var(--rust)")}>
            Delete
          </button>
          <button onClick={() => setConfirmingDelete(false)} style={smallBtn("#A8A395")}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 12, marginBottom: 8, opacity: card.ignored ? 0.45 : card.known ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--terracotta)" }}>{englishFirst ? card.back : card.front}</div>
          <div style={{ fontFamily: "var(--sans)", fontStyle: "italic", fontSize: 13, color: "var(--sage)" }}>{englishFirst ? card.front : card.back}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CheckBadgeIcon size={15} filled={!!card.known} onClick={onToggleKnown} style={{ cursor: "pointer" }} />
          <StarIcon size={15} filled={!!card.starred} color={card.starred ? "var(--rust)" : "#C9C4B6"} onClick={onToggleStar} style={{ cursor: "pointer" }} />
          <button
            onClick={onToggleIgnored}
            style={{ ...iconBtn, color: card.ignored ? "var(--muted)" : "#C9C4B6" }}
            aria-label={card.ignored ? "Stop ignoring this card" : "Ignore this card in Study"}
          >
            <Icon.EyeOff size={15} />
          </button>
        </div>
      </div>
      {card.notes && <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{card.notes}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <span style={{ fontFamily: "var(--sans)", fontSize: 11, color: "var(--muted)" }}>
          <Icon.Tag size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
          {catName}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {speechSupported() && speakableText && (
            <button onClick={() => speakDanish(speakableText)} style={iconBtn} aria-label="Pronounce this">
              <Icon.Volume2 size={15} />
            </button>
          )}
          <button onClick={onExplore} style={iconBtn} aria-label="Explore related words">
            <Icon.Lightbulb size={15} />
          </button>
          <button onClick={onEdit} style={iconBtn}>
            <Icon.Edit3 size={15} />
          </button>
          <button onClick={() => setConfirmingDelete(true)} style={iconBtn}>
            <Icon.Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Add Card ----------

function AddCardView({ categories, addCategory, addCards, onOpenSettings }) {
  const [type, setType] = useState("word");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [notes, setNotes] = useState("");
  const [examples, setExamples] = useState([{ da: "", en: "" }]);
  const [category, setCategory] = useState(categories[0]?.id || "");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [autoFilling, setAutoFilling] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [grammarPreview, setGrammarPreview] = useState(null);
  const categoryTouched = useRef(false);

  const copy = {
    word: {
      frontLabel: "Danish word",
      frontPlaceholder: "e.g. hund",
      backLabel: "English",
      backPlaceholder: "e.g. dog",
    },
    sentence: {
      frontLabel: "Danish sentence",
      frontPlaceholder: "e.g. jeg kan godt lide kaffe",
      backLabel: "English",
      backPlaceholder: "e.g. I really like coffee",
    },
    grammar: {
      frontLabel: "Grammar point name",
      frontPlaceholder: "e.g. Conditional with hvis (if/then)",
      backLabel: "Explanation",
      backPlaceholder: "e.g. Use hvis + past tense, then ville + infinitive, to describe a hypothetical.",
    },
  }[type];

  function updateExample(i, field, value) {
    setExamples(examples.map((ex, idx) => (idx === i ? { ...ex, [field]: value } : ex)));
  }

  function addExampleRow() {
    setExamples([...examples, { da: "", en: "" }]);
  }

  // Auto-fills the *other* language field, and the category, from
  // whichever side the learner just finished typing — only when that
  // other field is still empty, so it never overwrites something typed
  // on purpose. Silent on failure: this is a convenience, not something
  // that should block manual entry if the AI call doesn't work.
  async function autoFill(direction, value) {
    const trimmed = value.trim();
    if (!trimmed || (type !== "word" && type !== "sentence")) return;
    setAutoFilling(true);
    try {
      const categoryNames = categories.map((c) => c.name).join(", ");
      const reply = await callAI(
        "You help fill in a Danish learner's flashcard. Given a single word or short phrase, give its natural translation and the single best-fitting category for it. Be precise about its actual part of speech before choosing a category — don't confuse a verb with an adverb, an adjective with an adverb, or a noun with an adjective; check the word's real grammatical role rather than assuming from its surface form. The translation must be ONLY in the target language — never repeat or include the original word/phrase alongside it. If it's a Danish noun, include its grammatical article (en/et) with the Danish form, and match it with a natural English article ('a'/'an') only when the noun is countable that way in English — omit the article on both sides for mass/uncountable nouns (e.g. anger, water). Never show an article on only one side.",
        (direction === "da" ? "Danish" : "English") +
          ' text: "' +
          trimmed +
          '"\n\nExisting categories to prefer if one genuinely fits: ' +
          (categoryNames || "(none yet)") +
          '. If none fit well, suggest a short new category name instead (e.g. "Verbs", "Nouns", "Prepositions").' +
          '\n\nRespond ONLY with JSON, no other text: {"translation": "...", "category": "..."}',
        { maxTokens: 150 }
      );
      const parsed = parseJSONLoose(reply);
      if (parsed.translation) {
        const clean = cleanTranslation(parsed.translation);
        if (direction === "da") setBack((prev) => (prev.trim() ? prev : clean));
        else setFront((prev) => (prev.trim() ? prev : clean));
      }
      if (parsed.category && !categoryTouched.current) {
        const existing = categories.find((c) => c.name.toLowerCase() === parsed.category.toLowerCase());
        setCategory(existing ? existing.id : "__new__" + parsed.category);
      }
    } catch (e) {
      // Auto-fill failing just means the learner fills it in themselves.
    } finally {
      setAutoFilling(false);
    }
  }

  // Explicit, tappable version of the same fill — the automatic
  // on-leaving-the-field trigger is a nice bonus, but isn't discoverable
  // on its own, so there needs to be a button that visibly does this.
  function triggerAutoFill() {
    if (front.trim() && !back.trim()) autoFill("da", front);
    else if (back.trim() && !front.trim()) autoFill("en", back);
  }

  async function lookupGrammar() {
    if (!front.trim()) return;
    setLookingUp(true);
    setLookupError("");
    try {
      const reply = await callAI(
        "You are a Danish tutor. Given a grammar point name or short description from an intermediate, self-taught learner — which might be rough, vague, or just a quick note to themselves — come up with a clear, well-phrased short title for it (a few words, suitable as a flashcard heading) as grammarName. Then explain the point concisely in plain English (2-4 sentences, no jargon overload) and give up to 3 example sentences (Danish and English) illustrating it.",
        'Grammar point: "' +
          front.trim() +
          '"\n\nRespond ONLY with JSON, no other text: {"grammarName": "...", "explanation": "...", "examples": [{"da": "...", "en": "..."}]}',
        { maxTokens: 900 }
      );
      const parsed = parseJSONLoose(reply);
      setGrammarPreview({
        grammarName: parsed.grammarName || front.trim(),
        explanation: parsed.explanation || "",
        examples: (parsed.examples || []).map((ex) => ({ da: ex.da || "", en: ex.en || "" })),
      });
    } catch (e) {
      setLookupError(apiErrorMessage(e));
    } finally {
      setLookingUp(false);
    }
  }

  function useGrammarPreview() {
    if (!grammarPreview) return;
    setFront(grammarPreview.grammarName);
    setBack(grammarPreview.explanation);
    if (grammarPreview.examples.length) setExamples(grammarPreview.examples);
    setGrammarPreview(null);
  }

  function submit() {
    if (!front.trim() || !back.trim()) {
      setSubmitError("Fill in both fields before adding.");
      return;
    }
    setSubmitError("");
    let catId = category;
    if (category.startsWith("__new__")) catId = addCategory(category.replace("__new__", "") || "New category");
    const cleanExamples = examples.filter((ex) => ex.da.trim() && ex.en.trim());
    addCards([
      {
        type,
        front: front.trim(),
        back: back.trim(),
        notes: notes.trim(),
        category: catId,
        ...(type === "grammar" && cleanExamples.length ? { examples: cleanExamples } : {}),
      },
    ]);
    setFront("");
    setBack("");
    setNotes("");
    setExamples([{ da: "", en: "" }]);
    setLookupError("");
    categoryTouched.current = false;
  }

  function clearForm() {
    setFront("");
    setBack("");
    setNotes("");
    setExamples([{ da: "", en: "" }]);
    setLookupError("");
    setSubmitError("");
    setGrammarPreview(null);
    categoryTouched.current = false;
  }

  // Switching between Word/Sentence/Grammar changes what these fields
  // actually mean (a Danish word vs. a full sentence vs. a grammar point
  // name) — carrying over text typed under a different type is confusing
  // rather than helpful, so this starts the new type with a clean form.
  function changeType(t) {
    setType(t);
    clearForm();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <SectionTitle>Add a card</SectionTitle>
        {(front || back || notes) && (
          <button
            onClick={clearForm}
            style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 12, cursor: "pointer", padding: 4 }}
          >
            <Icon.Trash2 size={12} /> Clear
          </button>
        )}
      </div>
      <div style={{ height: 14 }} />
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {["word", "sentence", "grammar"].map((t) => (
          <Pill key={t} color={TYPE_COLOR[t]} active={type === t} onClick={() => changeType(t)}>
            {TYPE_LABEL[t]}
          </Pill>
        ))}
      </div>

      <Field label={copy.backLabel}>
        {type === "grammar" ? (
          <textarea value={back} onChange={(e) => setBack(e.target.value)} style={{ ...inputStyle, minHeight: 70 }} placeholder={copy.backPlaceholder} />
        ) : (
          <input
            value={back}
            onChange={(e) => setBack(e.target.value)}
            onBlur={(e) => autoFill("en", e.target.value)}
            style={inputStyle}
            placeholder={copy.backPlaceholder}
          />
        )}
      </Field>
      {(type === "word" || type === "sentence") && (
        <div style={{ display: "flex", justifyContent: "center", margin: "14px 0" }}>
          <button
            onClick={triggerAutoFill}
            disabled={autoFilling || !((front.trim() && !back.trim()) || (back.trim() && !front.trim()))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid " + ((front.trim() && !back.trim()) || (back.trim() && !front.trim()) ? "var(--fjord)" : "#D8D4CB"),
              background: (front.trim() && !back.trim()) || (back.trim() && !front.trim()) ? "#EEF2F0" : "transparent",
              borderRadius: 999,
              padding: "7px 16px",
              color: (front.trim() && !back.trim()) || (back.trim() && !front.trim()) ? "var(--fjord)" : "#B8B3A5",
              fontFamily: "var(--sans)",
              fontSize: 13,
              fontWeight: 700,
              cursor: (front.trim() && !back.trim()) || (back.trim() && !front.trim()) ? "pointer" : "default",
            }}
          >
            {autoFilling ? <Icon.Loader2 size={13} className="spin" /> : <Icon.Wand2 size={13} />}
            {autoFilling ? "Filling in…" : "Fill in translation"}
          </button>
        </div>
      )}

      {type === "grammar" && (
        <div style={{ margin: "14px 0" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={lookupGrammar}
              disabled={!front.trim() || lookingUp}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid " + (front.trim() ? "var(--fjord)" : "#D8D4CB"),
                background: front.trim() ? "#EEF2F0" : "transparent",
                borderRadius: 999,
                padding: "7px 16px",
                color: front.trim() ? "var(--fjord)" : "#B8B3A5",
                fontFamily: "var(--sans)",
                fontSize: 13,
                fontWeight: 700,
                cursor: front.trim() ? "pointer" : "default",
              }}
            >
              {lookingUp ? <Icon.Loader2 size={13} className="spin" /> : <Icon.Wand2 size={13} />}
              {lookingUp ? "Asking…" : "Ask AI to explain this"}
            </button>
          </div>
          <AIErrorNote message={lookupError} onOpenSettings={onOpenSettings} />
        </div>
      )}

      {grammarPreview && (
        <CenteredOverlay onClose={() => setGrammarPreview(null)} maxWidth={440}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--serif)", fontSize: 17, color: "var(--terracotta)" }}>{grammarPreview.grammarName}</div>
            <button onClick={() => setGrammarPreview(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55, marginBottom: 14 }}>{renderInlineMarkdown(grammarPreview.explanation)}</div>
          {grammarPreview.examples.length > 0 && (
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginBottom: 16 }}>
              {grammarPreview.examples.map((ex, i) => (
                <div key={i} style={{ fontFamily: "var(--sans)", fontSize: 13.5, marginBottom: 6 }}>
                  <span style={{ color: "var(--terracotta)" }}>{ex.da}</span> — <span style={{ color: "var(--sage)", fontStyle: "italic" }}>{ex.en}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={useGrammarPreview} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "10px", fontSize: 14 }}>
            Use this
          </button>
        </CenteredOverlay>
      )}

      <Field label={copy.frontLabel}>
        <input
          value={front}
          onChange={(e) => setFront(e.target.value)}
          onBlur={(e) => autoFill("da", e.target.value)}
          style={inputStyle}
          placeholder={copy.frontPlaceholder}
        />
      </Field>

      {type === "grammar" && (
        <Field label="Example sentences (optional)">
          {examples.map((ex, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input value={ex.da} onChange={(e) => updateExample(i, "da", e.target.value)} placeholder="Danish example" style={{ ...inputStyle, flex: 1 }} />
              <input value={ex.en} onChange={(e) => updateExample(i, "en", e.target.value)} placeholder="English translation" style={{ ...inputStyle, flex: 1 }} />
            </div>
          ))}
          <button
            onClick={addExampleRow}
            style={{ border: "none", background: "none", color: "var(--fjord)", fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 }}
          >
            + Add another example
          </button>
        </Field>
      )}

      <Field label="Notes (optional)">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="Anything worth remembering about this" />
      </Field>
      <Field label="Category">
        <CategoryPicker
          categories={categories}
          value={category}
          onChange={(v) => {
            categoryTouched.current = true;
            setCategory(v);
          }}
          allowNew
          onAddCategory={addCategory}
        />
      </Field>

      {submitError && <div style={{ color: "var(--rust)", fontFamily: "var(--sans)", fontSize: 12.5, marginBottom: 8 }}>{submitError}</div>}
      <button
        onClick={submit}
        style={{
          ...smallBtn("var(--rust)"),
          width: "100%",
          padding: "11px",
          fontSize: 14,
          marginTop: 4,
          opacity: front.trim() && back.trim() ? 1 : 0.5,
        }}
      >
        Add card
      </button>
    </div>
  );
}

// ============================================================
// Chat — the only place this app talks to an AI model. Every
// action here (conversation, sentence analysis, article
// vocabulary, category suggestions, starter vocabulary) is
// triggered by a tap, never automatically. Scanning pasted text
// for candidate vocabulary is done locally with no AI call at all
// — only translating the words you pick uses the AI.
// ============================================================

function AISettingsPanel({ onClose }) {
  const [engine, setEngineState] = useState(null);
  const [savedGeminiKey, setSavedGeminiKey] = useState(null);
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [savedKey, setSavedKey] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [loadingModel, setLoadingModel] = useState(false);
  const [modelProgress, setModelProgress] = useState("");
  const [modelReady, setModelReady] = useState(!!localEnginePromise);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState("");
  const [confirmingModel, setConfirmingModel] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(LOCAL_MODEL_ID);
  const [savedOllamaConfig, setSavedOllamaConfig] = useState(null);
  const [chromeTranslatorEnabled, setChromeTranslatorEnabledState] = useState(false);
  const [confirmingChromeTranslatorDownload, setConfirmingChromeTranslatorDownload] = useState(false);
  const [chromeTranslatorLoading, setChromeTranslatorLoading] = useState(false);
  const [chromeTranslatorDownloadProgress, setChromeTranslatorDownloadProgress] = useState("");
  const [ollamaUrlInput, setOllamaUrlInput] = useState("http://localhost:11434");
  const [ollamaModelInput, setOllamaModelInput] = useState("llama3.2");

  useEffect(() => {
    (async () => {
      const e = await storeGet("aiEngine");
      setEngineState(e);
      setSavedGeminiKey(await storeGet("geminiApiKey"));
      setSavedKey(await storeGet("anthropicApiKey"));
      try {
        const raw = await storeGet("ollamaConfig");
        if (raw) setSavedOllamaConfig(JSON.parse(raw));
      } catch (e) {}
      setChromeTranslatorEnabledState((await storeGet("chromeTranslatorEnabled")) === "true");
      // Anthropic is the default, always-visible option now — only
      // auto-expand "Use something else instead" if a different engine
      // is the one actually in use, so it's not hidden from its owner.
      if (e === "local" || e === "gemini" || e === "ollama") setShowMore(true);
    })();
  }, []);

  async function chooseEngine(next) {
    setEngineState(next);
    setError("");
    await storeSet("aiEngine", next);
  }

  async function saveOllamaConfig() {
    let url = ollamaUrlInput.trim().replace(/\/+$/, "");
    const model = ollamaModelInput.trim();
    if (!url || !model) return;
    // A very plausible mistake — the placeholder shows "http://..." but
    // it's easy to type just "localhost:11434" and skip the protocol,
    // which would silently fail as a relative URL instead of a real request.
    if (!/^https?:\/\//i.test(url)) url = "http://" + url;
    const config = { url, model };
    await storeSet("ollamaConfig", JSON.stringify(config));
    setSavedOllamaConfig(config);
    await chooseEngine("ollama");
    onClose("ollama");
  }

  async function toggleChromeTranslator(next) {
    if (!next) {
      // Turning it off never needs confirmation — nothing to download.
      setChromeTranslatorEnabledState(false);
      await storeSet("chromeTranslatorEnabled", "false");
      return;
    }
    setChromeTranslatorLoading(true);
    setError("");
    try {
      const [daEn, enDa] = await Promise.all([chromeTranslatorAvailability("da", "en"), chromeTranslatorAvailability("en", "da")]);
      const needsDownload = daEn === "downloadable" || daEn === "downloading" || enDa === "downloadable" || enDa === "downloading";
      if (needsDownload && !confirmingChromeTranslatorDownload) {
        // Ask before downloading anything, same as the local model.
        setConfirmingChromeTranslatorDownload(true);
        setChromeTranslatorLoading(false);
        return;
      }
      // Pre-warm both directions now, so the actual Translate button never
      // has to trigger a surprise download later.
      await Promise.all([
        Translator.create({
          sourceLanguage: "da",
          targetLanguage: "en",
          monitor(m) {
            m.addEventListener("downloadprogress", (e) => setChromeTranslatorDownloadProgress(Math.round(e.loaded * 100) + "%"));
          },
        }),
        Translator.create({
          sourceLanguage: "en",
          targetLanguage: "da",
          monitor(m) {
            m.addEventListener("downloadprogress", (e) => setChromeTranslatorDownloadProgress(Math.round(e.loaded * 100) + "%"));
          },
        }),
      ]);
      setChromeTranslatorEnabledState(true);
      await storeSet("chromeTranslatorEnabled", "true");
      setConfirmingChromeTranslatorDownload(false);
    } catch (e) {
      setError("Couldn't set up Chrome's translator — it may not be available on this device or browser. Try again, or leave it off.");
    } finally {
      setChromeTranslatorLoading(false);
      setChromeTranslatorDownloadProgress("");
    }
  }

  async function saveGeminiKey() {
    if (!geminiKeyInput.trim()) return;
    await storeSet("geminiApiKey", geminiKeyInput.trim());
    setSavedGeminiKey(geminiKeyInput.trim());
    setGeminiKeyInput("");
    await chooseEngine("gemini");
    onClose("gemini");
  }

  async function saveKey() {
    if (!apiKeyInput.trim()) return;
    await storeSet("anthropicApiKey", apiKeyInput.trim());
    setSavedKey(apiKeyInput.trim());
    setApiKeyInput("");
    await chooseEngine("api");
    onClose("api");
  }

  async function loadModelNow() {
    setConfirmingModel(false);
    setLoadingModel(true);
    setError("");
    try {
      await getLocalEngine((report) => setModelProgress(report.text || ""), selectedModelId);
      setModelReady(true);
      await chooseEngine("local");
      onClose("local");
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoadingModel(false);
    }
  }

  const apiActive = engine === "api";

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Connect an AI</div>
      <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 14 }}>
        Powers the tutor chat, sentence explanations, and article translation. Nothing else in this app needs it.
      </div>

      <div
        style={{
          border: "1.5px solid " + (apiActive ? "var(--fjord)" : "var(--line)"),
          borderRadius: 10,
          padding: 14,
          background: apiActive ? "#EEF2F0" : "transparent",
        }}
      >
        <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Anthropic key</div>
        <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
          Best quality for Danish specifically, small per-use cost (typically well under a dollar for normal use).
        </div>
        {!savedKey && (
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--rust)",
              textDecoration: "none",
              marginBottom: 10,
            }}
          >
            Get a key at console.anthropic.com ↗
          </a>
        )}
        {savedKey ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--fjord)", fontWeight: 600 }}>
              {apiActive ? "Connected" : "Key saved"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              {!apiActive && (
                <button onClick={() => chooseEngine("api")} style={smallBtn("var(--fjord)")}>
                  Use this
                </button>
              )}
              <button onClick={() => setSavedKey(null)} style={smallBtn("#A8A395")}>
                Change key
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <input type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="sk-ant-…" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={saveKey} style={smallBtn("var(--rust)")}>
              Save
            </button>
          </div>
        )}
      </div>

      {!showMore && (
        <button
          onClick={() => setShowMore(true)}
          style={{ border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 12, marginTop: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }}
        >
          Use something else instead
        </button>
      )}

      {showMore && (
        <>
          <div
            style={{
              border: "1.5px solid " + (engine === "gemini" ? "var(--fjord)" : "var(--line)"),
              borderRadius: 10,
              padding: 14,
              marginTop: 12,
              background: engine === "gemini" ? "#EEF2F0" : "transparent",
            }}
          >
            <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Google Gemini</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>
              Free, no credit card. Also handles Photo import, since it can read images. Good quality for everyday
              use, a step behind Claude on tricky grammar.
            </div>

            {savedGeminiKey ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--fjord)", fontWeight: 600 }}>
                  {engine === "gemini" ? "Connected" : "Key saved"}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  {engine !== "gemini" && (
                    <button onClick={() => chooseEngine("gemini")} style={smallBtn("var(--fjord)")}>
                      Use this
                    </button>
                  )}
                  <button onClick={() => setSavedGeminiKey(null)} style={smallBtn("#A8A395")}>
                    Change key
                  </button>
                </div>
              </div>
            ) : (
              <>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontFamily: "var(--sans)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "var(--rust)",
                    textDecoration: "none",
                    marginBottom: 10,
                  }}
                >
                  Get a free key at aistudio.google.com ↗
                </a>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="password"
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    placeholder="Paste your key — AIza…"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={saveGeminiKey} style={smallBtn("var(--rust)")}>
                    Save
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ border: "1.5px solid " + (engine === "local" ? "var(--fjord)" : "var(--line)"), borderRadius: 10, padding: 14, marginTop: 10 }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Local model</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
              Free, no key, works offline after a one-time download. Needs WebGPU — recent Chrome/Edge, or Safari 26+
              (iOS 26+ on iPhone). Weaker than Gemini at Danish, and can't do Photo import.
            </div>
            {modelReady && engine === "local" ? (
              <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--fjord)", fontWeight: 600 }}>Connected</span>
            ) : confirmingModel ? (
              <div>
                <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Choose a model:</div>
                <select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 10 }}
                >
                  {LOCAL_MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                  This downloads several hundred MB to this browser from Hugging Face. Continue?
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={loadModelNow} style={smallBtn("var(--rust)")}>
                    Download & use
                  </button>
                  <button onClick={() => setConfirmingModel(false)} style={smallBtn("#A8A395")}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmingModel(true)} disabled={loadingModel} style={smallBtn("var(--rust)")}>
                {loadingModel ? modelProgress || "Loading model…" : "Load local model"}
              </button>
            )}
          </div>

          <div style={{ border: "1.5px solid " + (engine === "ollama" ? "var(--fjord)" : "var(--line)"), borderRadius: 10, padding: 14, marginTop: 10 }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Ollama</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
              Free, private, runs on a computer with Ollama already installed. Ollama itself doesn't run on iPhone —
              but if that computer is on the same Wi-Fi as your phone, you can still use it from here: on the
              computer, run{" "}
              <code style={{ background: "var(--paper)", padding: "1px 4px", borderRadius: 4 }}>
                OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve
              </code>
              , then enter that computer's local network address below (something like{" "}
              <code style={{ background: "var(--paper)", padding: "1px 4px", borderRadius: 4 }}>http://192.168.1.42:11434</code>) instead
              of localhost. On the same computer, plain localhost works fine.
            </div>
            {engine === "ollama" && savedOllamaConfig ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--fjord)", fontWeight: 600 }}>
                  Connected — {savedOllamaConfig.model}
                </span>
                <button onClick={() => setSavedOllamaConfig(null)} style={smallBtn("#A8A395")}>
                  Change
                </button>
              </div>
            ) : (
              <div>
                <input
                  value={ollamaUrlInput}
                  onChange={(e) => setOllamaUrlInput(e.target.value)}
                  placeholder="http://localhost:11434"
                  style={{ ...inputStyle, marginBottom: 8 }}
                />
                <input
                  value={ollamaModelInput}
                  onChange={(e) => setOllamaModelInput(e.target.value)}
                  placeholder="Model name — e.g. llama3.2"
                  style={{ ...inputStyle, marginBottom: 8 }}
                />
                <button onClick={saveOllamaConfig} style={smallBtn("var(--rust)")}>
                  Connect
                </button>
              </div>
            )}
          </div>

          <div style={{ border: "1.5px solid " + (chromeTranslatorEnabled ? "var(--fjord)" : "var(--line)"), borderRadius: 10, padding: 14, marginTop: 10 }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Chrome's built-in translator</div>
            <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
              Free, entirely on-device, zero network call — but desktop Chrome only (Chrome 138+). Not available on
              iPhone, Android, Safari, Firefox, or Edge, since it's tied to Chrome's own bundled model. When it's on,
              only the Translate button uses it; everything else still uses your main AI above.
            </div>
            {!chromeTranslatorSupported() ? (
              <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", fontStyle: "italic" }}>
                Not available in this browser.
              </div>
            ) : confirmingChromeTranslatorDownload ? (
              <div>
                <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                  This downloads a small language pack to this browser the first time. Continue?
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => toggleChromeTranslator(true)} disabled={chromeTranslatorLoading} style={smallBtn("var(--rust)")}>
                    {chromeTranslatorLoading ? chromeTranslatorDownloadProgress || "Downloading…" : "Download & use"}
                  </button>
                  <button onClick={() => setConfirmingChromeTranslatorDownload(false)} style={smallBtn("#A8A395")}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: chromeTranslatorLoading ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={chromeTranslatorEnabled}
                  disabled={chromeTranslatorLoading}
                  onChange={(e) => toggleChromeTranslator(e.target.checked)}
                  style={{ accentColor: "var(--fjord)" }}
                />
                <span style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)" }}>
                  {chromeTranslatorLoading ? chromeTranslatorDownloadProgress || "Setting up…" : "Use it for Translate, when available"}
                </span>
              </label>
            )}
          </div>
        </>
      )}

      {error && <div style={{ color: "var(--rust)", fontFamily: "var(--sans)", fontSize: 12.5, marginTop: 10 }}>{error}</div>}

      <button onClick={onClose} style={{ ...smallBtn("#A8A395"), marginTop: 16, width: "100%", padding: "10px" }}>
        Done
      </button>
    </div>
  );
}

// A short fingerprint of the deck, so backup reminders only appear when
// something has actually changed since the last backup.
function backupFingerprint(cards, categories) {
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
async function performBackupExport(cards, categories, showToast) {
  const payload = { exportedAt: new Date().toISOString(), cards, categories };
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

function BackupPanel({ cards, categories, replaceAllData, showToast, onClose }) {
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
      const ok = await replaceAllData(parsed.cards, parsed.categories);
      showToast(ok ? "Backup restored (" + parsed.cards.length + " cards)" : "Couldn't restore the backup");
    } catch (e) {
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

function ChatView({ categories, addCategory, addCards, showToast, engine, onOpenSettings }) {
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

function loadingCopy(engine) {
  return engine === "local" ? "Thinking (local model can take a bit)…" : "Thinking…";
}

// ---------- Chat conversation ----------

function ChatConversation({ engine, categories, addCategory, addCards, showToast, onOpenSettings }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [savingIdx, setSavingIdx] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await storeGet("chatHistory");
        if (raw) setMessages(JSON.parse(raw));
      } catch (e) {}
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (scrollRef.current && scrollRef.current.scrollIntoView) scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function persist(next) {
    setMessages(next);
    await persistWithRetry("chatHistory", JSON.stringify(next.slice(-40)));
  }

  const [reviewingIdx, setReviewingIdx] = useState(null);
  const [reviewSelected, setReviewSelected] = useState({});
  const [reviewCategory, setReviewCategory] = useState({});

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: "user", content: text }];
    persist(next);
    setInput("");
    setSending(true);
    try {
      const categoryNames = categories.map((c) => c.name).join(", ");
      const history = next.slice(-20).map((m) => ({ role: m.role, content: m.content }));
      const reply = await callAI(
        "You are a knowledgeable Danish language reference for an intermediate, self-taught learner who has some foundational grammar gaps despite a decent vocabulary. For a plain question, answer directly and concisely in the reply field (1-3 sentences typically), then stop — don't pad with extra context they didn't ask for, and never end with a follow-up question or an invitation to continue (no \"let me know if...\", no \"would you like...\"). Use Danish examples with English translations whenever they help. " +
          "Separately: if the learner is asking you to CREATE one or more flashcards — a new topic (\"give me 10 words for the doctor\"), a single word or phrase (\"make a flashcard for hyggelig\"), or something from earlier in this conversation (\"make a flashcard from that\", \"save the last one\", \"turn that into a card\") — put those in the flashcards array. Use the conversation history to work out what \"that\" or \"it\" refers to when needed. Leave reply empty, or at most a short one-line confirmation, when the request was purely for flashcards. " +
          "For each flashcard: type is \"word\" (a single word or short phrase), \"sentence\" (a full sentence), or \"grammar\" (a rule or pattern that needs explaining rather than just translating — include up to 3 short example sentences for grammar only). Don't overuse \"grammar\" — most vocabulary requests are \"word\" or \"sentence\". For word/sentence, the back field must be ONE clean, natural translation only — never a list of synonyms or alternatives, and never a parenthetical part-of-speech note like \"(adj.)\"; deeper detail like that belongs behind the lightbulb feature once the card exists, not crammed into the card itself. Pick the single best-fitting category, being precise about actual part of speech first (don't confuse a verb with an adverb, an adjective with an adverb, or a noun with an adjective) — prefer an existing category if one genuinely fits, otherwise suggest a short new one; skip category for grammar. Include Danish grammatical articles (en/et) matched with a natural English article, omitting both for mass/uncountable nouns. " +
          "If nothing was asked to be saved, leave flashcards as an empty array.\n\nExisting categories to prefer if one fits: " +
          (categoryNames || "(none yet)"),
        text +
          '\n\nRespond ONLY with JSON, no other text: {"reply": "...", "flashcards": [{"type": "word", "front": "...", "back": "...", "category": "...", "examples": [{"da":"...","en":"..."}]}]} — omit category for grammar type; omit examples unless type is grammar; both reply and flashcards can be empty/[] as appropriate.',
        { maxTokens: 1800, history: history.slice(0, -1) }
      );
      const parsed = parseJSONLoose(reply);
      const replyText = (parsed.reply || "").trim();
      const rawFlashcards = Array.isArray(parsed.flashcards) ? parsed.flashcards : [];
      // Resolve each suggested category name to a real id up front, same
      // approach as everywhere else that generates a batch — so the
      // review popup can use a plain dropdown per item.
      const workingCategories = [...categories];
      const flashcards = rawFlashcards.map((fc) => {
        if (fc.type === "grammar") return { ...fc, categoryId: "grammar-lessons" };
        const name = (fc.category || "Uncategorized").trim();
        let existingCat = workingCategories.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (!existingCat) {
          const id = addCategory(name);
          existingCat = { id, name, custom: true };
          workingCategories.push(existingCat);
        }
        return { ...fc, categoryId: existingCat.id };
      });
      persist([...next, { role: "assistant", content: replyText, flashcards }]);
    } catch (e) {
      persist([...next, { role: "assistant", content: apiErrorMessage(e), isError: true }]);
    } finally {
      setSending(false);
    }
  }

  function openReview(idx) {
    const msg = messages[idx];
    if (!msg || !msg.flashcards || msg.flashcards.length === 0) return;
    const sel = {};
    const cat = {};
    msg.flashcards.forEach((fc, i) => {
      sel[i] = true;
      cat[i] = fc.categoryId || categories[0]?.id || "";
    });
    setReviewingIdx(idx);
    setReviewSelected(sel);
    setReviewCategory(cat);
  }

  function addReviewSelected() {
    const msg = messages[reviewingIdx];
    if (!msg) return;
    const toAdd = [];
    msg.flashcards.forEach((fc, i) => {
      if (!reviewSelected[i]) return;
      const catId = fc.type === "grammar" ? "grammar-lessons" : reviewCategory[i] || categories[0]?.id;
      toAdd.push({ type: fc.type, front: fc.front, back: fc.back, category: catId, ...(fc.type === "grammar" ? { examples: fc.examples || [] } : {}) });
      if (fc.type === "grammar" && fc.examples) {
        fc.examples.slice(0, 3).forEach((ex) => toAdd.push({ type: "sentence", front: ex.da, back: ex.en, category: catId }));
      }
    });
    if (toAdd.length === 0) return;
    addCards(toAdd);
    setReviewingIdx(null);
  }

  async function saveAsCard(idx) {
    const assistantMsg = messages[idx];
    if (!assistantMsg) return;
    let userMsg = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userMsg = messages[i];
        break;
      }
    }
    setSavingIdx(idx);
    try {
      const categoryNames = categories.map((c) => c.name).join(", ");
      const reply = await callAI(
        "You turn a Danish-tutor question and answer into the single most useful flashcard for the learner to review later. Choose whichever type genuinely fits best: " +
          "'word' if this was really just about one word or a short bit of vocabulary (front = the Danish word, back = ONE clean English translation only — never a list of synonyms or a parenthetical part-of-speech note); " +
          "'sentence' if this was about how to say or understand one specific sentence (front = the Danish sentence, back = the English translation); " +
          "'grammar' if this was about a rule, pattern, or structure that's more useful explained than just translated (front = a short name for the grammar point, back = a concise plain-English explanation, plus up to 3 short example sentences). " +
          "Don't overuse 'grammar' — most simple vocabulary questions should be 'word' or 'sentence'. " +
          "For 'word' or 'sentence' types, also pick the single best-fitting category (e.g. by part of speech or topic) — be precise about the word's actual part of speech first (don't confuse a verb with an adverb, an adjective with an adverb, or a noun with an adjective) — prefer an existing category if one genuinely fits, otherwise suggest a short new one. " +
          "If the front is a Danish noun, include its grammatical article (en/et), and match it with a natural English article ('a'/'an') only when the noun is countable that way in English — omit the article on both sides for mass/uncountable nouns (e.g. anger, water). Never show an article on only one side.",
        "Question: " +
          (userMsg ? userMsg.content : "(none)") +
          "\nAnswer: " +
          assistantMsg.content +
          "\n\nExisting categories to prefer if one fits (for word/sentence types): " +
          (categoryNames || "(none yet)") +
          '\n\nRespond ONLY with JSON, no other text: {"type": "word", "front": "...", "back": "...", "category": "...", "examples": [{"da": "...", "en": "..."}]} — omit "category" if type is "grammar"; omit "examples" unless type is "grammar".',
        { maxTokens: 700 }
      );
      const parsed = parseJSONLoose(reply);
      const type = ["word", "sentence", "grammar"].includes(parsed.type) ? parsed.type : "word";
      const catName = type === "grammar" ? "Grammar Lessons" : parsed.category || "From Chat";
      const existing = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
      const catId = existing ? existing.id : addCategory(catName);
      const examples = parsed.examples || [];
      const toAdd = [{ type, front: parsed.front, back: parsed.back, category: catId, ...(type === "grammar" ? { examples } : {}) }];
      if (type === "grammar") {
        examples.slice(0, 3).forEach((ex) => {
          toAdd.push({ type: "sentence", front: ex.da, back: ex.en, category: catId });
        });
      }
      addCards(toAdd);
    } catch (e) {
      showToast(apiErrorMessage(e));
    } finally {
      setSavingIdx(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {messages.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button
            onClick={() => persist([])}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              border: "none",
              background: "none",
              color: "var(--muted)",
              fontFamily: "var(--sans)",
              fontSize: 12,
              cursor: "pointer",
              padding: 4,
            }}
          >
            <Icon.Trash2 size={12} /> Clear chat
          </button>
        </div>
      )}
      <div style={{ marginBottom: 10 }}>
        {ready && messages.length === 0 && (
          <EmptyState
            icon={Icon.MessageCircle}
            title="Ask anything about Danish"
            body={
              <>
                <div style={{ margin: "6px 0" }}>or</div>
                <div>tell me to make cards, for example "make 10 cards with vocabulary about travel"</div>
              </>
            }
          />
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
            {(m.role === "user" || m.content) && (
              <div
                className={m.role === "assistant" && !m.isError ? "popover" : undefined}
                style={{
                  maxWidth: "82%",
                  background: m.role === "user" ? "var(--fjord)" : "var(--card)",
                  color: m.role === "user" ? "#FBFAF7" : "var(--ink)",
                  border: m.role === "user" ? "none" : "1px solid var(--line)",
                  borderRadius: 16,
                  padding: "11px 14px",
                  fontFamily: "var(--sans)",
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.role === "user" ? m.content : renderInlineMarkdown(m.content)}
              </div>
            )}
            {m.role === "assistant" && !m.isError && m.flashcards && m.flashcards.length > 0 && (
              <button
                onClick={() => openReview(i)}
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--fjord)",
                  fontFamily: "var(--sans)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  marginTop: 3,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Icon.Plus size={11} />
                Review {m.flashcards.length} flashcard{m.flashcards.length === 1 ? "" : "s"}
              </button>
            )}
            {m.role === "assistant" && !m.isError && (!m.flashcards || m.flashcards.length === 0) && (
              <button
                onClick={() => saveAsCard(i)}
                disabled={savingIdx === i}
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--fjord)",
                  fontFamily: "var(--sans)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  marginTop: 3,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {savingIdx === i ? <Icon.Loader2 size={11} className="spin" /> : <Icon.Plus size={11} />}
                Save as flashcard
              </button>
            )}
            {m.isError && onOpenSettings && isSwitchableAIError(m.content) && (
              <button
                onClick={onOpenSettings}
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--fjord)",
                  fontFamily: "var(--sans)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  marginTop: 3,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Icon.Key size={11} /> Choose another AI option
              </button>
            )}
          </div>
        ))}
        {sending && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "9px 12px", fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon.Loader2 size={14} className="spin" />
              {loadingCopy(engine)}
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Ask a question, or make a flashcard…"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          style={{
            border: "none",
            background: "var(--rust)",
            color: "#FBFAF7",
            borderRadius: 9,
            width: 42,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            opacity: sending || !input.trim() ? 0.5 : 1,
          }}
        >
          <Icon.Send size={16} />
        </button>
      </div>

      {reviewingIdx !== null && messages[reviewingIdx] && (
        <CenteredOverlay onClose={() => setReviewingIdx(null)} maxWidth={460}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button onClick={() => setReviewingIdx(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
            Uncheck any you don't want, and adjust the category if it's not quite right.
          </div>
          {messages[reviewingIdx].flashcards.map((fc, i) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < messages[reviewingIdx].flashcards.length - 1 ? "1px solid var(--line)" : "none" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={!!reviewSelected[i]}
                  onChange={(e) => setReviewSelected({ ...reviewSelected, [i]: e.target.checked })}
                  style={{ marginTop: 3, accentColor: "#8C6FA0" }}
                />
                <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, minWidth: 0 }}>
                  {fc.type === "grammar" ? (
                    <>
                      <b>{fc.front}</b> — {fc.back}
                    </>
                  ) : (
                    <>
                      <span style={{ color: "var(--terracotta)" }}>{fc.front}</span> — <span style={{ color: "var(--sage)", fontStyle: "italic" }}>{fc.back}</span>
                    </>
                  )}
                </span>
              </label>
              {fc.type !== "grammar" && (
                <select
                  value={reviewCategory[i] || ""}
                  onChange={(e) => setReviewCategory({ ...reviewCategory, [i]: e.target.value })}
                  style={{ ...inputStyle, width: "auto", padding: "5px 6px", fontSize: 11.5, marginLeft: 24 }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
          <button onClick={addReviewSelected} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "10px", fontSize: 14, marginTop: 6 }}>
            Add selected to deck
          </button>
        </CenteredOverlay>
      )}
    </div>
  );
}

// ---------- Sentence analysis panel ----------


// ---------- Article vocabulary panel ----------

function TextExtractPanel({ engine, categories, addCategory, addCards, onOpenSettings }) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  // Translate (quick lookup)
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupCategory, setLookupCategory] = useState(categories[0]?.id || "");

  // Analyze sentence — grammar breakdown, merged in from what used to be
  // its own separate tab. Lives here now so it can share one text box
  // with Translate and Extract text, instead of needing its own.
  const [sentenceLoading, setSentenceLoading] = useState(false);
  const [sentenceError, setSentenceError] = useState("");
  const [sentenceResult, setSentenceResult] = useState(null);
  const [sentenceSelected, setSentenceSelected] = useState({});
  const [pointCategory, setPointCategory] = useState({});

  // Extract text — pulls out vocabulary worth learning from a passage.
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [selected, setSelected] = useState({});
  const [itemCategory, setItemCategory] = useState({}); // da word -> category id, individually suggested per word
  const [error, setError] = useState("");

  // Word-insight popup — same deep-dive (forms, related words) as the
  // lightbulb on a study card. Only makes sense once the translated
  // result looks like a single word or short phrase, not a passage.
  const [insightFor, setInsightFor] = useState(null);
  const [insightForms, setInsightForms] = useState([]);
  const [insightExplanation, setInsightExplanation] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

  async function openInsight(word, meaning) {
    setInsightFor(word);
    setInsightError("");
    setInsightForms([]);
    setInsightExplanation("");
    setInsightLoading(true);
    try {
      const reply = await callAI(
        WORD_INSIGHT_SYSTEM_PROMPT,
        'Danish word or phrase: "' + word + '"' + (meaning ? " (means: " + meaning + ")" : "") + irregularVerbFactsHint(word) + irregularPluralFactsHint(word),
        { maxTokens: 700 }
      );
      const parsed = parseJSONLoose(reply);
      setInsightForms(parsed.forms || []);
      setInsightExplanation((parsed.explanation || "").trim());
    } catch (e) {
      setInsightError(apiErrorMessage(e));
    } finally {
      setInsightLoading(false);
    }
  }

  async function translate() {
    if (!text.trim()) return;
    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);
    try {
      // When Chrome's on-device translator is enabled and available, try
      // it first — free, instant, no network call. Any failure here is
      // never a hard error, just a signal to fall through to the
      // configured cloud AI below like normal.
      if (chromeTranslatorSupported()) {
        try {
          const enabled = (await storeGet("chromeTranslatorEnabled")) === "true";
          if (enabled) {
            const result = await translateWithChromeTranslator(text.trim());
            if (result && result.da && result.en && result.da.trim().toLowerCase() !== result.en.trim().toLowerCase()) {
              setLookupResult(result);
              return;
            }
          }
        } catch (e) {
          // fall through
        }
      }
      const inputText = text.trim();
      // Split into two focused calls rather than one that both detects
      // and translates — a dedicated detection step is more reliable
      // than asking the model to identify the language while also
      // composing the translation, where the direction can quietly
      // default to Danish under the weight of the larger task.
      const detectionReply = await callAI(
        "You detect whether a piece of text is written in Danish or English, based only on the actual words used. If it's a genuine mix of both languages, default to \"da\" — this is a Danish-learning app, so mixed text should be treated as Danish needing translation rather than English. Respond with ONLY the two letters \"da\" or \"en\" — nothing else, no punctuation, no explanation.",
        'Text: "' + inputText + '"',
        { maxTokens: 10 }
      );
      const isEnglish = detectionReply.trim().toLowerCase().replace(/[^a-z]/g, "").startsWith("en");
      const reply = await callAI(
        "You translate " +
          (isEnglish ? "English text into natural, fluent Danish" : "Danish text into natural, fluent English") +
          " for a language learner. Never invent or substitute a different word that merely looks similar to the input — if the input might contain a typo, translate your single best real-word interpretation of what was actually typed, not some other unrelated word. Respond with ONLY the translation itself — no original text alongside it, no notes, no quotation marks. If it's a single Danish noun (on either side), include its grammatical article (en/et) with the Danish form, and match it with a natural English article ('a'/'an') only when the noun is countable that way in English — omit the article on both sides for mass/uncountable nouns (e.g. anger, water).",
        inputText,
        { maxTokens: 1500 }
      );
      const translation = cleanTranslation(reply);
      const da = isEnglish ? translation : inputText;
      const en = isEnglish ? inputText : translation;
      // If both sides came back the same, the model didn't actually
      // translate. Treat that as a failure rather than silently showing
      // a broken result.
      if (da && en && da.trim().toLowerCase() === en.trim().toLowerCase()) {
        throw new Error("TRANSLATION_DIDNT_HAPPEN");
      }
      setLookupResult({ da, en });
    } catch (e) {
      setLookupError(apiErrorMessage(e));
    } finally {
      setLookupLoading(false);
    }
  }

  function addLookup() {
    if (!lookupResult || !lookupResult.da || !lookupResult.en) {
      setLookupError("Didn't get a usable translation to add — try translating again.");
      return;
    }
    let catId = lookupCategory;
    if (lookupCategory.startsWith("__new__")) catId = addCategory(lookupCategory.replace("__new__", "") || "Quick lookups");
    const type = (lookupResult.da || "").trim().split(/\s+/).length > 3 ? "sentence" : "word";
    addCards([{ type, front: lookupResult.da, back: lookupResult.en, category: catId }]);
    setLookupResult(null);
  }

  async function analyzeSentence() {
    if (!text.trim()) return;
    setSentenceLoading(true);
    setSentenceError("");
    setSentenceResult(null);
    try {
      const categoryNames = categories.map((c) => c.name).join(", ");
      const reply = await callAI(
        "You are a patient Danish tutor for an intermediate, self-taught learner who has foundational grammar gaps. The user will give you text in English or Danish — anywhere from a single sentence to a longer passage — that they're trying to figure out how to say or understand correctly. " +
          "Cover the WHOLE input, not just the first clause or the first thing that stands out — a longer passage usually has several distinct grammar points worth explaining (word order, tense, a specific construction, an idiom), and you should identify each of them separately rather than picking just one and ignoring the rest. A single short sentence will naturally still just yield one. " +
          "If what they wrote in Danish has a grammar mistake anywhere in it, you must catch it and clearly point out what was wrong and why, referencing the specific part that was incorrect — don't silently correct it without mentioning the error. If they wrote in English, or their Danish was already correct, leave the correction note empty. " +
          "For each distinct grammar point you identify: give it a short name, explain it in plain English in 1-2 sentences ONLY — the single most useful thing to know, not a full breakdown — give the correct Danish sentence that illustrates it (drawn from their input where it fits, or a new one otherwise) with its English translation, provide exactly 1 more example sentence using the same structure in a different context, and suggest the single best-fitting category for it — prefer an existing category if one genuinely fits. Keep the whole response tight — this is a quick, scannable reference, not an essay. " +
          "Existing categories to prefer if one fits: " +
          (categoryNames || "(none yet)") +
          '. \n\nRespond ONLY with JSON in this exact shape, no other text: {"correctionNote": "...", "grammarPoints": [{"grammarName": "...", "explanation": "...", "mainExample": {"da": "...", "en": "..."}, "examples": [{"da":"...","en":"..."}], "suggestedCategory": "..."}]} — correctionNote should be an empty string when there was nothing to correct.',
        text.trim(),
        { maxTokens: 2200 }
      );
      const parsed = parseJSONLoose(reply);
      const points = parsed.grammarPoints || [];
      if (points.length === 0) {
        setSentenceError("Couldn't identify a clear grammar point in that — try rephrasing, or adding a bit more context.");
        return;
      }
      setSentenceResult({ correctionNote: parsed.correctionNote || "", grammarPoints: points });
      const initialSelected = {};
      const initialCategory = {};
      points.forEach((p, i) => {
        initialSelected[i] = { grammar: true, main: true, examples: { 0: true, 1: true } };
        const existing = categories.find((c) => c.name.toLowerCase() === (p.suggestedCategory || "").toLowerCase());
        initialCategory[i] = existing ? existing.id : "__new__" + (p.suggestedCategory || "");
      });
      setSentenceSelected(initialSelected);
      setPointCategory(initialCategory);
    } catch (e) {
      setSentenceError(apiErrorMessage(e));
    } finally {
      setSentenceLoading(false);
    }
  }

  function addSentenceSelected() {
    if (!sentenceResult) return;
    const toAdd = [];
    sentenceResult.grammarPoints.forEach((point, i) => {
      const sel = sentenceSelected[i] || {};
      let catId = pointCategory[i] || "";
      if (catId.startsWith("__new__")) catId = addCategory(catId.replace("__new__", "") || "New grammar point");
      if (sel.grammar) {
        toAdd.push({
          type: "grammar",
          front: point.grammarName,
          back: point.explanation,
          notes: "Example: " + point.mainExample.da + " — " + point.mainExample.en,
          category: catId,
          examples: point.examples,
        });
      }
      if (sel.main) toAdd.push({ type: "sentence", front: point.mainExample.da, back: point.mainExample.en, category: catId });
      (point.examples || []).forEach((ex, j) => {
        if (sel.examples && sel.examples[j]) toAdd.push({ type: "sentence", front: ex.da, back: ex.en, category: catId });
      });
    });
    if (toAdd.length === 0) return;
    addCards(toAdd);
    setSentenceResult(null);
  }

  async function analyzeText() {
    if (!text.trim()) return;
    setAnalyzing(true);
    setError("");
    setAnalysis(null);
    try {
      const categoryNames = categories.map((c) => c.name).join(", ");
      const reply = await callAI(
        "You help an intermediate, self-taught Danish learner understand a piece of Danish text. First, give a natural, fluent English translation of the full passage. Then briefly explain the notable grammar and sentence structures used in this specific passage — reference actual phrases from the text, 2-4 sentences, plain English, no jargon overload. Then suggest the key vocabulary genuinely worth learning from it (not every word), with a natural English translation for each, and the single best-fitting category for each word individually (e.g. by part of speech or topic) — be precise about each word's actual part of speech as used in this passage before choosing a category (don't confuse a verb with an adverb, an adjective with an adverb, or a noun with an adjective) — prefer an existing category if one genuinely fits, otherwise suggest a short new one. Different words in the same passage can and should get different categories — a text usually mixes nouns, verbs, and other parts of speech, so don't give them all the same category.",
        "Text:\n" +
          text.slice(0, 3000) +
          "\n\nExisting categories to prefer if one fits: " +
          (categoryNames || "(none yet)") +
          '\n\nRespond ONLY with JSON, no other text: {"fullTranslation": "...", "grammarNotes": "...", "vocabulary": [{"da": "...", "en": "...", "category": "..."}]}',
        { maxTokens: 2500 }
      );
      const parsed = parseJSONLoose(reply);
      const vocab = parsed.vocabulary || [];
      // Resolve each suggested category name to a real id up front (creating
      // new ones as needed) so each row below can use a plain dropdown
      // rather than its own "new category" flow. Tracked locally so two
      // words suggesting the same new category name share one category
      // instead of creating duplicates.
      const workingCategories = [...categories];
      const sel = {};
      const cats = {};
      vocab.forEach((v) => {
        const name = (v.category || "Uncategorized").trim();
        let existing = workingCategories.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (!existing) {
          const id = addCategory(name);
          existing = { id, name, custom: true };
          workingCategories.push(existing);
        }
        sel[v.da] = true;
        cats[v.da] = existing.id;
      });
      setAnalysis(parsed);
      setSelected(sel);
      setItemCategory(cats);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setAnalyzing(false);
    }
  }

  function addSelectedVocab() {
    if (!analysis) return;
    const toAdd = (analysis.vocabulary || [])
      .filter((v) => selected[v.da])
      .map((v) => ({ type: "word", front: v.da, back: v.en, category: itemCategory[v.da] || categories[0]?.id }));
    if (toAdd.length === 0) return;
    addCards(toAdd);
    setAnalysis(null);
    setSelected({});
    setItemCategory({});
  }

  function clearAll() {
    setText("");
    setLookupResult(null);
    setLookupError("");
    setSentenceResult(null);
    setSentenceSelected({});
    setPointCategory({});
    setSentenceError("");
    setAnalysis(null);
    setSelected({});
    setItemCategory({});
    setError("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  const lookupIsWordLike = lookupResult && lookupResult.da && lookupResult.da.trim().split(/\s+/).length <= 4;

  return (
    <div>
      {(text || lookupResult || sentenceResult || analysis) && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button
            onClick={clearAll}
            style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 12, cursor: "pointer", padding: 4 }}
          >
            <Icon.Trash2 size={12} /> Clear
          </button>
        </div>
      )}
      <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 }}>
        Type or paste anything — a word, a sentence, or a longer passage — then translate it, get the grammar
        explained, or pull out the key vocabulary worth learning from it.
      </div>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = e.target.scrollHeight + "px";
        }}
        placeholder='e.g. "hyggelig", "hvis jeg kunne, ville jeg", or a longer passage…'
        style={{ ...inputStyle, minHeight: 100, overflow: "hidden", resize: "none" }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button
          onClick={translate}
          disabled={!text.trim() || lookupLoading}
          style={{ ...smallBtn("var(--fjord)"), flex: 1, padding: "9px 4px", fontSize: 12.5, display: "flex", justifyContent: "center", alignItems: "center", gap: 5, opacity: text.trim() ? 1 : 0.5 }}
        >
          {lookupLoading ? <Icon.Loader2 size={12} className="spin" /> : null}
          {lookupLoading ? loadingCopy(engine) : "Translate"}
        </button>
        <button
          onClick={analyzeSentence}
          disabled={!text.trim() || sentenceLoading}
          style={{ ...smallBtn("#8C6FA0"), flex: 1, padding: "9px 4px", fontSize: 12.5, display: "flex", justifyContent: "center", alignItems: "center", gap: 5, opacity: text.trim() ? 1 : 0.5 }}
        >
          {sentenceLoading ? <Icon.Loader2 size={12} className="spin" /> : null}
          {sentenceLoading ? loadingCopy(engine) : "Analyze sentence"}
        </button>
        <button
          onClick={analyzeText}
          disabled={!text.trim() || analyzing}
          style={{ ...smallBtn("var(--rust)"), flex: 1, padding: "9px 4px", fontSize: 12.5, display: "flex", justifyContent: "center", alignItems: "center", gap: 5, opacity: text.trim() ? 1 : 0.5 }}
        >
          {analyzing ? <Icon.Loader2 size={12} className="spin" /> : null}
          {analyzing ? loadingCopy(engine) : "Extract text"}
        </button>
      </div>

      <AIErrorNote message={lookupError} onOpenSettings={onOpenSettings} />
      <AIErrorNote message={sentenceError} onOpenSettings={onOpenSettings} />
      <AIErrorNote message={error} onOpenSettings={onOpenSettings} />

      {lookupResult && (
        <div style={{ position: "relative", marginTop: 12, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px" }}>
          {lookupIsWordLike ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--terracotta)" }}>{lookupResult.da}</span>
              {speechSupported() && (
                <button
                  onClick={() => speakDanish(lookupResult.da)}
                  aria-label="Pronounce this"
                  style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
                >
                  <Icon.Volume2 size={17} />
                </button>
              )}
              <button
                onClick={() => openInsight(lookupResult.da, lookupResult.en)}
                aria-label="Explore related words"
                style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
              >
                <Icon.Lightbulb size={17} />
              </button>
            </div>
          ) : (
            speechSupported() && (
              <button
                onClick={() => speakDanish(lookupResult.da)}
                aria-label="Pronounce this"
                style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: "4px 0", fontFamily: "var(--sans)", fontSize: 12, marginBottom: 4 }}
              >
                <Icon.Volume2 size={15} /> Listen to the Danish
              </button>
            )
          )}
          <div style={{ fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.5, marginBottom: 10, color: "var(--sage)", fontStyle: "italic" }}>{lookupResult.en}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <select
                value={lookupCategory.startsWith("__new__") ? "" : lookupCategory}
                onChange={(e) => {
                  if (e.target.value === "__new__cat") {
                    const name = window.prompt ? window.prompt("New category name") : "";
                    if (name && name.trim()) setLookupCategory("__new__" + name.trim());
                    return;
                  }
                  setLookupCategory(e.target.value);
                }}
                style={{ ...inputStyle, width: "auto", padding: "6px 8px", fontSize: 12.5 }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__cat">+ New category…</option>
              </select>
              <button
                onClick={addLookup}
                aria-label="Add word"
                style={{
                  border: "none",
                  background: "var(--rust)",
                  color: "#FBFAF7",
                  borderRadius: 999,
                  width: 30,
                  height: 30,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Icon.Plus size={16} />
              </button>
            </div>
          </div>

          {insightFor && (
            <CenteredOverlay onClose={() => setInsightFor(null)} maxWidth={380}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--terracotta)" }}>{insightFor}</div>
                <button onClick={() => setInsightFor(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
                  <Icon.X size={16} />
                </button>
              </div>
              {insightLoading ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <Icon.Loader2 className="spin" size={18} color="var(--muted)" />
                </div>
              ) : insightError ? (
                <AIErrorNote message={insightError} onOpenSettings={onOpenSettings} />
              ) : (
                <div style={{ background: "var(--paper)", borderRadius: 8, padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55 }}>
                  {insightForms.length > 0 && (
                    <div style={{ marginBottom: insightExplanation ? 10 : 0 }}>
                      {insightForms.map((f, i) => (
                        <div key={i} style={{ marginBottom: 3 }}>
                          <span style={{ color: "var(--terracotta)" }}>{f.da}</span>
                          <span style={{ color: "var(--sage)", fontStyle: "italic" }}> — {f.en}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {insightExplanation && <div style={{ whiteSpace: "pre-wrap" }}>{renderInlineMarkdown(insightExplanation)}</div>}
                </div>
              )}
            </CenteredOverlay>
          )}
        </div>
      )}

      {sentenceResult && (
        <CenteredOverlay onClose={() => setSentenceResult(null)} maxWidth={460}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button onClick={() => setSentenceResult(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          {sentenceResult.correctionNote && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                background: "#FBECE6",
                border: "1px solid var(--rust)",
                borderRadius: 8,
                padding: "9px 11px",
                marginBottom: 12,
              }}
            >
              <Icon.HelpCircle size={15} color="var(--rust)" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontFamily: "var(--sans)", fontSize: 13, lineHeight: 1.45, color: "var(--rust)" }}>{renderInlineMarkdown(sentenceResult.correctionNote)}</span>
            </div>
          )}

          {sentenceResult.grammarPoints.map((point, i) => (
            <div key={i} style={{ borderTop: i > 0 ? "1px solid var(--line)" : "none", paddingTop: i > 0 ? 16 : 0, marginTop: i > 0 ? 16 : 0 }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 17, marginBottom: 6 }}>{point.grammarName}</div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>{renderInlineMarkdown(point.explanation)}</div>

              <label style={rowCheck}>
                <input
                  type="checkbox"
                  checked={!!(sentenceSelected[i] && sentenceSelected[i].grammar)}
                  onChange={(e) => setSentenceSelected({ ...sentenceSelected, [i]: { ...sentenceSelected[i], grammar: e.target.checked } })}
                  style={{ accentColor: "#8C6FA0" }}
                />
                <span style={{ fontFamily: "var(--sans)", fontSize: 12.5 }}>Save this as a grammar card</span>
              </label>

              <div style={{ borderTop: "1px solid var(--line)", margin: "10px 0", paddingTop: 10 }}>
                <label style={rowCheck}>
                  <input
                    type="checkbox"
                    checked={!!(sentenceSelected[i] && sentenceSelected[i].main)}
                    onChange={(e) => setSentenceSelected({ ...sentenceSelected, [i]: { ...sentenceSelected[i], main: e.target.checked } })}
                    style={{ accentColor: "#8C6FA0" }}
                  />
                  <span style={{ fontFamily: "var(--sans)", fontSize: 13.5 }}>
                    <b style={{ color: "var(--terracotta)" }}>{point.mainExample.da}</b> —{" "}
                    <span style={{ color: "var(--sage)" }}>{point.mainExample.en}</span>
                  </span>
                </label>
                {(point.examples || []).map((ex, j) => (
                  <label key={j} style={rowCheck}>
                    <input
                      type="checkbox"
                      checked={!!(sentenceSelected[i] && sentenceSelected[i].examples && sentenceSelected[i].examples[j])}
                      onChange={(e) =>
                        setSentenceSelected({
                          ...sentenceSelected,
                          [i]: { ...sentenceSelected[i], examples: { ...(sentenceSelected[i] && sentenceSelected[i].examples), [j]: e.target.checked } },
                        })
                      }
                      style={{ accentColor: "#8C6FA0" }}
                    />
                    <span style={{ fontFamily: "var(--sans)", fontSize: 13.5 }}>
                      <span style={{ color: "var(--terracotta)" }}>{ex.da}</span> —{" "}
                      <span style={{ color: "var(--sage)" }}>{ex.en}</span>
                    </span>
                  </label>
                ))}
              </div>

              <Field label="Category">
                <CategoryPicker
                  categories={categories}
                  value={(pointCategory[i] || "").startsWith("__new__") ? "" : pointCategory[i] || ""}
                  onChange={(v) => setPointCategory({ ...pointCategory, [i]: v })}
                  allowNew
                  onAddCategory={(name) => addCategory(name)}
                />
                {(pointCategory[i] || "").startsWith("__new__") && (
                  <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--fjord)", marginTop: 4 }}>
                    Will create new category: {(pointCategory[i] || "").replace("__new__", "")}
                  </div>
                )}
              </Field>
            </div>
          ))}

          <button onClick={addSentenceSelected} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "10px", fontSize: 14, marginTop: 16 }}>
            Add selected to deck
          </button>
        </CenteredOverlay>
      )}

      {analysis && (
        <CenteredOverlay onClose={() => setAnalysis(null)} maxWidth={460}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button onClick={() => setAnalysis(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          {analysis.fullTranslation && !lookupResult && (
            <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Translation</div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55, fontStyle: "italic", color: "var(--sage)" }}>{renderInlineMarkdown(analysis.fullTranslation)}</div>
            </div>
          )}
          <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>{renderInlineMarkdown(analysis.grammarNotes)}</div>

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
              Suggested vocabulary — uncheck any you don't want, and adjust the category if it's not quite right.
            </div>
            {(analysis.vocabulary || []).map((v, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <input type="checkbox" checked={!!selected[v.da]} onChange={(e) => setSelected({ ...selected, [v.da]: e.target.checked })} style={{ accentColor: "#8C6FA0" }} />
                  <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, minWidth: 0 }}>
                    <span style={{ color: "var(--terracotta)" }}>{v.da}</span> —{" "}
                    <span style={{ color: "var(--sage)", fontStyle: "italic" }}>{v.en}</span>
                  </span>
                </label>
                <select
                  value={itemCategory[v.da] || ""}
                  onChange={(e) => setItemCategory({ ...itemCategory, [v.da]: e.target.value })}
                  style={{ ...inputStyle, width: "auto", padding: "5px 6px", fontSize: 11.5, flexShrink: 0 }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <button onClick={addSelectedVocab} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "10px", fontSize: 14, marginTop: 12 }}>
            Add selected to deck
          </button>
        </CenteredOverlay>
      )}
    </div>
  );
}

// ---------- Photo import panel (always uses the API — needs vision) ----------

function PhotoPanel({ categories, addCategory, addCards, onOpenSettings }) {
  const [backend, setBackend] = useState(undefined); // "gemini" | "api" | null
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);

  // Extract text (existing vocabulary-extraction flow)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [grammarNotes, setGrammarNotes] = useState("");
  const [selected, setSelected] = useState({});
  const [itemCategory, setItemCategory] = useState({}); // index -> category id, individually suggested per item

  // Translate — same shape/behavior as the text Translate panel, just
  // reading the Danish (or English) text straight out of the photo.
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupCategory, setLookupCategory] = useState(categories[0]?.id || "");

  // Analyze sentence — same grammar-breakdown flow as the text panel.
  const [sentenceLoading, setSentenceLoading] = useState(false);
  const [sentenceError, setSentenceError] = useState("");
  const [sentenceResult, setSentenceResult] = useState(null);
  const [sentenceSelected, setSentenceSelected] = useState({});
  const [pointCategory, setPointCategory] = useState({});

  // Word-insight popup for the Translate result, same as elsewhere.
  const [insightFor, setInsightFor] = useState(null);
  const [insightForms, setInsightForms] = useState([]);
  const [insightExplanation, setInsightExplanation] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

  useEffect(() => {
    (async () => {
      const engine = await getAIEngine();
      const geminiKey = await storeGet("geminiApiKey");
      const anthropicKey = await storeGet("anthropicApiKey");
      if (engine === "gemini" && geminiKey) setBackend("gemini");
      else if (engine === "api") setBackend("api"); // works whether via Claude's own auth or an explicit Anthropic key
      else if (anthropicKey) setBackend("api");
      else if (geminiKey) setBackend("gemini");
      else setBackend(null);
    })();
  }, []);

  const [dragActive, setDragActive] = useState(false);

  function handleFile(f) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setItems([]);
    setGrammarNotes("");
    setLookupResult(null);
    setSentenceResult(null);
    setError("");
    setLookupError("");
    setSentenceError("");
  }

  function pickFile(e) {
    handleFile(e.target.files?.[0]);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const f = Array.from(e.dataTransfer.files || []).find((f) => f.type.startsWith("image/"));
    if (f) handleFile(f);
  }

  function clearAll() {
    setFile(null);
    setPreview(null);
    setItems([]);
    setGrammarNotes("");
    setSelected({});
    setItemCategory({});
    setError("");
    setLookupResult(null);
    setLookupError("");
    setSentenceResult(null);
    setSentenceSelected({});
    setPointCategory({});
    setSentenceError("");
  }

  async function callVision(system, userText) {
    const base64 = await fileToBase64(file);
    const mediaType = file.type || "image/jpeg";
    return backend === "gemini" ? callGeminiImage(system, userText, base64, mediaType) : callClaudeImage(system, userText, base64, mediaType);
  }

  async function openInsight(word, meaning) {
    setInsightFor(word);
    setInsightError("");
    setInsightForms([]);
    setInsightExplanation("");
    setInsightLoading(true);
    try {
      const reply = await callAI(
        WORD_INSIGHT_SYSTEM_PROMPT,
        'Danish word or phrase: "' + word + '"' + (meaning ? " (means: " + meaning + ")" : "") + irregularVerbFactsHint(word) + irregularPluralFactsHint(word),
        { maxTokens: 700 }
      );
      const parsed = parseJSONLoose(reply);
      setInsightForms(parsed.forms || []);
      setInsightExplanation((parsed.explanation || "").trim());
    } catch (e) {
      setInsightError(apiErrorMessage(e));
    } finally {
      setInsightLoading(false);
    }
  }

  async function translate() {
    if (!file) return;
    setLookupLoading(true);
    setLookupError("");
    setLookupResult(null);
    try {
      const reply = await callVision(
        "You translate between Danish and English for a language learner, reading text directly out of a photo (a sign, a book page, an app, packaging). Your first and most important job is to correctly identify which language the text in the image is written in — it will not always be Danish, and treating it as Danish by default is a common mistake to avoid. Then translate it into the other language. If there's more than one distinct piece of text, focus on the single most prominent one. The translation must be ONLY in its target language — never repeat or include the original alongside it. If it's a single Danish noun (on either side), include its grammatical article (en/et) with the Danish form, and match it with a natural English article ('a'/'an') only when the noun is countable that way in English.",
        'Identify the language of the text in this photo, then translate it. Respond ONLY with JSON, no other text: {"detectedLanguage": "da or en", "original": "the text from the photo, in its original language", "translation": "your translation, in the other language"}'
      );
      const parsed = parseJSONLoose(reply);
      const isEnglish = String(parsed.detectedLanguage || "").toLowerCase().startsWith("en");
      const original = cleanTranslation(parsed.original);
      const translation = cleanTranslation(parsed.translation);
      const da = isEnglish ? translation : original;
      const en = isEnglish ? original : translation;
      if (da && en && da.trim().toLowerCase() === en.trim().toLowerCase()) {
        throw new Error("TRANSLATION_DIDNT_HAPPEN");
      }
      setLookupResult({ da, en });
    } catch (e) {
      setLookupError(apiErrorMessage(e));
    } finally {
      setLookupLoading(false);
    }
  }

  function addLookup() {
    if (!lookupResult || !lookupResult.da || !lookupResult.en) {
      setLookupError("Didn't get a usable translation to add — try translating again.");
      return;
    }
    let catId = lookupCategory;
    if (lookupCategory.startsWith("__new__")) catId = addCategory(lookupCategory.replace("__new__", "") || "Quick lookups");
    const type = (lookupResult.da || "").trim().split(/\s+/).length > 3 ? "sentence" : "word";
    addCards([{ type, front: lookupResult.da, back: lookupResult.en, category: catId }]);
    setLookupResult(null);
  }

  async function analyzeSentence() {
    if (!file) return;
    setSentenceLoading(true);
    setSentenceError("");
    setSentenceResult(null);
    try {
      const categoryNames = categories.map((c) => c.name).join(", ");
      const reply = await callVision(
        "You are a patient Danish tutor for an intermediate, self-taught learner who has foundational grammar gaps, reading text directly out of a photo. Cover the whole piece of text visible, not just the first clause — identify each distinct grammar point worth explaining separately rather than picking just one. If there's a grammar mistake anywhere in Danish text shown, point it out clearly and explain why. If the text is English, or the Danish was already correct, leave the correction note empty. " +
          "For each distinct grammar point you identify: give it a short name, explain it in plain English in 1-2 sentences ONLY — the single most useful thing to know, not a full breakdown — give the correct Danish sentence that illustrates it (drawn from the image where it fits, or a new one otherwise) with its English translation, provide exactly 1 more example sentence using the same structure in a different context, and suggest the single best-fitting category for it — prefer an existing category if one genuinely fits. Keep the whole response tight — this is a quick, scannable reference, not an essay. " +
          "Existing categories to prefer if one fits: " +
          (categoryNames || "(none yet)") +
          '. \n\nRespond ONLY with JSON in this exact shape, no other text: {"correctionNote": "...", "grammarPoints": [{"grammarName": "...", "explanation": "...", "mainExample": {"da": "...", "en": "..."}, "examples": [{"da":"...","en":"..."}], "suggestedCategory": "..."}]} — correctionNote should be an empty string when there was nothing to correct.',
        "Analyze the grammar of the text in this photo."
      );
      const parsed = parseJSONLoose(reply);
      const points = parsed.grammarPoints || [];
      if (points.length === 0) {
        setSentenceError("Couldn't identify a clear grammar point in that photo — try a clearer shot, or one with more text.");
        return;
      }
      setSentenceResult({ correctionNote: parsed.correctionNote || "", grammarPoints: points });
      const initialSelected = {};
      const initialCategory = {};
      points.forEach((p, i) => {
        initialSelected[i] = { grammar: true, main: true, examples: { 0: true, 1: true } };
        const existing = categories.find((c) => c.name.toLowerCase() === (p.suggestedCategory || "").toLowerCase());
        initialCategory[i] = existing ? existing.id : "__new__" + (p.suggestedCategory || "");
      });
      setSentenceSelected(initialSelected);
      setPointCategory(initialCategory);
    } catch (e) {
      setSentenceError(apiErrorMessage(e));
    } finally {
      setSentenceLoading(false);
    }
  }

  function addSentenceSelected() {
    if (!sentenceResult) return;
    const toAdd = [];
    sentenceResult.grammarPoints.forEach((point, i) => {
      const sel = sentenceSelected[i] || {};
      let catId = pointCategory[i] || "";
      if (catId.startsWith("__new__")) catId = addCategory(catId.replace("__new__", "") || "New grammar point");
      if (sel.grammar) {
        toAdd.push({
          type: "grammar",
          front: point.grammarName,
          back: point.explanation,
          notes: "Example: " + point.mainExample.da + " — " + point.mainExample.en,
          category: catId,
          examples: point.examples,
        });
      }
      if (sel.main) toAdd.push({ type: "sentence", front: point.mainExample.da, back: point.mainExample.en, category: catId });
      (point.examples || []).forEach((ex, j) => {
        if (sel.examples && sel.examples[j]) toAdd.push({ type: "sentence", front: ex.da, back: ex.en, category: catId });
      });
    });
    if (toAdd.length === 0) return;
    addCards(toAdd);
    setSentenceResult(null);
  }

  async function extract() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const categoryNames = categories.map((c) => c.name).join(", ");
      const system =
        "You help an intermediate self-taught Danish learner build flashcards from photos of text (book pages, signs, notes, apps). First, briefly note any grammar or sentence structures worth pointing out in this specific text (2-3 sentences, plain English) — skip this if the image is just a word list with nothing notable. Then extract every distinct Danish word or sentence visible, with a natural English translation for each, and the single best-fitting category for each item individually (e.g. by part of speech or topic) — be precise about each word's actual part of speech as used here before choosing a category (don't confuse a verb with an adverb, an adjective with an adverb, or a noun with an adjective) — prefer an existing category if one genuinely fits, otherwise suggest a short new one. Different items usually mix nouns, verbs, and other parts of speech, so don't give them all the same category. Keep the vocabulary list focused and useful — skip page numbers, headers, or noise. " +
        'Respond ONLY with JSON, no other text: {"grammarNotes": "...", "items": [{"danish": "...", "english": "...", "type": "word", "category": "..."}]} where "type" is "word" for single words/short phrases and "sentence" for full sentences. Use an empty string for grammarNotes if there is nothing worth noting. ' +
        "Existing categories to prefer if one fits: " +
        (categoryNames || "(none yet)");
      const text = await callVision(system, "Extract Danish vocabulary and sentences from this image.");
      const parsed = parseJSONLoose(text);
      const list = parsed.items || [];
      // Resolve each suggested category name to a real id up front (same
      // approach as the text-extract panel) so each row can use a plain
      // dropdown instead of its own "new category" flow.
      const workingCategories = [...categories];
      const sel = {};
      const cats = {};
      list.forEach((it, i) => {
        const name = (it.category || "Uncategorized").trim();
        let existing = workingCategories.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (!existing) {
          const id = addCategory(name);
          existing = { id, name, custom: true };
          workingCategories.push(existing);
        }
        sel[i] = true;
        cats[i] = existing.id;
      });
      setItems(list);
      setGrammarNotes(parsed.grammarNotes || "");
      setSelected(sel);
      setItemCategory(cats);
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function addSelected() {
    const toAdd = items
      .filter((_, i) => selected[i])
      .map((it, i) => ({ type: it.type === "sentence" ? "sentence" : "word", front: it.danish, back: it.english, category: itemCategory[i] || categories[0]?.id }));
    if (toAdd.length === 0) return;
    addCards(toAdd);
    setItems([]);
    setGrammarNotes("");
  }

  if (backend === undefined) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <Icon.Loader2 className="spin" size={18} color="var(--muted)" />
      </div>
    );
  }

  if (backend === null) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}>
        <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>
          Photo import needs a Gemini or Anthropic API key even if you're using the local model elsewhere — reading
          images needs a bigger model than fits in a browser tab. Gemini's key is free.
        </div>
        <button onClick={onOpenSettings} style={smallBtn("var(--rust)")}>
          Open AI settings
        </button>
      </div>
    );
  }

  const lookupIsWordLike = lookupResult && lookupResult.da && lookupResult.da.trim().split(/\s+/).length <= 4;

  return (
    <div>
      {(file || items.length > 0 || lookupResult || sentenceResult) && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button
            onClick={clearAll}
            style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", color: "var(--muted)", fontFamily: "var(--sans)", fontSize: 12, cursor: "pointer", padding: 4 }}
          >
            <Icon.Trash2 size={12} /> Clear
          </button>
        </div>
      )}
      <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Choose or take a photo of Danish text — a book, an app, a sign — then translate it, get the grammar
        explained, or pull out the key vocabulary worth learning from it.
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          border: dragActive ? "2px dashed var(--fjord)" : "1px dashed var(--line)",
          background: dragActive ? "#EEF2F0" : "var(--card)",
          borderRadius: 10,
          padding: preview ? 8 : 28,
          fontFamily: "var(--sans)",
          fontSize: 13.5,
          color: "var(--muted)",
          cursor: "pointer",
          textAlign: "center",
        }}
      >
        <input
          type="file"
          accept="image/*"
          onChange={pickFile}
          style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}
        />
        {preview ? (
          <img src={preview} alt="Selected photo" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 6 }} />
        ) : (
          <>
            <Icon.Upload size={20} style={{ marginBottom: 6 }} />
            <div>Tap to choose a photo or screenshot, or drag one here</div>
          </>
        )}
      </label>

      {!preview && isMobileDevice() && (
        <label
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: "100%",
            border: "1px solid var(--line)",
            background: "var(--card)",
            borderRadius: 10,
            padding: "10px",
            marginTop: 8,
            fontFamily: "var(--sans)",
            fontSize: 13.5,
            color: "var(--muted)",
            cursor: "pointer",
          }}
        >
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={pickFile}
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}
          />
          <Icon.Camera size={15} />
          Take a photo
        </label>
      )}

      {file && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button
            onClick={translate}
            disabled={lookupLoading}
            style={{ ...smallBtn("var(--fjord)"), flex: 1, padding: "9px 4px", fontSize: 12.5, display: "flex", justifyContent: "center", alignItems: "center", gap: 5 }}
          >
            {lookupLoading ? <Icon.Loader2 size={12} className="spin" /> : null}
            {lookupLoading ? "Reading…" : "Translate"}
          </button>
          <button
            onClick={analyzeSentence}
            disabled={sentenceLoading}
            style={{ ...smallBtn("#8C6FA0"), flex: 1, padding: "9px 4px", fontSize: 12.5, display: "flex", justifyContent: "center", alignItems: "center", gap: 5 }}
          >
            {sentenceLoading ? <Icon.Loader2 size={12} className="spin" /> : null}
            {sentenceLoading ? "Reading…" : "Analyze sentence"}
          </button>
          <button
            onClick={extract}
            disabled={loading}
            style={{ ...smallBtn("var(--rust)"), flex: 1, padding: "9px 4px", fontSize: 12.5, display: "flex", justifyContent: "center", alignItems: "center", gap: 5 }}
          >
            {loading ? <Icon.Loader2 size={12} className="spin" /> : null}
            {loading ? "Reading…" : "Extract text"}
          </button>
        </div>
      )}

      <AIErrorNote message={lookupError} onOpenSettings={onOpenSettings} />
      <AIErrorNote message={sentenceError} onOpenSettings={onOpenSettings} />
      <AIErrorNote message={error} onOpenSettings={onOpenSettings} />

      {lookupResult && (
        <div style={{ position: "relative", marginTop: 12, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px" }}>
          {lookupIsWordLike ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--terracotta)" }}>{lookupResult.da}</span>
              {speechSupported() && (
                <button
                  onClick={() => speakDanish(lookupResult.da)}
                  aria-label="Pronounce this"
                  style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
                >
                  <Icon.Volume2 size={17} />
                </button>
              )}
              <button
                onClick={() => openInsight(lookupResult.da, lookupResult.en)}
                aria-label="Explore related words"
                style={{ border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}
              >
                <Icon.Lightbulb size={17} />
              </button>
            </div>
          ) : (
            speechSupported() && (
              <button
                onClick={() => speakDanish(lookupResult.da)}
                aria-label="Pronounce this"
                style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "none", color: "var(--muted)", cursor: "pointer", padding: "4px 0", fontFamily: "var(--sans)", fontSize: 12, marginBottom: 4 }}
              >
                <Icon.Volume2 size={15} /> Listen to the Danish
              </button>
            )
          )}
          <div style={{ fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.5, marginBottom: 10, color: "var(--sage)", fontStyle: "italic" }}>{lookupResult.en}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
            <select
              value={lookupCategory.startsWith("__new__") ? "" : lookupCategory}
              onChange={(e) => {
                if (e.target.value === "__new__cat") {
                  const name = window.prompt ? window.prompt("New category name") : "";
                  if (name && name.trim()) setLookupCategory("__new__" + name.trim());
                  return;
                }
                setLookupCategory(e.target.value);
              }}
              style={{ ...inputStyle, width: "auto", padding: "6px 8px", fontSize: 12.5 }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new__cat">+ New category…</option>
            </select>
            <button
              onClick={addLookup}
              aria-label="Add word"
              style={{ border: "none", background: "var(--rust)", color: "#FBFAF7", borderRadius: 999, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <Icon.Plus size={16} />
            </button>
          </div>

          {insightFor && (
            <CenteredOverlay onClose={() => setInsightFor(null)} maxWidth={380}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 16, color: "var(--terracotta)" }}>{insightFor}</div>
                <button onClick={() => setInsightFor(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
                  <Icon.X size={16} />
                </button>
              </div>
              {insightLoading ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <Icon.Loader2 className="spin" size={18} color="var(--muted)" />
                </div>
              ) : insightError ? (
                <AIErrorNote message={insightError} onOpenSettings={onOpenSettings} />
              ) : (
                <div style={{ background: "var(--paper)", borderRadius: 8, padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55 }}>
                  {insightForms.length > 0 && (
                    <div style={{ marginBottom: insightExplanation ? 10 : 0 }}>
                      {insightForms.map((f, i) => (
                        <div key={i} style={{ marginBottom: 3 }}>
                          <span style={{ color: "var(--terracotta)" }}>{f.da}</span>
                          <span style={{ color: "var(--sage)", fontStyle: "italic" }}> — {f.en}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {insightExplanation && <div style={{ whiteSpace: "pre-wrap" }}>{renderInlineMarkdown(insightExplanation)}</div>}
                </div>
              )}
            </CenteredOverlay>
          )}
        </div>
      )}

      {sentenceResult && (
        <CenteredOverlay onClose={() => setSentenceResult(null)} maxWidth={460}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button onClick={() => setSentenceResult(null)} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          {sentenceResult.correctionNote && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                background: "#FBECE6",
                border: "1px solid var(--rust)",
                borderRadius: 8,
                padding: "9px 11px",
                marginBottom: 12,
              }}
            >
              <Icon.HelpCircle size={15} color="var(--rust)" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontFamily: "var(--sans)", fontSize: 13, lineHeight: 1.45, color: "var(--rust)" }}>{renderInlineMarkdown(sentenceResult.correctionNote)}</span>
            </div>
          )}
          {sentenceResult.grammarPoints.map((point, i) => (
            <div key={i} style={{ borderTop: i > 0 ? "1px solid var(--line)" : "none", paddingTop: i > 0 ? 16 : 0, marginTop: i > 0 ? 16 : 0 }}>
              <div style={{ fontFamily: "var(--serif)", fontSize: 17, marginBottom: 6 }}>{point.grammarName}</div>
              <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>{renderInlineMarkdown(point.explanation)}</div>
              <label style={rowCheck}>
                <input
                  type="checkbox"
                  checked={!!(sentenceSelected[i] && sentenceSelected[i].grammar)}
                  onChange={(e) => setSentenceSelected({ ...sentenceSelected, [i]: { ...sentenceSelected[i], grammar: e.target.checked } })}
                  style={{ accentColor: "#8C6FA0" }}
                />
                <span style={{ fontFamily: "var(--sans)", fontSize: 12.5 }}>Save this as a grammar card</span>
              </label>
              <div style={{ borderTop: "1px solid var(--line)", margin: "10px 0", paddingTop: 10 }}>
                <label style={rowCheck}>
                  <input
                    type="checkbox"
                    checked={!!(sentenceSelected[i] && sentenceSelected[i].main)}
                    onChange={(e) => setSentenceSelected({ ...sentenceSelected, [i]: { ...sentenceSelected[i], main: e.target.checked } })}
                    style={{ accentColor: "#8C6FA0" }}
                  />
                  <span style={{ fontFamily: "var(--sans)", fontSize: 13.5 }}>
                    <b style={{ color: "var(--terracotta)" }}>{point.mainExample.da}</b> — <span style={{ color: "var(--sage)" }}>{point.mainExample.en}</span>
                  </span>
                </label>
                {(point.examples || []).map((ex, j) => (
                  <label key={j} style={rowCheck}>
                    <input
                      type="checkbox"
                      checked={!!(sentenceSelected[i] && sentenceSelected[i].examples && sentenceSelected[i].examples[j])}
                      onChange={(e) =>
                        setSentenceSelected({
                          ...sentenceSelected,
                          [i]: { ...sentenceSelected[i], examples: { ...(sentenceSelected[i] && sentenceSelected[i].examples), [j]: e.target.checked } },
                        })
                      }
                      style={{ accentColor: "#8C6FA0" }}
                    />
                    <span style={{ fontFamily: "var(--sans)", fontSize: 13.5 }}>
                      <span style={{ color: "var(--terracotta)" }}>{ex.da}</span> — <span style={{ color: "var(--sage)" }}>{ex.en}</span>
                    </span>
                  </label>
                ))}
              </div>
              <Field label="Category">
                <CategoryPicker
                  categories={categories}
                  value={(pointCategory[i] || "").startsWith("__new__") ? "" : pointCategory[i] || ""}
                  onChange={(v) => setPointCategory({ ...pointCategory, [i]: v })}
                  allowNew
                  onAddCategory={(name) => addCategory(name)}
                />
                {(pointCategory[i] || "").startsWith("__new__") && (
                  <div style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--fjord)", marginTop: 4 }}>
                    Will create new category: {(pointCategory[i] || "").replace("__new__", "")}
                  </div>
                )}
              </Field>
            </div>
          ))}
          <button onClick={addSentenceSelected} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "10px", fontSize: 14, marginTop: 16 }}>
            Add selected to deck
          </button>
        </CenteredOverlay>
      )}

      {items.length > 0 && (
        <CenteredOverlay onClose={() => setItems([])} maxWidth={460}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
            <button onClick={() => setItems([])} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: "var(--muted)" }}>
              <Icon.X size={18} />
            </button>
          </div>
          {grammarNotes && (
            <div style={{ fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.5, marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
              {renderInlineMarkdown(grammarNotes)}
            </div>
          )}
          <div style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
            Found {items.length} item{items.length === 1 ? "" : "s"} — uncheck any you don't want, and adjust the category if it's not quite right.
          </div>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                <input type="checkbox" checked={!!selected[i]} onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })} style={{ accentColor: "#8C6FA0" }} />
                <span style={{ fontFamily: "var(--sans)", fontSize: 13.5, minWidth: 0 }}>
                  <span style={{ color: "var(--terracotta)" }}>{it.danish}</span> — <span style={{ color: "var(--sage)", fontStyle: "italic" }}>{it.english}</span>
                </span>
              </label>
              <select
                value={itemCategory[i] || ""}
                onChange={(e) => setItemCategory({ ...itemCategory, [i]: e.target.value })}
                style={{ ...inputStyle, width: "auto", padding: "5px 6px", fontSize: 11.5, flexShrink: 0 }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button onClick={addSelected} style={{ ...smallBtn("var(--rust)"), width: "100%", padding: "10px", fontSize: 14, marginTop: 6 }}>
            Add selected to deck
          </button>
        </CenteredOverlay>
      )}
    </div>
  );
}

// ---------- Category suggestions panel ----------


