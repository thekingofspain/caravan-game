import { describe, it, expect } from "vitest";
import { makeCard, getPreset } from "../src/game/cards";
import { setupGame, applyAction, legalActions } from "../src/game/engine";
import { caravanTotal, isJacked } from "../src/game/rules";
import { Card, Caravan, GameState, PlacedCard, PlayerState } from "../src/game/types";

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
function mkGame(p0: PlayerState, p1: PlayerState, current: 0 | 1 = 0): GameState {
  return { players: [p0, p1], current, phase: "play", winner: null, log: [] };
}

describe("setup", () => {
  it("deals 8-card hands from a 30-card deck", () => {
    const s = setupGame({ humanDeck: "default", aiDeck: "default", seed: 7 });
    expect(s.players[0].hand.length).toBe(8);
    expect(s.players[0].deck.length).toBe(22);
    expect(s.players[1].hand.length).toBe(8);
    expect(s.current).toBe(0);
  });
});

describe("initial round (must-start constraint)", () => {
  it("only allows playing value cards to empty caravans", () => {
    const s = setupGame({ humanDeck: "default", aiDeck: "default", seed: 7 });
    const acts = legalActions(s);
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) {
      expect(a.type).toBe("playValue");
      expect(s.players[a.player].caravans[a.caravan].cards.length).toBe(0);
    }
  });
  it("disallows discard while a caravan is empty", () => {
    const s = setupGame({ humanDeck: "default", aiDeck: "default", seed: 7 });
    const discards = legalActions(s).filter((a) => a.type === "discard");
    expect(discards.length).toBe(0);
  });
  it("starts a caravan when a value card is played", () => {
    const s = setupGame({ humanDeck: "default", aiDeck: "default", seed: 7 });
    const act = legalActions(s)[0];
    const card = s.players[0].hand[act.handIndex];
    const next = applyAction(s, act);
    expect(next.players[0].caravans[act.caravan].cards.length).toBe(1);
    expect(next.players[0].caravans[act.caravan].suit).toBe(card.suit);
    expect(next.current).toBe(1);
  });
  it("is pure (does not mutate input state)", () => {
    const s = setupGame({ humanDeck: "default", aiDeck: "default", seed: 7 });
    const before = JSON.stringify(s);
    applyAction(s, legalActions(s)[0]);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("face card effects", () => {
  it("Jack jacks the targeted card (kept on board, value 0, removable)", () => {
    const p0 = mkPlayer(EMPTY, [makeCard("spades", "J")]);
    const p1 = mkPlayer([caravanOf([]), caravanOf([]), caravanOf(["10"])], []);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "playFace", player: 0, target: { player: 1, caravan: 2, cardIndex: 0 }, handIndex: 0 });
    // Jack now attaches instead of splicing: card stays, marked jacked, value 0
    expect(next.players[1].caravans[2].cards.length).toBe(1);
    expect(isJacked(next.players[1].caravans[2].cards[0])).toBe(true);
    expect(caravanTotal(next.players[1].caravans[2])).toBe(0);
    expect(next.players[1].caravans[2].cards[0].attachments.some((c) => c.rank === "J")).toBe(true);
    // removal is a separate action on the jacked card's owner turn (next is AI's turn, but we force player 1's perspective)
    // verify legalActions includes removeJacked for the jacked card
    const acts = legalActions({ ...next, current: 1 as 0 | 1 });
    expect(acts.some((a) => a.type === "removeJacked" && a.target.player === 1 && a.target.caravan === 2 && a.target.cardIndex === 0)).toBe(true);
    // exercising removal cleans the card
    const afterRemove = applyAction({ ...next, current: 1 as 0 | 1 }, { type: "removeJacked", player: 1, target: { player: 1, caravan: 2, cardIndex: 0 } });
    expect(afterRemove.players[1].caravans[2].cards.length).toBe(0);
  });

  it("Queen reverses direction and changes suit", () => {
    const p0 = mkPlayer(EMPTY, [makeCard("hearts", "Q")]);
    const p1 = mkPlayer([caravanOf([]), caravanOf([]), caravanOf(["3", "7"])], []);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "playFace", player: 0, target: { player: 1, caravan: 2, cardIndex: 1 }, handIndex: 0 });
    const car = next.players[1].caravans[2];
    expect(car.direction).toBe("desc");
    expect(car.suit).toBe("hearts");
  });

  it("King doubles the targeted card", () => {
    const p0 = mkPlayer(EMPTY, [makeCard("spades", "K")]);
    const p1 = mkPlayer([caravanOf([]), caravanOf([]), caravanOf(["10"])], []);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "playFace", player: 0, target: { player: 1, caravan: 2, cardIndex: 0 }, handIndex: 0 });
    expect(next.players[1].caravans[2].cards[0].kingCount).toBe(1);
    expect(caravanTotal(next.players[1].caravans[2])).toBe(20);
  });

  it("King can be stacked on an already-kinged card, even if it busts the caravan", () => {
    const kinged: PlacedCard = { card: makeCard("spades", "10"), kingCount: 1, attachments: [makeCard("spades", "K")] };
    const car: Caravan = { cards: [kinged], direction: null, suit: "spades" };
    const p0 = mkPlayer(EMPTY, [makeCard("hearts", "K"), makeCard("clubs", "5")]);
    const p1 = mkPlayer([car, caravanOf([]), caravanOf([])], [makeCard("spades", "5")]);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "playFace", player: 0, target: { player: 1, caravan: 0, cardIndex: 0 }, handIndex: 0 });
    expect(next.players[1].caravans[0].cards[0].kingCount).toBe(2);
    expect(caravanTotal(next.players[1].caravans[0])).toBe(40);
    expect(next.phase).toBe("play");
  });

  it("legalActions offers King stacking on a kinged card even when it busts", () => {
    const kinged: PlacedCard = { card: makeCard("spades", "10"), kingCount: 1, attachments: [makeCard("spades", "K")] };
    const car: Caravan = { cards: [kinged], direction: null, suit: "spades" };
    const p0 = mkPlayer([caravanOf(["5"]), caravanOf(["5"]), caravanOf(["5"])], [makeCard("hearts", "K")]);
    const p1 = mkPlayer([car, caravanOf(["6"]), caravanOf(["7"])], []);
    const s = mkGame(p0, p1);
    const acts = legalActions(s).filter((a) => a.type === "playFace" && a.handIndex === 0);
    expect(acts.some((a) => a.type === "playFace" && a.target.player === 1 && a.target.caravan === 0 && a.target.cardIndex === 0)).toBe(true);
  });

  it("Joker on a 10 removes all other 10s from the table", () => {
    const p0 = mkPlayer(EMPTY, [makeCard("spades", "JOKER")]);
    const p1 = mkPlayer([caravanOf(["10", "5"]), caravanOf([]), caravanOf(["10"])], []);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "playFace", player: 0, target: { player: 1, caravan: 0, cardIndex: 0 }, handIndex: 0 });
    expect(next.players[1].caravans[0].cards.length).toBe(2); // target 10 + the 5 stay
    expect(next.players[1].caravans[2].cards.length).toBe(0); // other 10 removed
  });

  it("Joker on an Ace removes all other cards of that suit", () => {
    const p0 = mkPlayer(EMPTY, [makeCard("spades", "JOKER")]);
    const p1 = mkPlayer([caravanOf(["A", "5"]), caravanOf(["A"]), caravanOf([])], []);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "playFace", player: 0, target: { player: 1, caravan: 0, cardIndex: 0 }, handIndex: 0 });
    expect(next.players[1].caravans[0].cards.length).toBe(1); // ace (target) stays
    expect(next.players[1].caravans[1].cards.length).toBe(0); // other spade ace removed
  });
});

describe("disband", () => {
  it("clears a caravan once all are started", () => {
    const p0 = mkPlayer([caravanOf(["10"]), caravanOf(["9"]), caravanOf(["8"])], [makeCard("spades", "2")]);
    const p1 = mkPlayer(EMPTY, []);
    const s = mkGame(p0, p1);
    const next = applyAction(s, { type: "disband", player: 0, caravan: 0 });
    expect(next.players[0].caravans[0].cards.length).toBe(0);
  });
});

describe("preset decks", () => {
  it("every preset deck is exactly 30 cards", () => {
    for (const d of ["wanderer", "gambler", "default"]) {
      expect(getPreset(d).build().length).toBe(30);
    }
  });
});
