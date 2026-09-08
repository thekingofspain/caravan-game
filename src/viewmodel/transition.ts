import { allCaravanRows } from "../model/gameLog";
import type { Card, GameState, Move, PlayerId, TargetRef } from "../model/types";

export interface TransitionInfo {
    needsConfirmation: boolean;
    confirmer: PlayerId | null;
    impacted: TargetRef[];
    addedTemp: { card: Card; at: TargetRef } | null;
}

export function targetKey(t: TargetRef): string {
    return `${String(t.player)}-${String(t.caravan)}-${String(t.cardIndex)}`;
}

export function getTransitionInfo(
    previous: GameState,
    move: Move,
    current: GameState
): TransitionInfo {
    const impacted: TargetRef[] = [];
    let addedTemp: { card: Card; at: TargetRef } | null = null;
    let needsConfirmation = false;
    let confirmer: PlayerId | null = null;

    if (move.type === "playOperationCard") {
        // Diff the whole board: Jack removes its target row, Joker removes
        // matching rows anywhere except the target. The old check compared
        // only the target caravan's row count, so a Joker clearing other
        // caravans looked like a Queen/King attach and never asked for ack.

        for (const { ref, cards } of allCaravanRows(previous)) {
            const carCurr = current.players[ref.player].caravans[ref.caravan];
            const rowId = cards[0]?.id;
            const stillExists = carCurr.rows.some((r) => r[0]?.id === rowId);

            if (!stillExists) impacted.push(ref);
        }

        if (impacted.length > 0) {
            const card = previous.players[move.player].hand.at(move.handIndex);

            if (card !== undefined) addedTemp = { card, at: move.target };

            needsConfirmation = true;
            confirmer = move.player === 0 ? 1 : 0;
        } else {
            const card =
                current.players[move.player].hand.at(move.handIndex) ??
                previous.players[move.player].hand.at(move.handIndex);

            if (card !== undefined) addedTemp = { card: card, at: move.target };
        }
    }

    return { needsConfirmation, confirmer, impacted, addedTemp };
}

export function getDisplayedState(
    previous: GameState | null,
    current: GameState,
    transition: TransitionInfo | null
): GameState {
    if (!transition?.needsConfirmation || !previous) return current;

    if (!transition.addedTemp) return previous;

    const cloned: GameState = structuredClone(previous);
    const { card, at: target } = transition.addedTemp;
    const caravan = cloned.players[target.player].caravans[target.caravan];
    const row = caravan.rows.at(target.cardIndex);

    if (row !== undefined) row.push(card);

    return cloned;
}
