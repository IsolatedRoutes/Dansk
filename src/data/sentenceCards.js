import { frontKey } from "../lib/text";

// The built-in cards that are whole sentences, questions, commands or sayings
// (as opposed to single words, greetings, "ked af" style pairs and "at …"
// idioms). They are stored as ordinary phrase cards; this list only decides
// that they show up under "Sentences" in Study and Library, next to the
// sentence cards the learner makes. Nothing saved is changed.
// Every entry must match a Danish side in words.tsv exactly (a test checks).
export const BUILT_IN_SENTENCES = new Set(
  [
    "det gør ikke noget", "hvordan går det?", "det går godt", "hvad hedder du?", "jeg hedder…",
    "hvor kommer du fra?", "jeg kommer fra…", "hvor gammel er du?", "jeg forstår ikke", "kan du gentage det?",
    "tal langsomt", "hvad betyder det?", "det ved jeg ikke", "det tror jeg ikke", "det er lige meget",
    "hvor meget koster det?", "må jeg få regningen?", "hvad så?", "det er lige det", "det kommer an på",
    "sådan er det bare", "tag det roligt", "hold op", "lad være", "kom nu", "vent lidt", "skynd dig", "pas på",
    "det er synd", "er du sikker?", "jeg er enig", "jeg er uenig", "det giver mening", "det giver ikke mening",
    "det kan man ikke vide", "lad os se", "det håber jeg", "det tror jeg", "det går fint", "hvad laver du?",
    "det er i orden", "hvad hedder det på dansk?", "taler du engelsk?", "hvor er toilettet?", "hvad koster det?",
    "jeg vil gerne have", "må jeg bede om regningen?", "kan jeg betale med kort?", "skal vi ikke bare...?",
    "hav en god dag", "det lyder godt", "det er fint med mig", "det er en god idé", "det er rigtigt", "det passer",
    "det passer ikke", "det var dog utroligt", "det kan godt være", "jeg glæder mig", "jeg har det godt",
    "jeg har det skidt", "jeg er ked af det", "det er min skyld", "hvad med dig?", "hvad er klokken?",
    "klokken er fem", "hvordan har du det?", "kan jeg købe ...?", "er det ...?", "jeg beklager", "det var så lidt",
    "gør det selv", "nu skal du høre", "det var på høje tid", "det er ikke så svært", "det er hip som hap",
    "der er ingen ko på isen", "bedre sent end aldrig", "øvelse gør mester", "man skal ikke skue hunden på hårene",
    "den tid, den sorg", "ude af øje, ude af sind",
    "vi ses", "vi tales ved", "vi snakkes", "pas på dig selv", "sov godt",
  ].map(frontKey)
);

// A sentence card: one the learner made as a sentence, or one of the
// built-in sentences above.
export function isSentenceCard(card) {
  if (!card) return false;
  if (card.type === "sentence") return true;
  return !!card.starter && card.type === "word" && BUILT_IN_SENTENCES.has(frontKey(card.front));
}

// "word" / "sentence" / "grammar", counting the built-in sentences as sentences.
export function cardKind(card) {
  return isSentenceCard(card) ? "sentence" : card.type;
}
