import { Action, GameState, PlayerId } from "./types";
import { applyAction, legalActions } from "./engine";
import { caravanTotal, isInRange } from "./rules";

const OTHER: Record<PlayerId, PlayerId> = { 0: 1, 1: 0 };

function caravanScore(myT: number, oppT: number): number {
  const myIn = isInRange(myT);
  const oppIn = isInRange(oppT);
  if (myIn && oppIn) {
    if (myT > oppT) return 100 + (myT - 21);
    if (myT < oppT) return -100 - (26 - oppT);
    return -20; // tie: unresolved, slightly bad
  }
  if (myIn) return 100 + (myT - 21);
  if (oppIn) return -100 - (26 - oppT);
  if (myT > 26) return -80; // busted
  if (oppT > 26) return 8; // opponent busted, good for me
  return (myT / 21) * 5; // both under: reward progress toward 21
}

export function evaluateState(state: GameState, me: PlayerId): number {
  const other = OTHER[me];
  let score = 0;
  for (let i = 0; i < 3; i++) {
    const myT = caravanTotal(state.players[me].caravans[i]);
    const oppT = caravanTotal(state.players[other].caravans[i]);
    score += caravanScore(myT, oppT);
  }
  return score;
}

export type Rng = () => number;

export function chooseAction(state: GameState, me: PlayerId, rng: Rng = Math.random): Action {
  const acts = legalActions(state);
  if (acts.length === 0) throw new Error("chooseAction: no legal actions");

  let bestScore = -Infinity;
  let best: Action[] = [];
  for (const a of acts) {
    const next = applyAction(state, a);
    let sc = evaluateState(next, me);
    if (a.type === "discard") sc -= 0.5;
    if (sc > bestScore) {
      bestScore = sc;
      best = [a];
    } else if (sc === bestScore) {
      best.push(a);
    }
  }
  return best[Math.floor(rng() * best.length)];
}
