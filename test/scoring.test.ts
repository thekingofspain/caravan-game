import { describe, it, expect } from "vitest";
import { makeCard } from "../src/game/cards";
import { pairWinner, gameWinner, allSold } from "../src/game/scoring";
import { Caravan, GameState, PlayerState } from "../src/game/types";

function caravanOf(items: any[], suit: any = "spades"): Caravan {
  const cards = items.map((it) =>
    Array.isArray(it)
      ? { card: makeCard(suit, it[0]), kingCount: it[1], attachments: [] }
      : { card: makeCard(suit, it), kingCount: 0, attachments: [] },
  );
  return { cards, direction: null, suit: items.length ? suit : null };
}
function mkPlayer(caravans: Caravan[]): PlayerState {
  return { deck: [], hand: [], caravans, sales: 0 };
}
function mkGame(p0: Caravan[], p1: Caravan[]): GameState {
  return { players: [mkPlayer(p0), mkPlayer(p1)], current: 0, phase: "play", winner: null, log: [] };
}

describe("pairWinner", () => {
  it("no winner when both out of range (under)", () => {
    expect(pairWinner(mkGame([caravanOf(["10"])], [caravanOf(["9"])]), 0)).toBe(null);
  });
  it("no winner when both out of range (over)", () => {
    expect(pairWinner(mkGame([caravanOf(["10", ["10", 1]])], [caravanOf(["10", ["10", 1]])]), 0)).toBe(null);
  });
  it("higher in-range value wins", () => {
    expect(pairWinner(mkGame([caravanOf([["10", 1], "4"])], [caravanOf(["10", "9"])]), 0)).toBe(0); // 24 vs 19
    expect(pairWinner(mkGame([caravanOf(["10", "9"])], [caravanOf([["10", 1], "4"])]), 0)).toBe(1); // 19 vs 24
  });
  it("tie in range is not resolved", () => {
    expect(pairWinner(mkGame([caravanOf([["10", 1], "4"])], [caravanOf([["10", 1], "4"])]), 0)).toBe(null); // 24 vs 24
  });
  it("both in range picks the higher", () => {
    expect(pairWinner(mkGame([caravanOf([["10", 1], "4"])], [caravanOf(["10", "8", "4"])]), 0)).toBe(0); // 24 vs 22
  });
});

describe("allSold / gameWinner", () => {
  it("allSold false until every pair resolved", () => {
    const g = mkGame(
      [caravanOf([["10", 1], "4"]), caravanOf(["10", "9"]), caravanOf(["10"])],
      [caravanOf(["10", "8", "4"]), caravanOf(["10", "8"]), caravanOf(["9"])],
    );
    expect(allSold(g)).toBe(false);
  });

  it("a player with 2+ sold caravans wins", () => {
    const g = mkGame(
      [
        caravanOf([["10", 1], "4"]),
        caravanOf(["10", "9", "4"]),
        caravanOf(["10", "9", "7"]),
      ],
      [
        caravanOf(["10", "8", "4"]),
        caravanOf(["10", "9", "6"]),
        caravanOf(["10", "9", "2"]),
      ],
    );
    // pair0: 24 vs 22 -> 0 ; pair1: 23 vs 25 -> 1 ; pair2: 26 vs 21 -> 0  => 0 wins 2
    expect(allSold(g)).toBe(true);
    expect(gameWinner(g)).toBe(0);
  });

  it("opponent wins a 1-2 split", () => {
    const g = mkGame(
      [
        caravanOf([["10", 1], "4"]),
        caravanOf(["10", "9", "4"]),
        caravanOf(["10", "8", "4"]),
      ],
      [
        caravanOf(["10", "8", "4"]),
        caravanOf(["10", "9", "6"]),
        caravanOf(["10", "9", "7"]),
      ],
    );
    // pair0: 24 vs 22 ->0 ; pair1: 23 vs 25 ->1 ; pair2: 22 vs 26 ->1  => 1 wins 2
    expect(gameWinner(g)).toBe(1);
  });
});
