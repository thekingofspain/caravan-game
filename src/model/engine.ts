import { buildDeck } from "./cards";
import { canPlaceCard, hasJackAttached, isValidCardIndex } from "./rules/caravanCardRules";
import { gameWinner } from "./scoring";
import { mulberry32, shuffle } from "./rng";
import { describe, log, removalDetail, resetLogIds } from "./gameLog";
import {
    Move,
    Ai,
    Card,
    Caravan,
    CaravanIndex,
    CARAVAN_COUNT,
    PLAYERS,
    GameState,
    Human,
    IllegalMoveError,
    Nullable,
    PlayerId,
    PlayerState,
    SetupOptions,
    TargetRef,
    isFaceCard,
    isJokerCard,
    isValueCard,
    baseValue
} from "./types";
import type { CaravanRow } from "./types";

function emptyCaravan(): Caravan {
    return { rows: [], direction: null, suit: null };
}

function makePlayer(rng: () => number, deckId: number): PlayerState {
    const deck = shuffle(buildDeck(deckId), rng).slice(0, 30);

    if (deck.length !== 30)
        throw new Error(`makePlayer: deck slice expected 30 got ${String(deck.length)}`);

    const hand = deck.slice(0, 8);
    const rest = deck.slice(8);

    if (hand.length !== 8 || rest.length !== 22)
        throw new Error(
            `makePlayer: hand/deck expected 8/22 got ${String(hand.length)}/${String(rest.length)}`
        );

    return { deck: rest, hand, caravans: [emptyCaravan(), emptyCaravan(), emptyCaravan()] };
}
export function setupGame(opts: SetupOptions): GameState {
    resetLogIds();
    const rng = mulberry32(opts.seed ?? 1);

    return {
        players: [makePlayer(rng, 1), makePlayer(rng, 2)],
        current: opts.first ?? Human,
        phase: "play",
        winner: null,
        log: [],
        started: true
    };
}
function draw(player: PlayerState): void {
    if (player.deck.length > 0) {
        const c = player.deck.shift();

        if (c !== undefined) player.hand.push(c);
    }
}
function normalizeCaravan(car: Caravan): void {
    if (car.rows.length === 0) {
        car.direction = null;
        car.suit = null;
    } else if (car.rows.length === 1) {
        car.direction = null;
        car.suit = car.rows[0][0].suit;
    } else if (car.direction === null) {
        const aRow = car.rows[car.rows.length - 2];
        const bRow = car.rows[car.rows.length - 1];
        const a = baseValue(aRow[0]);
        const b = baseValue(bRow[0]);

        car.direction = b > a ? "asc" : "desc";
    }
}

function jokerRemovals(state: GameState, target: TargetRef): TargetRef[] {
    const targetRow = state.players[target.player].caravans[target.caravan].rows.at(
        target.cardIndex
    );

    if (targetRow === undefined || targetRow.length === 0) return [];

    const targetCard = targetRow[0];
    const isAce = targetCard.rank === "A";
    const suit = targetCard.suit;
    const rankVal = baseValue(targetCard);
    const refs: TargetRef[] = [];

    for (let p = 0; p < 2; p++) {
        const player = p as PlayerId;

        for (let ci = 0; ci < CARAVAN_COUNT; ci++) {
            const car = state.players[player].caravans[ci as 0 | 1 | 2];

            for (let cidx = 0; cidx < car.rows.length; cidx++) {
                const card = car.rows.at(cidx)?.at(0);

                if (card === undefined) continue;

                if (isAce) {
                    if (card.suit === suit)
                        refs.push({ player, caravan: ci as 0 | 1 | 2, cardIndex: cidx });
                } else {
                    if (baseValue(card) === rankVal)
                        refs.push({ player, caravan: ci as 0 | 1 | 2, cardIndex: cidx });
                }
            }
        }
    }

    return refs;
}
function removeTargets(state: GameState, refs: TargetRef[]): void {
    const byCar = new Map<string, number[]>();

    for (const r of refs) {
        const key = `${String(r.player)}-${String(r.caravan)}`;

        if (!byCar.has(key)) byCar.set(key, []);

        byCar.get(key)?.push(r.cardIndex);
    }
    for (const [key, indices] of byCar) {
        const [p, ci] = key.split("-").map(Number) as [PlayerId, CaravanIndex];
        const car = state.players[p].caravans[ci];

        for (const idx of indices.sort((a, b) => b - a)) car.rows.splice(idx, 1);
        normalizeCaravan(car);
    }
}

function handlePlayValueCard(
    next: GameState,
    action: Extract<Move, { type: "playValueCard" }>
): void {
    const player = next.players[action.player];
    const car = player.caravans[action.caravan];
    const card = player.hand.at(action.handIndex);

    if (card === undefined || !isValueCard(card))
        throw new IllegalMoveError("playValueCard: not a value card");

    if (!canPlaceCard(card, car)) throw new IllegalMoveError("playValueCard: cannot place card");

    player.hand.splice(action.handIndex, 1);
    car.rows.push([card]);
    normalizeCaravan(car);
    draw(player);
}

function attachJack(next: GameState, card: Card, target: TargetRef): void {
    const car = next.players[target.player].caravans[target.caravan];
    const tgt = car.rows.at(target.cardIndex);

    if (tgt === undefined) return;

    tgt.push(card);
    removeTargets(next, [target]);
}

function attachQueen(next: GameState, card: Card, target: TargetRef): void {
    const car = next.players[target.player].caravans[target.caravan];
    const tgt = car.rows.at(target.cardIndex);

    if (tgt === undefined) return;

    tgt.push(card);
    if (car.direction !== null) car.direction = car.direction === "asc" ? "desc" : "asc";

    car.suit = card.suit;
}

function attachKing(next: GameState, card: Card, target: TargetRef): void {
    const car = next.players[target.player].caravans[target.caravan];
    const tgt = car.rows.at(target.cardIndex);

    if (tgt === undefined) return;

    tgt.push(card);
}

function attachJoker(next: GameState, card: Card, target: TargetRef): string[] {
    const car = next.players[target.player].caravans[target.caravan];
    const tgt = car.rows.at(target.cardIndex);

    if (tgt === undefined) return [];

    tgt.push(card);
    const refs = jokerRemovals(next, target);
    const detail = removalDetail(next, refs);

    removeTargets(next, refs);

    return detail;
}

function handlePlayFaceCard(
    next: GameState,
    action: Extract<Move, { type: "playFaceCard" }>
): Nullable<string[]> {
    const player = next.players[action.player];
    const card = player.hand.at(action.handIndex);

    if (card === undefined || (!isFaceCard(card) && !isJokerCard(card)))
        throw new IllegalMoveError("playFaceCard: not a face card");

    if (
        !isValidCardIndex(
            next.players[action.target.player].caravans[action.target.caravan],
            action.target.cardIndex
        )
    )
        throw new IllegalMoveError("playFaceCard: invalid target");

    const tgtPre = next.players[action.target.player].caravans[action.target.caravan].rows.at(
        action.target.cardIndex
    );

    if (tgtPre === undefined) throw new IllegalMoveError("playFaceCard: invalid target");

    if (card.rank === "J" && hasJackAttached(tgtPre))
        throw new IllegalMoveError("playFaceCard: Jack on jacked card");

    if (card.rank === "K" && hasJackAttached(tgtPre))
        throw new IllegalMoveError("playFaceCard: King on jacked card");

    player.hand.splice(action.handIndex, 1);
    let jokerDetail: Nullable<string[]> = null;

    if (card.rank === "J") attachJack(next, card, action.target);
    else if (card.rank === "Q") attachQueen(next, card, action.target);
    else if (card.rank === "K") attachKing(next, card, action.target);
    else if (isJokerCard(card)) jokerDetail = attachJoker(next, card, action.target);

    draw(player);

    return jokerDetail;
}

function handleDiscardCard(next: GameState, action: Extract<Move, { type: "discardCard" }>): void {
    const player = next.players[action.player];

    if (player.caravans.some((c) => c.rows.length === 0))
        throw new IllegalMoveError("discardCard: cannot discard before all caravans started");

    if (!player.hand[action.handIndex])
        throw new IllegalMoveError("discardCard: invalid hand index");

    player.hand.splice(action.handIndex, 1);
    draw(player);
}

function handleDismissCaravan(
    next: GameState,
    action: Extract<Move, { type: "dismissCaravan" }>
): void {
    const player = next.players[action.player];

    if (player.caravans.some((c) => c.rows.length === 0))
        throw new IllegalMoveError("dismissCaravan: cannot disband before all caravans started");

    player.caravans[action.caravan] = emptyCaravan();
}
export function cloneAndApply(
    state: GameState,
    action: Move
): { next: GameState; jokerDetail: Nullable<string[]> } {
    if (state.phase === "over") throw new IllegalMoveError("game over");

    if (action.player !== state.current) throw new IllegalMoveError("not current player");

    const next: GameState = structuredClone(state);
    let jokerDetail: Nullable<string[]> = null;

    if (action.type === "playValueCard") handlePlayValueCard(next, action);
    else if (action.type === "playFaceCard") jokerDetail = handlePlayFaceCard(next, action);
    else if (action.type === "discardCard") handleDiscardCard(next, action);
    else handleDismissCaravan(next, action);

    return { next, jokerDetail };
}
export function appendActionLog(
    next: GameState,
    action: Move,
    prev: GameState,
    jokerDetail: Nullable<string[]>
): void {
    const text = describe(action, prev);

    if (text === null) return;

    const entry = log(text);

    if (jokerDetail && jokerDetail.length > 0) entry.detail = jokerDetail;

    next.log = [...next.log, entry];
}
export function resolveTerminal(next: GameState): void {
    const winner = gameWinner(next);

    if (winner !== null) {
        next.phase = "over";
        next.winner = winner;
        next.log = [
            ...next.log,
            log(winner === Human ? "You win the caravan!" : "AI wins the caravan.")
        ];

        return;
    }

    next.current = next.current === Human ? Ai : Human;
    if (legalMoves(next).length === 0) {
        const loser = next.current;

        next.phase = "over";
        next.winner = loser === Human ? Ai : Human;
        next.log = [
            ...next.log,
            log(
                loser === Human
                    ? "You ran out of moves — AI wins."
                    : "AI ran out of moves — you win!"
            )
        ];
    }
}
export function applyMove(state: GameState, action: Move): GameState {
    const { next, jokerDetail } = cloneAndApply(state, action);

    appendActionLog(next, action, state, jokerDetail);
    resolveTerminal(next);

    return next;
}
function isBlockedByJack(row: CaravanRow, rank: string): boolean {
    return (rank === "J" || rank === "K") && hasJackAttached(row);
}
function faceCardTargets(state: GameState, pid: PlayerId, handIndex: number): Move[] {
    const card = state.players[pid].hand.at(handIndex);

    if (card === undefined || (!isFaceCard(card) && !isJokerCard(card))) return [];

    const out: Move[] = [];

    for (const p of PLAYERS)
        for (let ci = 0; ci < CARAVAN_COUNT; ci++) {
            const targetCar = state.players[p].caravans[ci as CaravanIndex];

            for (let cidx = 0; cidx < targetCar.rows.length; cidx++) {
                const row = targetCar.rows[cidx];

                if (isBlockedByJack(row, card.rank)) continue;

                out.push({
                    type: "playFaceCard",
                    player: pid,
                    target: { player: p, caravan: ci as CaravanIndex, cardIndex: cidx },
                    handIndex
                });
            }
        }

    return out;
}
function valueCardMoves(player: PlayerState, pid: PlayerId, filterEmptyOnly: boolean): Move[] {
    const out: Move[] = [];

    for (let ci = 0; ci < player.caravans.length; ci++) {
        const car = player.caravans[ci];

        if (filterEmptyOnly && car.rows.length !== 0) continue;

        for (let hi = 0; hi < player.hand.length; hi++) {
            const card = player.hand[hi];

            if (!isValueCard(card)) continue;

            if (!filterEmptyOnly && !canPlaceCard(card, car)) continue;

            out.push({
                type: "playValueCard",
                player: pid,
                caravan: ci as CaravanIndex,
                handIndex: hi
            });
        }
    }

    return out;
}
export function legalMoves(state: GameState): Move[] {
    if (state.phase === "over") return [];

    const pid = state.current;
    const player = state.players[pid];
    const hasEmpty = player.caravans.some((c) => c.rows.length === 0);

    if (hasEmpty) {
        const valueMoves = valueCardMoves(player, pid, true);

        if (valueMoves.length > 0) return valueMoves;

        return player.hand.flatMap((_, hi) => faceCardTargets(state, pid, hi));
    }

    return [
        ...valueCardMoves(player, pid, false),
        ...player.hand.flatMap((_, hi) => faceCardTargets(state, pid, hi)),
        ...player.hand.map((_, hi) => ({
            type: "discardCard" as const,
            player: pid,
            handIndex: hi
        })),
        ...([0, 1, 2] as CaravanIndex[]).map((ci) => ({
            type: "dismissCaravan" as const,
            player: pid,
            caravan: ci
        }))
    ];
}
