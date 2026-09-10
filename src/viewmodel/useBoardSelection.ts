import { useMemo } from "react";

import { Human, type Move, Nullable } from "../model/types";
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
    // display pending + confirm visuals. Otherwise the human's own Jack/Joker
    // flashes an X until the AI auto-move clears the transition.

    const pendingKeys = useMemo(
        () =>
            transition?.pendingAck?.confirmer === Human
                ? new Set(transition.pendingAck.removed.map(targetKey))
                : new Set<string>(),
        [transition]
    );

    return { legalCaravans, targetSet, canDiscard, pendingKeys };
}
