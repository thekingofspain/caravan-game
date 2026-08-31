import { describe, it, expect, vi } from "vitest";
import { isHumanTurn, handSelectable } from "../src/viewmodel/useGame";
import { setupGame, legalMoves } from "../src/model/engine";
import { Human, Ai } from "../src/model/types";

describe("isHumanTurn", () => {
  it("true when phase play and current Human", () => {
    const s = setupGame({ seed: 1 });
    s.current = Human;
    s.phase = "play";
    expect(isHumanTurn(s)).toBe(true);
  });
  it("false when AI turn or over", () => {
    const s = setupGame({ seed: 1 });
    s.current = Ai;
    expect(isHumanTurn(s)).toBe(false);
    s.phase = "over";
    s.current = Human;
    expect(isHumanTurn(s)).toBe(false);
  });
});

describe("handSelectable", () => {
  it("marks only legal hand indices as selectable", () => {
    const s = setupGame({ seed: 7 });
    const legal = legalMoves(s);
    const selectable = [];
    for (let i = 0; i < s.players[Human].hand.length; i++) {
      if ((handSelectable as (s: unknown, l: unknown, idx: number) => boolean)(s, legal, i)) selectable.push(i);
    }
    expect(selectable.length).toBeGreaterThan(0);
    expect(selectable.length).toBeLessThan(8);
    for (const idx of selectable) {
      expect(legal.some((a) => (a as { handIndex: number }).handIndex === idx)).toBe(true);
    }
  });
  it("empty hand has no selectable", () => {
    const s = setupGame({ seed: 7 });
    s.players[Human].hand = [];
    const legal = legalMoves(s);
    expect(handSelectable(s, legal, 0)).toBe(false);
  });
});

describe("useGame thinking timer (via isHumanTurn gate)", () => {
  it("thinking only when AI turn and not over", async () => {
    vi.useFakeTimers();
    const sHuman = setupGame({ seed: 1 });
    sHuman.current = Human;
    expect(isHumanTurn(sHuman)).toBe(true);
    const sAi = setupGame({ seed: 1 });
    sAi.current = Ai;
    expect(isHumanTurn(sAi)).toBe(false);
    vi.useRealTimers();
  });
});
