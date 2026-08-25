import { buildDeck, jokerColor, SUIT_SYMBOL } from "./cards";
import { canPlayValue, caravanTotal, isInRange, isJacked, isValidTarget } from "./rules";
import { gameWinner, pairWinner } from "./scoring";
import { LogEntry } from "./types";
import {
  Action,
  Card,
  Caravan,
  GameState,
  PlayerId,
  PlayerState,
  Suit,
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
  const human = shuffle(buildDeck(), rng).slice(0, 30);
  const ai = shuffle(buildDeck(), rng).slice(0, 30);
  return {
    players: [makePlayer(human), makePlayer(ai)],
    current: opts.first ?? 0,
    phase: "play",
    winner: null,
    log: [],
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
  normalizeCaravan(car);
}

function normalizeCaravan(car: Caravan): void {
  if (car.cards.length === 0) {
    car.direction = null;
    car.suit = null;
  } else if (car.cards.length === 1) {
    car.direction = null;
    car.suit = car.cards[0].card.suit as Caravan["suit"];
  }
}

// Joker removes all matching cards from play (target excluded): on an Ace all
// cards of that suit, otherwise all cards of the same value — across every
// caravan of both players. Attachments travel with their removed value card.
// Returns one line per affected caravan listing the removed cards.
function applyJoker(state: GameState, target: TargetRef): string[] {
  const tgt = state.players[target.player].caravans[target.caravan].cards[target.cardIndex];
  const isAceTarget = tgt.card.rank === "A";
  const suit = tgt.card.suit;
  const value = baseValue(tgt.card);
  const detail: string[] = [];
  for (let p = 0 as PlayerId; p <= 1; p = (p + 1) as PlayerId) {
    for (let ci = 0; ci < state.players[p].caravans.length; ci++) {
      const car = state.players[p].caravans[ci];
      const removed: Card[] = [];
      for (let i = car.cards.length - 1; i >= 0; i--) {
        const pc = car.cards[i];
        if (pc === tgt) continue;
        const match = isAceTarget ? pc.card.suit === suit : baseValue(pc.card) === value;
        if (match) {
          removed.push(pc.card);
          car.cards.splice(i, 1);
        }
      }
      normalizeCaravan(car);
      if (removed.length > 0) {
        detail.push(`${ownerLabel(p)} caravan ${ci + 1}: ${removed.map(fmt).join(", ")}`);
      }
    }
  }
  return detail;
}

function fmt(card: Card): string {
  if (card.rank === "JOKER") return `{${jokerColor(card) === "red" ? "Red" : "Black"} Joker}`;
  return `{${card.rank}${SUIT_SYMBOL[card.suit as Suit]}}`;
}

function ownerLabel(p: PlayerId): string {
  return p === 0 ? "your" : "AI's";
}

function caravanAnalysis(state: GameState): string {
  const side = (p: PlayerId) =>
    state.players[p].caravans
      .map((c, i) => {
        const t = caravanTotal(c);
        if (pairWinner(state, i as 0 | 1 | 2) === p) return `**${t}**`;
        if (isInRange(t)) return `*${t}*`;
        return `${t}`;
      })
      .join("/");
  return `Final caravans — you ${side(0)}, AI ${side(1)}.`;
}

function describe(action: Action, state: GameState): string {
  const names = ["You", "AI"] as const;
  const actor = names[action.player];

  if (action.type === "playValue") {
    const c = state.players[action.player].hand[action.handIndex];
    const row = state.players[action.player].caravans[action.caravan].cards.length + 1;
    return `${actor} placed ${fmt(c)} on row ${row} of ${ownerLabel(action.player)} caravan ${action.caravan + 1}.`;
  }

  if (action.type === "playFace") {
    const c = state.players[action.player].hand[action.handIndex];
    const tgt = state.players[action.target.player].caravans[action.target.caravan].cards[action.target.cardIndex];
    const row = action.target.cardIndex + 1;
    const caravan = action.target.caravan + 1;
    const owner = ownerLabel(action.target.player);
    let effect = "";
    if (c.rank === "J") effect = ` — jacked ${fmt(tgt.card)} (0, removable)`;
    else if (c.rank === "Q") effect = ` — reversed direction, set suit to {${SUIT_SYMBOL[c.suit as Suit]}}`;
    else if (isJoker(c)) {
      if (tgt.card.rank === "A") effect = ` — removed all {${SUIT_SYMBOL[tgt.card.suit as Suit]}} cards`;
      else effect = ` — removed all ${baseValue(tgt.card)}s`;
    }
    return `${actor} placed ${fmt(c)} on ${fmt(tgt.card)} on row ${row} of ${owner} caravan ${caravan}${effect}.`;
  }

  if (action.type === "discard") {
    const c = state.players[action.player].hand[action.handIndex];
    return `${actor} discarded ${fmt(c)}.`;
  }

  if (action.type === "disband") {
    return `${actor} disbanded ${ownerLabel(action.player)} caravan ${action.caravan + 1}.`;
  }

  if (action.type === "removeJacked") {
    const tgt = state.players[action.target.player].caravans[action.target.caravan].cards[action.target.cardIndex];
    const row = action.target.cardIndex + 1;
    const caravan = action.target.caravan + 1;
    const owner = ownerLabel(action.target.player);
    const cardDesc = tgt ? fmt(tgt.card) : "card";
    return `${actor} removed jacked ${cardDesc} on row ${row} of ${owner} caravan ${caravan}.`;
  }

  return `${actor} acted.`;
}

export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase === "over") return state;
  if (action.player !== state.current) return state;

  const next: GameState = structuredClone(state);
  const player = next.players[action.player];
  let jokerDetail: string[] | null = null;

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
    const tgtPre = next.players[action.target.player].caravans[action.target.caravan].cards[action.target.cardIndex];
    // Jack cannot be played on an already-jacked card
    if (card.rank === "J" && tgtPre && isJacked(tgtPre)) return state;
    // King cannot be played on a jacked card; stacking Kings (even to bust) is legal
    if (card.rank === "K" && tgtPre && isJacked(tgtPre)) return state;
    player.hand.splice(action.handIndex, 1);
    const tgt = next.players[action.target.player].caravans[action.target.caravan].cards[action.target.cardIndex];
    if (card.rank === "J") {
      if (tgt) tgt.attachments.push(card);
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
      jokerDetail = applyJoker(next, action.target);
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
  } else if (action.type === "removeJacked") {
    if (!isValidTarget(next, action.target)) return state;
    const car = next.players[action.target.player].caravans[action.target.caravan];
    const tgt = car.cards[action.target.cardIndex];
    if (!tgt || !isJacked(tgt)) return state;
    removeValueCard(next, action.target);
    draw(player);
  }

  const entry = log(describe(action, state));
  if (jokerDetail && jokerDetail.length > 0) entry.detail = jokerDetail;
  next.log = [...next.log, entry].slice(-50);

  const winner = gameWinner(next);
  if (winner !== null) {
    next.phase = "over";
    next.winner = winner;
    next.log = [
      ...next.log,
      log(`${winner === 0 ? "You win the caravan!" : "AI wins the caravan."} ${caravanAnalysis(next)}`),
    ];
  } else if (legalActions(next).length === 0) {
    // A player who cannot make any move (out of cards / no legal play) loses;
    // the opponent wins automatically — matches the in-game coded behavior.
    const loser = next.current;
    next.phase = "over";
    next.winner = loser === 0 ? 1 : 0;
    next.log = [
      ...next.log,
      log(
        `${loser === 0 ? "You ran out of moves — AI wins." : "AI ran out of moves — you win!"} ${caravanAnalysis(next)}`,
      ),
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

  // remove jacked cards are always available (even during must-start, to clean board)
  const jackRemovals: Action[] = [];
  for (let p = 0 as PlayerId; p <= 1; p = (p + 1) as PlayerId) {
    const owner = state.players[p];
    for (let ci = 0; ci < owner.caravans.length; ci++) {
      const car = owner.caravans[ci];
      for (let cidx = 0; cidx < car.cards.length; cidx++) {
        const pc = car.cards[cidx];
        if (isJacked(pc)) {
          jackRemovals.push({ type: "removeJacked", player: pid, target: { player: p, caravan: ci as 0 | 1 | 2, cardIndex: cidx } });
        }
      }
    }
  }

  if (hasEmpty) {
    for (let ci = 0; ci < player.caravans.length; ci++) {
      const car = player.caravans[ci];
      if (car.cards.length !== 0) continue;
      for (let hi = 0; hi < player.hand.length; hi++) {
        const card = player.hand[hi];
        if (isValueCard(card)) actions.push({ type: "playValue", player: pid, caravan: ci as 0 | 1 | 2, handIndex: hi });
      }
    }
    actions.push(...jackRemovals);
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
            const tgt = car.cards[cidx];
            if (card.rank === "J" && isJacked(tgt)) continue;
            // King stacking is legal even when it busts; only jacked targets are invalid
            if (card.rank === "K" && isJacked(tgt)) continue;
            actions.push({ type: "playFace", player: pid, target: { player: p, caravan: ci as 0 | 1 | 2, cardIndex: cidx }, handIndex: hi });
          }
        }
      }
    }
  }

  actions.push(...jackRemovals);

  if (player.deck.length > 0) {
    for (let hi = 0; hi < player.hand.length; hi++) actions.push({ type: "discard", player: pid, handIndex: hi });
  }
  for (let ci = 0; ci < 3; ci++) actions.push({ type: "disband", player: pid, caravan: ci as 0 | 1 | 2 });
  return actions;
}
