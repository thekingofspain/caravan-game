import { calculateCaravanState } from "./rules/caravanCardRules";
import { Ai, CARAVAN_COUNT, GameState, Human, PlayerId } from "./types";

export function pairWinner(state: GameState, i: 0 | 1 | 2): PlayerId | null {
  const s0 = calculateCaravanState(state.players[Human].caravans[i]);
  const s1 = calculateCaravanState(state.players[Ai].caravans[i]);
  const r0 = s0.status === "sellable";
  const r1 = s1.status === "sellable";
  if (r0 && r1) return s0.total > s1.total ? Human : s1.total > s0.total ? Ai : null;
  if (r0) return Human;
  if (r1) return Ai;
  return null;
}

export function gameWinner(state: GameState): PlayerId | null {
  const w = [pairWinner(state, 0), pairWinner(state, 1), pairWinner(state, 2)];
  if (w.some((x) => x === null)) return null;
  const wins0 = w.filter((x) => x === Human).length;
  return wins0 >= 2 ? Human : Ai;
}

export function allSold(state: GameState): boolean {
  return Array.from({length: CARAVAN_COUNT}, (_,i)=> i as 0|1|2).every((i) => pairWinner(state, i) !== null);
}
