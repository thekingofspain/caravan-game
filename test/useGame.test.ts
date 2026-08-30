import { describe, it, expect, vi } from "vitest";
import { isHumanTurn, handSelectable } from "../src/state/useGame";
import { setupGame, legalActions } from "../src/game/engine";
import { Human, Ai } from "../src/game/types";

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
    const legal = legalActions(s);
    // At start, only value cards on empty caravans are legal, so some hand indices are selectable, some not (face cards)
    const selectable = [];
    for(let i=0;i<s.players[Human].hand.length;i++){
      if((handSelectable as (s: unknown, l: unknown, idx:number)=>boolean)(s, legal, i)) selectable.push(i);
    }
    expect(selectable.length).toBeGreaterThan(0);
    expect(selectable.length).toBeLessThan(8);
    // Every selectable index must have a legal action with that handIndex
    for(const idx of selectable){
      expect(legal.some(a=> (a as {handIndex:number}).handIndex===idx)).toBe(true);
    }
  });
  it("empty hand has no selectable", () => {
    const s = setupGame({ seed: 7 });
    s.players[Human].hand = [];
    const legal = legalActions(s);
    expect(handSelectable(s, legal, 0)).toBe(false);
  });
});

describe("useGame thinking timer (via isHumanTurn gate)", () => {
  it("thinking only when AI turn and not over", async () => {
    // This test validates the gate logic used by useGame's useEffect
    // We don't need renderHook — just validate the condition that drives thinking
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
