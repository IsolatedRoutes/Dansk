import WORD_DATA from "../data/words.tsv?raw";
import { makeOrder, knownPlainSet, plainKey } from "./learningOrderCore";

export { knownPlainSet, plainKey };
export const ORDER = makeOrder(WORD_DATA);
