import { buildDeck, jokerColor, SUIT_SYMBOL, resetCardIds } from "./cards";
import { canPlayValueCard, caravanTotal, isInRange, isJacked, isValidTarget } from "./rules";
import { caravanName } from "./names";
import { gameWinner, pairWinner } from "./scoring";
import {
  Action,
  Ai,
  Card,
  Caravan,
  CaravanIndex,
  CARAVAN_COUNT,
  PLAYERS,
  GameState,
  Human,
  IllegalActionError,
  LogEntry,
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
  // Reset per-game counters for repeatable IDs (F.I.R.S.T. Repeatable)
  logId = 0;
  resetCardIds();
  const rng = mulberry32(opts.seed ?? 1);
  const human = shuffle(buildDeck(), rng).slice(0, 30);
  const ai = shuffle(buildDeck(), rng).slice(0, 30);
  return {
    players: [makePlayer(human), makePlayer(ai)],
    current: opts.first ?? Human,
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

// Pure preview of which cards a Joker played on `target` would remove. This
// includes the target card itself (the whole matched set is removed), across
// every caravan of both players. Attachments travel with their removed card.
export function jokerRemovals(state: GameState, target: TargetRef): TargetRef[] {
  const tgt = state.players[target.player].caravans[target.caravan].cards[target.cardIndex];
  if (!tgt) return [];
  const isAceTarget = tgt.card.rank === "A";
  const suit = tgt.card.suit;
  const value = baseValue(tgt.card);
  const out: TargetRef[] = [];
  for (const p of PLAYERS) {
    const car = state.players[p].caravans;
    for (let ci = 0; ci < car.length; ci++) {
      car[ci].cards.forEach((pc, cidx) => {
        const match = isAceTarget ? pc.card.suit === suit : baseValue(pc.card) === value;
        if (match) out.push({ player: p, caravan: ci as 0 | 1 | 2, cardIndex: cidx });
      });
    }
  }
  return out;
}
// Remove given targets (grouped per caravan, descending order) — used for Joker/Jack immediate commit.
function removeTargets(state: GameState, refs: TargetRef[]): void {
  const groups = new Map<string, TargetRef[]>();
  for (const r of refs) {
    const k = `${r.player}-${r.caravan}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  for (const refs of groups.values()) {
    refs.sort((a, b) => b.cardIndex - a.cardIndex);
    for (const r of refs) removeValueCard(state, r);
  }
}

// Build per-caravan bullet lines describing removals (for Joker log).
function removalDetail(state: GameState, refs: TargetRef[]): string[] {
  const byCar = new Map<string, Card[]>();
  for (const r of refs) {
    const pc = state.players[r.player].caravans[r.caravan].cards[r.cardIndex];
    if (!pc) continue;
    const key = `${r.player}-${r.caravan}`;
    if (!byCar.has(key)) byCar.set(key, []);
    byCar.get(key)!.push(pc.card);
  }
  const detail: string[] = [];
  for (const [key, cards] of byCar) {
    const [p, ci] = key.split("-").map(Number) as [PlayerId, number];
    detail.push(`${formatOwnerLabel(p)} caravan ${caravanName(p, ci)}: ${cards.map(formatCardLog).join(", ")}`);
  }
  return detail;
}
function formatCardLog(card: Card): string {
  if (card.rank === "JOKER") return `{${jokerColor(card) === "red" ? "Red" : "Black"} Joker}`;
  return `{${card.rank}${SUIT_SYMBOL[card.suit as Suit]}}`;
}

function formatOwnerLabel(p: PlayerId): string {
  return p === Human ? "your" : "AI's";
}

function formatFinalScore(state: GameState): string {
  const side = (p: PlayerId) =>
    state.players[p].caravans
      .map((c, i) => {
        const t = caravanTotal(c);
        if (pairWinner(state, i as 0 | 1 | 2) === p) return `**${t}**`;
        if (isInRange(t)) return `*${t}*`;
        return `${t}`;
      })
      .join("/");
  return `Final caravans — you ${side(Human)}, AI ${side(Ai)}.`;
}

function describe(action: Action, state: GameState): string | null {
  const names = ["You", "AI"] as const;
  const actor = names[action.player];

  if (action.type === "playValueCard") {
    const c = state.players[action.player].hand[action.handIndex];
    const row = state.players[action.player].caravans[action.caravan].cards.length + 1;
    return `${actor} placed ${formatCardLog(c)} on row ${row} of ${formatOwnerLabel(action.player)} caravan ${caravanName(action.player, action.caravan)}.`;
  }

  if (action.type === "playFaceCard") {
    const c = state.players[action.player].hand[action.handIndex];
    const tgt = state.players[action.target.player].caravans[action.target.caravan].cards[action.target.cardIndex];
    const row = action.target.cardIndex + 1;
    const caravan = caravanName(action.target.player, action.target.caravan);
    const owner = formatOwnerLabel(action.target.player);
    let effect = "";
    if (c.rank === "J") effect = ` — marked ${formatCardLog(tgt.card)} for removal`;
    else if (c.rank === "Q") effect = ` — reversed direction, set suit to {${SUIT_SYMBOL[c.suit as Suit]}}`;
    else if (isJoker(c)) {
      if (tgt.card.rank === "A") effect = ` — removed all {${SUIT_SYMBOL[tgt.card.suit as Suit]}} cards`;
      else effect = ` — removed all ${baseValue(tgt.card)}s`;
    }
    return `${actor} placed ${formatCardLog(c)} on ${formatCardLog(tgt.card)} on row ${row} of ${owner} caravan ${caravan}${effect}.`;
  }

  if (action.type === "discardCard") {
    const c = state.players[action.player].hand[action.handIndex];
    return `${actor} discarded ${formatCardLog(c)}.`;
  }

  if (action.type === "dismissCaravan") {
    return `${actor} dismissed ${formatOwnerLabel(action.player)} caravan ${caravanName(action.player, action.caravan)}.`;
  }

  return `${actor} acted.`;
}

function handlePlayValueCard(next: GameState, action: Extract<Action, { type: "playValueCard" }>): void {
  const player = next.players[action.player];
  const car = player.caravans[action.caravan];
  const card = player.hand[action.handIndex];
  if (!card || !isValueCard(card)) throw new IllegalActionError("playValueCard: not a value card");
  if (!canPlayValueCard(card, car)) throw new IllegalActionError("playValueCard: illegal placement");
  player.hand.splice(action.handIndex, 1);
  car.cards.push({ card, kingCount: 0, attachments: [] });
  if (car.cards.length === 1) car.suit = card.suit as Caravan["suit"];
  if (car.cards.length === 2) {
    const a = baseValue(car.cards[0].card);
    const b = baseValue(car.cards[1].card);
    car.direction = b > a ? "asc" : "desc";
  }
  draw(player);
}

function handlePlayFaceCard(
  next: GameState,
  action: Extract<Action, { type: "playFaceCard" }>,
): string[] | null {
  const player = next.players[action.player];
  const card = player.hand[action.handIndex];
  if (!card || (!isFaceCard(card) && !isJoker(card))) throw new IllegalActionError("playFaceCard: not a face card");
  if (!isValidTarget(next, action.target)) throw new IllegalActionError("playFaceCard: invalid target");
  const tgtPre = next.players[action.target.player].caravans[action.target.caravan].cards[action.target.cardIndex];
  if (card.rank === "J" && tgtPre && isJacked(tgtPre)) throw new IllegalActionError("playFaceCard: Jack on jacked card");
  if (card.rank === "K" && tgtPre && isJacked(tgtPre)) throw new IllegalActionError("playFaceCard: King on jacked card");
  player.hand.splice(action.handIndex, 1);
  const tgt = next.players[action.target.player].caravans[action.target.caravan].cards[action.target.cardIndex];
  let jokerDetail: string[] | null = null;
  if (card.rank === "J") {
    if (tgt) tgt.attachments.push(card);
    removeTargets(next, [action.target]);
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
    const refs = jokerRemovals(next, action.target);
    jokerDetail = removalDetail(next, refs);
    removeTargets(next, refs);
  }
  draw(player);
  return jokerDetail;
}

function handleDiscardCard(next: GameState, action: Extract<Action, { type: "discardCard" }>): void {
  const player = next.players[action.player];
  if (player.caravans.some((c) => c.cards.length === 0)) throw new IllegalActionError("discardCard: cannot discard before all caravans started");
  if (!player.hand[action.handIndex]) throw new IllegalActionError("discardCard: invalid hand index");
  player.hand.splice(action.handIndex, 1);
  draw(player);
}

function handleDismissCaravan(next: GameState, action: Extract<Action, { type: "dismissCaravan" }>): void {
  const player = next.players[action.player];
  if (player.caravans.some((c) => c.cards.length === 0)) throw new IllegalActionError("dismissCaravan: cannot disband before all caravans started");
  player.caravans[action.caravan] = emptyCaravan();
}

export function applyAction(state: GameState, action: Action): GameState {
  if (state.phase === "over") throw new IllegalActionError("game over");
  if (action.player !== state.current) throw new IllegalActionError("not current player");

  const next: GameState = structuredClone(state);
  let jokerDetail: string[] | null = null;

  if (
    !next.started &&
    next.players.every((p) => p.caravans.every((c) => c.cards.length > 0))
  ) {
    next.started = true;
  }

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
    if (legalActions(next).length === 0) {
      // The player whose turn is next cannot make any move (out of cards /
      // no legal play) and loses; the opponent wins automatically.
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

export function legalActions(state: GameState): Action[] {
  if (state.phase === "over") return [];
  // Pending is now UX-only via getTransitionInfo(previous, move, current) — engine commits immediately.
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
        if (isValueCard(card)) actions.push({ type: "playValueCard", player: pid, caravan: ci as 0 | 1 | 2, handIndex: hi });
      }
    }
    return actions;
  }

  for (let hi = 0; hi < player.hand.length; hi++) {
    const card = player.hand[hi];
    if (isValueCard(card)) {
      for (let ci = 0; ci < player.caravans.length; ci++) {
        const car = player.caravans[ci];
        if (canPlayValueCard(card, car)) actions.push({ type: "playValueCard", player: pid, caravan: ci as 0 | 1 | 2, handIndex: hi });
      }
    } else {
      for (const p of PLAYERS) {
        const opp = state.players[p];
        for (let ci = 0; ci < opp.caravans.length; ci++) {
          const car = opp.caravans[ci];
          for (let cidx = 0; cidx < car.cards.length; cidx++) {
            const tgt = car.cards[cidx];
            if (card.rank === "J" && isJacked(tgt)) continue;
            // King stacking is legal even when it busts; only jacked targets are invalid
            if (card.rank === "K" && isJacked(tgt)) continue;
            actions.push({ type: "playFaceCard", player: pid, target: { player: p, caravan: ci as 0 | 1 | 2, cardIndex: cidx }, handIndex: hi });
          }
        }
      }
    }
  }

  if (player.deck.length > 0) {
    for (let hi = 0; hi < player.hand.length; hi++) actions.push({ type: "discardCard", player: pid, handIndex: hi });
  }
  for (let ci = 0; ci < CARAVAN_COUNT; ci++) actions.push({ type: "dismissCaravan", player: pid, caravan: ci as CaravanIndex });
  return actions;
}
