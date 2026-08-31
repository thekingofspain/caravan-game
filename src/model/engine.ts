import { buildDeck, makePlaceholderCard } from "./cards";
import { canPlaceCard, hasJackAttached, isValidCardIndex } from "./rules/caravanCardRules";
import { gameWinner } from "./scoring";
import { mulberry32, shuffle } from "./rng";
import { describe, formatFinalScore, log, removalDetail, resetLogIds } from "./gameLog";
import {
  Move,
  Ai,
  Card,
  Caravan,
  CaravanIndex,
  CARAVAN_COUNT,
  PLAYERS,
  GameState,
  Human,
  IllegalMoveError,
  Nullable,
  PlayerId,
  PlayerState,
  SetupOptions,
  TargetRef,
  isFaceCard,
  isJokerCard,
  isPlaceholderCard,
  isValueCard,
  baseValue,
} from "./types";

function emptyCaravan(): Caravan {
  return { rows: [], direction: null, suit: null };
}

function makePlayer(rng: () => number, deckId: number): PlayerState {
  const deck = shuffle(buildDeck(deckId), rng).slice(0, 30);
  const hand = deck.slice(0, 8);
  const rest = deck.slice(8);
  return { deck: rest, hand, caravans: [emptyCaravan(), emptyCaravan(), emptyCaravan()] };
}
export function setupGame(opts: SetupOptions): GameState {
  resetLogIds();
  const rng = mulberry32(opts.seed ?? 1);
  return {
    players: [makePlayer(rng, 1), makePlayer(rng, 2)],
    current: opts.first ?? Human,
    phase: "play",
    winner: null,
    log: [],
    started: true,
  };
}
function draw(player: PlayerState): void {
  if (player.deck.length > 0) {
    const c = player.deck.shift()!;
    player.hand.push(c);
  } else {
    player.hand.push(makePlaceholderCard());
  }
}

function normalizeCaravan(car: Caravan): void {
  if (((car as any).rows ?? (car as any).cards).length === 0) {
    car.direction = null;
    car.suit = null;
  } else if (((car as any).rows ?? (car as any).cards).length === 1) {
    car.direction = null;
    const first: any = ((car as any).rows ?? (car as any).cards)[0];
    car.suit = (Array.isArray(first) ? first[0].suit : first.card.suit) as Caravan["suit"];
  } else {
    const rows: any = (car as any).rows ?? (car as any).cards;
    const aRow: any = rows[rows.length-2];
    const bRow: any = rows[rows.length-1];
    const aCard: any = Array.isArray(aRow) ? aRow[0] : aRow.card;
    const bCard: any = Array.isArray(bRow) ? bRow[0] : bRow.card;
    const a = baseValue(aCard);
    const b = baseValue(bCard);
    car.direction = b > a ? "asc" : "desc";
  }
}

function jokerRemovals(state: GameState, target: TargetRef): TargetRef[] {
  const carTgt: any = state.players[target.player].caravans[target.caravan];
  const rowsTgt: any = carTgt.rows ?? carTgt.cards;
  const targetRow: any = rowsTgt[target.cardIndex];
  if (!targetRow || (Array.isArray(targetRow) ? targetRow.length===0 : !targetRow.card)) return [];
  const targetCard: any = Array.isArray(targetRow) ? targetRow[0] : targetRow.card;
  const isAce = targetCard.rank === "A";
  const suit = targetCard.suit;
  const rankVal = baseValue(targetCard);
  const refs: TargetRef[] = [];
  for (let p=0; p<2; p++) {
    const player = p as PlayerId;
    for (let ci=0; ci<CARAVAN_COUNT; ci++) {
      const car = state.players[player].caravans[ci as 0|1|2];
      for (let cidx=0; cidx<((car as any).rows ?? (car as any).cards).length; cidx++) {
        const row: any = ((car as any).rows ?? (car as any).cards)[cidx];
        if (!row || (Array.isArray(row) ? row.length===0 : !row.card)) continue;
        const card: any = Array.isArray(row) ? row[0] : row.card;
        if (isAce) {
          if (card.suit === suit) refs.push({ player, caravan: ci as 0|1|2, cardIndex: cidx });
        } else {
          if (baseValue(card) === rankVal) refs.push({ player, caravan: ci as 0|1|2, cardIndex: cidx });
        }
      }
    }
  }
  return refs;
}
function removeTargets(state: GameState, refs: TargetRef[]): void {
  const byCar = new Map<string, number[]>();
  for (const r of refs) {
    const key = `${r.player}-${r.caravan}`;
    if (!byCar.has(key)) byCar.set(key, []);
    byCar.get(key)!.push(r.cardIndex);
  }
  for (const [key, indices] of byCar) {
    const [p, ci] = key.split("-").map(Number) as [PlayerId, CaravanIndex];
    const car = state.players[p].caravans[ci];
    for (const idx of indices.sort((a,b)=>b-a)) ((car as any).rows ?? (car as any).cards).splice(idx, 1);
    normalizeCaravan(car);
  }
}

function handlePlayValueCard(next: GameState, action: Extract<Move, { type: "playValueCard" }>): void {
  const player = next.players[action.player];
  const car = player.caravans[action.caravan];
  const card = player.hand[action.handIndex];
  if (!card || !isValueCard(card)) throw new IllegalMoveError("playValueCard: not a value card");
  if (!canPlaceCard(card, car)) throw new IllegalMoveError("playValueCard: cannot place card");
  player.hand.splice(action.handIndex, 1);
  ((car as any).rows ?? (car as any).cards).push([card]);
  normalizeCaravan(car);
  draw(player);
}

function attachJack(next: GameState, card: Card, target: TargetRef): void {
  const car: any = next.players[target.player].caravans[target.caravan];
  const rows: any = car.rows ?? car.cards;
  const tgt: any = rows[target.cardIndex];
  if (!tgt) return;
  if (Array.isArray(tgt)) tgt.push(card); else {
    tgt.attachments = [...(tgt.attachments||[]), card];
    if (card.rank === "J") tgt.kingCount = tgt.kingCount; // no change
  }
  removeTargets(next, [target]);
}

function attachQueen(next: GameState, card: Card, target: TargetRef): void {
  const car: any = next.players[target.player].caravans[target.caravan];
  const rows: any = car.rows ?? car.cards;
  const tgt: any = rows[target.cardIndex];
  if (!tgt) return;
  if (Array.isArray(tgt)) tgt.push(card); else tgt.attachments = [...(tgt.attachments||[]), card];
  const car2: any = next.players[target.player].caravans[target.caravan];
  if (car2.direction !== null) car.direction = car.direction === "asc" ? "desc" : "asc";
  car2.suit = card.suit as Caravan["suit"];
}

function attachKing(next: GameState, card: Card, target: TargetRef): void {
  const car: any = next.players[target.player].caravans[target.caravan];
  const rows: any = car.rows ?? car.cards;
  const tgt: any = rows[target.cardIndex];
  if (!tgt) return;
  if (Array.isArray(tgt)) {
    tgt.push(card);
  } else {
    // old PlacedCard
    tgt.attachments = [...(tgt.attachments||[]), card];
    if (card.rank === "K") tgt.kingCount = (tgt.kingCount || 0) + 1;
  }
}

function attachJoker(next: GameState, card: Card, target: TargetRef): string[] {
  const car: any = next.players[target.player].caravans[target.caravan];
  const rows: any = car.rows ?? car.cards;
  const tgt: any = rows[target.cardIndex];
  if (Array.isArray(tgt)) tgt.push(card); else if (tgt) tgt.attachments = [...(tgt.attachments||[]), card];
  const refs = jokerRemovals(next, target);
  const detail = removalDetail(next, refs);
  removeTargets(next, refs);
  return detail;
}

function handlePlayFaceCard(
  next: GameState,
  action: Extract<Move, { type: "playFaceCard" }>,
): Nullable<string[]> {
  const player = next.players[action.player];
  const card = player.hand[action.handIndex];
  if (!card || (!isFaceCard(card) && !isJokerCard(card))) throw new IllegalMoveError("playFaceCard: not a face card");
  if (!isValidCardIndex(next.players[action.target.player].caravans[action.target.caravan], action.target.cardIndex)) throw new IllegalMoveError("playFaceCard: invalid target");
  const carTgt: any = next.players[action.target.player].caravans[action.target.caravan];
  const rowsTgt = carTgt.rows ?? carTgt.cards;
  const tgtPre = rowsTgt[action.target.cardIndex];
  if (card.rank === "J" && tgtPre && hasJackAttached(tgtPre as any)) throw new IllegalMoveError("playFaceCard: Jack on jacked card");
  if (card.rank === "K" && tgtPre && hasJackAttached(tgtPre as any)) throw new IllegalMoveError("playFaceCard: King on jacked card");
  player.hand.splice(action.handIndex, 1);
  let jokerDetail: Nullable<string[]> = null;
  if (card.rank === "J") attachJack(next, card, action.target);
  else if (card.rank === "Q") attachQueen(next, card, action.target);
  else if (card.rank === "K") attachKing(next, card, action.target);
  else if (isJokerCard(card)) jokerDetail = attachJoker(next, card, action.target);
  draw(player);
  return jokerDetail;
}

function handleDiscardCard(next: GameState, action: Extract<Move, { type: "discardCard" }>): void {
  const player = next.players[action.player];
  const card = player.hand[action.handIndex];
  const isPlaceholder = card && isPlaceholderCard(card);
  if (!isPlaceholder && player.caravans.some((c) => ((c as any).rows ?? (c as any).cards).length === 0)) throw new IllegalMoveError("discardCard: cannot discard before all caravans started");
  if (!player.hand[action.handIndex]) throw new IllegalMoveError("discardCard: invalid hand index");
  player.hand.splice(action.handIndex, 1);
  draw(player);
}

function handleDismissCaravan(next: GameState, action: Extract<Move, { type: "dismissCaravan" }>): void {
  const player = next.players[action.player];
  if (player.caravans.some((c) => ((c as any).rows ?? (c as any).cards).length === 0)) throw new IllegalMoveError("dismissCaravan: cannot disband before all caravans started");
  player.caravans[action.caravan] = emptyCaravan();
}
export function applyMove(state: GameState, action: Move): GameState {
  if (state.phase === "over") throw new IllegalMoveError("game over");
  if (action.player !== state.current) throw new IllegalMoveError("not current player");

  const next: GameState = structuredClone(state);
  let jokerDetail: Nullable<string[]> = null;

  if (action.type === "playValueCard") {
    handlePlayValueCard(next, action);
  } else if (action.type === "playFaceCard") {
    jokerDetail = handlePlayFaceCard(next, action);
  } else if (action.type === "discardCard") {
    handleDiscardCard(next, action);
  } else if (action.type === "dismissCaravan") {
    handleDismissCaravan(next, action);
  }

  const text = describe(action, state);
  if (text !== null) {
    const entry = log(text);
    if (jokerDetail && jokerDetail.length > 0) entry.detail = jokerDetail;
    next.log = [...next.log, entry];
  }

  const winner = gameWinner(next);
  if (winner !== null) {
    next.phase = "over";
    next.winner = winner;
    next.log = [
      ...next.log,
      log(`${winner === Human ? "You win the caravan!" : "AI wins the caravan."} ${formatFinalScore(next)}`),
    ];
  } else {
    next.current = next.current === Human ? Ai : Human;
    if (legalMoves(next).length === 0) {
      const loser = next.current;
      next.phase = "over";
      next.winner = loser === Human ? Ai : Human;
      next.log = [
        ...next.log,
        log(
          `${loser === Human ? "You ran out of moves — AI wins." : "AI ran out of moves — you win!"} ${formatFinalScore(next)}`,
        ),
      ];
    }
  }
  return next;
}

export function legalMoves(state: GameState): Move[] {
  if (state.phase === "over") return [];
  const pid = state.current;
  const player = state.players[pid];
  const actions: Move[] = [];
  const hasEmpty = player.caravans.some((c) => ((c as any).rows ?? (c as any).cards).length === 0);

  if (hasEmpty) {
    for (let ci = 0; ci < player.caravans.length; ci++) {
      const car = player.caravans[ci];
      if (((car as any).rows ?? (car as any).cards).length !== 0) continue;
      for (let hi = 0; hi < player.hand.length; hi++) {
        const card = player.hand[hi];
        if (isValueCard(card)) actions.push({ type: "playValueCard", player: pid, caravan: ci as CaravanIndex, handIndex: hi });
      }
    }
    for (let hi = 0; hi < player.hand.length; hi++) {
      const card = player.hand[hi];
      if (!isFaceCard(card) && !isJokerCard(card)) continue;
      for (const p of PLAYERS) {
        for (let ci = 0; ci < CARAVAN_COUNT; ci++) {
          const targetCar = state.players[p].caravans[ci];
          for (let cidx = 0; cidx < ((targetCar as any).rows ?? (targetCar as any).cards).length; cidx++) {
            const tgt: TargetRef = { player: p, caravan: ci as CaravanIndex, cardIndex: cidx };
            const row = ((targetCar as any).rows ?? (targetCar as any).cards)[cidx];
            if (card.rank === "J" && hasJackAttached(row)) continue;
            if (card.rank === "K" && hasJackAttached(row)) continue;
            actions.push({ type: "playFaceCard", player: pid, target: tgt, handIndex: hi });
          }
        }
      }
    }
    for (let hi = 0; hi < player.hand.length; hi++) {
      const card = player.hand[hi];
      if (isPlaceholderCard(card)) actions.push({ type: "discardCard", player: pid, handIndex: hi });
    }
    return actions;
  }

  for (let ci = 0; ci < player.caravans.length; ci++) {
    const car = player.caravans[ci];
    for (let hi = 0; hi < player.hand.length; hi++) {
      const card = player.hand[hi];
      if (isValueCard(card) && canPlaceCard(card, car)) {
        actions.push({ type: "playValueCard", player: pid, caravan: ci as CaravanIndex, handIndex: hi });
      }
    }
  }
  for (let hi = 0; hi < player.hand.length; hi++) {
    const card = player.hand[hi];
    if (!isFaceCard(card) && !isJokerCard(card)) continue;
    for (const p of PLAYERS) {
      for (let ci = 0; ci < CARAVAN_COUNT; ci++) {
        const targetCar = state.players[p].caravans[ci];
        for (let cidx = 0; cidx < ((targetCar as any).rows ?? (targetCar as any).cards).length; cidx++) {
          const tgt: TargetRef = { player: p, caravan: ci as CaravanIndex, cardIndex: cidx };
          const row = ((targetCar as any).rows ?? (targetCar as any).cards)[cidx];
          if (card.rank === "J" && hasJackAttached(row)) continue;
          if (card.rank === "K" && hasJackAttached(row)) continue;
          actions.push({ type: "playFaceCard", player: pid, target: tgt, handIndex: hi });
        }
      }
    }
  }
  for (let hi = 0; hi < player.hand.length; hi++) {
    actions.push({ type: "discardCard", player: pid, handIndex: hi });
  }
  for (let ci = 0; ci < player.caravans.length; ci++) {
    actions.push({ type: "dismissCaravan", player: pid, caravan: ci as CaravanIndex });
  }
  return actions;
}
