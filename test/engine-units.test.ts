import { describe, it, expect } from "vitest";
import { makeCard } from "../src/model/cards";
import { cloneAndApply, appendActionLog, resolveTerminal, applyMove, setupGame, legalMoves } from "../src/model/engine";
import { resetLogIds } from "../src/model/gameLog";
import { Caravan, GameState, PlayerState, Human, Ai, Card } from "../src/model/types";

function caravanEmpty(): Caravan { return { rows: [], direction: null, suit: null }; }
function mkPlayer(caravans: Caravan[], hand: Card[]): PlayerState {
  return { deck: [], hand, caravans: caravans as [Caravan, Caravan, Caravan] } as unknown as PlayerState;
}
function mkGame(p0: PlayerState, p1: PlayerState, current: typeof Human | typeof Ai = Human): GameState {
  return { players: [p0, p1], current, phase: "play", winner: null, log: [], started: false };
}
function openValueSituation() {
  const g = mkGame(mkPlayer([caravanEmpty(), caravanEmpty(), caravanEmpty()], [makeCard(1, "5", "hearts")]), mkPlayer([caravanEmpty(), caravanEmpty(), caravanEmpty()], []), Human);
  return { g };
}

// applyMove pipeline order: cloneAndApply → appendActionLog → resolveTerminal → orchestration.
describe("cloneAndApply", () => {
  it("leaves the original untouched", () => {
    const { g } = openValueSituation();
    const before = JSON.stringify(g);
    cloneAndApply(g, { type: "playValueCard", player: Human, caravan: 0, handIndex: 0 });
    expect(JSON.stringify(g)).toBe(before);
  });
  it("plays the card on the copy", () => {
    const { g } = openValueSituation();
    const { next } = cloneAndApply(g, { type: "playValueCard", player: Human, caravan: 0, handIndex: 0 });
    expect(next.players[Human].caravans[0].rows).toHaveLength(1);
  });
  it("leaves direction null on a single-row caravan", () => {
    const { g } = openValueSituation();
    const { next } = cloneAndApply(g, { type: "playValueCard", player: Human, caravan: 0, handIndex: 0 });
    expect(next.players[Human].caravans[0].rows).toHaveLength(1);
    expect(next.players[Human].caravans[0].direction).toBeNull();
  });
  it("throws when not current player", () => {
    const g = mkGame(mkPlayer([caravanEmpty(), caravanEmpty(), caravanEmpty()], [makeCard(1, "5", "hearts")]), mkPlayer([caravanEmpty(), caravanEmpty(), caravanEmpty()], []), Ai);
    expect(() => cloneAndApply(g, { type: "playValueCard", player: Human, caravan: 0, handIndex: 0 })).toThrow(/not current player/);
  });
  it("throws when game over", () => {
    const g = mkGame(mkPlayer([caravanEmpty(), caravanEmpty(), caravanEmpty()], []), mkPlayer([caravanEmpty(), caravanEmpty(), caravanEmpty()], []), Human);
    g.phase = "over";
    expect(() => cloneAndApply(g, { type: "discardCard", player: Human, handIndex: 0 })).toThrow(/game over/);
  });
});

describe("appendActionLog", () => {
  function loggedSituation() {
    const hand = [makeCard(1, "5", "hearts")];
    const g = mkGame(mkPlayer([caravanEmpty(), caravanEmpty(), caravanEmpty()], hand), mkPlayer([caravanEmpty(), caravanEmpty(), caravanEmpty()], []), Human);
    const { next, jokerDetail } = cloneAndApply(g, { type: "playValueCard", player: Human, caravan: 1, handIndex: 0 });
    const lenBefore = next.log.length;
    appendActionLog(next, { type: "playValueCard", player: Human, caravan: 1, handIndex: 0 }, g, jokerDetail);
    return { next, lenBefore };
  }

  it("adds one log entry", () => {
    const { next, lenBefore } = loggedSituation();
    expect(next.log.length).toBe(lenBefore + 1);
  });
  it("logs a played message", () => {
    expect(loggedSituation().next.log[0].text).toMatch(/played/);
  });
});

describe("resolveTerminal", () => {
  it("flips turn when no winner", () => {
    const c: Caravan = { rows: [[makeCard(1, "5", "hearts")]], direction: null, suit: "hearts" } as unknown as Caravan;
    const g = mkGame(mkPlayer([c, c, c], [makeCard(1, "2", "hearts")]), mkPlayer([c, c, c], [makeCard(1, "2", "hearts")]), Human);
    const before = g.current;
    resolveTerminal(g);
    expect(g.current).toBe(before === Human ? Ai : Human);
  });
  it("declares out-of-moves without throw", () => {
    const c: Caravan = { rows: [[makeCard(1, "5", "hearts")]], direction: null, suit: "hearts" } as unknown as Caravan;
    const g = mkGame(mkPlayer([c, c, c], []), mkPlayer([c, c, c], []), Human);
    expect(() => resolveTerminal(g)).not.toThrow();
  });
});

describe("applyMove orchestration", () => {
  function orchestrationSituation() {
    resetLogIds();
    const g = setupGame({ seed: 1 });
    const moves = legalMoves(g);
    const m = moves[0];
    const viaApply = applyMove(g, m);
    resetLogIds();
    const g2 = setupGame({ seed: 1 });
    const { next, jokerDetail } = cloneAndApply(g2, m);
    appendActionLog(next, m, g2, jokerDetail);
    resolveTerminal(next);
    return { next, viaApply };
  }

  it("matches the combined log", () => {
    const { next, viaApply } = orchestrationSituation();
    expect(next.log.map((l) => l.text)).toEqual(viaApply.log.map((l) => l.text));
  });
  it("matches the combined phase", () => {
    const { next, viaApply } = orchestrationSituation();
    expect(next.phase).toEqual(viaApply.phase);
  });
  it("matches the combined turn", () => {
    const { next, viaApply } = orchestrationSituation();
    expect(next.current).toEqual(viaApply.current);
  });
});
