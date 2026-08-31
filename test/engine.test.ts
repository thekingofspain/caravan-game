import { describe, it, expect } from "vitest";
import { makeCard, buildDeck, jokerColor } from "../src/game/cards";
import { setupGame, applyAction, legalActions } from "../src/game/engine";
import { caravanTotal, isJacked } from "../src/game/rules";
import { Card, Caravan, GameState, PlacedCard, PlayerState, Human, Ai } from "../src/game/types";
import { getTransitionInfo } from "../src/game/transition";
function pcard(rank: any, suit: any = "spades", kingCount = 0): PlacedCard {
  return { card: makeCard(suit, rank), kingCount, attachments: [] };
}
function caravanOf(ranks: any[], suit: any = "spades"): Caravan {
  const cards = ranks.map((r) => pcard(r, suit));
  let direction: any = null;
  if (cards.length >= 2) direction = ranks[1] > ranks[0] ? "asc" : "desc";
  return { cards, direction, suit: ranks.length ? suit : null };
}
const EMPTY: Caravan[] = [caravanOf([]), caravanOf([]), caravanOf([])];
function mkPlayer(caravans: Caravan[], hand: Card[]): PlayerState {
  return { deck: [], hand, caravans, sales: 0 };
}
function mkGame(p0: PlayerState, p1: PlayerState, current: Human | 1 = 0): GameState {
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
    const acts = legalActions(s);
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) {
      expect(a.type).toBe("playValueCard");
      expect(((s.players[a.player].caravans[a.caravan] as any).rows ?? (s.players[a.player].caravans[a.caravan] as any).cards).length).toBe(0);
    }
  });
  it("disallows discard while a caravan is empty", () => {
    const s = setupGame({ seed: 7 });
    const discards = legalActions(s).filter((a) => a.type === "discardCard");
    expect(discards.length).toBe(0);
  });
  it("starts a caravan when a value card is played", () => {
    const s = setupGame({ seed: 7 });
    const act = legalActions(s)[0];
    const card = s.players[Human].hand[act.handIndex];
    const next = applyAction(s, act);
    expect(((next.players[Human].caravans[act.caravan] as any).rows ?? (next.players[Human].caravans[act.caravan] as any).cards).length).toBe(1);
    expect(next.players[Human].caravans[act.caravan].suit).toBe(card.suit);
    expect(next.current).toBe(1);
  });
  it("is pure (does not mutate input state)", () => {
    const s = setupGame({ seed: 7 });
    const before = JSON.stringify(s);
    applyAction(s, legalActions(s)[0]);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("face card effects", () => {
  it("Jack removes the targeted card immediately on the player's own move", () => {
    const p0 = mkPlayer(EMPTY, [makeCard("spades", "J"), makeCard("hearts", "3")]);
    const p1 = mkPlayer([caravanOf([]), caravanOf([]), caravanOf(["10"])], []);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "playFaceCard", player: 0, target: { player: 1, caravan: 2, cardIndex: 0 }, handIndex: 0 });
    // Jacked card is removed right away on the player's own turn (no separate step).
    expect(((next.players[Ai].caravans[2] as any).rows ?? (next.players[Ai].caravans[2] as any).cards).length).toBe(0);
    expect(next.current).toBe(1);
  });

  it("Opponent jack is committed immediately; UX shows pseudo via diff", () => {
    const p0 = mkPlayer([caravanOf([]), caravanOf([]), caravanOf(["10"])], [makeCard("hearts", "3")]);
    const p1 = mkPlayer(EMPTY, [makeCard("spades", "J")]);
    const s = mkGame(p0, p1, 1);
    const move = { type: "playFaceCard", player: 1, target: { player: 0, caravan: 2, cardIndex: 0 }, handIndex: 0 } as const;
    const next = applyAction(s, move);
    // Engine commits immediately — no pending; card is gone in `next`, UX shows pseudo via diff
    expect(((next.players[Human].caravans[2] as any).rows ?? (next.players[Human].caravans[2] as any).cards).length).toBe(0);
    // UX derives pseudo from diff(previous, move, current)
    const info = getTransitionInfo(s, move, next);
    expect(info.needsConfirmation).toBe(true);
    expect(info.confirmer).toBe(Human); // Human must acknowledge AI's removal
    expect(info.impacted.length).toBe(1);
    expect(info.impacted[0]).toEqual({ player: 0, caravan: 2, cardIndex: 0 });
    expect(info.addedTemp?.card.rank).toBe("J");
  });

  it("Queen reverses direction and changes suit", () => {
    const p0 = mkPlayer(EMPTY, [makeCard("hearts", "Q")]);
    const p1 = mkPlayer([caravanOf([]), caravanOf([]), caravanOf(["3", "7"])], []);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "playFaceCard", player: 0, target: { player: 1, caravan: 2, cardIndex: 1 }, handIndex: 0 });
    const car = next.players[Ai].caravans[2];
    expect(car.direction).toBe("desc");
    expect(car.suit).toBe("hearts");
  });

  it("King doubles the targeted card", () => {
    const p0 = mkPlayer(EMPTY, [makeCard("spades", "K")]);
    const p1 = mkPlayer([caravanOf([]), caravanOf([]), caravanOf(["10"])], []);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "playFaceCard", player: 0, target: { player: 1, caravan: 2, cardIndex: 0 }, handIndex: 0 });
    expect(next.players[Ai].caravans[2].cards[0].kingCount).toBe(1);
    expect(caravanTotal(next.players[Ai].caravans[2])).toBe(20);
  });

  it("King can be stacked on an already-kinged card, even if it busts the caravan", () => {
    const kinged: PlacedCard = { card: makeCard("spades", "10"), kingCount: 1, attachments: [makeCard("spades", "K")] };
    const car: Caravan = { cards: [kinged], direction: null, suit: "spades" };
    const p0 = mkPlayer(EMPTY, [makeCard("hearts", "K"), makeCard("clubs", "5")]);
    const p1 = mkPlayer([car, caravanOf([]), caravanOf([])], [makeCard("spades", "5")]);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "playFaceCard", player: 0, target: { player: 1, caravan: 0, cardIndex: 0 }, handIndex: 0 });
    expect(next.players[Ai].caravans[0].cards[0].kingCount).toBe(2);
    expect(caravanTotal(next.players[Ai].caravans[0])).toBe(40);
    expect(next.phase).toBe("play");
  });

  it("legalActions offers King stacking on a kinged card even when it busts", () => {
    const kinged: PlacedCard = { card: makeCard("spades", "10"), kingCount: 1, attachments: [makeCard("spades", "K")] };
    const car: Caravan = { cards: [kinged], direction: null, suit: "spades" };
    const p0 = mkPlayer([caravanOf(["5"]), caravanOf(["5"]), caravanOf(["5"])], [makeCard("hearts", "K")]);
    const p1 = mkPlayer([car, caravanOf(["6"]), caravanOf(["7"])], []);
    const s = mkGame(p0, p1);
    const acts = legalActions(s).filter((a) => a.type === "playFaceCard" && a.handIndex === 0);
    expect(acts.some((a) => a.type === "playFaceCard" && a.target.player === 1 && a.target.caravan === 0 && a.target.cardIndex === 0)).toBe(true);
  });

  it("Joker on a 10 removes all 10s of that rank (including the target)", () => {
    const p0 = mkPlayer(EMPTY, [makeCard("spades", "JOKER")]);
    const p1 = mkPlayer([caravanOf(["10", "5"]), caravanOf([]), caravanOf(["10"])], []);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "playFaceCard", player: 0, target: { player: 1, caravan: 0, cardIndex: 0 }, handIndex: 0 });
    expect(next.players[Ai].caravans[0].cards.length).toBe(1); // only the 5 stays
    expect(((next.players[Ai].caravans[2] as any).rows ?? (next.players[Ai].caravans[2] as any).cards).length).toBe(0); // other 10 removed
    const entry = next.log.find((e) => e.text.includes("Joker"))!;
    expect(entry.detail).toEqual(["AI's caravan Dayglow: {10♠}", "AI's caravan The Hub: {10♠}"]); // one bullet per affected caravan
  });

  it("Joker on an Ace removes all cards of that suit (including the target)", () => {
    const p0 = mkPlayer(EMPTY, [makeCard("spades", "JOKER")]);
    const p1 = mkPlayer([caravanOf(["A", "5"]), caravanOf(["A"]), caravanOf([])], []);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "playFaceCard", player: 0, target: { player: 1, caravan: 0, cardIndex: 0 }, handIndex: 0 });
    expect(next.players[Ai].caravans[0].cards.length).toBe(0); // ace (target) and 5 removed
    expect(next.players[Ai].caravans[1].cards.length).toBe(0); // other spade ace removed
    const entry = next.log.find((e) => e.text.includes("Joker"))!;
    expect(entry.detail).toEqual(["AI's caravan Dayglow: {A♠}, {5♠}", "AI's caravan New Reno: {A♠}"]);
  });
});

describe("dismissCaravan", () => {
  it("clears a caravan once all are started", () => {
    const p0 = mkPlayer([caravanOf(["10"]), caravanOf(["9"]), caravanOf(["8"])], [makeCard("spades", "2")]);
    const p1 = mkPlayer(EMPTY, []);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "dismissCaravan", player: 0, caravan: 0 });
    expect(((next.players[Human].caravans[0] as any).rows ?? (next.players[Human].caravans[0] as any).cards).length).toBe(0);
  });
});

describe("illegal actions throw", () => {
  it("throws IllegalActionError for illegal value placement", () => {
    // Boneyard has 8♠ then 5♠ (desc), top is 5♠, try 6♥ (6 >5 but direction is desc, suit hearts != spades) -> illegal
    const p0 = mkPlayer([caravanOf(["8","5"]), caravanOf(["9"]), caravanOf(["8"])], [makeCard("hearts","6")]);
    const p1 = mkPlayer(EMPTY, []);
    const s = mkGame(p0, p1);
    expect(() => applyAction(s, { type: "playValueCard", player: 0, caravan: 0, handIndex: 0 })).toThrow();
  });
  it("throws for playing on wrong turn", () => {
    const s = setupGame({ seed: 7 });
    // s.current is Human, try Ai move (illegal turn)
    expect(() => applyAction(s, { type: "playValueCard", player: 1, caravan: 0, handIndex: 0 })).toThrow();
  });
});

describe("deck", () => {
  it("standard deck has 54 unique cards including a black and a red joker", () => {
    const d = buildDeck();
    expect(d.length).toBe(54);
    const jokers = d.filter((c) => (c.rank === "JOKER" || c.rank === "Joker"));
    expect(jokers.map(jokerColor).sort()).toEqual(["black", "red"]);
    expect(new Set(d.map((c) => c.id)).size).toBe(54);
  });

  it("setupGame deals each player 30 cards from a full shuffled deck", () => {
    const s = setupGame({ seed: 7 });
    for (const p of s.players) {
      expect(p.hand.length + p.deck.length).toBe(30);
      for (const c of [...p.hand, ...p.deck]) {
        expect((c.rank === "JOKER" || c.rank === "Joker") || c.suit !== "joker").toBe(true);
      }
    }
  });
});
