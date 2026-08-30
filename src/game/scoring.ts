import { caravanTotal, isInRange } from "./rules";
import { Ai, CARAVAN_COUNT, GameState, Human, PlayerId } from "./types";

export function pairWinner(state: GameState, i: 0 | 1 | 2): PlayerId | null {
  const v0 = caravanTotal(state.players[Human].caravans[i]);
  const v1 = caravanTotal(state.players[Ai].caravans[i]);
  const r0 = isInRange(v0);
  const r1 = isInRange(v1);
  if (r0 && r1) return v0 > v1 ? Human : v1 > v0 ? Ai : null;
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

export function pairsWon(state: GameState): [number, number] {
  let a = 0;
  let b = 0;
  for (let i = 0; i < CARAVAN_COUNT; i++) {
    const w = pairWinner(state, i as 0 | 1 | 2);
    if (w === Human) a++;
    else if (w === Ai) b++;
  }
  return [a, b];
}

export function resolveWinner(state: GameState): PlayerId | null {
  const [a, b] = pairsWon(state);
  if (a === b) return null;
  return a > b ? Human : Ai;
}
