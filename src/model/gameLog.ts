import { cardNameText } from "./cards";
import { caravanName } from "./names";
import {
    ActorRef,
    Ai,
    CARAVAN_INDICES,
    CaravanIndex,
    CaravanRef,
    Card,
    GameState,
    Human,
    JOKER_RANK,
    LogEntry,
    LogSegment,
    Move,
    Nullable,
    PlayerId,
    PLAYERS,
    TargetRef,
} from "./types";

let logId = 0;

export function resetLogIds(): void {
    logId = 0;
}

export function log(entry: Omit<LogEntry, "id" | "text">): LogEntry {
    logId += 1;
    const text = segmentsText(entry.segments);

    return { id: logId, text, ...entry };
}

function formatCardLog(card: Card): string {
    return `{${cardNameText(card)}}`;
}
export function actor(player: PlayerId, form: ActorRef["form"]): ActorRef {
    return { type: "actor", player, form };
}
export function caravan(player: PlayerId, index: CaravanIndex): CaravanRef {
    return { type: "caravan", player, caravan: index };
}
function segmentText(segment: LogSegment): string {
    if (typeof segment === "string") return segment;

    if ("type" in segment) {
        if (segment.type === "actor") {
            const who = segment.player === Human ? "You" : "AI";

            return segment.form === "subject" ? who : `${who}'s `;
        }

        return caravanName(segment.player, segment.caravan);
    }

    return formatCardLog(segment);
}
export function segmentsText(segments: LogSegment[]): string {
    return segments.map(segmentText).join("");
}
export function truncateSegments(segments: LogSegment[], marker: string): LogSegment[] {
    const out: LogSegment[] = [];

    for (const segment of segments) {
        if (typeof segment === "string") {
            const at = segment.indexOf(marker);

            if (at === -1) {
                out.push(segment);
                continue;
            }

            out.push(segment.slice(0, at + marker.length));
            break;
        }

        out.push(segment);
    }

    return out;
}

export interface CardsToRemove {
    ref: TargetRef;
    cards: Card[];
}

// Resolves target refs to their rows (copies), deduped, in ref order.
// Sorting is caller-side: display wants ascending, splice wants descending.

export function cardsToRemove(state: GameState, refs: TargetRef[]): CardsToRemove[] {
    const byRow = new Map<string, CardsToRemove>();

    for (const ref of refs) {
        const key = `${String(ref.player)}-${String(ref.caravan)}-${String(ref.cardIndex)}`;

        if (byRow.has(key)) continue;

        const cards = [...state.players[ref.player].caravans[ref.caravan].rows[ref.cardIndex]];

        byRow.set(key, { ref, cards });
    }

    return [...byRow.values()];
}
export function allCaravanRows(state: GameState): CardsToRemove[] {
    const out: CardsToRemove[] = [];

    for (const player of PLAYERS)
        for (const caravan of CARAVAN_INDICES)
            state.players[player].caravans[caravan].rows.forEach((row, cardIndex) => {
                out.push({ ref: { player, caravan, cardIndex }, cards: [...row] });
            });

    return out;
}

export function removalDetail(state: GameState, refs: TargetRef[]): LogSegment[][] {
    const sorted = cardsToRemove(state, refs).sort((a, b) => {
        if (a.ref.player !== b.ref.player) return b.ref.player - a.ref.player;

        if (a.ref.caravan !== b.ref.caravan) return a.ref.caravan - b.ref.caravan;

        return a.ref.cardIndex - b.ref.cardIndex;
    });

    const detail: LogSegment[][] = [];

    for (const { ref, cards } of sorted) {
        const shown = cards.at(-1)?.rank === JOKER_RANK ? cards.slice(0, -1) : cards;
        const owner: LogSegment[] = ref.player === Human ? [actor(Human, "subject"), " "] : [actor(Ai, "possessive")];

        for (const card of shown) {
            detail.push([
                "removal of ",
                card,
                " from ",
                ...owner,
                caravan(ref.player, ref.caravan)
            ]);
        }
    }

    return detail;
}

export function describe(action: Move, state: GameState): Nullable<Omit<LogEntry, "id" | "text">> {
    const subject = actor(action.player, "subject");

    if (action.type === "playValueCard") {
        const card = state.players[action.player].hand[action.handIndex];

        return {
            player: action.player,
            action: action.type,
            card,
            caravan: action.caravan,
            segments: [subject, " played ", card, " to ", caravan(action.player, action.caravan)]
        };
    }

    if (action.type === "playOperationCard") {
        const card = state.players[action.player].hand[action.handIndex];
        const carTgt = state.players[action.target.player].caravans[action.target.caravan];
        const tgt = carTgt.rows[action.target.cardIndex];
        const tgtCard = tgt[0];
        const segments: LogSegment[] = [
            subject,
            " played ",
            card,
            " on ",
            actor(action.target.player, "possessive"),
            caravan(action.target.player, action.target.caravan),
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
            segments: [subject, " discarded ", card]
        };
    }

    return {
        player: action.player,
        action: action.type,
        caravan: action.caravan,
        segments: [subject, " disbanded ", caravan(action.player, action.caravan)]
    };
}
