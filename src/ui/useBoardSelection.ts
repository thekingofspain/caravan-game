import { useMemo } from "react";
import type { Action, TargetRef } from "../game/types";
import type { TransitionInfo } from "../game/transition";

function targetKey(t: TargetRef): string {
  return `${t.player}-${t.caravan}-${t.cardIndex}`;
}

export function useBoardSelection(sel: number | null, legal: Action[], transition: TransitionInfo | null) {
  const { legalCaravans, targetSet, canDiscard } = useMemo(() => {
    if (sel === null) {
      return { legalCaravans: [] as number[], targetSet: new Set<string>(), canDiscard: false };
    }
    const caravans: number[] = [];
    const targets = new Set<string>();
    let discard = false;
    for (const a of legal) {
      if (a.type !== "playValueCard" && a.type !== "playFaceCard" && a.type !== "discardCard") continue;
      if (a.handIndex !== sel) continue;
      if (a.type === "playValueCard" && typeof a.caravan === "number") caravans.push(a.caravan);
      else if (a.type === "playFaceCard" && a.target) targets.add(targetKey(a.target));
      else discard = true;
    }
    return { legalCaravans: caravans, targetSet: targets, canDiscard: discard };
  }, [sel, legal]);

  const pendingKeys = useMemo(() => new Set(transition?.impacted.map(targetKey) ?? []), [transition]);

  return { legalCaravans, targetSet, canDiscard, pendingKeys };
}
