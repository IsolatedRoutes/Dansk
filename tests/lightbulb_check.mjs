// Checks the ready-made lightbulb files: every entry belongs to a built-in
// word, sits in the right file, and has everything the popup shows.
import { readFileSync, readdirSync } from "node:fs";
import { lightbulbBucket } from "../src/lib/lightbulb.js";
import { frontKey } from "../src/lib/text.js";
const levelOf = new Map();
for (const l of readFileSync("src/data/words.tsv", "utf8").split("\n")) { const c = l.split("\t"); if (c[0]) levelOf.set(frontKey(c[0]), Number(c[3])); }
const fronts = new Set(readFileSync("src/data/words.tsv", "utf8").split("\n").map((l) => frontKey(l.split("\t")[0])).filter(Boolean));
let bad = 0, n = 0;
const fail = (m) => { bad++; console.log("  problem: " + m); };
for (const f of readdirSync("lightbulb").filter((x) => x.endsWith(".json"))) {
  const data = JSON.parse(readFileSync("lightbulb/" + f, "utf8"));
  for (const [k, e] of Object.entries(data)) {
    n++;
    if (!fronts.has(k)) fail(k + " is not a built-in word");
    if (lightbulbBucket(k) + ".json" !== f) fail(k + " is in the wrong file " + f);
    if (!Array.isArray(e.forms) || !e.forms.length || e.forms.some((x) => !x.da || !x.en)) fail(k + ": forms");
    if (!e.explanation || e.explanation.length < 15) fail(k + ": explanation too short");
    if (!/^"[^"]+"/.test(e.explanation)) fail(k + ": explanation must open with the quoted word'");
    const banned = /learn (it|them) as|fixed phrase|written as one word|usual pattern|participle|infinitive|conjugat|declen|definite|indefinite|neuter|\bis the (head|doll)\b|useful for text|\bit is an? (en|et)-word/i;
    if (banned.test(e.explanation)) fail(k + ": explanation has banned wording");
    {
      const words = (x) => new Set((x.toLowerCase().replace(/^(at|en|et)\s+/, "").match(/[\p{L}\d]+/gu) || []));
      const parts = words(k);
      if (parts.size > 1 && Array.isArray(e.related))
        for (const r of e.related) {
          const rw = [...words(r.da || "")];
          if (rw.length && rw.every((w) => parts.has(w))) fail(k + ": related '" + r.da + "' is just part of the card itself");
        }
    }
    if (Array.isArray(e.related)) {
      const ex = " " + e.explanation.toLowerCase().replace(/[^\p{L}\d]+/gu, " ") + " ";
      for (const r of e.related) {
        const w = (r.da || "").toLowerCase().replace(/^(at|en|et)\s+/, "").replace(/[^\p{L}\d]+/gu, " ").trim();
        if (w && ex.includes(" " + w + " ")) fail(k + ": related '" + r.da + "' is already in the explanation");
      }
    }
    if (!Array.isArray(e.related) || e.related.length < 3 || e.related.length > 4) fail(k + ": related must have 3 or 4 words");
    if (!e.sentence || !e.sentence.da || !e.sentence.en) fail(k + ": sentence");
    else if (!/\*\*[^*]+\*\*/.test(e.sentence.da)) fail(k + ": sentence word not marked with **");
    else {
      // The marked word must be the card's own word (no en/et/at), not a "the" or plural form.
      const norm = (x) => x.toLowerCase().replace(/[^\p{L}\d ]/gu, "").trim();
      { const max = levelOf.get(k) === 1 ? 8 : 14; if (e.sentence.da.replace(/\*\*/g, "").trim().split(/\s+/).length > max) fail(k + ": sentence longer than " + max + " words for its level"); }
      const marked = e.sentence.da.match(/\*\*([^*]+)\*\*/)[1];
      const base = k.replace(/^(en|et|at) /, "");
      const loose = ["både…og", "enten…eller", "er det ...?", "en / et"];
      if (!loose.includes(k) && ![norm(base), norm(k)].includes(norm(marked))) fail(k + ": sentence marks '" + marked + "' instead of the card's word");
    }
  }
}
console.log(n + " ready-made entries checked");
process.exit(bad ? 1 : 0);
