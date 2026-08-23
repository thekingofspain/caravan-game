import { caravanTotal, isInRange } from "./rules";
import { GameState, PlayerId } from "./types";

export function pairWinner(state: GameState, i: 0 | 1 | 2): PlayerId | null {
  const v0 = caravanTotal(state.players[0].caravans[i]);
  const v1 = caravanTotal(state.players[1].caravans[i]);
  const r0 = isInRange(v0);
  const r1 = isInRange(v1);
  if (r0 && r1) return v0 > v1 ? 0 : v1 > v0 ? 1 : null;
  if (r0) return 0;
  if (r1) return 1;
  return null;
}

export function gameWinner(state: GameState): PlayerId | null {
  const w = [pairWinner(state, 0), pairWinner(state, 1), pairWinner(state, 2)];
  if (w.some((x) => x === null)) return null;
  const wins0 = w.filter((x) => x === 0).length;
  return wins0 >= 2 ? 0 : 1;
}

export function allSold(state: GameState): boolean {
  return [0, 1, 2].every((i) => pairWinner(state, i as 0 | 1 | 2) !== null);
}

export function pairsWon(state: GameState): [number, number] {
  let a = 0;
  let b = 0;
  for (let i = 0; i < 3; i++) {
    const w = pairWinner(state, i as 0 | 1 | 2);
    if (w === 0) a++;
    else if (w === 1) b++;
  }
  return [a, b];
}

export function resolveWinner(state: GameState): PlayerId | null {
  const [a, b] = pairsWon(state);
  if (a === b) return null;
  return a > b ? 0 : 1;
}
