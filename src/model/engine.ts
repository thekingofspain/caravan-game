import { buildDeck } from "./cards";
import { actor, cardsToRemove, describe, log, removalDetail, resetLogIds } from "./gameLog";
import { mulberry32, shuffle } from "./rng";
import { canPlaceCard, isValidCardIndex } from "./rules/caravanCardRules";
import { gameWinner } from "./scoring";
import {
    Ai,
    baseValue,
    Caravan,
    FaceCard,
    GameState,
    Human,
    IllegalMoveError,
    isOperationCard,
    isValueCard,
    JokerCard,
    LANE_INDICES,
    LaneIndex,
    LogSegment,
    Move,
    Nullable,
    otherPlayer,
    playedCard,
    PlayerId,
    PLAYERS,
    PlayerState,
    SetupOptions,
    Suit,
    SuitedCard,
    TargetRef} from "./types";

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
        {throw new Error(`makePlayer: deck slice expected 30 got ${String(deck.length)}`);}

    if (hand.length !== 8 || rest.length !== 22)
        {throw new Error(
            `makePlayer: hand/deck expected 8/22 got ${String(hand.length)}/${String(rest.length)}`
        );}

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

function inOpeningRound(player: PlayerState): boolean {
    return player.caravans.some((c) => !(c.started ?? c.rows.length > 0));
}

function lastRowSuit(car: Caravan): Nullable<Suit> {
    const last = car.rows.at(-1);

    if (last === undefined) return null;

    // Queen ranks only exist on standard cards, whose suits are never null.

    const queens = last.slice(1).filter((c): c is SuitedCard => c.rank === "Q");

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
    const targetRow = state.players[target.player].caravans[target.lane].rows.at(
        target.cardIndex
    );

    if (targetRow === undefined || targetRow.length === 0) return [];

    const targetCard = targetRow[0];
    const isAce = targetCard.rank === "A";
    const suit = targetCard.suit;
    const rankVal = baseValue(targetCard);
    const refs: TargetRef[] = [];

    for (const player of PLAYERS) {
        for (const laneIndex of LANE_INDICES) {
            const car = state.players[player].caravans[laneIndex];

            for (let cidx = 0; cidx < car.rows.length; cidx++) {
                const card = car.rows.at(cidx)?.at(0);

                if (card === undefined) continue;

                if (player === target.player && laneIndex === target.lane && cidx === target.cardIndex)
                    {continue;}

                if (isAce) {
                    if (card.suit === suit) refs.push({ player, lane: laneIndex, cardIndex: cidx });
                } else {
                    if (baseValue(card) === rankVal)
                        {refs.push({ player, lane: laneIndex, cardIndex: cidx });}
                }
            }
        }
    }

    return refs;
}

function removeTargets(state: GameState, refs: TargetRef[]): void {
    const rows = cardsToRemove(state, refs).sort(
        (a, b) => b.ref.player - a.ref.player || b.ref.lane - a.ref.lane || b.ref.cardIndex - a.ref.cardIndex
    );
    const touched = new Set<Caravan>();

    for (const { ref } of rows) {
        const car = state.players[ref.player].caravans[ref.lane];

        car.rows.splice(ref.cardIndex, 1);
        touched.add(car);
    }

    for (const car of touched) normalizeCaravan(car);
}

function handlePlayValueCard(
    next: GameState,
    action: Extract<Move, { type: "playValueCard" }>
): void {
    const player = next.players[action.player];
    const wasOpening = inOpeningRound(player);
    const car = player.caravans[action.lane];
    const card = player.hand.at(action.handIndex);

    if (card === undefined || !isValueCard(card))
        {throw new IllegalMoveError("playValueCard: not a value card");}

    if (!canPlaceCard(card, car)) throw new IllegalMoveError("playValueCard: cannot place card");

    player.hand.splice(action.handIndex, 1);
    car.rows.push([card]);
    car.started = true;
    normalizeCaravan(car);
    if (!wasOpening) draw(player);
}

function attachJack(next: GameState, target: TargetRef): LogSegment[][] {
    const detail = removalDetail(next, [target]);

    removeTargets(next, [target]);

    return detail;
}

function attachQueen(next: GameState, card: FaceCard, target: TargetRef): void {
    const car = next.players[target.player].caravans[target.lane];
    const tgt = car.rows.at(target.cardIndex);

    if (tgt === undefined) return;

    tgt.push(card);
    if (car.direction !== null) car.direction = car.direction === "asc" ? "desc" : "asc";

    // The queen imposes its own suit until rows change again.

    car.suit = card.suit;
}

function attachKing(next: GameState, card: FaceCard, target: TargetRef): void {
    const car = next.players[target.player].caravans[target.lane];
    const tgt = car.rows.at(target.cardIndex);

    if (tgt === undefined) return;

    tgt.push(card);
}

function attachJoker(next: GameState, card: JokerCard, target: TargetRef): LogSegment[][] {
    const refs = jokerRemovals(next, target);
    const detail = removalDetail(next, refs);

    removeTargets(next, refs);

    // The Joker rides its host row like K/Q (removals always spare the target).

    const tgt = next.players[target.player].caravans[target.lane].rows.at(target.cardIndex);

    if (tgt !== undefined) tgt.push(card);

    return detail;
}

function handleOperationCard(
    next: GameState,
    action: Extract<Move, { type: "playOperationCard" }>
): Nullable<LogSegment[][]> {
    const player = next.players[action.player];
    const wasOpening = inOpeningRound(player);
    const card = player.hand.at(action.handIndex);

    if (card === undefined || !isOperationCard(card))
        {throw new IllegalMoveError("playOperationCard: not an operation card");}

    if (
        !isValidCardIndex(
            next.players[action.target.player].caravans[action.target.lane],
            action.target.cardIndex
        )
    )
        {throw new IllegalMoveError("playOperationCard: invalid target");}

    const tgtPre = next.players[action.target.player].caravans[action.target.lane].rows.at(
        action.target.cardIndex
    );

    if (tgtPre === undefined) throw new IllegalMoveError("playOperationCard: invalid target");

    // At most three pictures ride on one number card; fuller rows only leave
    // via Joker elsewhere or disbanding.

    if (tgtPre.length - 1 >= 3)
        {throw new IllegalMoveError("playOperationCard: row already has three pictures");}

    if (
        card.rank === "Q" &&
        action.target.cardIndex !==
            next.players[action.target.player].caravans[action.target.lane].rows.length - 1
    )
        {throw new IllegalMoveError("playOperationCard: Queen must target the last row");}

    player.hand.splice(action.handIndex, 1);
    let jokerDetail: Nullable<LogSegment[][]> = null;

    switch (card.rank) {
        case "J":
            jokerDetail = attachJack(next, action.target);
            break;
        case "Q":
            attachQueen(next, card, action.target);
            break;
        case "K":
            attachKing(next, card, action.target);
            break;
        case "Joker":
            jokerDetail = attachJoker(next, card, action.target);
            break;
        default: {
            const exhaustive: never = card;

            throw new IllegalMoveError(`playOperationCard: unexpected card ${JSON.stringify(exhaustive)}`);
        }
    }

    if (!wasOpening) draw(player);

    return jokerDetail;
}

function handleDiscardCard(next: GameState, action: Extract<Move, { type: "discardCard" }>): void {
    const player = next.players[action.player];
    const wasOpening = inOpeningRound(player);

    if (inOpeningRound(player)) throw new IllegalMoveError("discardCard: must fill empty caravans first");

    if (action.handIndex < 0 || action.handIndex >= player.hand.length)
        {throw new IllegalMoveError("discardCard: invalid hand index");}

    const [card] = player.hand.splice(action.handIndex, 1);

    player.discard = card;
    if (!wasOpening) draw(player);
}

function handleDisbandCaravan(
    next: GameState,
    action: Extract<Move, { type: "disbandCaravan" }>
): void {
    const player = next.players[action.player];

    if (inOpeningRound(player))
        {throw new IllegalMoveError("disbandCaravan: cannot disband before all caravans started");}

    if (player.caravans[action.lane].rows.length === 0)
        {throw new IllegalMoveError("disbandCaravan: caravan already empty");}

    player.caravans[action.lane] = { ...emptyCaravan(), started: true };
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
    else if (action.type === "playOperationCard") jokerDetail = handleOperationCard(next, action);
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

    next.log = [...next.log, log({ ...entryData, detail: jokerDetail ?? undefined })];
}

// Shared no-moves loss: loser and their log line in one place.

function applyNoMovesLoss(next: GameState, loser: PlayerId): void {
    next.phase = "over";
    next.winner = otherPlayer(loser);
    next.log = [
        ...next.log,
        log({
            segments:
                loser === Human
                    ? [actor(Human, "subject"), " ran out of moves — ", actor(Ai, "subject"), " wins."]
                    : [actor(Ai, "subject"), " ran out of moves — ", actor(Human, "subject"), " win!"]
        })
    ];
}

// Turn player has no legal moves at turn start (e.g. unfillable empties
// with no value cards): they lose immediately.

export function forfeitNoMoves(state: GameState): GameState {
    const forfeited: GameState = structuredClone(state);

    applyNoMovesLoss(forfeited, state.current);

    return forfeited;
}

export function resolveTerminal(next: GameState): void {
    const winner = gameWinner(next);

    if (winner !== null) {
        next.phase = "over";
        next.winner = winner;
        next.log = [
            ...next.log,
            log({
                segments: [actor(winner, "subject"), " won the game."],
                player: winner
            })
        ];

        return;
    }

    if (next.players[Human].hand.length === 0) {
        next.phase = "over";
        next.winner = Ai;
        next.log = [
            ...next.log,
            log({
                segments: [actor(Human, "subject"), " ran out of cards — ", actor(Ai, "subject"), " wins."]
            })
        ];

        return;
    }

    if (next.players[Ai].hand.length === 0) {
        next.phase = "over";
        next.winner = Human;
        next.log = [
            ...next.log,
            log({
                segments: [actor(Ai, "subject"), " ran out of cards — ", actor(Human, "subject"), " win!"]
            })
        ];

        return;
    }

    next.current = otherPlayer(next.current);
    if (legalMoves(next).length === 0) applyNoMovesLoss(next, next.current);
}

export function applyMove(state: GameState, action: Move): GameState {
    const { next, jokerDetail } = cloneAndApply(state, action);

    appendActionLog(next, action, state, jokerDetail);
    resolveTerminal(next);

    return next;
}

function operationCardTargets(state: GameState, pid: PlayerId, handIndex: number): Move[] {
    const card = playedCard(state, pid, handIndex);

    if (!isOperationCard(card)) return [];

    const out: Move[] = [];

    for (const p of PLAYERS)
        {for (const laneIndex of LANE_INDICES) {
            const targetCar = state.players[p].caravans[laneIndex];

            for (let cidx = 0; cidx < targetCar.rows.length; cidx++) {
                const row = targetCar.rows[cidx];

                // At most three pictures ride on one number card.

                if (row.length - 1 >= 3) continue;

                // Queens ride on the latest (last-row) card only.

                if (card.rank === "Q" && cidx !== targetCar.rows.length - 1) continue;

                out.push({
                    type: "playOperationCard",
                    player: pid,
                    target: { player: p, lane: laneIndex, cardIndex: cidx },
                    handIndex
                });
            }
        }}

    return out;
}

function valueCardMoves(player: PlayerState, pid: PlayerId, filterEmptyOnly: boolean): Move[] {
    const out: Move[] = [];

    for (let laneIndex = 0; laneIndex < player.caravans.length; laneIndex++) {
        const car = player.caravans[laneIndex];

        if (filterEmptyOnly && car.rows.length !== 0) continue;

        for (let hi = 0; hi < player.hand.length; hi++) {
            const card = player.hand[hi];

            if (!isValueCard(card)) continue;

            if (!filterEmptyOnly && !canPlaceCard(card, car)) continue;

            out.push({
                type: "playValueCard",
                player: pid,
                lane: laneIndex as LaneIndex,
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

    // Opening only (the first 6 value moves): `started` is set on placement
    // and never cleared, so this is false for the rest of the game — even
    // with an emptied caravan. No discards or disbands until it clears.

    const isOpening = inOpeningRound(player);

    if (isOpening) {
        // Value cards into the empties, or no moves (stuck player loses).

        return valueCardMoves(player, pid, true);
    }

    return [
        ...valueCardMoves(player, pid, false),
        ...player.hand.flatMap((_, hi) => operationCardTargets(state, pid, hi)),
        ...player.hand.map((_, hi) => ({
            type: "discardCard" as const,
            player: pid,
            handIndex: hi
        })),
        ...LANE_INDICES.filter((laneIndex) => player.caravans[laneIndex].rows.length > 0).map((laneIndex) => ({
            type: "disbandCaravan" as const,
            player: pid,
            lane: laneIndex
        }))
    ];
}
