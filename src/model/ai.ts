import { applyMove, legalMoves } from "./engine";
import { calcLaneScoreboard, gameWinner, isSellablePoints, MAX_SELLABLE } from "./scoring";
import { Ai, Caravan, GameState, Human, LANE_INDICES, Move, otherPlayer, PlayerId } from "./types";

// #region AI evaluation
const EVAL_SOLD_WEIGHT = 100;
const EVAL_BUST_WEIGHT = 80;
const EVAL_TIE_WEIGHT = 20;

// ---- Types ----

export type Rng = () => number;

// ---- Functions ----

function calculateCaravanAdvantage(current: Caravan, opposing: Caravan): number {
    // humanPoints/aiPoints are positional: points of the first/second arg (current/opposing here).

    const { aiPoints: opposingPoints, humanPoints: currentPoints, seller } = calcLaneScoreboard(current, opposing);

    if (seller === Human) return EVAL_SOLD_WEIGHT + (currentPoints - 21);

    if (seller === Ai) return -EVAL_SOLD_WEIGHT - (26 - opposingPoints);

    if (isSellablePoints(currentPoints)) return -EVAL_TIE_WEIGHT;

    if (currentPoints > MAX_SELLABLE) return -EVAL_BUST_WEIGHT;

    if (opposingPoints > MAX_SELLABLE) return 8;

    return (currentPoints / 21) * 5;
}

export function evaluateBoard(state: GameState, actingPlayerId: PlayerId): number {
    let score = 0;

    for (const i of LANE_INDICES) {
        const current: Caravan = state.players[actingPlayerId].caravans[i];
        const opposing = state.players[otherPlayer(actingPlayerId)].caravans[i];

        score += calculateCaravanAdvantage(current, opposing);
    }

    return score;
}

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

        if (gameWinner(next) === actingPlayerId) return a;

        let sc = evaluateBoard(next, actingPlayerId);

        if (a.type === "discardCard") sc -= 0.5;

        if (sc > bestScore) {
            bestScore = sc;
            best = [a];
        } else if (sc === bestScore) best.push(a);
    }

    return best[Math.floor(rng() * best.length)];
}
// #endregion
