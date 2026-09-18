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

async function persistWithRetry(key, value) {
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
  "More Verbs": "Basic Verbs",
  "Common Actions": "Basic Verbs",
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

// Preloaded starter vocabulary — no AI involved. Written once, works
// instantly offline, and never costs a request. Roughly 1,350 words
// across 16 themes; ask to expand any category and more can be added
// later the same way.
const STARTER_WORDS = {
  "Basic Verbs": [
    ["være","to be"],["have","to have"],["blive","to become / stay"],["gøre","to do"],["kunne","can / to be able to"],
    ["skulle","shall / should"],["ville","to want to / will"],["måtte","must / may"],["få","to get"],["give","to give"],
    ["tage","to take"],["komme","to come"],["gå","to go / walk"],["se","to see"],["vide","to know (a fact)"],
    ["kende","to know (a person/place)"],["sige","to say"],["tale","to speak"],["tro","to believe"],["tænke","to think"],
    ["synes","to think (an opinion)"],["mene","to mean / think"],["finde","to find"],["lave","to make / do"],["spise","to eat"],
    ["drikke","to drink"],["sove","to sleep"],["vågne","to wake up"],["stå","to stand"],["sidde","to sit"],
    ["ligge","to lie down"],["løbe","to run"],["køre","to drive"],["flyve","to fly"],["svømme","to swim"],
    ["læse","to read"],["skrive","to write"],["lytte","to listen"],["høre","to hear"],["kigge","to look"],
    ["vise","to show"],["forstå","to understand"],["lære","to learn"],["undervise","to teach"],["studere","to study"],
    ["arbejde","to work"],["spille","to play (game/instrument)"],["lege","to play (children)"],["vinde","to win"],["tabe","to lose"],
    ["prøve","to try"],["øve","to practice"],["begynde","to begin"],["starte","to start"],["stoppe","to stop"],
    ["slutte","to end / finish"],["fortsætte","to continue"],["vente","to wait"],["håbe","to hope"],["ønske","to wish"],
    ["elske","to love"],["kunne lide","to like"],["hade","to hate"],["savne","to miss"],["huske","to remember"],
    ["glemme","to forget"],["forklare","to explain"],["spørge","to ask"],["svare","to answer"],["bede","to ask / pray"],
    ["takke","to thank"],["undskylde","to apologize"],["hjælpe","to help"],["bruge","to use"],["betale","to pay"],
    ["koste","to cost"],["sælge","to sell"],["købe","to buy"],["låne","to borrow / lend"],["sende","to send"],
    ["modtage","to receive"],["ringe","to call (phone)"],["besøge","to visit"],["rejse","to travel"],["flytte","to move"],
    ["bo","to live / reside"],["bygge","to build"],["reparere","to repair"],["ødelægge","to destroy / break"],["åbne","to open"],
    ["lukke","to close"],["slukke","to turn off"],["tænde","to turn on"],["skifte","to change / switch"],["ændre","to change / alter"],
    ["vokse","to grow"],["falde","to fall"],["hoppe","to jump"],["danse","to dance"],["synge","to sing"],
    ["grine","to laugh"],["græde","to cry"],["smile","to smile"],["råbe","to shout"],["hviske","to whisper"],
    ["passe","to fit / suit"],["invitere","to invite"],["acceptere","to accept"],["nægte","to refuse"],["tillade","to allow"],
    ["kræve","to require"],["foreslå","to suggest"],["bestemme","to decide"],["vælge","to choose"],["planlægge","to plan"],
    ["forberede","to prepare"],["vaske","to wash"],["male","to paint"],["tegne","to draw"],["optage","to record"],
    ["ansætte","to hire"],["søge","to search / apply"],["holde","to hold / keep"],["miste","to lose (something)"],["dele","to share / divide"],
    ["samle","to gather / collect"],["sætte","to put / place"],["lægge","to lay down"],["forsøge","to attempt"],["anbefale","to recommend"],
    ["overveje","to consider"],["beslutte","to decide"],["undgå","to avoid"],["forhindre","to prevent"],["love","to promise"],
    ["true","to threaten"],["advare","to warn"],["overtale","to persuade"],["overbevise","to convince"],["påvirke","to influence"],
    ["forbedre","to improve"],["forværre","to worsen"],["forandre","to change"],["udvikle","to develop"],["forsvinde","to disappear"],
    ["dukke op","to show up"],["opdage","to discover"],["afsløre","to reveal"],["skjule","to hide"],["gemme","to save/hide"],
    ["bekræfte","to confirm"],["benægte","to deny"],["klage","to complain"],["reagere","to react"],["handle","to act"],
    ["undlade","to omit"],["overtage","to take over"],["deltage","to participate"],["rive ned","to tear down"],["sprede","to spread"],
    ["forene","to unite"],["adskille","to separate"],["forbinde","to connect"],["afbryde","to interrupt"],["genoptage","to resume"],
    ["udsætte","to postpone"],["fremskynde","to speed up"],["bremse","to slow down"],["forsinke","to delay"],["organisere","to organize"],
    ["gennemføre","to carry out"],["opnå","to achieve"],["mislykkes","to fail"],["lykkes","to succeed"],["prøve på","to try on"],
    ["teste","to test"],["måle","to measure"],["veje","to weigh"],["tælle","to count"],["beregne","to calculate"],
    ["anslå","to estimate"],
  ],
  "Common Nouns": [
    ["et hus","a house"],["en bil","a car"],["en by","a town"],["et land","a country"],["en verden","a world"],
    ["en gade","a street"],["en vej","a road"],["et hjem","a home"],["en dør","a door"],["et vindue","a window"],
    ["et bord","a table"],["en stol","a chair"],["en seng","a bed"],["et skab","a cupboard"],["et gulv","a floor"],
    ["et loft","a ceiling / attic"],["en væg","a wall"],["et tag","a roof"],["en have","a garden"],["en skov","a forest"],
    ["en sø","a lake"],["et hav","a sea"],["en strand","a beach"],["et bjerg","a mountain"],["en bro","a bridge"],
    ["en park","a park"],["en butik","a shop"],["et marked","a market"],["et kontor","an office"],["en skole","a school"],
    ["et universitet","a university"],["et sygehus","a hospital"],["en kirke","a church"],["et museum","a museum"],["et bibliotek","a library"],
    ["en restaurant","a restaurant"],["en café","a café"],["et hotel","a hotel"],["en lufthavn","an airport"],["en station","a station"],
    ["et tog","a train"],["en bus","a bus"],["et fly","a plane"],["et skib","a ship"],["en cykel","a bicycle"],
    ["penge","money"],["en krone","a crown (currency)"],["en regning","a bill"],["en pris","a price"],["en tid","a time"],
    ["en dag","a day"],["en uge","a week"],["en måned","a month"],["et år","a year"],["en time","an hour"],
    ["et minut","a minute"],["et sekund","a second"],["en morgen","a morning"],["en aften","an evening"],["en nat","a night"],
    ["en sommer","a summer"],["en vinter","a winter"],["et forår","a spring"],["et efterår","an autumn"],["vejr","weather"],
    ["en sol","a sun"],["en måne","a moon"],["en stjerne","a star"],["en himmel","a sky"],["en sky","a cloud"],
    ["regn","rain"],["sne","snow"],["en vind","wind"],["luft","air"],["vand","water"],
    ["ild","fire"],["jord","earth / soil"],["en sten","a stone"],["et træ","a tree / wood"],["en blomst","a flower"],
    ["græs","grass"],["et dyr","an animal"],["en hund","a dog"],["en kat","a cat"],["en fugl","a bird"],
    ["en fisk","a fish"],["en hest","a horse"],["en ko","a cow"],["en gris","a pig"],["et får","a sheep"],
    ["en mus","a mouse"],["et navn","a name"],["et ord","a word"],["et sprog","a language"],["en bog","a book"],
    ["en avis","a newspaper"],["et blad","a magazine"],["et brev","a letter"],["en historie","a story / history"],["en idé","an idea"],
    ["et spørgsmål","a question"],["et svar","an answer"],["et problem","a problem"],["en løsning","a solution"],["en grund","a reason"],
    ["en måde","a way / manner"],["et sted","a place"],["en retning","a direction"],["en side","a page / side"],["en del","a part"],
    ["et stykke","a piece"],["en ting","a thing"],["en sag","a matter / case"],["en person","a person"],["et menneske","a human being"],
    ["et folk","a people"],["et samfund","a society"],["en regering","a government"],["en politik","a policy"],["en lov","a law"],
    ["en ret","a right / dish"],["et job","a job"],["et firma","a company"],["en virksomhed","a business"],["en chef","a boss"],
    ["en kollega","a colleague"],["et møde","a meeting"],["en aftale","an appointment / agreement"],["en plan","a plan"],["et mål","a goal"],
    ["en drøm","a dream"],["et håb","hope"],["en frygt","fear"],["en glæde","joy"],["en sorg","sorrow"],
    ["en kærlighed","love"],["et venskab","friendship"],["en familie","a family"],["en ven","a friend"],["en fjende","an enemy"],
    ["en gæst","a guest"],["en nabo","a neighbor"],["en fremmed","a stranger"],["et arbejde","a job / work"],["en arbejdsgiver","an employer"],
    ["en ekspert","an expert"],["en amatør","an amateur"],["en begynder","a beginner"],["en veteran","a veteran"],["en repræsentant","a representative"],
    ["en talsperson","a spokesperson"],["en deltager","a participant"],["en tilhænger","a supporter"],["en kritiker","a critic"],["en beundrer","an admirer"],
    ["en autoritet","an authority"],["en myndighed","an authority/agency"],["en embedsmand","a civil servant"],["en iværksætter","an entrepreneur"],["en ejer","an owner"],
  ],
  "Adjectives": [
    ["stor","big"],["lille","small"],["lang","long"],["kort","short"],["høj","tall / high"],
    ["lav","low"],["tyk","thick / fat"],["tynd","thin"],["bred","wide"],["smal","narrow"],
    ["dyb","deep"],["ny","new"],["gammel","old"],["ung","young"],["god","good"],
    ["dårlig","bad"],["rigtig","correct / real"],["forkert","wrong"],["let","easy / light"],["svær","difficult"],
    ["tung","heavy"],["hurtig","fast"],["langsom","slow"],["varm","warm"],["kold","cold"],
    ["tør","dry"],["våd","wet"],["ren","clean"],["beskidt","dirty"],["smuk","beautiful"],
    ["grim","ugly"],["pæn","nice / neat"],["sød","sweet / cute"],["sur","sour / grumpy"],["bitter","bitter"],
    ["rig","rich"],["fattig","poor"],["dyr","expensive"],["billig","cheap"],["fri","free"],
    ["optaget","busy / occupied"],["træt","tired"],["vågen","awake"],["sulten","hungry"],["tørstig","thirsty"],
    ["mæt","full / satisfied"],["syg","sick"],["rask","healthy / recovered"],["stærk","strong"],["svag","weak"],
    ["glad","happy"],["ked af det","sad"],["vred","angry"],["bange","afraid"],["nervøs","nervous"],
    ["rolig","calm"],["stille","quiet"],["højlydt","loud"],["venlig","kind / friendly"],["uhøflig","rude"],
    ["ærlig","honest"],["utrolig","unbelievable"],["sikker","sure / safe"],["usikker","unsure"],["vigtig","important"],
    ["interessant","interesting"],["kedelig","boring"],["sjov","fun"],["morsom","funny / amusing"],["alvorlig","serious"],
    ["enkel","simple"],["kompliceret","complicated"],["klar","ready / clear"],["færdig","finished / done"],["åben","open"],
    ["lukket","closed"],["tom","empty"],["fuld","full"],["mørk","dark"],["lys","light / bright"],
    ["farverig","colorful"],["hvid","white"],["sort","black"],["rød","red"],["blå","blue"],
    ["grøn","green"],["gul","yellow"],["grå","gray"],["brun","brown"],["lige","straight / equal"],
    ["skæv","crooked"],["flot","handsome / nice-looking"],["fantastisk","fantastic"],["forfærdelig","terrible"],["heldig","lucky"],
    ["uheldig","unlucky"],["populær","popular"],["berømt","famous"],["ukendt","unknown"],["speciel","special"],
    ["normal","normal"],["mærkelig","strange"],["typisk","typical"],["muligt","possible"],["umuligt","impossible"],
    ["nødvendig","necessary"],["passende","suitable"],["praktisk","practical"],["moderne","modern"],["gammeldags","old-fashioned"],
    ["orange","orange"],["lilla","purple"],["lyserød","pink"],["lyseblå","light blue"],["mørkeblå","dark blue"],
    ["rund","round"],["firkantet","square-shaped"],["stribet","striped"],["ternet","checkered / plaid"],["ensfarvet","solid-colored"],
    ["betydelig","significant"],["tilstrækkelig","sufficient"],["upassende","inappropriate"],["rimelig","reasonable"],["urimelig","unreasonable"],
    ["effektiv","efficient"],["ineffektiv","inefficient"],["kompleks","complex"],["tydelig","clear"],["utydelig","unclear"],
    ["konkret","concrete"],["abstrakt","abstract"],["åbenlys","obvious"],["uundgåelig","inevitable"],["afgørende","decisive"],
    ["unødvendig","unnecessary"],["frivillig","voluntary"],["obligatorisk","mandatory"],["midlertidig","temporary"],["permanent","permanent"],
    ["konstant","constant"],["stabil","stable"],["ustabil","unstable"],["tålmodig","patient"],["utålmodig","impatient"],
    ["uærlig","dishonest"],["mistænksom","suspicious"],["naiv","naive"],["fordomsfri","unbiased"],["fordomsfuld","prejudiced"],
    ["solid","solid"],["skrøbelig","fragile"],["holdbar","durable"],["slidt","worn"],["intakt","intact"],
    ["beskadiget","damaged"],["defekt","defective"],["fejlfri","flawless"],["original","original"],["ægte","genuine"],
    ["falsk","fake"],["autentisk","authentic"],["tidssvarende","up to date"],["forældet","outdated"],["upopulær","unpopular"],
    ["almindelig","ordinary"],["usædvanlig","unusual"],["ekstraordinær","extraordinary"],["bemærkelsesværdig","remarkable"],["ubetydelig","insignificant"],
    ["relevant","relevant"],["irrelevant","irrelevant"],
  ],
  "Numbers & Time": [
    ["en / et","one"],["to","two"],["tre","three"],["fire","four"],["fem","five"],
    ["seks","six"],["syv","seven"],["otte","eight"],["ni","nine"],["ti","ten"],
    ["elleve","eleven"],["tolv","twelve"],["tretten","thirteen"],["fjorten","fourteen"],["femten","fifteen"],
    ["seksten","sixteen"],["sytten","seventeen"],["atten","eighteen"],["nitten","nineteen"],["tyve","twenty"],
    ["tredive","thirty"],["fyrre","forty"],["halvtreds","fifty"],["tres","sixty"],["halvfjerds","seventy"],
    ["firs","eighty"],["halvfems","ninety"],["hundrede","hundred"],["tusind","thousand"],["million","million"],
    ["første","first"],["anden","second"],["tredje","third"],["fjerde","fourth"],["femte","fifth"],
    ["sidste","last"],["mandag","Monday"],["tirsdag","Tuesday"],["onsdag","Wednesday"],["torsdag","Thursday"],
    ["fredag","Friday"],["lørdag","Saturday"],["søndag","Sunday"],["januar","January"],["februar","February"],
    ["marts","March"],["april","April"],["maj","May"],["juni","June"],["juli","July"],
    ["august","August"],["september","September"],["oktober","October"],["november","November"],["december","December"],
    ["i dag","today"],["i morgen","tomorrow"],["i går","yesterday"],["nu","now"],["senere","later"],
    ["snart","soon"],["altid","always"],["aldrig","never"],["nogle gange","sometimes"],["ofte","often"],
    ["sjældent","rarely"],["tidligt","early"],["sent","late"],["klokken","the clock / o'clock"],["halv","half"],
    ["kvart","quarter"],["en weekend","a weekend"],["en ferie","a vacation"],["en fødselsdag","a birthday"],["et øjeblik","a moment"],
    ["en periode","a period"],["øjeblikkeligt","immediately"],["straks","right away"],["længe","for a long time"],["endnu","yet / still"],
    ["allerede","already"],["nul","zero"],["i sidste ende","in the end"],["i første omgang","at first"],["efterhånden","gradually"],
    ["pludselig","suddenly"],["i forvejen","in advance"],["bagefter","afterwards"],["undervejs","along the way"],["indtil videre","so far"],
    ["fra nu af","from now on"],["indtil nu","until now"],["for evigt","forever"],["lejlighedsvis","occasionally"],["regelmæssigt","regularly"],
    ["af og til","now and then"],["samtidig","simultaneously"],["forinden","beforehand"],["efterfølgende","subsequently"],["i fremtiden","in the future"],
    ["i fortiden","in the past"],["nutildags","nowadays"],["en cirkel","a circle"],["et kvadrat","a square"],["en trekant","a triangle"],
    ["en firkant","a rectangle"],["en linje","a line"],["en kant","an edge"],["et hjørne","a corner"],["en længde","a length"],
    ["en bredde","a width"],["en højde","a height"],["en dybde","a depth"],["en vægt","a weight"],["et rumfang","a volume"],
    ["en diameter","a diameter"],["en afstand","a distance"],["en vinkel","an angle"],["en procent","a percentage"],["en brøk","a fraction"],
    ["et gennemsnit","an average"],["en mængde","an amount"],
  ],
  "Family & People": [
    ["en mor","a mother"],["en far","a father"],["forældre","parents"],["et barn","a child"],["en søn","a son"],
    ["en datter","a daughter"],["en bror","a brother"],["en søster","a sister"],["en bedstemor","a grandmother"],["en bedstefar","a grandfather"],
    ["et barnebarn","a grandchild"],["en tante","an aunt"],["en onkel","an uncle"],["en fætter","a male cousin"],["en kusine","a female cousin"],
    ["en nevø","a nephew"],["en niece","a niece"],["en mand","a husband / man"],["en kone","a wife"],["en ægtefælle","a spouse"],
    ["en kæreste","a girlfriend / boyfriend"],["en veninde","a female friend"],["en bekendt","an acquaintance"],["en svigermor","a mother-in-law"],["en svigerfar","a father-in-law"],
    ["en stedmor","a stepmother"],["en stedfar","a stepfather"],["en tvilling","a twin"],["en baby","a baby"],["en voksen","an adult"],
    ["en teenager","a teenager"],["en dreng","a boy"],["en pige","a girl"],["en kvinde","a woman"],["en forfatter","an author"],
    ["en læge","a doctor"],["en sygeplejerske","a nurse"],["en lærer","a teacher"],["en elev","a pupil"],["en studerende","a student"],
    ["en professor","a professor"],["en advokat","a lawyer"],["en politibetjent","a police officer"],["en brandmand","a firefighter"],["en sælger","a salesperson"],
    ["en kunde","a customer"],["en chauffør","a driver"],["en kok","a chef"],["en tjener","a waiter"],["en håndværker","a craftsman"],
    ["en ingeniør","an engineer"],["en programmør","a programmer"],["en kunstner","an artist"],["en musiker","a musician"],["en skuespiller","an actor"],
    ["en journalist","a journalist"],["en præst","a priest"],["en soldat","a soldier"],["en bonde","a farmer"],["en fisker","a fisherman"],
    ["en direktør","a director / CEO"],["en statsminister","a prime minister"],["en borgmester","a mayor"],["en turist","a tourist"],["et medlem","a member"],
    ["en leder","a leader"],["en medarbejder","an employee"],["en pensionist","a retiree"],["et kærlighedsforhold","a romantic relationship"],["en date","a date"],
    ["et ægteskab","a marriage"],["en skilsmisse","a divorce"],["en forlovelse","an engagement"],["et bryllup","a wedding"],["et jubilæum","an anniversary"],
    ["en fest","a party"],["en invitation","an invitation"],["en vært","a host"],["et selskab","a company/gathering"],["en underordnet","a subordinate"],
    ["en misforståelse","a misunderstanding"],["et skænderi","an argument"],["en forsoning","a reconciliation"],["en undskyldning","an apology"],["en tilgivelse","a forgiveness"],
    ["en loyalitet","a loyalty"],["en flirt","a flirt"],["en eks","an ex"],["en gensidighed","a mutuality"],["en fortrolighed","an intimacy"],
    ["en sladder","gossip"],["et rygte","a rumor"],
  ],
  "Food & Drink": [
    ["mad","food"],["en morgenmad","breakfast"],["en frokost","lunch"],["en aftensmad","dinner"],["et måltid","a meal"],
    ["et brød","bread"],["et rugbrød","rye bread"],["smør","butter"],["en ost","cheese"],["mælk","milk"],
    ["en fløde","cream"],["et æg","an egg"],["kød","meat"],["oksekød","beef"],["svinekød","pork"],
    ["en kylling","chicken"],["en pølse","a sausage"],["en laks","salmon"],["en reje","a shrimp"],["ris","rice"],
    ["pasta","pasta"],["en kartoffel","a potato"],["en grøntsag","a vegetable"],["en gulerod","a carrot"],["et løg","an onion"],
    ["et hvidløg","garlic"],["en tomat","a tomato"],["en agurk","a cucumber"],["en salat","a salad / lettuce"],["en frugt","a fruit"],
    ["et æble","an apple"],["en banan","a banana"],["en appelsin","an orange"],["en citron","a lemon"],["et jordbær","a strawberry"],
    ["en vindrue","a grape"],["en pære","a pear"],["en nød","a nut"],["en mandel","an almond"],["en suppe","a soup"],
    ["en sovs","a sauce / gravy"],["et krydderi","a spice"],["peber","pepper"],["sukker","sugar"],["honning","honey"],
    ["syltetøj","jam"],["en kage","a cake"],["en is","ice cream"],["en chokolade","chocolate"],["slik","candy"],
    ["en kiks","a biscuit"],["en juice","juice"],["en sodavand","soda"],["en øl","a beer"],["en vin","a wine"],
    ["en kaffe","coffee"],["en te","tea"],["en drik","a drink"],["et glas","a glass"],["en kop","a cup"],
    ["en tallerken","a plate"],["en skål","a bowl"],["en ske","a spoon"],["en gaffel","a fork"],["en kniv","a knife"],
    ["en serviet","a napkin"],["en opskrift","a recipe"],["en ingrediens","an ingredient"],["en smag","a taste"],["lækker","delicious"],
    ["tilberede","to prepare (food)"],["stege","to fry / roast"],["koge","to boil"],["bage","to bake"],["grille","to grill"],
    ["skære","to cut"],["rive","to grate"],["blande","to mix"],["smage","to taste"],["servere","to serve"],
    ["bestille","to order"],["drikkepenge","a tip"],["en vegetar","a vegetarian"],["en veganer","a vegan"],["en allergi","an allergy"],
    ["en appetit","appetite"],["skål","cheers"],["et franskbrød","white bread"],["en bolle","a bun"],["en pandekage","a pancake"],
    ["en risengrød","rice pudding"],["en frikadelle","a meatball"],["en leverpostej","liver pâté"],["en rødgrød","red berry pudding"],["en snaps","a schnapps"],
    ["en rødvin","a red wine"],["en hvidvin","a white wine"],["et fadøl","a draft beer"],["et knækbrød","crispbread"],["en müsli","muesli"],
    ["en yoghurt","yogurt"],["en spegepølse","salami"],["et smørrebrød","an open sandwich"],["en portion","a portion"],["en gryde","a pot"],
    ["en pande","a pan"],["et menukort","a menu"],["en forret","a starter"],["en hovedret","a main course"],["en dessert","a dessert"],
    ["en duft","a smell"],["en konsistens","a texture"],["krydret","spicy"],["mild","mild"],["mættende","filling"],
    ["vegetarisk","vegetarian"],["vegansk","vegan"],["en bagning","a baking"],["en stegning","a frying"],["en kogning","a boiling"],
  ],
  "Home & Daily Life": [
    ["en lejlighed","an apartment"],["et værelse","a room"],["et soveværelse","a bedroom"],["et badeværelse","a bathroom"],["et køkken","a kitchen"],
    ["en stue","a living room"],["en entré","a hallway"],["en altan","a balcony"],["en kælder","a basement"],["en garage","a garage"],
    ["en nøgle","a key"],["en lås","a lock"],["en lampe","a lamp"],["et ur","a clock / watch"],["et spejl","a mirror"],
    ["et gardin","a curtain"],["et tæppe","a rug / blanket"],["en pude","a pillow"],["en dyne","a duvet"],["et håndklæde","a towel"],
    ["sæbe","soap"],["shampoo","shampoo"],["en tandbørste","a toothbrush"],["tandpasta","toothpaste"],["et toilet","a toilet"],
    ["et badekar","a bathtub"],["en bruser","a shower"],["en vask","a sink"],["et komfur","a stove"],["en ovn","an oven"],
    ["et køleskab","a fridge"],["en fryser","a freezer"],["en opvaskemaskine","a dishwasher"],["en vaskemaskine","a washing machine"],["en tørretumbler","a dryer"],
    ["en støvsuger","a vacuum cleaner"],["affald","trash"],["en skraldespand","a trash can"],["en kost","a broom"],["en moppe","a mop"],
    ["en stikkontakt","an outlet"],["en fjernbetjening","a remote control"],["et tv","a TV"],["en radio","a radio"],["en computer","a computer"],
    ["en telefon","a phone"],["en oplader","a charger"],["et møbel","a piece of furniture"],["en reol","a bookshelf"],["et skrivebord","a desk"],
    ["en sofa","a sofa"],["en lænestol","an armchair"],["en trappe","stairs"],["en elevator","an elevator"],["en postkasse","a mailbox"],
    ["husleje","rent"],["forsikring","insurance"],["et abonnement","a subscription"],["internet","internet"],["wifi","wifi"],
    ["en husholdning","a household"],["et gøremål","a chore"],["et indkøb","shopping (an errand)"],["en indkøbsliste","a shopping list"],["feje","to sweep"],
    ["stryge","to iron"],["tøj","clothes"],["en lyspære","a lightbulb"],["en alarm","an alarm"],["et vækkeur","an alarm clock"],
    ["en kalender","a calendar"],["en seddel","a note"],["en liste","a list"],["en pose","a bag"],["en kurv","a basket"],
    ["en flaske","a bottle"],["en dåse","a can"],["en pakke","a package"],["en æske","a box"],["en taske","a bag / purse"],
    ["en rygsæk","a backpack"],["en paraply","an umbrella"],["en bolig","a home/residence"],["en villa","a detached house"],["en udlejer","a landlord"],
    ["en lejer","a tenant"],["et depositum","a deposit"],["en lejekontrakt","a lease"],["en ejendom","a property"],["en ejendomsmægler","a real estate agent"],
    ["et boligmarked","a housing market"],["et lån","a loan"],["et realkreditlån","a mortgage"],["en renovering","a renovation"],["en ombygning","a remodel"],
    ["en flytning","a move"],["en flyttekasse","a moving box"],["et byggeri","a construction"],["en terrasse","a terrace"],["en indretning","an interior design"],
    ["en vedligeholdelse","a maintenance"],["en rengøring","a cleaning"],["en støvsugning","a vacuuming"],["en opvask","a dishwashing"],["en tøjvask","a laundry"],
    ["en strygning","an ironing"],["en oprydning","a tidying up"],["en affaldssortering","a waste sorting"],["en madlavning","a cooking"],["en græsslåning","a lawn mowing"],
    ["en snerydning","a snow removal"],["en reparation","a repair"],["et rengøringsmiddel","a cleaning product"],["en gulvvask","a floor washing"],["en vinduespudsning","a window cleaning"],
    ["en sengeredning","a bed-making"],["en støvning","a dusting"],["en ventetid","a wait time"],["en kø","a queue"],["en åbningstid","an opening hour"],
    ["en lukketid","a closing time"],["en ombytning","an exchange"],["en returnering","a return"],["en garanti","a warranty"],["en undtagelse","an exception"],
    ["en betingelse","a condition"],["et krav","a requirement"],["en tilladelse","a permission"],["et forbud","a ban"],
  ],
  "Travel & Transport": [
    ["en rejse","a trip / journey"],["et pas","a passport"],["et visum","a visa"],["en billet","a ticket"],["bagage","luggage"],
    ["en kuffert","a suitcase"],["en taxa","a taxi"],["en metro","a metro"],["en færge","a ferry"],["en motorcykel","a motorcycle"],
    ["en motorvej","a motorway"],["en sti","a path"],["et kort","a map"],["en afgang","a departure"],["en ankomst","an arrival"],
    ["en forsinkelse","a delay"],["en gate","a gate"],["en perron","a platform"],["en pilot","a pilot"],["en stewardesse","a flight attendant"],
    ["en destination","a destination"],["en grænse","a border"],["told","customs"],["et vandrehjem","a hostel"],["en campingplads","a campsite"],
    ["et telt","a tent"],["en sovepose","a sleeping bag"],["et bagagerum","a trunk"],["et sæde","a seat"],["en sikkerhedssele","a seatbelt"],
    ["en tank","a tank"],["benzin","petrol"],["diesel","diesel"],["en tankstation","a gas station"],["parkering","parking"],
    ["en p-plads","a parking spot"],["trafik","traffic"],["et trafiklys","a traffic light"],["et fortov","a sidewalk"],["en fodgænger","a pedestrian"],
    ["en rundkørsel","a roundabout"],["et kryds","an intersection"],["en adresse","an address"],["et kompas","a compass"],["en rute","a route"],
    ["en udflugt","an excursion"],["en seværdighed","an attraction"],["en guide","a guide"],["en reservation","a reservation"],["en afrejse","a departure (trip)"],
    ["en hjemrejse","a return trip"],["jetlag","jet lag"],["en souvenir","a souvenir"],["en landsby","a village"],["en hovedstad","a capital city"],
    ["en region","a region"],["en kyst","a coast"],["en ø","an island"],["en halvø","a peninsula"],["en fjord","a fjord"],
    ["en dal","a valley"],["en slette","a plain"],["en rejseplan","an itinerary"],["en aflysning","a cancellation"],["en boardingpas","a boarding pass"],
    ["en toldkontrol","a customs check"],["en ambassade","an embassy"],["en rejseforsikring","a travel insurance policy"],["en vaccination","a vaccination"],["en tidszone","a time zone"],
    ["en lokalbefolkning","a local population"],["et vandrerhjem","a hostel"],["en udlejningsbil","a rental car"],
  ],
  "Weather & Nature": [
    ["blæst","windy"],["en storm","a storm"],["et tordenvejr","a thunderstorm"],["et lyn","lightning"],["en torden","thunder"],
    ["en tåge","fog"],["en frost","frost"],["is (frozen water)","ice"],["varme","heat"],["kulde","cold (noun)"],
    ["en temperatur","a temperature"],["grader","degrees"],["et klima","a climate"],["en årstid","a season"],["skyet","cloudy"],
    ["solrigt","sunny"],["regnfuldt","rainy"],["fugtigt","humid"],["en regnbue","a rainbow"],["et blad (leaf)","a leaf"],
    ["en rod","a root"],["en gren","a branch"],["en plante","a plant"],["et frø","a seed"],["en busk","a bush"],
    ["en mark","a field"],["en eng","a meadow"],["en bakke","a hill"],["en klippe","a cliff / rock"],["en flod","a river"],
    ["en å","a stream"],["en bølge","a wave"],["sand","sand"],["et insekt","an insect"],["en bi","a bee"],
    ["en sommerfugl","a butterfly"],["en myre","an ant"],["en edderkop","a spider"],["en flue","a fly"],["en myg","a mosquito"],
    ["en orm","a worm"],["en slange","a snake"],["en frø","a frog"],["en skildpadde","a turtle"],["en ræv","a fox"],
    ["en ulv","a wolf"],["en bjørn","a bear"],["en hjort","a deer"],["et egern","a squirrel"],["en kanin","a rabbit"],
    ["en rotte","a rat"],["dug","dew"],["hagl","hail"],["et snefnug","a snowflake"],["en solnedgang","a sunset"],
    ["en solopgang","a sunrise"],["en skygge","a shadow"],["en ørken","a desert"],["en vulkan","a volcano"],["en gletsjer","a glacier"],
    ["et jordskælv","an earthquake"],["biodiversitet","biodiversity"],["en udryddelse","an extinction"],["en emission","an emission"],["en klode","a planet"],
    ["forurening","pollution"],["genbrug","recycling"],["bæredygtighed","sustainability"],["en ressource","a resource"],["energi","energy"],
    ["et landskab","a landscape"],["en art","a species"],["et økosystem","an ecosystem"],["klimaforandring","climate change"],["en drivhuseffekt","a greenhouse effect"],
    ["en naturkatastrofe","a natural disaster"],["en oversvømmelse","a flood"],["en tørke","a drought"],["en skovbrand","a wildfire"],["en byge","a shower"],
    ["et isslag","black ice"],["en solskoldning","a sunburn"],["en brise","a breeze"],["en kuling","a gale"],["fugtighed","humidity"],
    ["en varmebølge","a heatwave"],
  ],
  "Body & Health": [
    ["en krop","a body"],["et hoved","a head"],["et hår","hair"],["et ansigt","a face"],["et øje","an eye"],
    ["et øre","an ear"],["en næse","a nose"],["en mund","a mouth"],["en tand","a tooth"],["en tunge","a tongue"],
    ["en hals","a throat / neck"],["en skulder","a shoulder"],["en arm","an arm"],["en albue","an elbow"],["en hånd","a hand"],
    ["en finger","a finger"],["et bryst","a chest"],["en mave","a stomach"],["en ryg","a back"],["et ben","a leg / bone"],
    ["et knæ","a knee"],["en fod","a foot"],["en tå","a toe"],["et hjerte","a heart"],["en lunge","a lung"],
    ["hud","skin"],["en muskel","a muscle"],["en knogle","a bone"],["blod","blood"],["en hjerne","a brain"],
    ["en nerve","a nerve"],["en sygdom","a disease"],["en smerte","a pain"],["en hovedpine","a headache"],["en mavepine","a stomachache"],
    ["en feber","a fever"],["en forkølelse","a cold (illness)"],["en hoste","a cough"],["en influenza","the flu"],["en medicin","medicine"],
    ["en pille","a pill"],["en recept","a prescription"],["en tandlæge","a dentist"],["en klinik","a clinic"],["en ambulance","an ambulance"],
    ["en skadestue","an ER"],["en operation","a surgery"],["en undersøgelse","an examination"],["et symptom","a symptom"],["en diagnose","a diagnosis"],
    ["en behandling","a treatment"],["helbred","health"],["sund","healthy"],["usund","unhealthy"],["motion","exercise"],
    ["en træning","training / exercise"],["en diæt","a diet"],["søvn","sleep"],["træthed","tiredness"],["stress","stress"],
    ["angst","anxiety"],["en graviditet","a pregnancy"],["en fødsel","a birth"],["en vaccine","a vaccine"],["et plaster","a band-aid"],
    ["en bandage","a bandage"],["en krykke","a crutch"],["en kørestol","a wheelchair"],["briller","glasses"],["en kontaktlinse","a contact lens"],
    ["et høreapparat","a hearing aid"],["et smil","a smile"],["en latter","a laugh"],["et blik","a look"],["en gestus","a gesture"],
    ["et nik","a nod"],["en krammer","a hug"],["et håndtryk","a handshake"],["en gaben","a yawn"],["et suk","a sigh"],
    ["en grimasse","a grimace"],["en tåre","a tear"],["en rødmen","a blush"],["en rysten","a shiver"],["en gys","a shudder"],
    ["en stirren","a stare"],
  ],
  "Work & School": [
    ["en opgave","a task"],["et projekt","a project"],["en deadline","a deadline"],["en rapport","a report"],["en præsentation","a presentation"],
    ["en kontrakt","a contract"],["en løn","a salary"],["en lønseddel","a paystub"],["en sygemelding","sick leave"],["en opsigelse","a resignation"],
    ["en ansættelsessamtale","a job interview"],["et cv","a CV"],["en ansøgning","an application"],["en karriere","a career"],["en erfaring","experience"],
    ["en kvalifikation","a qualification"],["en uddannelse","an education"],["et gymnasium","a high school"],["en folkeskole","a primary school"],["en børnehave","a kindergarten"],
    ["en klasse","a class / classroom"],["en klassekammerat","a classmate"],["en karakter","a grade"],["en eksamen","an exam"],["en prøve","a test / quiz"],
    ["lektier","homework"],["et skema","a schedule"],["et fag","a subject"],["matematik","math"],["dansk","Danish (subject)"],
    ["engelsk","English (subject)"],["geografi","geography"],["fysik","physics"],["kemi","chemistry"],["biologi","biology"],
    ["idræt","PE / sports"],["musik","music"],["kunst","art"],["en pause","a break"],["et frikvarter","recess"],
    ["en skoletaske","a school bag"],["en blyant","a pencil"],["en pen","a pen"],["et viskelæder","an eraser"],["en linjal","a ruler"],
    ["en tavle","a blackboard"],["et whiteboard","a whiteboard"],["et studiekort","a student card"],["et stipendium","a scholarship"],["et studielån","a student loan"],
    ["en afgangseksamen","a final exam"],["et diplom","a diploma"],["en grad","a degree"],["en lektion","a lesson"],["en vikar","a substitute teacher"],
    ["en rektor","a principal"],["en opsparing","a savings"],["en investering","an investment"],["en aktie","a stock/share"],["et budget","a budget"],
    ["en udgift","an expense"],["en indtægt","an income"],["en faktura","an invoice"],["en gæld","a debt"],["en rente","an interest rate"],
    ["en pension","a pension"],["en bonus","a bonus"],["en overførsel","a transfer"],["et kontantbeløb","a cash amount"],["en valuta","a currency"],
    ["en vekselkurs","an exchange rate"],["en bank","a bank"],["et kreditkort","a credit card"],["en transaktion","a transaction"],["en underskrift","a signature"],
    ["et dokument","a document"],["en undervisning","a teaching"],["et pensum","a curriculum"],["en lærebog","a textbook"],["en aflevering","a submission"],
    ["en frist","a deadline"],["en forelæsning","a lecture"],["et kursus","a course"],["et studium","a study program"],["en klasseværelse","a classroom"],
    ["en studiegruppe","a study group"],["en eksaminator","an examiner"],["en vejleder","a supervisor"],["en note","a note"],["en færdighed","a skill"],
    ["en evne","an ability"],["en fremgangsmåde","a procedure"],["en indlæring","a learning process"],["en hukommelse","a memory"],["en koncentration","a concentration"],
  ],
  "Emotions & Personality": [
    ["en vrede","anger"],["en jalousi","jealousy"],["en skyld","guilt"],["en skam","shame"],["en stolthed","pride"],
    ["en medlidenhed","pity"],["en overraskelse","a surprise"],["en forvirring","confusion"],["en lettelse","relief"],["en ensomhed","loneliness"],
    ["en kedsomhed","boredom"],["en spænding","excitement"],["en ro","calm"],["en tillid","trust"],["en mistillid","distrust"],
    ["en respekt","respect"],["en tålmodighed","patience"],["en utålmodighed","impatience"],["et mod","courage"],["en fejhed","cowardice"],
    ["en generøsitet","generosity"],["en gerrighed","greed"],["upålidelig","unreliable"],["pålidelig","reliable"],["doven","lazy"],
    ["flittig","diligent"],["nysgerrig","curious"],["kreativ","creative"],["logisk","logical"],["fornuftig","sensible"],
    ["stædig","stubborn"],["fleksibel","flexible"],["sky","shy"],["udadvendt","outgoing"],["indadvendt","introverted"],
    ["selvsikker","confident"],["ydmyg","humble"],["arrogant","arrogant"],["sympatisk","likeable"],["usympatisk","unlikeable"],
    ["sarkastisk","sarcastic"],["seriøs","serious"],["munter","cheerful"],["gnaven","grumpy"],["optimistisk","optimistic"],
    ["pessimistisk","pessimistic"],["hjælpsom","helpful"],["ansvarlig","responsible"],["uansvarlig","irresponsible"],["loyal","loyal"],
    ["sensitiv","sensitive"],["rationel","rational"],["impulsiv","impulsive"],["energisk","energetic"],["målrettet","goal-oriented"],
    ["en tilfredshed","a satisfaction"],["en utilfredshed","a dissatisfaction"],["en flovhed","an embarrassment"],["en frustration","a frustration"],["en irritation","an irritation"],
    ["en nervøsitet","a nervousness"],["en nysgerrighed","a curiosity"],["en taknemmelighed","a gratitude"],["en medfølelse","a compassion"],["en empati","an empathy"],
    ["en afmagt","a helplessness"],["en skyldfølelse","a guilt"],["en lettet følelse","a sense of relief"],["overvældet","overwhelmed"],["ligeglad","indifferent"],
    ["rørt","touched"],["chokeret","shocked"],["fortvivlet","desperate"],["generøs","generous"],["gerrig","stingy"],
    ["egoistisk","selfish"],["uselvisk","unselfish"],["modig","brave"],["fej","cowardly"],["ambitiøs","ambitious"],
    ["følsom","sensitive"],["hårdhudet","thick-skinned"],["beskeden","modest"],["charmerende","charming"],["irriterende","annoying"],
    ["spontan","spontaneous"],["forsigtig","cautious"],["skødesløs","careless"],
  ],
  "Common Phrases & Idioms": [
    ["hej","hi"],["farvel","goodbye"],["godmorgen","good morning"],["godaften","good evening"],["godnat","good night"],
    ["tak","thanks"],["tak for det","thanks for that"],["selv tak","you're welcome"],["undskyld","sorry / excuse me"],["det gør ikke noget","it's ok / no problem"],
    ["hvordan går det?","how's it going?"],["det går godt","it's going well"],["hvad hedder du?","what's your name?"],["jeg hedder…","my name is…"],["hvor kommer du fra?","where are you from?"],
    ["jeg kommer fra…","I'm from…"],["hvor gammel er du?","how old are you?"],["jeg forstår ikke","I don't understand"],["kan du gentage det?","can you repeat that?"],["tal langsomt","speak slowly"],
    ["hvad betyder det?","what does that mean?"],["det ved jeg ikke","I don't know"],["det tror jeg ikke","I don't think so"],["måske","maybe"],["selvfølgelig","of course"],
    ["det er lige meget","it doesn't matter"],["hvor meget koster det?","how much does it cost?"],["må jeg få regningen?","may I have the bill?"],["værsgo","here you go"],["god fornøjelse","enjoy"],
    ["held og lykke","good luck"],["tillykke","congratulations"],["vi ses","see you"],["vi tales ved","talk soon"],["pas på dig selv","take care"],
    ["god weekend","have a good weekend"],["god appetit","bon appétit"],["hvad så?","what's up?"],["det er lige det","that's exactly it"],["i det store hele","all in all"],
    ["det kommer an på","it depends"],["sådan er det bare","that's just how it is"],["tag det roligt","take it easy / calm down"],["hold op","stop it"],["lad være","don't / stop"],
    ["kom nu","come on"],["vent lidt","wait a bit"],["skynd dig","hurry up"],["pas på","watch out / be careful"],["det er synd","that's a shame"],
    ["sikke noget","what a thing / wow"],["hold da op","wow / whoa"],["er du sikker?","are you sure?"],["jeg er enig","I agree"],["jeg er uenig","I disagree"],
    ["det giver mening","that makes sense"],["det giver ikke mening","that doesn't make sense"],["i mellemtiden","in the meantime"],["med det samme","right away"],["lidt efter lidt","little by little"],
    ["i hvert fald","in any case / at least"],["for eksempel","for example"],["med andre ord","in other words"],["det vil sige","that is to say"],["på trods af","despite"],
    ["på grund af","because of"],["selvom","even though"],["i stedet for","instead of"],["i forhold til","in relation to"],["fra tid til anden","from time to time"],
    ["en gang imellem","once in a while"],["det kan man ikke vide","you never know"],["lad os se","let's see"],["det håber jeg","I hope so"],["det tror jeg","I think so"],
    ["stort set","basically"],["i det mindste","at least"],["hvis jeg var dig","if I were you"],["at være enig","to agree"],["at være uenig","to disagree"],
    ["at modsige","to contradict"],["at understøtte","to support"],["at bestride","to dispute"],["at retfærdiggøre","to justify"],["at understrege","to emphasize"],
    ["at antyde","to imply"],["at konkludere","to conclude"],["at generalisere","to generalize"],["at sammenligne","to compare"],["at modstille","to contrast"],
    ["at vurdere","to evaluate"],["at kritisere","to criticize"],["at rose","to praise"],["efter min mening","in my opinion"],["på den ene side","on one hand"],
    ["på den anden side","on the other hand"],["i modsætning til","in contrast to"],["alt i alt","all in all"],["kort sagt","in short"],["at slå to fluer med et smæk","to kill two birds with one stone"],
    ["at tage tyren ved hornene","to take the bull by the horns"],["at falde med næsen i smøret","to fall into a lucky opportunity"],["at have en finger med i spillet","to be involved in something"],["at gå over åen efter vand","to make things unnecessarily complicated"],["at kaste håndklædet i ringen","to throw in the towel"],
    ["at være ude i god tid","to be well ahead of time"],["at stikke en kæp i hjulet","to throw a wrench in the works"],["at tage skeen i den anden hånd","to change one's approach"],["at have hjertet på rette sted","to have one's heart in the right place"],["at gøre en dyd af nødvendigheden","to make a virtue of necessity"],
    ["at være på bar bund","to be at a total loss"],["at ramme plet","to hit the mark"],["at gå agurk","to go crazy"],["at tale udenom","to beat around the bush"],
  ],
  "Prepositions & Connectors": [
    ["i","in"],["på","on"],["til","to"],["fra","from"],["med","with"],
    ["uden","without"],["for","for"],["om","about / around"],["over","over"],["under","under"],
    ["ved","by / at"],["hos","at someone's place"],["mellem","between"],["gennem","through"],["mod","against / towards"],
    ["imod","against"],["efter","after"],["før","before"],["siden","since"],["indtil","until"],
    ["mens","while"],["da","when (past)"],["når","when (general/future)"],["hvis","if"],["fordi","because"],
    ["så","so / then"],["men","but"],["og","and"],["eller","or"],["derfor","therefore"],
    ["altså","thus / so"],["dog","however"],["alligevel","nevertheless"],["desuden","furthermore"],["også","also"],
    ["kun","only"],["både…og","both…and"],["enten…eller","either…or"],["hverken…eller","neither…nor"],["selv","even / self"],
    ["næsten","almost"],["helt","completely"],["lidt","a little"],["meget","very / a lot"],["nok","enough"],
    ["hvor","where"],["hvorfor","why"],["hvordan","how"],["hvornår","when (question)"],["hvem","who"],
    ["hvad","what"],["hvilken","which"],["op","up"],["ned","down"],["ind","in (direction)"],
    ["ud","out (direction)"],["hen","over / toward"],["forbi","past / by"],["omkring","around"],["skønt","although"],
    ["medmindre","unless"],["forudsat at","provided that"],["i tilfælde af","in case of"],["i mangel af","for lack of"],["som følge af","as a result of"],
    ["i kraft af","by virtue of"],["med hensyn til","regarding"],["angående","concerning"],["bortset fra","apart from"],["ud over","besides"],
    ["ligesom","just like"],["hvorimod","whereas"],["hvorved","whereby"],["hvorefter","after which"],
  ],
  "Clothing & Shopping": [
    ["en skjorte","a shirt"],["en t-shirt","a t-shirt"],["en bluse","a blouse"],["bukser","pants"],["en jeans","jeans"],
    ["en nederdel","a skirt"],["en kjole","a dress"],["en jakke","a jacket"],["en frakke","a coat"],["en sweater","a sweater"],
    ["en trøje","a sweater / jumper"],["underbukser","underwear"],["en bh","a bra"],["sokker","socks"],["sko","shoes"],
    ["støvler","boots"],["sandaler","sandals"],["en hue","a beanie"],["en hat","a hat"],["handsker","gloves"],
    ["et tørklæde","a scarf"],["et bælte","a belt"],["et slips","a tie"],["en pyjamas","pajamas"],["et badetøj","swimwear"],
    ["en regnjakke","a rain jacket"],["en størrelse","a size"],["en farve","a color"],["et stof","a fabric"],["et mønster","a pattern"],
    ["mode","fashion"],["en stil","a style"],["et smykke","a piece of jewelry"],["en ring","a ring"],["en halskæde","a necklace"],
    ["et armbånd","a bracelet"],["øreringe","earrings"],["en pung","a wallet"],["et prøverum","a fitting room"],["en kvittering","a receipt"],
    ["et tilbud","an offer / deal"],["et udsalg","a sale"],["en rabat","a discount"],["et medlemskab","a membership"],["en betaling","a payment"],
    ["kontant","cash"],["et betalingskort","a payment card"],["byttepenge","change (money)"],["returnere","to return an item"],["bytte","to exchange"],
    ["en ekspedient","a shop assistant"],["et indkøbscenter","a shopping mall"],["et stormagasin","a department store"],
  ],
  "Technology & Media": [
    ["en smartphone","a smartphone"],["en tablet","a tablet"],["en skærm","a screen"],["et tastatur","a keyboard"],["en computermus","a computer mouse"],
    ["en hjemmeside","a website"],["en app","an app"],["et program","a program"],["software","software"],["en fil","a file"],
    ["en mappe","a folder"],["et download","a download"],["et upload","an upload"],["et kodeord","a password"],["en bruger","a user"],
    ["en konto","an account"],["en profil","a profile"],["en besked","a message"],["en sms","a text message"],["en email","an email"],
    ["et opkald","a phone call"],["et kamera","a camera"],["et billede","a picture"],["en video","a video"],["en playliste","a playlist"],
    ["streaming","streaming"],["en podcast","a podcast"],["nyheder","news"],["en blog","a blog"],["sociale medier","social media"],
    ["et opslag","a post"],["en kommentar","a comment"],["et like","a like"],["en følger","a follower"],["et hashtag","a hashtag"],
    ["en reklame","an advertisement"],["en opdatering","an update"],["en version","a version"],["en fejl","an error / bug"],["en virus","a virus"],
    ["sikkerhed","security"],["en backup","a backup"],["en server","a server"],["et netværk","a network"],["en router","a router"],
    ["et batteri","a battery"],["opladning","charging"],["et skærmbillede","a screenshot"],["hardware","hardware"],["en robot","a robot"],
    ["en kunstig intelligens","artificial intelligence"],["en artikel","an article"],["en overskrift","a headline"],["en udsendelse","a broadcast"],["en kanal","a channel"],
    ["en serie","a series"],["en afsnit","an episode"],["en instruktør","a director"],["en rolle","a role"],["en anmeldelse","a review"],
    ["en genre","a genre"],["en soundtrack","a soundtrack"],["en sang","a song"],["en tekst","a text"],["et interview","an interview"],
    ["en dokumentar","a documentary"],["en streamingtjeneste","a streaming service"],["en påvirker","an influencer"],["en nyhed","a piece of news"],["en udgivelse","a release"],
    ["en adgangskode","a password"],["en indstilling","a setting"],["et link","a link"],["en browser","a browser"],["en nedbrud","a crash"],
    ["en genstart","a restart"],["en installation","an installation"],["en synkronisering","a sync"],["en enhed","a device"],["en forbindelse","a connection"],
    ["en firewall","a firewall"],["en sikkerhedskopi","a backup"],
  ],
  "Abstract Concepts & Opinions": [
    ["en hensigt","an intention"],["en antagelse","an assumption"],["en betragtning","a consideration"],["en mening","an opinion"],["en holdning","an attitude"],
    ["et synspunkt","a viewpoint"],["en påstand","a claim"],["et argument","an argument"],["en årsag","a reason"],["en konsekvens","a consequence"],
    ["et resultat","a result"],["en mulighed","a possibility"],["en fordel","an advantage"],["en ulempe","a disadvantage"],["en udfordring","a challenge"],
    ["en forskel","a difference"],["en lighed","a similarity"],["et forhold","a relationship"],["en sammenhæng","a connection"],["en betydning","a meaning"],
    ["en tendens","a trend"],["en udvikling","a development"],["en forandring","a change"],["en forbedring","an improvement"],["en forværring","a worsening"],
    ["et formål","a purpose"],["en beslutning","a decision"],["et valg","a choice"],["en handling","an action"],["en indsats","an effort"],
    ["en fremgang","progress"],["et fremskridt","an advance"],["en oplevelse","an experience"],["et indtryk","an impression"],["en vurdering","an assessment"],
    ["en forventning","an expectation"],["en skuffelse","a disappointment"],["en bekymring","a worry"],["en tvivl","a doubt"],["en overbevisning","a conviction"],
    ["en værdi","a value"],["et princip","a principle"],["en teori","a theory"],["et begreb","a concept"],["en påvirkning","an influence"],
    ["en risiko","a risk"],["en fordom","a prejudice"],["en hindring","an obstacle"],["en forhindring","a hurdle"],["en begrænsning","a limitation"],
    ["en mangel","a shortage"],["et underskud","a deficit"],["et overskud","a surplus"],["en nødsituation","an emergency"],["en fejltagelse","a mistake"],
    ["en uenighed","a disagreement"],["en modsætning","a contradiction"],["et kompromis","a compromise"],["et alternativ","an alternative"],["en udvej","a way out"],
    ["en genvej","a shortcut"],["en omvej","a detour"],["en beslutningstager","a decision-maker"],["en igangsætter","an initiator"],["en efterfølger","a successor"],
    ["en forgænger","a predecessor"],["en fortolkning","an interpretation"],["en implikation","an implication"],["en fortaler","an advocate"],["en formidler","a mediator"],
    ["en iagttager","an observer"],["en deltagerliste","a list of participants"],["en prioritet","a priority"],["en dagsorden","an agenda"],["et referat","a summary/minutes"],
    ["en beslutningsproces","a decision-making process"],["en høring","a hearing"],["en afklaring","a clarification"],["en uklarhed","an ambiguity"],["en tvetydighed","an ambiguity"],
    ["en nuance","a nuance"],["en detalje","a detail"],["en helhed","a whole"],["en delmængde","a subset"],["en kategori","a category"],
    ["en klassificering","a classification"],["en rangorden","a ranking"],["en prioritering","a prioritization"],["en tilpasning","an adaptation"],["en tilvænning","an adjustment"],
    ["en overgang","a transition"],["en milepæl","a milestone"],["en fase","a phase"],["et stadie","a stage"],["et niveau","a level"],
    ["en skala","a scale"],["en tærskel","a threshold"],["en grænseværdi","a limit value"],["en variation","a variation"],["en afvigelse","a deviation"],
    ["en uregelmæssighed","an irregularity"],["en sammenhængskraft","a cohesion"],["en balance","a balance"],["en ubalance","an imbalance"],["en ligevægt","an equilibrium"],
    ["en harmoni","a harmony"],["en disharmoni","a discord"],["en modvilje","a reluctance"],["en villighed","a willingness"],["en beredvillighed","a readiness"],
    ["en tøven","a hesitation"],["en beslutsomhed","a determination"],["en vedholdenhed","a persistence"],["en opgivelse","a giving up"],["en genopretning","a recovery"],
    ["en tilbagevenden","a return"],["en tilbagegang","a decline"],["en stagnation","a stagnation"],
  ],
  "Society & Culture": [
    ["en straf","a punishment"],["en forpligtelse","an obligation"],["en institution","an institution"],["en minoritet","a minority"],["et flertal","a majority"],
    ["en afstemning","a vote"],["en kultur","a culture"],["en tradition","a tradition"],["en regel","a rule"],["en pligt","a duty"],
    ["en frihed","a freedom"],["en ligestilling","an equality"],["en økonomi","an economy"],["en valgkreds","a constituency"],["en borger","a citizen"],
    ["en organisation","an organization"],["en industri","an industry"],["en handel","trade"],["en skat","a tax"],["en indkomst","an income"],
    ["en fattigdom","poverty"],["en rigdom","wealth"],["en generation","a generation"],["en befolkning","a population"],["et fællesskab","a community"],
    ["en integration","an integration"],["en identitet","an identity"],["en religion","a religion"],["en ytringsfrihed","a freedom of speech"],["en debat","a debate"],
    ["en konflikt","a conflict"],["en krise","a crisis"],["en protest","a protest"],["en demonstration","a demonstration"],["en rettighed","an entitlement"],
    ["en pligtfølelse","a sense of duty"],["en forbrydelse","a crime"],["en tyveri","a theft"],["et indbrud","a burglary"],["et bedrageri","a fraud"],
    ["en anklage","an accusation"],["en efterforskning","an investigation"],["en anholdelse","an arrest"],["en dom","a verdict"],["en retssag","a court case"],
    ["en dommer","a judge"],["et vidne","a witness"],["et bevis","a proof"],["en fængsel","a prison"],["et offer","a victim"],
    ["en gerningsmand","a perpetrator"],["en fare","a danger"],["et overfald","an assault"],["en trussel","a threat"],["en ulykke","an accident"],
    ["en skade","a damage/injury"],["en redning","a rescue"],["en evakuering","an evacuation"],["et brandvæsen","a fire department"],["et nødopkald","an emergency call"],
    ["en videnskab","a science"],["en forsker","a researcher"],["et forsøg","an experiment"],["en opdagelse","a discovery"],["en opfindelse","an invention"],
    ["en hypotese","a hypothesis"],["en metode","a method"],["en analyse","an analysis"],["data","data"],["en statistik","a statistic"],
    ["en konklusion","a conclusion"],["en teknologi","a technology"],["en innovation","an innovation"],["en opfinder","an inventor"],["et laboratorium","a laboratory"],
    ["en afhandling","a thesis"],["genetik","genetics"],["et molekyle","a molecule"],["en celle","a cell"],["en samtale","a conversation"],
    ["en diskussion","a discussion"],["en forhandling","a negotiation"],["en meddelelse","an announcement"],["en forespørgsel","an inquiry"],["en anmodning","a request"],
    ["en instruktion","an instruction"],["en forklaring","an explanation"],["en beskrivelse","a description"],["en oversættelse","a translation"],["en dialekt","a dialect"],
    ["en accent","an accent"],["en udtale","a pronunciation"],["en grammatik","a grammar"],["et ordforråd","a vocabulary"],["en sætning","a sentence"],
    ["et udtryk","an expression"],["en talemåde","a saying"],["en tolk","an interpreter"],["en tavshed","a silence"],["en høflighed","a politeness"],
  ],
  "Hobbies & Leisure": [
    ["fritid","free time"],["en interesse","an interest"],["et talent","a talent"],["en hobby","a hobby"],["en samling","a collection"],
    ["et håndarbejde","a handicraft"],["strikning","knitting"],["syning","sewing"],["et maleri","a painting"],["en tegning","a drawing"],
    ["et fotografi","a photograph"],["en koncert","a concert"],["en udstilling","an exhibition"],["en biograf","a cinema"],["et teater","a theatre"],
    ["en forestilling","a performance"],["en klub","a club"],["en konkurrence","a competition"],["en turnering","a tournament"],["en sejr","a victory"],
    ["et nederlag","a defeat"],["en holdkammerat","a teammate"],["en fanklub","a fan club"],["en tilskuer","a spectator"],["yoga","yoga"],
    ["en meditation","a meditation"],["en vandretur","a hike"],["en cykeltur","a bike ride"],["fiskeri","fishing"],["en jagt","a hunt"],
    ["et havearbejde","gardening"],["en gåtur","a walk"],["et brætspil","a board game"],["et puslespil","a puzzle"],["en gætteleg","a guessing game"],
    ["et håndværk","a craft"],["en øvelse","an exercise"],["en styrke","a strength"],["en udholdenhed","an endurance"],["kondition","fitness"],
    ["et fitnesscenter","a gym"],["en træner","a coach"],["et hold","a team"],["en modstander","an opponent"],["en bane","a field/court"],
    ["en runde","a round"],["en rekord","a record"],["en medalje","a medal"],["en præstation","a performance"],["en opvarmning","a warm-up"],
    ["en udstrækning","a stretch"],["en løbetur","a run"],["en svømmetur","a swim"],["en fodboldkamp","a football match"],["et mesterskab","a championship"],
  ],
};

// A small, carefully-vetted set of core Danish grammar points, seeded the
// same way starter vocabulary is. Kept deliberately modest — these are
// solid, textbook-level facts rather than edge cases or contested
// details, since accuracy matters more here than breadth.
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
      newCards.push({ id: stableStarterId(da), type: "word", front: da, back: en, category: nameToId[catName.toLowerCase()], starter: true });
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
  "A Danish learner tapped a word or short phrase on their flashcard because they want to understand it more deeply. Explain it clearly and completely in plain English, in about 4-6 short flowing sentences (no headers, no bullet points): start with what kind of word it is and what it means. If it's a noun, you MUST explicitly state all of these, every time, even if some feel obvious: its gender (whether it's an en-word or et-word), its indefinite singular form, its definite singular form, its indefinite plural form, and its definite plural form — noting plainly if it has no natural plural rather than skipping the point. For a verb, give its principal forms (infinitive, present, past, past participle). For a preposition, adverb, or other small function word, give 2-3 other common Danish words that share its root or pattern, and what that shared pattern actually means for the learner. Always finish your last sentence completely — never trail off or stop mid-thought.";

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
  if (!res.ok) throw new Error("Request failed (" + res.status + "): " + (data.error?.message || JSON.stringify(data).slice(0, 180)));
  const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!reply.trim()) throw new Error("RESPONSE_NOT_JSON: (empty response)");
  return reply;
}

async function callClaudeImage(system, userText, base64, mediaType) {
  const headers = await buildHeaders();
  const { res, data } = await fetchAndParse("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
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
  if (!res.ok) throw new Error("Request failed (" + res.status + "): " + (data.error?.message || JSON.stringify(data).slice(0, 180)));
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
    throw new Error("Request failed (" + res.status + "): " + (data.error?.message || JSON.stringify(data).slice(0, 180)));
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

async function callGeminiImage(system, userText, base64, mediaType) {
  const headers = await geminiHeaders();
  return geminiGenerate(headers, {
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      { role: "user", parts: [{ inlineData: { mimeType: mediaType, data: base64 } }, { text: userText }] },
    ],
    generationConfig: { maxOutputTokens: 1500 },
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

      if (autoOn) {
        const ONE_DAY = 24 * 60 * 60 * 1000;
        if (now - referencePoint > ONE_DAY) setAutoBackupDue(true);
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
        if (raw) c = JSON.parse(raw);
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

      // Starter vocabulary should always just be complete — no manual
      // button, no visible prompt. This quietly tops up anything missing,
      // whether that's a first-ever launch with nothing yet, or an
      // existing deck from before a later vocabulary expansion.
      const existingFronts = new Set(c.map((card) => card.front.trim().toLowerCase()));
      const { newCards, combinedCategories } = buildStarterAdditions(cat, existingFronts);
      if (newCards.length > 0 || idsMigrated || consolidationMigrated || vocabCorrected) {
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
    setIdx(0);
    setFlipped(false);
    setDragX(0);
    setExiting(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catFilter, starredOnly, unknownOnly, sessionKey]);

  const current = cards.find((c) => c.id === poolIds[idx]);
  // Scoped to the current filter selection (category, starred, and the
  // same grammar-inclusion rule the pool itself uses) so switching to
  // Grammar Lessons shows progress within that category, not a leftover
  // number from the whole deck. Deliberately NOT scoped to unknownOnly —
  // that filter controls session contents, but progress should still be
  // visible even while looking at the unknown-only view. Computed fresh
  // from live cards every render, so it auto-updates immediately.
  const knownWordCount = cards.filter((c) => {
    if (c.ignored) return false;
    if (c.type === "grammar" && catFilter !== "grammar-lessons") return false;
    if (catFilter !== "all" && c.category !== catFilter) return false;
    if (starredOnly && !c.starred) return false;
    return c.known;
  }).length;
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
      setInsightCache((prev) => ({ ...prev, [card.id]: reply.trim() }));
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
        <CategoryPicker categories={categories} value={catFilter} onChange={setCatFilter} allowAll />
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
              <span style={{ color: "var(--sage)", fontWeight: 700 }}>{knownWordCount}</span> known
            </span>
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
                    {langDir === "da-first" ? (
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
                    {langDir === "da-first" ? (
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
            <div style={{ background: "var(--paper)", borderRadius: 8, padding: "12px 14px", fontFamily: "var(--sans)", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {renderInlineMarkdown(insightCache[insightFor])}
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
    (typeFilter !== "all" ? 1 : 0) +
    (starredOnly ? 1 : 0) +
    (knownFilter !== "all" ? 1 : 0) +
    (originFilter !== "all" ? 1 : 0);

  function clearFilters() {
    setCatFilter("all");
    setTypeFilter("all");
    setStarredOnly(false);
    setKnownFilter("all");
    setOriginFilter("all");
  }

  const filtered = cards.filter((c) => {
    if (catFilter !== "all" && c.category !== catFilter) return false;
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
      setInsightCache((prev) => ({ ...prev, [card.id]: reply.trim() }));
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
                            <div style={{ background: "var(--paper)", borderRadius: 8, padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{renderInlineMarkdown(insightCache[insightFor])}</div>
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
        storeSet("lastBackupAt", Date.now().toString()).catch(() => {});
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
      storeSet("lastBackupAt", Date.now().toString()).catch(() => {});
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
  storeSet("lastBackupAt", Date.now().toString()).catch(() => {});
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
        synced folder (like iCloud Drive), then Import on the other device.
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
            Prompts a one-tap backup once it's been a day since your last one. This is a per-device setting —
            turning it on here won't affect your other devices.
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
  const [insightText, setInsightText] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

  async function openInsight(word, meaning) {
    setInsightFor(word);
    setInsightError("");
    setInsightText("");
    setInsightLoading(true);
    try {
      const reply = await callAI(
        WORD_INSIGHT_SYSTEM_PROMPT,
        'Danish word or phrase: "' + word + '"' + (meaning ? " (means: " + meaning + ")" : "") + irregularVerbFactsHint(word) + irregularPluralFactsHint(word),
        { maxTokens: 700 }
      );
      setInsightText(reply.trim());
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
                <div style={{ background: "var(--paper)", borderRadius: 8, padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{renderInlineMarkdown(insightText)}</div>
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
  const [insightText, setInsightText] = useState("");
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
    setInsightText("");
    setInsightLoading(true);
    try {
      const reply = await callAI(
        WORD_INSIGHT_SYSTEM_PROMPT,
        'Danish word or phrase: "' + word + '"' + (meaning ? " (means: " + meaning + ")" : "") + irregularVerbFactsHint(word) + irregularPluralFactsHint(word),
        { maxTokens: 700 }
      );
      setInsightText(reply.trim());
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
                <div style={{ background: "var(--paper)", borderRadius: 8, padding: "10px 12px", fontFamily: "var(--sans)", fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{renderInlineMarkdown(insightText)}</div>
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


