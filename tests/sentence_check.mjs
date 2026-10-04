import { isSentenceCard, isMultiWordCard } from "../src/data/sentenceCards.js";
import fs from "node:fs";

let failed = 0;
const check = (ok, msg) => { console.log((ok ? "PASS  " : "FAIL  ") + msg); if (!ok) failed++; };
const word = (front) => ({ type: "word", front });
const yes = (f) => check(isSentenceCard(word(f)) === true, '"' + f + '" is a sentence/phrase');
const no = (f) => check(isSentenceCard(word(f)) === false, '"' + f + '" stays a word');

["hvordan går det?", "det går godt", "jeg vil gerne have", "ked af", "på grund af", "i øvrigt", "tak for det",
 "god weekend", "pommes frites", "vi ses", "bedre sent end aldrig", "at tage tyren ved hornene",
 "at slå to fluer med et smæk", "en halv time"].forEach(yes);
["hund", "en hund", "et hus", "at spise", "hej", "ja", "tak", "at gå glip af", "at finde ud af", "at kunne lide",
 "at skynde sig", "en / et", "en ph.d."].forEach(no);
check(isSentenceCard({ type: "sentence", front: "Jeg er træt" }) === true, "a card made as a sentence always counts");
check(isSentenceCard({ type: "grammar", front: "Word order in main clauses" }) === false, "grammar lessons are not sentences");

// Roughly how many of the built-in cards this picks up.
const rows = fs.readFileSync(new URL("../src/data/words.tsv", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => l.split("\t"));
const n = rows.filter((r) => isMultiWordCard({ type: "word", front: r[0] })).length;
check(n >= 330 && n <= 420, "about 350 built-in cards count as sentences and phrases (" + n + ")");
console.log("\n" + (failed ? "FAILED: " + failed : "ALL PASSED"));
process.exit(failed ? 1 : 0);
