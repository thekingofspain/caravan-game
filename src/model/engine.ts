import { buildDeck } from "./cards";
import { canPlaceCard, isValidCardIndex } from "./rules/caravanCardRules";
import { gameWinner } from "./scoring";
import { mulberry32, shuffle } from "./rng";
import { describe, log, removalDetail, resetLogIds } from "./gameLog";
import {
    Move,
    Ai,
    Card,
    Caravan,
    CaravanIndex,
    CARAVAN_INDICES,
    PLAYERS,
    GameState,
    Human,
    IllegalMoveError,
    LogSegment,
    Nullable,
    PlayerId,
    PlayerState,
    SetupOptions,
    StandardCard,
    Suit,
    TargetRef,
    isFaceCard,
    isJokerCard,
    isValueCard,
    baseValue
} from "./types";

function emptyCaravan(): Caravan {
    return { rows: [], direction: null, suit: null };
}

function makePlayer(rng: () => number, deckId: number): PlayerState {
    let deck = shuffle(buildDeck(deckId), rng).slice(0, 30);
    let hand = deck.slice(0, 8);
    let rest = deck.slice(8);

    // Opening mulligan (Mifflin): without three number cards the hand goes
    // back into the shoe (30 total), reshuffles, and redraws — until it hits.

    for (let i = 0; i < 100 && hand.filter((c) => isValueCard(c)).length < 3; i++) {
        deck = shuffle([...hand, ...rest], rng);
        hand = deck.slice(0, 8);
        rest = deck.slice(8);
    }

    if (deck.length !== 30)
        throw new Error(`makePlayer: deck slice expected 30 got ${String(deck.length)}`);

    if (hand.length !== 8 || rest.length !== 22)
        throw new Error(
            `makePlayer: hand/deck expected 8/22 got ${String(hand.length)}/${String(rest.length)}`
        );

    return {
        deck: rest,
        hand,
        discard: null,
        caravans: [emptyCaravan(), emptyCaravan(), emptyCaravan()]
    };
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
function lastRowSuit(car: Caravan): Suit | null {
    const last = car.rows.at(-1);

    if (last === undefined) return null;

    // Queen ranks only exist on standard cards, whose suits are never null.

    const queens = last.slice(1).filter((c): c is StandardCard => c.rank === "Q");

    if (queens.length === 0) return last[0].suit;

    return queens[queens.length - 1].suit;
}
function normalizeCaravan(car: Caravan): void {
    if (car.rows.length === 0) {
        car.direction = null;
        car.suit = null;
    } else if (car.rows.length === 1) {
        car.direction = null;
        car.suit = lastRowSuit(car);
    } else {
        const aRow = car.rows[car.rows.length - 2];
        const bRow = car.rows[car.rows.length - 1];
        const a = baseValue(aRow[0]);
        const b = baseValue(bRow[0]);

        // Equal heads keep the existing direction (removal edge case);
        // otherwise the bottom pair re-establishes it — including after
        // suit-match plays that break the old run.

        if (a !== b) car.direction = b > a ? "asc" : "desc";

        car.suit = lastRowSuit(car);
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

    for (const player of PLAYERS) {
        for (const ci of CARAVAN_INDICES) {
            const car = state.players[player].caravans[ci];

            for (let cidx = 0; cidx < car.rows.length; cidx++) {
                const card = car.rows.at(cidx)?.at(0);

                if (card === undefined) continue;

                if (isAce) {
                    if (card.suit === suit) refs.push({ player, caravan: ci, cardIndex: cidx });
                } else {
                    if (baseValue(card) === rankVal)
                        refs.push({ player, caravan: ci, cardIndex: cidx });
                }
            }
        }
    }

    return refs;
}
function removeTargets(state: GameState, refs: TargetRef[]): void {
    const byCar = new Map<PlayerId, Map<CaravanIndex, number[]>>();

    for (const r of refs) {
        let byCi = byCar.get(r.player);

        if (!byCi) {
            byCi = new Map();
            byCar.set(r.player, byCi);
        }

        let indices = byCi.get(r.caravan);

        if (!indices) {
            indices = [];
            byCi.set(r.caravan, indices);
        }

        indices.push(r.cardIndex);
    }
    for (const [p, byCi] of byCar)
        for (const [ci, indices] of byCi) {
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
    car.started = true;
    normalizeCaravan(car);
    draw(player);
}

function attachJack(next: GameState, target: TargetRef): LogSegment[][] {
    const detail = removalDetail(next, [target]);

    removeTargets(next, [target]);

    return detail;
}

function attachQueen(next: GameState, card: Card, target: TargetRef): void {
    const car = next.players[target.player].caravans[target.caravan];
    const tgt = car.rows.at(target.cardIndex);

    if (tgt === undefined) return;

    tgt.push(card);
    if (car.direction !== null) car.direction = car.direction === "asc" ? "desc" : "asc";

    // The queen imposes its own suit until rows change again.

    car.suit = card.suit;
}

function attachKing(next: GameState, card: Card, target: TargetRef): void {
    const car = next.players[target.player].caravans[target.caravan];
    const tgt = car.rows.at(target.cardIndex);

    if (tgt === undefined) return;

    tgt.push(card);
}
function attachJoker(next: GameState, card: Card, target: TargetRef): LogSegment[][] {
    const refs = jokerRemovals(next, target);
    const detail = removalDetail(next, refs);

    removeTargets(next, refs);

    return detail;
}

function handlePlayFaceCard(
    next: GameState,
    action: Extract<Move, { type: "playFaceCard" }>
): Nullable<LogSegment[][]> {
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

    // At most three pictures ride on one number card; fuller rows only leave
    // via Joker elsewhere or disbanding.

    if (tgtPre.length - 1 >= 3)
        throw new IllegalMoveError("playFaceCard: row already has three pictures");

    if (
        card.rank === "Q" &&
        action.target.cardIndex !==
            next.players[action.target.player].caravans[action.target.caravan].rows.length - 1
    )
        throw new IllegalMoveError("playFaceCard: Queen must target the last row");

    player.hand.splice(action.handIndex, 1);
    let jokerDetail: Nullable<LogSegment[][]> = null;

    if (card.rank === "J") jokerDetail = attachJack(next, action.target);
    else if (card.rank === "Q") attachQueen(next, card, action.target);
    else if (card.rank === "K") attachKing(next, card, action.target);
    else if (isJokerCard(card)) jokerDetail = attachJoker(next, card, action.target);

    draw(player);

    return jokerDetail;
}

function handleDiscardCard(next: GameState, action: Extract<Move, { type: "discardCard" }>): void {
    const player = next.players[action.player];
    const mustFillEmpty =
        player.caravans.some((c) => c.rows.length === 0) && player.hand.some((c) => isValueCard(c));

    if (mustFillEmpty) throw new IllegalMoveError("discardCard: must fill empty caravans first");

    if (action.handIndex < 0 || action.handIndex >= player.hand.length)
        throw new IllegalMoveError("discardCard: invalid hand index");

    const [card] = player.hand.splice(action.handIndex, 1);

    player.discard = card;
    draw(player);
}

function handleDisbandCaravan(
    next: GameState,
    action: Extract<Move, { type: "disbandCaravan" }>
): void {
    const player = next.players[action.player];

    if (player.caravans.some((c) => !(c.started ?? c.rows.length > 0)))
        throw new IllegalMoveError("disbandCaravan: cannot disband before all caravans started");

    if (player.caravans[action.caravan].rows.length === 0)
        throw new IllegalMoveError("disbandCaravan: caravan already empty");

    player.caravans[action.caravan] = { ...emptyCaravan(), started: true };
}
export function cloneAndApply(
    state: GameState,
    action: Move
): { next: GameState; jokerDetail: Nullable<LogSegment[][]> } {
    if (state.phase === "over") throw new IllegalMoveError("game over");

    if (action.player !== state.current) throw new IllegalMoveError("not current player");

    const next: GameState = structuredClone(state);
    let jokerDetail: Nullable<LogSegment[][]> = null;

    if (action.type === "playValueCard") handlePlayValueCard(next, action);
    else if (action.type === "playFaceCard") jokerDetail = handlePlayFaceCard(next, action);
    else if (action.type === "discardCard") handleDiscardCard(next, action);
    else handleDisbandCaravan(next, action);

    return { next, jokerDetail };
}
export function appendActionLog(
    next: GameState,
    action: Move,
    prev: GameState,
    jokerDetail: Nullable<LogSegment[][]>
): void {
    const entryData = describe(action, prev);

    if (entryData === null) return;

    const entry = log(entryData);

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
            log({
                segments: [winner === Human ? "You won the game." : "AI won the game."],
                player: winner
            })
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
            log({
                segments: [
                    loser === Human
                        ? "You ran out of moves — AI wins."
                        : "AI ran out of moves — You win!"
                ]
            })
        ];
    }
}
export function applyMove(state: GameState, action: Move): GameState {
    const { next, jokerDetail } = cloneAndApply(state, action);

    appendActionLog(next, action, state, jokerDetail);
    resolveTerminal(next);

    return next;
}
function faceCardTargets(state: GameState, pid: PlayerId, handIndex: number): Move[] {
    const card = state.players[pid].hand.at(handIndex);

    if (card === undefined || (!isFaceCard(card) && !isJokerCard(card))) return [];

    const out: Move[] = [];

    for (const p of PLAYERS)
        for (const ci of CARAVAN_INDICES) {
            const targetCar = state.players[p].caravans[ci];

            for (let cidx = 0; cidx < targetCar.rows.length; cidx++) {
                const row = targetCar.rows[cidx];

                // At most three pictures ride on one number card.

                if (row.length - 1 >= 3) continue;

                // Queens ride on the latest (last-row) card only.

                if (card.rank === "Q" && cidx !== targetCar.rows.length - 1) continue;

                out.push({
                    type: "playFaceCard",
                    player: pid,
                    target: { player: p, caravan: ci, cardIndex: cidx },
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

        // Opening bind: empty slots unfillable (face cards/Jokers only), so the
        // only move is discard — and only with cards left in the shoe. With an
        // empty shoe there are no moves and resolveTerminal ends the game.

        if (player.deck.length === 0) return [];

        return player.hand.map((_, hi) => ({
            type: "discardCard" as const,
            player: pid,
            handIndex: hi
        }));
    }

    return [
        ...valueCardMoves(player, pid, false),
        ...player.hand.flatMap((_, hi) => faceCardTargets(state, pid, hi)),
        ...player.hand.map((_, hi) => ({
            type: "discardCard" as const,
            player: pid,
            handIndex: hi
        })),
        ...CARAVAN_INDICES.map((ci) => ({
            type: "disbandCaravan" as const,
            player: pid,
            caravan: ci
        }))
    ];
}
