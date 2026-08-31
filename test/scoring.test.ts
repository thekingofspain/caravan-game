import { describe, it, expect } from "vitest";
import { makeCard } from "../src/model/cards";
import { pairWinner, gameWinner } from "../src/model/scoring";
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

describe("pairWinner", () => {
  it("no winner when both out of range (under)", () => {
    expect(pairWinner(mkGame([caravanOf(["10"])], [caravanOf(["9"])]), 0)).toBe(null);
  });
  it("no winner when both out of range (over)", () => {
    expect(pairWinner(mkGame([caravanOf(["10", ["10", 1]])], [caravanOf(["10", ["10", 1]])]), 0)).toBe(null);
  });
  it("higher in-range value wins", () => {
    expect(pairWinner(mkGame([caravanOf([["10", 1], "4"])], [caravanOf(["10", "9"])]), 0)).toBe(Human);
    expect(pairWinner(mkGame([caravanOf(["10", "9"])], [caravanOf([["10", 1], "4"])]), 0)).toBe(Ai);
  });
  it("tie in range is not resolved", () => {
    expect(pairWinner(mkGame([caravanOf([["10", 1], "4"])], [caravanOf([["10", 1], "4"])]), 0)).toBe(null);
  });
  it("both in range picks the higher", () => {
    expect(pairWinner(mkGame([caravanOf([["10", 1], "4"])], [caravanOf(["10", "8", "4"])]), 0)).toBe(Human);
  });
});

describe("allSold / gameWinner", () => {
  it("not all pairs resolved until every pair has winner", () => {
    const g = mkGame(
      [caravanOf([["10", 1], "4"]), caravanOf(["10", "9"]), caravanOf(["10"])],
      [caravanOf(["10", "8", "4"]), caravanOf(["10", "8"]), caravanOf(["9"])],
    );
    expect([0, 1, 2].every((i) => pairWinner(g, i as 0 | 1 | 2) !== null)).toBe(false);
  });

  it("a player with 2+ sold caravans wins", () => {
    const g = mkGame(
      [caravanOf([["10", 1], "4"]), caravanOf(["10", "9", "4"]), caravanOf(["10", "9", "7"])],
      [caravanOf(["10", "8", "4"]), caravanOf(["10", "9", "6"]), caravanOf(["10", "9", "2"])],
    );
    expect([0, 1, 2].every((i) => pairWinner(g, i as 0 | 1 | 2) !== null)).toBe(true);
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
