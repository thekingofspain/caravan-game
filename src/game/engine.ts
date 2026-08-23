import { getPreset } from "./cards";
import { canPlayValue, isValidTarget } from "./rules";
import { gameWinner } from "./scoring";
import { LogEntry } from "./types";
import {
  Action,
  Card,
  Caravan,
  GameState,
  PlayerId,
  PlayerState,
  TargetRef,
  isFaceCard,
  isJoker,
  isValueCard,
  baseValue,
} from "./types";

export interface SetupOptions {
  first?: PlayerId;
  seed?: number;
}

let logId = 0;
function log(text: string): LogEntry {
  logId += 1;
  return { id: logId, text };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function emptyCaravan(): Caravan {
  return { cards: [], direction: null, suit: null };
}

function makePlayer(deck: Card[]): PlayerState {
  const hand = deck.slice(0, 8);
  const rest = deck.slice(8);
  return { deck: rest, hand, caravans: [emptyCaravan(), emptyCaravan(), emptyCaravan()], sales: 0 };
}

export function setupGame(opts: SetupOptions): GameState {
  const rng = mulberry32(opts.seed ?? 1);
  const courierDeck = getPreset("default").build();
  const human = shuffle(courierDeck, rng).slice(0, 30);
  const ai = shuffle(courierDeck, rng).slice(0, 30);
  return {
    players: [makePlayer(human), makePlayer(ai)],
    current: opts.first ?? 0,
    phase: "play",
    winner: null,
    log: [log("Caravan begun. Place your starting cards.")],
    started: false,
  };
}

function draw(player: PlayerState): void {
  if (player.deck.length > 0) {
    const c = player.deck.shift()!;
    player.hand.push(c);
  }
}

function removeValueCard(state: GameState, target: TargetRef): void {
  const car = state.players[target.player].caravans[target.caravan];
  car.cards.splice(target.cardIndex, 1);
  if (car.cards.length === 0) {
    car.direction = null;
    car.suit = null;
  } else if (car.cards.length === 1) {
    car.direction = null;
    car.suit = car.cards[0].card.suit as Caravan["suit"];
  }
}

function applyJoker(state: GameState, target: TargetRef): void {
  const tgt = state.players[target.player].caravans[target.caravan].cards[target.cardIndex];
  const suit = tgt.card.suit;
  const value = baseValue(tgt.card);
  for (const p of state.players) {
    for (const car of p.caravans) {
      car.cards = car.cards.filter((pc) => {
        if (pc === tgt) return true;
        if (suit === "joker") return true;
        if (tgt.card.rank === "A") return pc.card.suit !== suit;
        return baseValue(pc.card) !== value;
      });
      if (car.cards.length === 0) {
        car.direction = null;
        car.suit = null;
      } else if (car.cards.length === 1) {
        car.direction = null;
        car.suit = car.cards[0].card.suit as Caravan["suit"];
      }
    }
  }
}

function describe(action: Action, state: GameState): string {
  const names = ["You", "AI"];
  if (action.type === "playValue") {
    const c = state.players[action.player].hand[action.handIndex];
    return `${names[action.player]} played ${c.rank}${c.suit === "joker" ? "" : c.suit[0].toUpperCase()} to caravan ${action.caravan + 1}.`;
  }
  if (action.type === "playFace") {
    const c = state.players[action.player].hand[action.handIndex];
    const t = state.players[action.target.player].caravans[action.target.caravan].cards[action.target.cardIndex];
    return `${names[action.player]} used ${c.rank} on ${t.card.rank}${t.card.suit === "joker" ? "" : t.card.suit[0].toUpperCase()}.`;
  }
  if (action.type === "discard") {
    const c = state.players[action.player].hand[action.handIndex];
    return `${names[action.player]} discarded ${c.rank}${c.suit === "joker" ? "" : c.suit[0].toUpperCase()}.`;
  }
  return `${names[action.player]} disbanded caravan ${action.caravan + 1}.`;
}

export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase === "over") return state;
  if (action.player !== state.current) return state;

  const next: GameState = structuredClone(state);
  const player = next.players[action.player];

  if (
    !next.started &&
    next.players.every((p) => p.caravans.every((c) => c.cards.length > 0))
  ) {
    next.started = true;
  }

  if (action.type === "playValue") {
    const car = player.caravans[action.caravan];
    const card = player.hand[action.handIndex];
    if (!card || !isValueCard(card)) return state;
    if (!canPlayValue(card, car)) return state;
    player.hand.splice(action.handIndex, 1);
    car.cards.push({ card, kingCount: 0, attachments: [] });
    if (car.cards.length === 1) car.suit = card.suit as Caravan["suit"];
    if (car.cards.length === 2) {
      const a = baseValue(car.cards[0].card);
      const b = baseValue(car.cards[1].card);
      car.direction = b > a ? "asc" : "desc";
    }
    draw(player);
  } else if (action.type === "playFace") {
    const card = player.hand[action.handIndex];
    if (!card || (!isFaceCard(card) && !isJoker(card))) return state;
    if (!isValidTarget(next, action.target)) return state;
    player.hand.splice(action.handIndex, 1);
    const tgt = next.players[action.target.player].caravans[action.target.caravan].cards[action.target.cardIndex];
    if (card.rank === "J") {
      removeValueCard(next, action.target);
    } else if (card.rank === "Q") {
      if (tgt) tgt.attachments.push(card);
      const car = next.players[action.target.player].caravans[action.target.caravan];
      if (car.direction !== null) car.direction = car.direction === "asc" ? "desc" : "asc";
      car.suit = card.suit as Caravan["suit"];
    } else if (card.rank === "K") {
      if (tgt) tgt.kingCount += 1;
      if (tgt) tgt.attachments.push(card);
    } else if (isJoker(card)) {
      if (tgt) tgt.attachments.push(card);
      applyJoker(next, action.target);
    }
    draw(player);
  } else if (action.type === "discard") {
    if (player.caravans.some((c) => c.cards.length === 0)) return state;
    if (!player.hand[action.handIndex]) return state;
    player.hand.splice(action.handIndex, 1);
    draw(player);
  } else if (action.type === "disband") {
    if (player.caravans.some((c) => c.cards.length === 0)) return state;
    player.caravans[action.caravan] = emptyCaravan();
  }

  next.log = [...next.log, log(describe(action, state))].slice(-50);

  const winner = gameWinner(next);
  if (winner !== null) {
    next.phase = "over";
    next.winner = winner;
    next.log = [...next.log, log(winner === 0 ? "You win the caravan!" : "AI wins the caravan.")];
  } else if (legalActions(next).length === 0) {
    // A player who cannot make any move (out of cards / no legal play) loses;
    // the opponent wins automatically — matches the in-game coded behavior.
    const loser = next.current;
    next.phase = "over";
    next.winner = loser === 0 ? 1 : 0;
    next.log = [
      ...next.log,
      log(loser === 0 ? "You ran out of moves — AI wins." : "AI ran out of moves — you win!"),
    ];
  } else {
    next.current = next.current === 0 ? 1 : 0;
  }
  return next;
}

export function legalActions(state: GameState): Action[] {
  if (state.phase === "over") return [];
  const pid = state.current;
  const player = state.players[pid];
  const actions: Action[] = [];
  const hasEmpty = player.caravans.some((c) => c.cards.length === 0);

  if (hasEmpty) {
    for (let ci = 0; ci < player.caravans.length; ci++) {
      const car = player.caravans[ci];
      if (car.cards.length !== 0) continue;
      for (let hi = 0; hi < player.hand.length; hi++) {
        const card = player.hand[hi];
        if (isValueCard(card)) actions.push({ type: "playValue", player: pid, caravan: ci as 0 | 1 | 2, handIndex: hi });
      }
    }
    return actions;
  }

  for (let hi = 0; hi < player.hand.length; hi++) {
    const card = player.hand[hi];
    if (isValueCard(card)) {
      for (let ci = 0; ci < player.caravans.length; ci++) {
        const car = player.caravans[ci];
        if (canPlayValue(card, car)) actions.push({ type: "playValue", player: pid, caravan: ci as 0 | 1 | 2, handIndex: hi });
      }
    } else {
      for (let p = 0 as PlayerId; p <= 1; p = (p + 1) as PlayerId) {
        const opp = state.players[p];
        for (let ci = 0; ci < opp.caravans.length; ci++) {
          const car = opp.caravans[ci];
          for (let cidx = 0; cidx < car.cards.length; cidx++) {
            actions.push({ type: "playFace", player: pid, target: { player: p, caravan: ci as 0 | 1 | 2, cardIndex: cidx }, handIndex: hi });
          }
        }
      }
    }
  }

  if (player.deck.length > 0) {
    for (let hi = 0; hi < player.hand.length; hi++) actions.push({ type: "discard", player: pid, handIndex: hi });
  }
  for (let ci = 0; ci < 3; ci++) actions.push({ type: "disband", player: pid, caravan: ci as 0 | 1 | 2 });
  return actions;
}
