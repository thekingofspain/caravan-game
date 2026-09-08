import { describe, it, expect } from "vitest";
import { makeCard } from "../src/model/cards";
import { Caravan, CaravanRow } from "../src/model/types";
import { calculateScore, canPlaceCard, calculateCaravanRowValue, isSellable } from "../src/model/rules/caravanCardRules";

function row(rank: string, suit: string = "spades", kings: number = 0): CaravanRow {
  const base = makeCard(1, rank as any, suit as any);
  const ks: CaravanRow = [base];
  for (let i = 0; i < kings; i++) ks.push(makeCard(1, "K" as any, "spades" as any));
  return ks;
}
function caravan(rows: CaravanRow[]): Caravan {
  let direction: any = null;
  if (rows.length >= 2) {
    const a = rows[0][0];
    const b = rows[1][0];
    const av = a.rank === "A" ? 1 : Number(a.rank) || 0;
    const bv = b.rank === "A" ? 1 : Number(b.rank) || 0;
    direction = bv > av ? "asc" : "desc";
  }
  const suit = rows.length ? rows[0][0].suit : null;
  return { rows, direction, suit: suit as any };
}

describe("canPlaceCard", () => {
  it("allows any value card on an empty caravan", () => {
    expect(canPlaceCard(makeCard(1, "5" as any, "spades" as any), caravan([]))).toBe(true);
  });
  it("rejects equal rank played in sequence", () => {
    expect(canPlaceCard(makeCard(1, "5" as any, "hearts" as any), caravan([row("5")]))).toBe(false);
  });
  it("ascending direction requires increasing value", () => {
    const c = caravan([row("3"), row("5")]);
    expect(c.direction).toBe("asc");
    expect(canPlaceCard(makeCard(1, "7" as any, "clubs" as any), c)).toBe(true);
    expect(canPlaceCard(makeCard(1, "4" as any, "clubs" as any), c)).toBe(false);
  });
  it("matching previous suit is legal regardless of direction", () => {
    const c = caravan([row("3"), row("5")]);
    expect(canPlaceCard(makeCard(1, "2" as any, "spades" as any), c)).toBe(true);
  });
  it("descending direction requires decreasing value", () => {
    const c = caravan([row("9"), row("7")]);
    expect(c.direction).toBe("desc");
    expect(canPlaceCard(makeCard(1, "5" as any, "clubs" as any), c)).toBe(true);
    expect(canPlaceCard(makeCard(1, "8" as any, "clubs" as any), c)).toBe(false);
  });
});

describe("calculateScore / calculateCaravanRowValue", () => {
  it("sums base values", () => {
    expect(calculateScore(caravan([row("10"), row("6")]))).toBe(16);
  });
  it("ace counts as 1", () => {
    expect(calculateScore(caravan([row("A")]))).toBe(1);
  });
  it("one king doubles the target", () => {
    expect(calculateScore(caravan([row("10", "spades", 1)]))).toBe(20);
    expect(calculateCaravanRowValue(row("10", "spades", 1))).toBe(20);
  });
  it("two kings quadruple the target", () => {
    expect(calculateScore(caravan([row("10", "spades", 2)]))).toBe(40);
  });
  it("ranks number cards A=1, 2-10 at face value", () => {
    expect(calculateScore(caravan([row("A")]))).toBe(1);
    expect(calculateScore(caravan([row("7")]))).toBe(7);
  });
  it("sells at 21 and 26", () => {
    expect(isSellable(caravan([row("10"), row("9"), row("2")]))).toBe(true);
    expect(isSellable(caravan([row("10"), row("9"), row("7")]))).toBe(true);
  });
  it("rejects bids below 21 and above 26", () => {
    expect(isSellable(caravan([row("10"), row("9"), row("A")]))).toBe(false);
    expect(isSellable(caravan([row("10"), row("9"), row("8")]))).toBe(false);
  });
  it("adds number cards plus King value to the bid", () => {
    expect(calculateScore(caravan([row("10"), row("6"), row("10", "spades", 1)]))).toBe(36);
  });
});
describe("reddit gap coverage", () => {
  it("follows the suit or sequence of the last card", () => {
    const c = caravan([row("3"), row("5", "hearts")]);
    expect(canPlaceCard(makeCard(1, "2" as any, "spades" as any), c)).toBe(true);
    expect(canPlaceCard(makeCard(1, "7" as any, "clubs" as any), c)).toBe(true);
    expect(canPlaceCard(makeCard(1, "4" as any, "clubs" as any), c)).toBe(false);
  });
  it("allows gaps in numerical sequence", () => {
    const c = caravan([row("3"), row("5")]);
    expect(canPlaceCard(makeCard(1, "7" as any, "clubs" as any), c)).toBe(true);
    expect(canPlaceCard(makeCard(1, "6" as any, "hearts" as any), c)).toBe(true);
  });
  it("accepts only deuce or ace below a descending 3", () => {
    const c = caravan([row("7"), row("3")]);
    expect(canPlaceCard(makeCard(1, "A" as any, "hearts" as any), c)).toBe(true);
    expect(canPlaceCard(makeCard(1, "2" as any, "clubs" as any), c)).toBe(true);
    expect(canPlaceCard(makeCard(1, "4" as any, "clubs" as any), c)).toBe(false);
  });
});

