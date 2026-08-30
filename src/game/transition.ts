import { CARAVAN_COUNT } from "./types";
import type { Action, Card, GameState, PlayerId, TargetRef } from "./types";

/** Pure differ: takes two sequential snapshots + the move that produced `current`. */
export interface TransitionInfo {
  needsConfirmation: boolean;
  confirmer: PlayerId | null;
  impacted: TargetRef[];
  addedTemp: { card: Card; at: TargetRef } | null;
}

function forEachPlaced(state: GameState, fn: (pc: { card: Card }, ref: TargetRef) => void): void {
  for (let p = 0; p < 2; p++) {
    const player = p as PlayerId;
    for (let ci = 0; ci < CARAVAN_COUNT; ci++) {
      const car = state.players[player].caravans[ci as 0 | 1 | 2];
      for (let idx = 0; idx < car.cards.length; idx++) {
        const pc = car.cards[idx];
        fn(pc, { player, caravan: ci as 0 | 1 | 2, cardIndex: idx });
        // attachments are not separate placed cards for diff — they travel with parent
      }
    }
  }
}

export function getTransitionInfo(
  previous: GameState,
  move: Action,
  current: GameState
): TransitionInfo {
  const isFace = move.type === "playFaceCard";
  if (!isFace) {
    return { needsConfirmation: false, confirmer: null, impacted: [], addedTemp: null };
  }
  const played = previous.players[move.player].hand[move.handIndex];
  if (!played) return { needsConfirmation: false, confirmer: null, impacted: [], addedTemp: null };
  const isRemoval = played.rank === "J" || played.rank === "JOKER";
  if (!isRemoval) return { needsConfirmation: false, confirmer: null, impacted: [], addedTemp: null };

  const beforeIds = new Map<string, { ref: TargetRef; card: Card }>();
  forEachPlaced(previous, (pc, ref) => beforeIds.set(pc.card.id, { ref, card: pc.card }));
  const afterIds = new Set<string>();
  forEachPlaced(current, (pc) => afterIds.add(pc.card.id));

  const impacted: TargetRef[] = [];
  for (const [id, v] of beforeIds) {
    if (!afterIds.has(id)) impacted.push(v.ref);
  }

  const addedTemp = !afterIds.has(played.id) ? { card: played, at: move.target } : null;
  const needsConfirmation = impacted.length > 0;
  // opponent of mover confirms; Human confirms AI's removal, AI auto-confirms Human's
  const confirmer: PlayerId | null = needsConfirmation ? ((move.player === 0 ? 1 : 0) as PlayerId) : null;

  return { needsConfirmation, confirmer, impacted, addedTemp };
}
