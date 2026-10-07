// Turns the AI's "analyze sentence" JSON into what the screen shows, and builds
// the cards to save from what is ticked. Only the first idea is ticked at first,
// so nothing unseen is added to the deck.
const clean = (t) => (typeof t === "string" ? t.replace(/\*\*/g, "").trim() : "");

export function readSentenceResult(parsed) {
  const raw = parsed && Array.isArray(parsed.points) ? parsed.points : [];
  const points = raw
    .filter((p) => p && clean(p.title) && clean(p.explanation))
    .slice(0, 2)
    .map((p) => ({
      title: clean(p.title),
      literal: clean(p.literal),
      explanation: clean(p.explanation),
      more: clean(p.more),
    }));
  return {
    sameAsEnglish: clean(parsed && parsed.sameAsEnglish),
    correctionNote: clean(parsed && parsed.correctionNote),
    grammarPoints: points,
  };
}

export function initialSentenceSelection(points) {
  const sel = {};
  points.forEach((_, i) => {
    sel[i] = { grammar: i === 0 };
  });
  return sel;
}

// Each ticked idea becomes one grammar card (what is different, plus the extras as a note).
export function cardsFromSentenceSelection(result, selected) {
  const out = [];
  result.grammarPoints.forEach((point, i) => {
    if (!(selected[i] && selected[i].grammar)) return;
    out.push({ type: "grammar", front: point.title, back: point.explanation, notes: point.more, category: "" });
  });
  return out;
}
