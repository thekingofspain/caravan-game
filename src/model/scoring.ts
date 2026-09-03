import { calculateCaravanState } from "./rules/caravanCardRules";
import { Ai, GameState, Human, PlayerId } from "./types";

export function caravanSeller(state: GameState, i: 0 | 1 | 2): PlayerId | null {
  const s0 = calculateCaravanState(state.players[Human].caravans[i]);
  const s1 = calculateCaravanState(state.players[Ai].caravans[i]);
  const r0 = s0.status === "sellable";
  const r1 = s1.status === "sellable";
  if (r0 && r1) return s0.total > s1.total ? Human : s1.total > s0.total ? Ai : null;
  if (r0) return Human;
  if (r1) return Ai;
  return null;
}

export interface CaravanScoreMeta {
  total: number;
  isSellable: boolean;
  isSold: boolean;
}
export interface GameScores {
  humanScores: CaravanScoreMeta[];
  aiScores: CaravanScoreMeta[];
  humanWins: number;
  aiWins: number;
  sellers: (PlayerId | null)[];
}
export function getCaravanScores(state: GameState): GameScores {
  const rows = [0, 1, 2] as const;
  const humanScores: CaravanScoreMeta[] = [];
  const aiScores: CaravanScoreMeta[] = [];
  const sellers: (PlayerId | null)[] = [];
  for (const ci of rows) {
    const hSt = calculateCaravanState(state.players[Human].caravans[ci]);
    const aSt = calculateCaravanState(state.players[Ai].caravans[ci]);
    const seller = caravanSeller(state, ci);
    sellers[ci] = seller;
    humanScores[ci] = { total: hSt.total, isSellable: hSt.status === "sellable", isSold: hSt.status === "sellable" && seller === Human };
    aiScores[ci] = { total: aSt.total, isSellable: aSt.status === "sellable", isSold: aSt.status === "sellable" && seller === Ai };
  }
  const humanWins = sellers.filter((s) => s === Human).length;
  const aiWins = sellers.filter((s) => s === Ai).length;
  return { humanScores, aiScores, humanWins, aiWins, sellers };
}


export const pairWinner = caravanSeller;
export function gameWinner(state: GameState): PlayerId | null {
  const w = [caravanSeller(state, 0), caravanSeller(state, 1), caravanSeller(state, 2)];
  if (w.some((x) => x === null)) return null;
  const wins0 = w.filter((x) => x === Human).length;
  return wins0 >= 2 ? Human : Ai;
}
