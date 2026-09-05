import { useMemo } from "react";
import type { Move } from "../model/types";
import { targetKey, type TransitionInfo } from "./transition";

export function useBoardSelection(
    sel: number | null,
    legal: Move[],
    transition: TransitionInfo | null
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

            if (a.type === "playValueCard") caravans.push(a.caravan);
            else if (a.type === "playFaceCard") targets.add(targetKey(a.target));
            else discard = true;
        }

        return { legalCaravans: caravans, targetSet: targets, canDiscard: discard };
    }, [sel, legal]);

    const pendingKeys = useMemo(
        () => new Set(transition?.impacted.map(targetKey) ?? []),
        [transition]
    );

    return { legalCaravans, targetSet, canDiscard, pendingKeys };
}
