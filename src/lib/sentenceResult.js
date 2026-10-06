// Turns the AI's "analyze sentence" JSON into what the screen shows, and sets
// what is ticked to save at first. Only the first idea is ticked: the rest are
// folded away, so nothing unseen is added to the deck.
export function readSentenceResult(parsed) {
  const raw = parsed && Array.isArray(parsed.grammarPoints) ? parsed.grammarPoints : [];
  const points = raw
    .filter((p) => p && p.grammarName && p.explanation && p.line && p.line.da)
    .slice(0, 3)
    .map((p) => {
      const usual = p.usual && p.usual.da && p.usual.en ? { da: p.usual.da, en: p.usual.en } : null;
      return {
        grammarName: p.grammarName,
        rule: p.rule || "",
        literal: p.line.literal || "",
        explanation: p.explanation,
        mainExample: { da: p.line.da, en: p.line.en || "" },
        examples: usual ? [usual] : [],
        // what a saved grammar card says
        cardBack: [p.rule, p.explanation].filter(Boolean).join(" "),
      };
    });
  return {
    sameAsEnglish: (parsed && parsed.sameAsEnglish) || "",
    correctionNote: (parsed && parsed.correctionNote) || "",
    grammarPoints: points,
  };
}

export function initialSentenceSelection(points) {
  const sel = {};
  points.forEach((_, i) => {
    sel[i] = { grammar: i === 0, main: i === 0, examples: {} };
  });
  return sel;
}
