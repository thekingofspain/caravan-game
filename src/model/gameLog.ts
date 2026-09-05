import { caravanName } from "./names";
import {
    Card,
    GameState,
    Human,
    LogEntry,
    LogSegment,
    Move,
    Nullable,
    SUIT_SYMBOL,
    TargetRef,
    isJokerCard
} from "./types";

let logId = 0;

export function resetLogIds(): void {
    logId = 0;
}

export function log(entry: Omit<LogEntry, "id" | "text">): LogEntry {
    logId += 1;
    const text = entry.segments.map((s) => (typeof s === "string" ? s : formatCardLog(s))).join("");

    return { id: logId, text, ...entry };
}

export function formatCardLog(card: Card): string {
    if (isJokerCard(card)) return `{${card.jokerType} Joker}`;

    return `{${card.rank}${SUIT_SYMBOL[card.suit]}}`;
}

export function removalDetail(state: GameState, refs: TargetRef[]): LogSegment[][] {
    const byRow = new Map<string, { ref: TargetRef; cards: Card[] }>();

    for (const r of refs) {
        const car = state.players[r.player].caravans[r.caravan];
        const row = car.rows[r.cardIndex];
        const key = `${String(r.player)}-${String(r.caravan)}-${String(r.cardIndex)}`;

        const isLastJoker = row[row.length - 1].rank === "Joker";
        const cardsToPush: Card[] = isLastJoker ? row.slice(0, -1) : [...row];
        const existing = byRow.get(key);

        if (existing === undefined) {
            byRow.set(key, { ref: r, cards: cardsToPush });
        } else {
            existing.cards.push(...cardsToPush);
        }
    }

    const sorted = [...byRow.values()].sort((a, b) => {
        if (a.ref.player !== b.ref.player) return b.ref.player - a.ref.player;

        if (a.ref.caravan !== b.ref.caravan) return a.ref.caravan - b.ref.caravan;

        return a.ref.cardIndex - b.ref.cardIndex;
    });

    const detail: LogSegment[][] = [];

    for (const { ref, cards } of sorted) {
        const owner: LogSegment[] = ref.player === Human ? ["You", " "] : ["AI", "'s "];

        for (const card of cards) {
            detail.push([
                "removal of ",
                card,
                " from ",
                ...owner,
                caravanName(ref.player, ref.caravan)
            ]);
        }
    }

    return detail;
}

export function describe(action: Move, state: GameState): Nullable<Omit<LogEntry, "id" | "text">> {
    const who = action.player === Human ? "You" : "AI";

    if (action.type === "playValueCard") {
        const card = state.players[action.player].hand[action.handIndex];

        return {
            player: action.player,
            action: action.type,
            card,
            caravan: action.caravan,
            segments: [who, " played ", card, " to ", caravanName(action.player, action.caravan)]
        };
    }

    if (action.type === "playFaceCard") {
        const card = state.players[action.player].hand[action.handIndex];
        const carTgt = state.players[action.target.player].caravans[action.target.caravan];
        const tgt = carTgt.rows[action.target.cardIndex];
        const tgtCard = tgt[0];
        const segments: LogSegment[] = [
            who,
            " played ",
            card,
            " on ",
            action.target.player === Human ? "You's " : "AI's ",
            caravanName(action.target.player, action.target.caravan),
            " ",
            tgtCard
        ];

        return {
            player: action.player,
            action: action.type,
            card,
            target: action.target,
            segments
        };
    }

    if (action.type === "discardCard") {
        const card = state.players[action.player].hand[action.handIndex];

        return {
            player: action.player,
            action: action.type,
            card,
            segments: [who, " discarded ", card]
        };
    }

    return {
        player: action.player,
        action: action.type,
        caravan: action.caravan,
        segments: [who, " disbanded ", caravanName(action.player, action.caravan)]
    };
}
