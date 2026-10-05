// Checks the ready-made lightbulb files: every entry belongs to a built-in
// word, sits in the right file, and has everything the popup shows.
import { readFileSync, readdirSync } from "node:fs";
import { lightbulbBucket } from "../src/lib/lightbulb.js";
const fronts = new Set(readFileSync("src/data/words.tsv", "utf8").split("\n").map((l) => l.split("\t")[0].trim().toLowerCase()).filter(Boolean));
let bad = 0, n = 0;
const fail = (m) => { bad++; console.log("  problem: " + m); };
for (const f of readdirSync("lightbulb").filter((x) => x.endsWith(".json"))) {
  const data = JSON.parse(readFileSync("lightbulb/" + f, "utf8"));
  for (const [k, e] of Object.entries(data)) {
    n++;
    if (!fronts.has(k)) fail(k + " is not a built-in word");
    if (lightbulbBucket(k) + ".json" !== f) fail(k + " is in the wrong file " + f);
    if (!Array.isArray(e.forms) || !e.forms.length || e.forms.some((x) => !x.da || !x.en)) fail(k + ": forms");
    if (!e.explanation || e.explanation.length < 80) fail(k + ": explanation too short");
    if (!Array.isArray(e.related) || !e.related.length) fail(k + ": related");
    if (!e.sentence || !e.sentence.da || !e.sentence.en) fail(k + ": sentence");
    else if (!/\*\*[^*]+\*\*/.test(e.sentence.da)) fail(k + ": sentence word not marked with **");
  }
}
console.log(n + " ready-made entries checked");
process.exit(bad ? 1 : 0);
