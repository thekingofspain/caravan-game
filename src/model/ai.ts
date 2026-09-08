import { applyMove, legalMoves } from "./engine";
import { calculateScore, isSellable, MAX_SELLABLE } from "./rules/caravanCardRules";
import { Ai, Caravan,CARAVAN_INDICES, GameState, Human, Move, PlayerId } from "./types";

const OTHER: Record<PlayerId, PlayerId> = { [Human]: Ai, [Ai]: Human };
const EVAL_SOLD_WEIGHT = 100;
const EVAL_BUST_WEIGHT = 80;
const EVAL_TIE_WEIGHT = 20;

function calculateCaravanAdvantage(current: Caravan, opposing: Caravan): number {
    const currentTotal = calculateScore(current);
    const opposingTotal = calculateScore(opposing);
    const currentSellable = isSellable(current);
    const opposingSellable = isSellable(opposing);

    if (currentSellable && opposingSellable) {
        if (currentTotal > opposingTotal) return EVAL_SOLD_WEIGHT + (currentTotal - 21);

        if (currentTotal < opposingTotal) return -EVAL_SOLD_WEIGHT - (26 - opposingTotal);

        return -EVAL_TIE_WEIGHT;
    }

    if (currentSellable) return EVAL_SOLD_WEIGHT + (currentTotal - 21);

    if (opposingSellable) return -EVAL_SOLD_WEIGHT - (26 - opposingTotal);

    if (currentTotal > MAX_SELLABLE) return -EVAL_BUST_WEIGHT;

    if (opposingTotal > MAX_SELLABLE) return 8;

    return (currentTotal / 21) * 5;
}

export function evaluateBoard(state: GameState, actingPlayerId: PlayerId): number {
    let score = 0;

    for (const i of CARAVAN_INDICES) {
        const current = state.players[actingPlayerId].caravans[i];
        const opposing = state.players[OTHER[actingPlayerId]].caravans[i];

        score += calculateCaravanAdvantage(current, opposing);
    }

    return score;
}
export type Rng = () => number;
export function determineBestMove(
    state: GameState,
    actingPlayerId: PlayerId,
    rng: Rng = Math.random
): Move {
    const acts = legalMoves(state);

    if (acts.length === 0) throw new Error("determineBestMove: no legal moves");

    let bestScore = -Infinity;
    let best: Move[] = [];

    for (const a of acts) {
        const next = applyMove(state, a);
        let sc = evaluateBoard(next, actingPlayerId);

        if (a.type === "discardCard") sc -= 0.5;

        if (sc > bestScore) {
            bestScore = sc;
            best = [a];
        } else if (sc === bestScore) best.push(a);
    }

    return best[Math.floor(rng() * best.length)];
}
