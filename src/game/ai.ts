import { Action, Ai, CARAVAN_COUNT, GameState, Human, PlayerId } from "./types";
import { applyAction, legalActions } from "./engine";
import { caravanTotal, isInRange } from "./rules";

const OTHER: Record<PlayerId, PlayerId> = { [Human]: Ai, [Ai]: Human };

const WIN_BONUS = 100;
const BUST_PENALTY = 80;
const TIE_PENALTY = 20;

function caravanScore(myT: number, oppT: number): number {
  const myIn = isInRange(myT);
  const oppIn = isInRange(oppT);
  if (myIn && oppIn) {
    if (myT > oppT) return WIN_BONUS + (myT - 21);
    if (myT < oppT) return -WIN_BONUS - (26 - oppT);
    return -TIE_PENALTY; // tie: unresolved, slightly bad
  }
  if (myIn) return WIN_BONUS + (myT - 21);
  if (oppIn) return -WIN_BONUS - (26 - oppT);
  if (myT > 26) return -BUST_PENALTY; // busted
  if (oppT > 26) return 8; // opponent busted, good for me
  return (myT / 21) * 5; // both under: reward progress toward 21
}

export function evaluateState(state: GameState, me: PlayerId): number {
  const other = OTHER[me];
  let score = 0;
  for (let i = 0; i < CARAVAN_COUNT; i++) {
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
    if (a.type === "discardCard") sc -= 0.5;
    if (sc > bestScore) {
      bestScore = sc;
      best = [a];
    } else if (sc === bestScore) {
      best.push(a);
    }
  }
  return best[Math.floor(rng() * best.length)];
}
