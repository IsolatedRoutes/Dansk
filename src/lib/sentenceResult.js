// Turns the AI's "analyze sentence" JSON into what the screen shows, and sets
// what is ticked to save at first. Only the first idea is ticked: the rest are
// folded away, so nothing unseen is added to the deck.
export function readSentenceResult(parsed) {
  const points = (parsed && parsed.grammarPoints ? parsed.grammarPoints : [])
    .filter((p) => p && p.grammarName && p.explanation && p.mainExample && p.mainExample.da)
    .slice(0, 3)
    .map((p) => ({ ...p, examples: (p.examples || []).slice(0, 1) }));
  return {
    sentenceExplanation: (parsed && parsed.sentenceExplanation) || "",
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
