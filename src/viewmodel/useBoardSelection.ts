import { useMemo } from "react";

import { Human, isJokerCard, type Move, Nullable } from "../model/types";
import { targetKey, type TransitionInfo } from "./transition";

export function useBoardSelection(
    sel: Nullable<number>,
    legal: Move[],
    transition: Nullable<TransitionInfo>
) {
    const { legalCaravans, targetSet, canDiscard } = useMemo(() => {
        if (sel === null) {
            return {
                legalCaravans: [] as number[],
                targetSet: new Set<string>(),
                canDiscard: false
            };
        }

        const caravans: number[] = [];
        const targets = new Set<string>();
        let discard = false;

        for (const a of legal) {
            if (a.type === "disbandCaravan") continue;

            if (a.handIndex !== sel) continue;

            if (a.type === "playValueCard") caravans.push(a.lane);
            else if (a.type === "playOperationCard") targets.add(targetKey(a.target));
            else discard = true;
        }

        return { legalCaravans: caravans, targetSet: targets, canDiscard: discard };
    }, [sel, legal]);

    // Human moves never show the red X: only AI removals awaiting human ack
    // display pending + confirm visuals.

    const pendingKeys = useMemo(
        () =>
            transition?.pendingAck?.confirmer === Human
                ? new Set(transition.pendingAck.removed.map(targetKey))
                : new Set<string>(),
        [transition]
    );

    // The ack X for a Joker pins to the pending move's host row only — never
    // to stale Jokers from earlier moves still riding other rows.

    const pendingJokerKey = useMemo(() => {
        const ack = transition?.pendingAck;

        if (ack?.confirmer !== Human || !ack.played) return null;

        if (!isJokerCard(ack.played.card)) return null;

        return targetKey(ack.played.at);
    }, [transition]);

    return { legalCaravans, targetSet, canDiscard, pendingKeys, pendingJokerKey };
}
