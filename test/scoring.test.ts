import { describe, it, expect } from "vitest";
import { makeCard } from "../src/model/cards";
import { caravanSeller, gameWinner } from "../src/model/scoring";
import { Caravan, GameState, PlayerState, Human, Ai } from "../src/model/types";
import { CaravanRow } from "../src/model/types";

function row(rank: string, suit: string = "spades", kings: number = 0): CaravanRow {
  const base = makeCard(1, rank as any, suit as any);
  const r: CaravanRow = [base];
  for (let i = 0; i < kings; i++) r.push(makeCard(1, "K" as any, "spades" as any));
  return r;
}
function caravanOf(items: any[], suit: any = "spades"): Caravan {
  const rows: CaravanRow[] = items.map((it) =>
    Array.isArray(it) ? row(it[0], suit, it[1]) : row(it, suit, 0)
  );
  return { rows, direction: null, suit: items.length ? (suit as any) : null };
}
function mkPlayer(caravans: Caravan[]): PlayerState {
  return { deck: [], hand: [], caravans };
}
function mkGame(p0: Caravan[], p1: Caravan[]): GameState {
  return { players: [mkPlayer(p0), mkPlayer(p1)], current: Human, phase: "play", winner: null, log: [], started: false };
}

describe("caravanSeller", () => {
  it("no winner when both out of range (under)", () => {
    expect(caravanSeller(mkGame([caravanOf(["10"])], [caravanOf(["9"])]), 0)).toBe(null);
  });
  it("no winner when both out of range (over)", () => {
    expect(caravanSeller(mkGame([caravanOf(["10", ["10", 1]])], [caravanOf(["10", ["10", 1]])]), 0)).toBe(null);
  });
  it("higher in-range value wins", () => {
    expect(caravanSeller(mkGame([caravanOf([["10", 1], "4"])], [caravanOf(["10", "9"])]), 0)).toBe(Human);
    expect(caravanSeller(mkGame([caravanOf(["10", "9"])], [caravanOf([["10", 1], "4"])]), 0)).toBe(Ai);
  });
  it("tie in range is not resolved", () => {
    expect(caravanSeller(mkGame([caravanOf([["10", 1], "4"])], [caravanOf([["10", 1], "4"])]), 0)).toBe(null);
  });
  it("both in range picks the higher", () => {
    expect(caravanSeller(mkGame([caravanOf([["10", 1], "4"])], [caravanOf(["10", "8", "4"])]), 0)).toBe(Human);
  });
});

describe("allSold / gameWinner", () => {
  it("not all pairs resolved until every pair has winner", () => {
    const g = mkGame(
      [caravanOf([["10", 1], "4"]), caravanOf(["10", "9"]), caravanOf(["10"])],
      [caravanOf(["10", "8", "4"]), caravanOf(["10", "8"]), caravanOf(["9"])],
    );
    expect([0, 1, 2].every((i) => caravanSeller(g, i as 0 | 1 | 2) !== null)).toBe(false);
  });

  it("a player with 2+ sold caravans wins", () => {
    const g = mkGame(
      [caravanOf([["10", 1], "4"]), caravanOf(["10", "9", "4"]), caravanOf(["10", "9", "7"])],
      [caravanOf(["10", "8", "4"]), caravanOf(["10", "9", "6"]), caravanOf(["10", "9", "2"])],
    );
    expect([0, 1, 2].every((i) => caravanSeller(g, i as 0 | 1 | 2) !== null)).toBe(true);
    expect(gameWinner(g)).toBe(Human);
  });

  it("opponent wins a 1-2 split", () => {
    const g = mkGame(
      [caravanOf([["10", 1], "4"]), caravanOf(["10", "9", "4"]), caravanOf(["10", "8", "4"])],
      [caravanOf(["10", "8", "4"]), caravanOf(["10", "9", "6"]), caravanOf(["10", "9", "7"])],
    );
    expect(gameWinner(g)).toBe(Ai);
  });
});

describe("reddit atomic coverage", () => {
  it("pairs each caravan against the same-index opponent", () => {
    const g = mkGame(
      [caravanOf([["10", 1], "4"]), caravanOf(["10"]), caravanOf(["10"])],
      [caravanOf(["10", "9"]), caravanOf([["10", 1], "4"]), caravanOf(["9"])]
    );
    expect(caravanSeller(g, 0)).toBe(Human);
    expect(caravanSeller(g, 1)).toBe(Ai);
  });
  it("wins with two higher-bid caravans", () => {
    const g = mkGame(
      [caravanOf(["10", "9", "2"]), caravanOf([["10", 1], "4", "2"]), caravanOf(["10"])],
      [caravanOf(["9"]), caravanOf(["9"]), caravanOf(["10", "9", "2"])]
    );
    expect(gameWinner(g)).toBe(Human);
  });
});

describe("reddit gap coverage", () => {
  it("wins by disbanding the tied track", () => {
    const tied = mkGame(
      [caravanOf([["10", 1], "4"]), caravanOf(["10", "9", "3"]), caravanOf(["10", "9", "5"])],
      [caravanOf(["10", "9"]), caravanOf(["10", "9", "A"]), caravanOf(["10", "9", "5"])]
    );
    expect(gameWinner(tied)).toBe(null);
    const freed = mkGame(
      [caravanOf([["10", 1], "4"]), caravanOf(["10", "9", "3"]), caravanOf([])],
      [caravanOf(["10", "9"]), caravanOf(["10", "9", "A"]), caravanOf(["10", "9", "5"])]
    );
    expect(gameWinner(freed)).toBe(Human);
  });
});
