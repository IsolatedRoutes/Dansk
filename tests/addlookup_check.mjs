import { cardTypeFor, readLookup, lookupUserText } from "../src/lib/addLookup.js";
let bad = 0;
const ok = (c, m) => { console.log((c ? "PASS  " : "FAIL  ") + m); if (!c) bad++; };
ok(cardTypeFor("en hund") === "word" && cardTypeFor("at gå glip af") === "word" && cardTypeFor("hej") === "word", "words stay words");
ok(cardTypeFor("Hvad hedder du?") === "sentence" && cardTypeFor("jeg kan godt lide kaffe") === "sentence" && cardTypeFor("Tak.") === "sentence", "sentences are told apart without asking");
const r = readLookup({ danish: "en hund", english: "a dog", category: "Animals", wordType: "Noun", level: 1, forms: [{ da: "hunden", en: "the dog" }, { da: "hunde", en: "dogs" }] });
ok(r.da === "en hund" && r.en === "a dog" && r.wordType === "noun" && r.level === 1 && r.forms.length === 2 && r.category === "Animals", "a good answer is read");
const s = readLookup({ danish: "Jeg spiser.", english: "I eat.", category: "Verbs", wordType: "verb", level: 9, forms: "x" });
ok(s.category === "" && s.level === 0 && Array.isArray(s.forms) && s.forms.length === 0, "word-type 'categories', bad levels and bad forms are dropped");
let e1 = ""; try { readLookup({ danish: "hund", english: "hund" }); } catch (e) { e1 = e.message; }
ok(e1 === "TRANSLATION_DIDNT_HAPPEN", "same text on both sides is rejected");
let e2 = ""; try { readLookup({ danish: "hund" }); } catch (e) { e2 = e.message; }
ok(e2 === "LOOKUP_INCOMPLETE", "a missing side is rejected");
ok(lookupUserText("dog", "auto", "Food").includes("detect") && lookupUserText("dog", "en", "").includes("English"), "the language hint is passed");
process.exit(bad ? 1 : 0);
