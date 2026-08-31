import { CARAVAN_COUNT, CaravanRow } from "../model/types";
import type { Move, Card, GameState, PlayerId, TargetRef } from "../model/types";

export interface TransitionInfo {
  needsConfirmation: boolean;
  confirmer: PlayerId | null;
  impacted: TargetRef[];
  addedTemp: { card: Card; at: TargetRef } | null;
}

export function targetKey(t: TargetRef): string {
  return `${t.player}-${t.caravan}-${t.cardIndex}`;
}

function forEachCaravanRow(state: GameState, fn: (row: CaravanRow, ref: TargetRef) => void): void {
  for (let p = 0; p < 2; p++) {
    const player = p as PlayerId;
    for (let ci = 0; ci < CARAVAN_COUNT; ci++) {
      const car = state.players[player].caravans[ci as 0 | 1 | 2];
      for (let idx = 0; idx < car.rows.length; idx++) {
        const row = car.rows[idx];
        fn(row, { player, caravan: ci as 0 | 1 | 2, cardIndex: idx });
      }
    }
  }
}

export function getTransitionInfo(
  previous: GameState,
  move: Move,
  current: GameState
): TransitionInfo {
  let impacted: TargetRef[] = [];
  let addedTemp: { card: Card; at: TargetRef } | null = null;
  let needsConfirmation = false;
  let confirmer: PlayerId | null = null;

  if (move.type === "playFaceCard") {
    const prevCar = previous.players[move.target.player].caravans[move.target.caravan];
    const currCar = current.players[move.target.player].caravans[move.target.caravan];
    if (prevCar.rows.length === currCar.rows.length) {
      const card = current.players[move.player].hand[move.handIndex] ?? previous.players[move.player].hand[move.handIndex];
      addedTemp = { card: card as Card, at: move.target };
    } else {
      forEachCaravanRow(previous, (row, ref) => {
        const carCurr = current.players[ref.player].caravans[ref.caravan];
        const stillExists = carCurr.rows[ref.cardIndex];
        const stillId = stillExists?.[0]?.id;
        const rowId = row[0]?.id;
        if (!stillExists || stillId !== rowId) impacted.push(ref);
      });
      const card = previous.players[move.player].hand[move.handIndex];
      if (card) addedTemp = { card, at: move.target };
      needsConfirmation = true;
      confirmer = move.player === 0 ? 1 : 0;
    }
  }

  return { needsConfirmation, confirmer, impacted, addedTemp };
}

export function getDisplayedState(previous: GameState | null, current: GameState, transition: TransitionInfo | null): GameState {
  if (!transition || !transition.needsConfirmation || !previous || !transition.addedTemp) return current;
  const cloned: GameState = JSON.parse(JSON.stringify(previous));
  const { card, at } = transition.addedTemp;
  const caravan = cloned.players[at.player].caravans[at.caravan];
  const row = caravan.rows[at.cardIndex];
  if (row) row.push(card as Card);
  return cloned;
}

export function sortAttachments(cards: Card[]): Card[] {
  const order: Record<string, number> = { K: 0, J: 1, Joker: 2, Q: 3 };
  return [...cards].sort((a, b) => {
    const oa = order[a.rank] ?? 99;
    const ob = order[b.rank] ?? 99;
    return oa - ob;
  });
}
