import { allCaravanRows } from "../model/gameLog";
import type { Card, GameState, Move, Nullable, PlayerId, TargetRef } from "../model/types";
import { otherPlayer, playedCard } from "../model/types";

export interface PendingAck {
    confirmer: PlayerId;
    removed: TargetRef[];
    played: Nullable<{ card: Card; at: TargetRef }>;
}

export interface TransitionInfo {
    pendingAck: Nullable<PendingAck>;
}

export function targetKey(t: TargetRef): string {
    return `${String(t.player)}-${String(t.lane)}-${String(t.cardIndex)}`;
}

export function getTransitionInfo(
    previous: GameState,
    move: Move,
    current: GameState
): TransitionInfo {
    const removed: TargetRef[] = [];

    if (move.type === "playOperationCard") {
        // Diff the whole board: Jack removes its target row, Joker removes
        // matching rows anywhere except the target. The old check compared
        // only the target caravan's row count, so a Joker clearing other
        // caravans looked like a Queen/King attach and never asked for ack.

        for (const { ref, cards } of allCaravanRows(previous)) {
            const carCurr = current.players[ref.player].caravans[ref.lane];
            const rowId = cards[0]?.id;
            const stillExists = carCurr.rows.some((r) => r[0]?.id === rowId);

            if (!stillExists) removed.push(ref);
        }

        if (removed.length > 0) {
            const card = playedCard(previous, move.player, move.handIndex);

            return {
                pendingAck: {
                    confirmer: otherPlayer(move.player),
                    removed,
                    played: { card, at: move.target }
                }
            };
        }
    }

    return { pendingAck: null };
}

export function getDisplayedState(
    previous: Nullable<GameState>,
    current: GameState,
    transition: Nullable<TransitionInfo>
): GameState {
    if (!transition?.pendingAck || !previous) return current;

    if (!transition.pendingAck.played) return previous;

    const cloned: GameState = structuredClone(previous);
    const { card, at: target } = transition.pendingAck.played;
    const caravan = cloned.players[target.player].caravans[target.lane];
    const row = caravan.rows.at(target.cardIndex);

    if (row !== undefined) row.push(card);

    return cloned;
}
