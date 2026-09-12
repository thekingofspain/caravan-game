import { applyMove, legalMoves } from "./engine";
import { canPlaceCard } from "./rules/caravanCardRules";
import {
    calcLaneScoreboard,
    calculatePoints,
    calculateRowPoints,
    gameWinner,
    isSellablePoints,
    MAX_SELLABLE,
    MIN_SELLABLE
} from "./scoring";
import {
    AiLevel,
    baseValue,
    Caravan,
    GameState,
    isValueCard,
    LANE_INDICES,
    Move,
    otherPlayer,
    PlayerId
} from "./types";

// #region AI evaluation
const EVAL_SOLD_WEIGHT = 100;
const EVAL_BUST_WEIGHT = 80;
const EVAL_TIE_WEIGHT = 20;

/** Top-K own moves that get a full opponent-reply search in expert. */

const EXPERT_BREADTH = 12;

/** Net Joker value below which building wins (no sale-break). */

const JOKER_MIN_VALUE = 8;

/** Probability the easiest level plays a random legal move instead of the best one. */

export const EASY_RANDOM_P = 0.25;

// ---- Types ----

export type Rng = () => number;

export interface AiOptions {
    level?: AiLevel;
    rng?: Rng;
}

/** Uniform pick clamped against rng() === 1 (Rng documents no range contract). */

function pick<T>(items: readonly T[], rng: Rng): T {
    return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

// ---- Functions ----

function calculateCaravanAdvantage(current: Caravan, opposing: Caravan): number {
    // Points are positional (first/second arg); the seller is resolved
    // player-relatively so this stays correct whichever side is acting.

    const { aiPoints: opposingPoints, humanPoints: currentPoints } = calcLaneScoreboard(current, opposing);
    const seller = laneSeller(currentPoints, opposingPoints);

    if (seller === 1) return EVAL_SOLD_WEIGHT + (currentPoints - 21);

    if (seller === -1) return -EVAL_SOLD_WEIGHT - (26 - opposingPoints);

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

// ---- Tactical eval (hard, option A) ----

/** Player-relative lane seller: 1 = acting sells, -1 = opponent sells, 0 = none. */

function laneSeller(myPoints: number, oppPoints: number): 1 | -1 | 0 {
    const mySellable = isSellablePoints(myPoints);
    const oppSellable = isSellablePoints(oppPoints);

    if (mySellable && (!oppSellable || myPoints > oppPoints)) return 1;

    if (oppSellable && (!mySellable || oppPoints > myPoints)) return -1;

    return 0;
}

function laneBase(myPoints: number, oppPoints: number): number {
    const seller = laneSeller(myPoints, oppPoints);

    if (seller === 1) return EVAL_SOLD_WEIGHT + (myPoints - 21);

    if (seller === -1) return -EVAL_SOLD_WEIGHT - (26 - oppPoints);

    if (isSellablePoints(myPoints)) return -EVAL_TIE_WEIGHT;

    if (myPoints > MAX_SELLABLE) return -EVAL_BUST_WEIGHT;

    if (oppPoints > MAX_SELLABLE) return 8;

    return (myPoints / 21) * 5;
}

/** Count (value card, own lane) pairs the acting player can legally place. */

function countPlaceablePairs(state: GameState, acting: PlayerId): number {
    const player = state.players[acting];
    let n = 0;

    for (const card of player.hand) {
        if (!isValueCard(card)) continue;

        for (const lane of LANE_INDICES) {
            if (canPlaceCard(card, player.caravans[lane])) n += 1;
        }
    }

    return n;
}

function isLaneDead(
    state: GameState,
    acting: PlayerId,
    lane: (typeof LANE_INDICES)[number]
): boolean {
    const car = state.players[acting].caravans[lane];

    if (car.rows.length === 0) return false;

    if (calculatePoints(car) >= 21) return false;

    const player = state.players[acting];

    for (const card of player.hand) {
        if (!isValueCard(card)) continue;

        if (canPlaceCard(card, car)) return false;
    }

    return true;
}

/** Richer board eval: normal lane base + match urgency + mobility + Jack threat. */

export function evaluateTacticalBoard(state: GameState, acting: PlayerId): number {
    const opp = otherPlayer(acting);
    let score = 0;
    let mySellers = 0;
    let oppSellers = 0;

    for (const lane of LANE_INDICES) {
        const myPoints = calculatePoints(state.players[acting].caravans[lane]);
        const oppPoints = calculatePoints(state.players[opp].caravans[lane]);
        const seller = laneSeller(myPoints, oppPoints);

        if (seller === 1) mySellers += 1;
        else if (seller === -1) oppSellers += 1;

        score += laneBase(myPoints, oppPoints);
    }

    // Match urgency: blocking the opponent's third seller / closing our second.

    score += 15 * (mySellers - oppSellers);

    if (oppSellers === 2) score -= 50;

    if (mySellers === 2) score += 25;

    // Mobility: keep lanes playable.

    score += Math.min(countPlaceablePairs(state, acting), 8);

    for (const lane of LANE_INDICES) {
        if (isLaneDead(state, acting, lane)) score -= 6;
    }

    // Jack threat: sold lanes are exposed while the opponent holds a Jack.

    const oppHoldsJack = state.players[opp].hand.some((c) => c.rank === "J");

    if (oppHoldsJack) {
        for (const lane of LANE_INDICES) {
            const myPoints = calculatePoints(state.players[acting].caravans[lane]);
            const oppPoints = calculatePoints(state.players[opp].caravans[lane]);

            if (laneSeller(myPoints, oppPoints) === 1) score -= 10;
        }
    }

    return score;
}

function sellersOf(state: GameState, acting: PlayerId): (1 | -1 | 0)[] {
    const opp = otherPlayer(acting);

    return LANE_INDICES.map((lane) =>
        laneSeller(
            calculatePoints(state.players[acting].caravans[lane]),
            calculatePoints(state.players[opp].caravans[lane])
        )
    );
}

/**
 * Worth of a non-sale removal on a lane at these points: full value within one
 * play of selling (any value card closes up to 10), decaying further away.
 */

function removalWeight(oppPoints: number): number {
    if (oppPoints > MAX_SELLABLE) return 0;

    const gap = MIN_SELLABLE - oppPoints;

    return gap <= 10 ? 1 : 10 / gap;
}

export function tacticalMoveBonus(
    prev: GameState,
    move: Move,
    next: GameState,
    acting: PlayerId,
    level: AiLevel = "hard"
): number {
    const opp = otherPlayer(acting);

    if (move.type === "playOperationCard") {
        const card = prev.players[acting].hand.at(move.handIndex);

        if (card === undefined) return 0;

        const before = sellersOf(prev, acting);
        const after = sellersOf(next, acting);

        if (card.rank === "J" && move.target.player === opp) {
            // Removing the opponent's seller swings ~200 (their sale gone, lane open).

            if (before[move.target.lane] === -1) return 60;

            // Otherwise the value is the net change: the removed row's points,
            // weighted by how close the lane was to selling. Second hits on an
            // already-degraded lane score themselves out of contention.

            const row = prev.players[opp].caravans[move.target.lane].rows.at(move.target.cardIndex);

            if (row === undefined) return 0;

            const lanePoints = calculatePoints(prev.players[opp].caravans[move.target.lane]);

            return Math.min(calculateRowPoints(row) * removalWeight(lanePoints), 20);
        }

        if (card.rank === "K") {
            if (
                move.target.player === acting &&
                before[move.target.lane] !== 1 &&
                after[move.target.lane] === 1
            ) {
                return 25;
            }

            // King on the opponent either busts them out of a sale or gifts points.

            if (
                move.target.player === opp &&
                before[move.target.lane] === -1 &&
                after[move.target.lane] !== -1
            ) {
                return 40;
            }

            if (move.target.player === opp) {
                const oppAfter = calculatePoints(next.players[opp].caravans[move.target.lane]);

                if (oppAfter > MAX_SELLABLE) return 30;
            }

            return 0;
        }

        if (card.rank === "Q") {
            // Points don't change; value is future strangling / reopening.

            if (move.target.player === opp && before[move.target.lane] === -1) return 12;

            if (move.target.player === acting && isLaneDead(prev, acting, move.target.lane)) {
                return 8;
            }

            return 0;
        }

        if (card.rank === "Joker") {
            let oppRemoved = 0;
            let ownRemoved = 0;

            for (const lane of LANE_INDICES) {
                const oppDelta =
                    calculatePoints(prev.players[opp].caravans[lane]) -
                    calculatePoints(next.players[opp].caravans[lane]);

                if (oppDelta > 0) oppRemoved += oppDelta;

                const ownDelta =
                    calculatePoints(prev.players[acting].caravans[lane]) -
                    calculatePoints(next.players[acting].caravans[lane]);

                if (ownDelta > 0) ownRemoved += ownDelta;
            }

            const net = oppRemoved - ownRemoved;
            let saleBreak = false;

            for (const lane of LANE_INDICES) {
                if (before[lane] === -1 && after[lane] !== -1) {
                    saleBreak = true;
                    break;
                }
            }

            // Speculative Jokers with little net value lose to building.

            if (net <= 0 || (!saleBreak && net < JOKER_MIN_VALUE)) return 0;

            return Math.min(Math.min(net, 40) + (saleBreak ? 50 : 0), 60);
        }

        return 0;
    }

    if (move.type === "playValueCard") {
        // Seller-count is scored only above hard: closing and blocking matter more
        // than raw points once the match comes down to two sellers.

        if (level === "hard") return 0;

        const myBefore = sellersOf(prev, acting).filter((s) => s === 1).length;
        const myAfter = sellersOf(next, acting).filter((s) => s === 1).length;
        const oppBefore = sellersOf(prev, acting).filter((s) => s === -1).length;
        const oppAfter = sellersOf(next, acting).filter((s) => s === -1).length;
        let bonus = 0;

        if (myBefore === 1 && myAfter === 2) bonus += 30;

        if (oppBefore < 2 && oppAfter === 2) bonus -= 40;

        return bonus;
    }

    if (move.type === "discardCard") {
        const card = prev.players[acting].hand.at(move.handIndex);

        if (card === undefined) return 0;

        if (isValueCard(card)) {
            const playable = LANE_INDICES.some((lane) =>
                canPlaceCard(card, prev.players[acting].caravans[lane])
            );

            // Throwing away a playable value card hurts; ditching a dead card is fine.

            return playable ? -4 : -0.2;
        }

        return -2;
    }

    // Only disbandCaravan reaches here: every other move type returns above.

    const points = calculatePoints(prev.players[acting].caravans[move.lane]);

    // Base eval already prices the lost seller; bonus only frees busted lanes.

    return points > MAX_SELLABLE ? 10 : 0;
}

function isWinningState(next: GameState, acting: PlayerId): boolean {
    return gameWinner(next) === acting || (next.phase === "over" && next.winner === acting);
}

/** Guardrail: immediate-loss moves are only picked when nothing else exists. */

function nonLosingMoves(state: GameState, acting: PlayerId): Move[] {
    const acts = legalMoves(state);

    if (acts.length === 0) throw new Error("determineBestMove: no legal moves");

    const opp = otherPlayer(acting);
    const safe = acts.filter((a) => !isWinningState(applyMove(state, a), opp));

    return safe.length > 0 ? safe : acts;
}

function determineTacticalBestMove(state: GameState, acting: PlayerId, rng: Rng): Move {
    const acts = nonLosingMoves(state, acting);

    let bestScore = -Infinity;
    let best: Move[] = [];

    for (const a of acts) {
        const next = applyMove(state, a);

        if (isWinningState(next, acting)) return a;

        const sc = evaluateTacticalBoard(next, acting) + tacticalMoveBonus(state, a, next, acting);

        if (sc > bestScore) {
            bestScore = sc;
            best = [a];
        } else if (sc === bestScore) best.push(a);
    }

    return pick(best, rng);
}

// ---- Expert: 2-ply minimax on the tactical eval (option C) ----

function determineExpertBestMove(
    state: GameState,
    acting: PlayerId,
    rng: Rng,
    extraBonus: (prev: GameState, move: Move, next: GameState, acting: PlayerId) => number = () =>
        0,
    level: AiLevel = "expert"
): Move {
    const opp = otherPlayer(acting);
    const acts = nonLosingMoves(state, acting);

    // 1-ply ordering: full reply search only runs on the top-K candidates.

    const ordered = acts.map((a) => {
        const next = applyMove(state, a);

        if (isWinningState(next, acting)) return { a, next, win: true, s1: Infinity, bonus: 0 };

        const bonus =
            tacticalMoveBonus(state, a, next, acting, level) + extraBonus(state, a, next, acting);

        return { a, next, win: false, s1: evaluateTacticalBoard(next, acting) + bonus, bonus };
    });

    const immediate = ordered.find((o) => o.win);

    if (immediate) return immediate.a;

    ordered.sort((x, y) => y.s1 - x.s1);

    const candidates =
        ordered.length <= EXPERT_BREADTH + 4 ? ordered : ordered.slice(0, EXPERT_BREADTH);

    let bestScore = -Infinity;
    let best: Move[] = [];

    for (const { a, next, bonus } of candidates) {
        let final: number;

        if (next.phase === "over") {
            final = next.winner === acting ? Infinity : -Infinity;
        } else {
            const replies = legalMoves(next);

            // Opponent avoids handing us an immediate win unless forced.

            const evaluated = replies.map((b) => {
                const next2 = applyMove(next, b);

                return {
                    next2,
                    suicide: isWinningState(next2, acting),
                    kill: isWinningState(next2, opp)
                };
            });
            const pool = evaluated.filter((e) => !e.suicide);
            const considered = pool.length > 0 ? pool : evaluated;
            let minReply = Infinity;

            for (const e of considered) {
                if (e.kill) {
                    minReply = -Infinity;
                    break;
                }

                const v = evaluateTacticalBoard(e.next2, acting);

                if (v < minReply) minReply = v;
            }

            final = minReply + bonus;
        }

        if (final > bestScore) {
            bestScore = final;
            best = [a];
        } else if (final === bestScore) best.push(a);
    }

    return pick(best, rng);
}

// ---- Master: risk-vs-reward on top of the expert shape ----

/** Reward points gained per point of distance-to-sellable closed. */

const MASTER_REWARD_PER_POINT = 2;

/** Cap so steady progress never outranks a sale-break. */

const MASTER_REWARD_CAP = 16;

/** Bonus per opponent ply-to-win pushed out (negative when letting it shrink). */

const MASTER_RISK_PER_PLY = 30;

function masterReward(prev: GameState, next: GameState, acting: PlayerId): number {
    if (prev.phase === "over" || next.phase === "over") return 0;

    const dist = (points: number): number => Math.max(0, MIN_SELLABLE - points);
    let closed = 0;

    for (const lane of LANE_INDICES) {
        const before = calculatePoints(prev.players[acting].caravans[lane]);
        const after = calculatePoints(next.players[acting].caravans[lane]);

        if (after > MAX_SELLABLE) continue;

        closed += Math.max(0, dist(before) - dist(after));
    }

    return Math.min(closed * MASTER_REWARD_PER_POINT, MASTER_REWARD_CAP);
}

/**
 * Minimal opponent plays to take a lane, assuming best-case cards
 * (any value card closes up to 10 per turn). Busted lanes are unwinnable.
 */

function oppLanePlies(state: GameState, acting: PlayerId, lane: (typeof LANE_INDICES)[number]): number {
    const opp = otherPlayer(acting);
    const myPoints = calculatePoints(state.players[acting].caravans[lane]);
    const oppPoints = calculatePoints(state.players[opp].caravans[lane]);

    if (laneSeller(myPoints, oppPoints) === -1) return 0;

    if (oppPoints > MAX_SELLABLE) return 99;

    if (isSellablePoints(oppPoints)) return 1;

    const hand = state.players[opp].hand;
    const car = state.players[opp].caravans[lane];

    for (const card of hand) {
        if (!isValueCard(card)) continue;

        if (!canPlaceCard(card, car)) continue;

        const after = oppPoints + baseValue(card);

        if (after > MAX_SELLABLE) continue;

        if (isSellablePoints(after) && laneSeller(myPoints, after) === -1) return 1;
    }

    return Math.max(1, Math.ceil((MIN_SELLABLE - oppPoints) / 10));
}

/** Minimal opponent plays to win the game: the two closest lanes (two win). */

function oppGamePlies(state: GameState, acting: PlayerId): number {
    const plies = LANE_INDICES.map((lane) => oppLanePlies(state, acting, lane)).sort((a, b) => a - b);

    return (plies[0] ?? 99) + (plies[1] ?? 99);
}

function masterRisk(prev: GameState, next: GameState, acting: PlayerId): number {
    if (prev.phase === "over" || next.phase === "over") return 0;

    return MASTER_RISK_PER_PLY * (oppGamePlies(next, acting) - oppGamePlies(prev, acting));
}

export function masterMoveBonus(
    prev: GameState,
    _move: Move,
    next: GameState,
    acting: PlayerId
): number {
    return masterReward(prev, next, acting) + masterRisk(prev, next, acting);
}

function determineMasterBestMove(state: GameState, acting: PlayerId, rng: Rng): Move {
    return determineExpertBestMove(state, acting, rng, masterMoveBonus, "master");
}

export function determineBestMove(
    state: GameState,
    actingPlayerId: PlayerId,
    rngOrOpts: Rng | AiOptions = Math.random
): Move {
    const opts: AiOptions = typeof rngOrOpts === "function" ? { rng: rngOrOpts } : rngOrOpts;
    const level: AiLevel = opts.level ?? "normal";
    const rng: Rng = opts.rng ?? Math.random;

    if (level === "master") return determineMasterBestMove(state, actingPlayerId, rng);

    if (level === "expert") return determineExpertBestMove(state, actingPlayerId, rng);

    if (level === "hard") return determineTacticalBestMove(state, actingPlayerId, rng);

    const acts = nonLosingMoves(state, actingPlayerId);

    // Easiest level: mostly greedy, sometimes just plays something legal.

    if (rng() < EASY_RANDOM_P) return pick(acts, rng);

    let bestScore = -Infinity;
    let best: Move[] = [];

    for (const a of acts) {
        const next = applyMove(state, a);

        if (isWinningState(next, actingPlayerId)) return a;

        let sc = evaluateBoard(next, actingPlayerId);

        if (a.type === "discardCard") sc -= 0.5;

        if (sc > bestScore) {
            bestScore = sc;
            best = [a];
        } else if (sc === bestScore) best.push(a);
    }

    return pick(best, rng);
}
// #endregion
