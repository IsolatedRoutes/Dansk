// Which level the learner chose on the Study screen, as a sentence for the
// "Analyze sentence" prompt so it picks points that suit them. With no level
// chosen (or all four), the AI judges from the text itself.
import { LEVELS } from "../data/categories";
import { storeGet } from "./storage";

export async function analysisLevelHint() {
  try {
    const raw = await storeGet("studySettings");
    const o = raw ? JSON.parse(raw) : null;
    const ids = o && Array.isArray(o.levels) ? o.levels.filter((l) => LEVELS.some((x) => x.id === l)) : [];
    if (ids.length === 0 || ids.length === LEVELS.length) {
      return " The learner has not chosen a level: judge what to teach from how hard the text is, favoring what a learner of that text would most likely stumble on.";
    }
    const names = LEVELS.filter((l) => ids.includes(l.id)).map((l) => l.name + " (" + l.cefr + ")");
    return " The learner is studying at these levels: " + names.join(", ") + ". Pick points that suit them: at their level, skip things clearly easier than the lowest chosen level unless one is the key point of this text, and do not teach things far beyond the highest chosen level.";
  } catch {
    return "";
  }
}
