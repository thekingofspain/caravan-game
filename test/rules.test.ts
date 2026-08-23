import { describe, it, expect } from "vitest";
import { makeCard } from "../src/game/cards";
import { Caravan, PlacedCard } from "../src/game/types";
import { caravanTotal, canPlayValue, placedValue } from "../src/game/rules";

function placed(rank: any, suit: any = "spades", kingCount = 0): PlacedCard {
  return { card: makeCard(suit, rank), kingCount, attachments: [] };
}
function caravan(cards: PlacedCard[]): Caravan {
  let direction: any = null;
  if (cards.length >= 2) direction = cards[1].card.rank > cards[0].card.rank ? "asc" : "desc";
  const suit = cards.length ? cards[0].card.suit : null;
  return { cards, direction, suit };
}

describe("caravanTotal / placedValue", () => {
  it("sums base values", () => {
    expect(caravanTotal(caravan([placed("10"), placed("6")]))).toBe(16);
  });
  it("ace counts as 1", () => {
    expect(caravanTotal(caravan([placed("A")]))).toBe(1);
  });
  it("one king doubles the target", () => {
    expect(caravanTotal(caravan([placed("10", "spades", 1)]))).toBe(20);
    expect(placedValue(placed("10", "spades", 1))).toBe(20);
  });
  it("two kings quadruple the target", () => {
    expect(caravanTotal(caravan([placed("10", "spades", 2)]))).toBe(40);
  });
});

describe("canPlayValue", () => {
  it("allows any value card on an empty caravan", () => {
    expect(canPlayValue(makeCard("spades", "5"), caravan([]))).toBe(true);
  });
  it("rejects equal rank played in sequence", () => {
    expect(canPlayValue(makeCard("hearts", "5"), caravan([placed("5")]))).toBe(false);
  });
  it("ascending direction requires increasing value", () => {
    const c = caravan([placed("3"), placed("5")]);
    expect(c.direction).toBe("asc");
    expect(canPlayValue(makeCard("clubs", "7"), c)).toBe(true);
    expect(canPlayValue(makeCard("clubs", "4"), c)).toBe(false);
  });
  it("matching previous suit is legal regardless of direction", () => {
    const c = caravan([placed("3"), placed("5")]);
    expect(canPlayValue(makeCard("spades", "2"), c)).toBe(true);
  });
  it("descending direction requires decreasing value", () => {
    const c = caravan([placed("9"), placed("7")]);
    expect(c.direction).toBe("desc");
    expect(canPlayValue(makeCard("clubs", "5"), c)).toBe(true);
    expect(canPlayValue(makeCard("clubs", "8"), c)).toBe(false);
  });
});
