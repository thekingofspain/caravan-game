import { CARAVAN_COUNT, GameState, Human, Ai, PlayerId, Move } from "./types";
import { applyMove, legalMoves } from "./engine";
import { calculateCaravanState } from "./rules/caravanCardRules";

const OTHER: Record<PlayerId, PlayerId> = { [Human]: Ai, [Ai]: Human };
const EVAL_SOLD_WEIGHT = 100;
const EVAL_BUST_WEIGHT = 80;
const EVAL_TIE_WEIGHT = 20;

function calculateCaravanAdvantage(current: any, opposing: any): number {
  const currentSellable = current.status === "sellable";
  const opposingSellable = opposing.status === "sellable";
  const currentTotal = current.total ?? 0;
  const opposingTotal = opposing.total ?? 0;
  if (currentSellable && opposingSellable) {
    if (currentTotal > opposingTotal) return EVAL_SOLD_WEIGHT + (currentTotal - 21);
    if (currentTotal < opposingTotal) return -EVAL_SOLD_WEIGHT - (26 - opposingTotal);
    return -EVAL_TIE_WEIGHT;
  }
  if (currentSellable) return EVAL_SOLD_WEIGHT + (currentTotal - 21);
  if (opposingSellable) return -EVAL_SOLD_WEIGHT - (26 - opposingTotal);
  if (current.status === "busted") return -EVAL_BUST_WEIGHT;
  if (opposing.status === "busted") return 8;
  return (currentTotal / 21) * 5;
}

export function evaluateBoard(state: GameState, actingPlayerId: PlayerId): number {
  let score = 0;
  for (let i=0; i<CARAVAN_COUNT; i++) {
    const current = calculateCaravanState(state.players[actingPlayerId].caravans[i as 0|1|2]);
    const opposing = calculateCaravanState(state.players[OTHER[actingPlayerId]].caravans[i as 0|1|2]);
    score += calculateCaravanAdvantage(current, opposing);
  }
  return score;
}
export type Rng = () => number;
export function determineBestMove(state: GameState, actingPlayerId: PlayerId, rng: Rng = Math.random): Move {
  const acts = legalMoves(state);
  if (acts.length === 0) throw new Error("determineBestMove: no legal moves");
  let bestScore = -Infinity;
  let best: Move[] = [];
  for (const a of acts) {
    const next = applyMove(state, a);
    let sc = evaluateBoard(next, actingPlayerId);
    if (a.type === "discardCard") sc -= 0.5;
    if (sc > bestScore) { bestScore = sc; best = [a]; } else if (sc === bestScore) best.push(a);
  }
  return best[Math.floor(rng() * best.length)];
}
