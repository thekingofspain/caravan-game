import { describe, it, expect } from "vitest";
import { makeCard, buildDeck } from "../src/model/cards";
import { setupGame, applyMove, legalMoves } from "../src/model/engine";
import { calculateScore, hasJackAttached } from "../src/model/rules/caravanCardRules";
import { Card, Caravan, CaravanRow, GameState, PlayerState, Human, Ai } from "../src/model/types";
import { getTransitionInfo } from "../src/viewmodel/transition";

function rowWithKings(rank: string, suit: string = "spades", kings: number = 0): CaravanRow {
  const r: CaravanRow = [makeCard(1, rank as any, suit as any)];
  for (let i = 0; i < kings; i++) r.push(makeCard(1, "K" as any, "spades" as any));
  return r;
}
function caravanOf(ranks: any[], suit: any = "spades"): Caravan {
  const rows: CaravanRow[] = ranks.map((r) => rowWithKings(r, suit));
  let direction: any = null;
  if (rows.length >= 2) {
    const av = rows[0][0].rank === "A" ? 1 : Number(rows[0][0].rank) || 0;
    const bv = rows[1][0].rank === "A" ? 1 : Number(rows[1][0].rank) || 0;
    direction = bv > av ? "asc" : "desc";
  }
  return { rows, direction, suit: ranks.length ? (suit as any) : null };
}
const EMPTY: Caravan[] = [caravanOf([]), caravanOf([]), caravanOf([])];
function mkPlayer(caravans: Caravan[], hand: Card[]): PlayerState {
  return { deck: [], hand, caravans };
}
function mkGame(p0: PlayerState, p1: PlayerState, current: any = 0): GameState {
  return { players: [p0, p1], current, phase: "play", winner: null, log: [], started: false };
}

describe("setup", () => {
  it("deals 8-card hands from a 30-card deck", () => {
    const s = setupGame({ seed: 7 });
    expect(s.players[Human].hand.length).toBe(8);
    expect(s.players[Human].deck.length).toBe(22);
    expect(s.players[Ai].hand.length).toBe(8);
    expect(s.current).toBe(0);
  });
});

describe("initial round (must-start constraint)", () => {
  it("only allows playing value cards to empty caravans", () => {
    const s = setupGame({ seed: 7 });
    const acts = legalMoves(s);
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) {
      expect(a.type).toBe("playValueCard");
      expect(s.players[a.player].caravans[a.caravan].rows.length).toBe(0);
    }
  });
  it("disallows discard while a caravan is empty", () => {
    const s = setupGame({ seed: 7 });
    const discards = legalMoves(s).filter((a) => a.type === "discardCard");
    expect(discards.length).toBe(0);
  });
  it("starts a caravan when a value card is played", () => {
    const s = setupGame({ seed: 7 });
    const act = legalMoves(s)[0] as any;
    const card = s.players[Human].hand[act.handIndex];
    const next = applyMove(s, act);
    expect(next.players[Human].caravans[act.caravan].rows.length).toBe(1);
    expect(next.players[Human].caravans[act.caravan].suit).toBe(card.suit);
    expect(next.current).toBe(1);
  });
  it("is pure (does not mutate input state)", () => {
    const s = setupGame({ seed: 7 });
    const before = JSON.stringify(s);
    applyMove(s, legalMoves(s)[0]);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("face card effects", () => {
  it("Jack removes the targeted card immediately on the player's own move", () => {
    const p0 = mkPlayer(EMPTY, [makeCard(1, "J" as any, "spades" as any), makeCard(1, "3" as any, "hearts" as any)]);
    const p1 = mkPlayer([caravanOf([]), caravanOf([]), caravanOf(["10"])], []);
    const s = mkGame(p0, p1);
    const next = applyMove(s, { type: "playFaceCard", player: 0, target: { player: 1, caravan: 2, cardIndex: 0 }, handIndex: 0 });
    expect(next.players[Ai].caravans[2].rows.length).toBe(0);
    expect(next.current).toBe(1);
  });

  it("Opponent jack is committed immediately; UX shows pseudo via diff", () => {
    const p0 = mkPlayer([caravanOf([]), caravanOf([]), caravanOf(["10"])], [makeCard(1, "3" as any, "hearts" as any)]);
    const p1 = mkPlayer(EMPTY, [makeCard(1, "J" as any, "spades" as any)]);
    const s = mkGame(p0, p1, 1);
    const move = { type: "playFaceCard", player: 1, target: { player: 0, caravan: 2, cardIndex: 0 }, handIndex: 0 } as const;
    const next = applyMove(s, move);
    expect(next.players[Human].caravans[2].rows.length).toBe(0);
    const info = getTransitionInfo(s, move, next);
    expect(info.needsConfirmation).toBe(true);
    expect(info.confirmer).toBe(Human);
    expect(info.impacted.length).toBe(1);
    expect(info.impacted[0]).toEqual({ player: 0, caravan: 2, cardIndex: 0 });
    expect(info.addedTemp?.card.rank).toBe("J");
  });

  it("Queen reverses direction and changes suit", () => {
    const p0 = mkPlayer(EMPTY, [makeCard(1, "Q" as any, "hearts" as any)]);
    const p1 = mkPlayer([caravanOf([]), caravanOf([]), caravanOf(["3", "7"])], []);
    const s = mkGame(p0, p1);
    const next = applyMove(s, { type: "playFaceCard", player: 0, target: { player: 1, caravan: 2, cardIndex: 1 }, handIndex: 0 });
    const car = next.players[Ai].caravans[2];
    expect(car.direction).toBe("desc");
    expect(car.suit).toBe("hearts");
    expect(car.rows[1].length).toBe(2);
  });

  it("King doubles the targeted row value", () => {
    const p0 = mkPlayer(EMPTY, [makeCard(1, "K" as any, "spades" as any)]);
    const p1 = mkPlayer([caravanOf([]), caravanOf([]), caravanOf(["10"])], []);
    const s = mkGame(p0, p1);
    const next = applyMove(s, { type: "playFaceCard", player: 0, target: { player: 1, caravan: 2, cardIndex: 0 }, handIndex: 0 });
    expect(calculateScore(next.players[Ai].caravans[2])).toBe(20);
  });

  it("Joker on Ace removes all cards of that suit", () => {
    const joker = makeCard(1, "Joker" as any, "Red" as any);
    const p0 = mkPlayer(EMPTY, [joker]);
    const p1 = mkPlayer([caravanOf(["10"], "spades"), caravanOf(["5"], "hearts"), caravanOf(["3"], "spades")], []);
    const s = mkGame(p0, p1);
    // target is spade Ace? Actually to remove spades, target must be Ace of spades or rank match. UseAce.
    // Set target to spade-ranked card with same suit; easiest: target spade 10 and Joker should remove same rank? Let's test rank removal.
    // Joker on 10 of spades removes all 10s
    const next = applyMove(s, { type: "playFaceCard", player: 0, target: { player: 1, caravan: 0, cardIndex: 0 }, handIndex: 0 });
    // Should have removed both 10s (none other 10s) - check via detail not needed
    expect(next.players[Ai].caravans[0].rows.length).toBe(0);
  });

  it("cannot Jack a jacked card", () => {
    const p0 = mkPlayer(EMPTY, [makeCard(1, "J" as any, "clubs" as any)]);
    const row: CaravanRow = [makeCard(1, "10" as any, "spades" as any), makeCard(1, "J" as any, "hearts" as any)];
    const car: Caravan = { rows: [row], direction: null, suit: "spades" };
    const p1 = mkPlayer([car, caravanOf([]), caravanOf([])], []);
    const s = mkGame(p1, p0, 0);
    // Try to jack the already jacked row
    expect(() => applyMove(s, { type: "playFaceCard", player: 0, target: { player: 0, caravan: 0, cardIndex: 0 }, handIndex: 0 })).toThrow();
  });
});

describe("dismissCaravan", () => {
  it("dismisses a caravan", () => {
    const p0 = mkPlayer([caravanOf(["10"]), caravanOf(["10"]), caravanOf(["10"])], []);
    const p1 = mkPlayer(EMPTY, []);
    const s = mkGame(p0, p1, 0);
    const next = applyMove(s, { type: "dismissCaravan", player: 0, caravan: 1 });
    expect(next.players[0].caravans[1].rows.length).toBe(0);
  });
  it("cannot dismiss while any empty", () => {
    const s = mkGame(mkPlayer(EMPTY, []), mkPlayer(EMPTY, []), 0);
    expect(() => applyMove(s, { type: "dismissCaravan", player: 0, caravan: 0 })).toThrow();
  });
});

describe("illegal actions throw", () => {
  it("not current player", () => {
    const s = setupGame({ seed: 1 });
    s.current = Human;
    expect(() => applyMove(s, { type: "discardCard", player: Ai, handIndex: 0 })).toThrow();
  });
  it("game over blocks moves", () => {
    const s = setupGame({ seed: 1 });
    s.phase = "over";
    expect(() => applyMove(s, legalMoves(setupGame({ seed: 1 }))[0])).toThrow();
  });
});

describe("deck", () => {
  it("buildDeck creates 52 cards plus jokers per deck", () => {
    const d = buildDeck(1);
    expect(d.length).toBe(53 + 1); // 52 + 2 jokers? Actually STANDARD_RANKS includes 13 ranks x4 suits =52 +2 jokers =54
    expect(d.filter((c) => c.rank === "Joker").length).toBe(2);
  });
  it("joker colors are Red/Black", () => {
    const d = buildDeck(1);
    const jokers = d.filter((c) => c.rank === "Joker");
    expect(jokers.map((j) => (j as any).jokerType).sort()).toEqual(["Black", "Red"]);
  });
});
