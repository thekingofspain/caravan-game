import { describe, it, expect } from "vitest";
import {Action, Human, Ai} from "../src/game/types";
import { applyAction, legalActions, setupGame } from "../src/game/engine";
import { chooseAction } from "../src/game/ai";
import { caravanTotal } from "../src/game/rules";

function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "playValueCard" && b.type === "playValueCard")
    return a.player === b.player && a.caravan === b.caravan && a.handIndex === b.handIndex;
  if (a.type === "playFaceCard" && b.type === "playFaceCard")
    return (
      a.player === b.player &&
      a.handIndex === b.handIndex &&
      a.target.player === b.target.player &&
      a.target.caravan === b.target.caravan &&
      a.target.cardIndex === b.target.cardIndex
    );
  if (a.type === "discardCard" && b.type === "discardCard")
    return a.player === b.player && a.handIndex === b.handIndex;
  if (a.type === "dismissCaravan" && b.type === "dismissCaravan") return a.player === b.player && a.caravan === b.caravan;
  return false;
}

describe("AI", () => {
  it("always returns a legal action", () => {
    let s = setupGame({ seed: 3, first: Human });
    for (let i = 0; i < 200 && s.phase === "play"; i++) {
      const a = chooseAction(s, s.current);
      const legal = legalActions(s).some((l) => sameAction(l, a));
      expect(legal).toBe(true);
      s = applyAction(s, a);
    }
  });

  it("plays a caravan into the 21-26 winning range", () => {
    let s = setupGame({ seed: 11, first: Ai });
    for (let i = 0; i < 80 && s.phase === "play"; i++) {
      s = applyAction(s, chooseAction(s, s.current));
      const totals = s.players[Ai].caravans.map((c) => caravanTotal(c));
      if (totals.some((t) => t >= 21 && t <= 26)) break;
    }
    const totals = s.players[Ai].caravans.map((c) => caravanTotal(c));
    expect(totals.some((t) => t >= 21 && t <= 26)).toBe(true);
  });

  it("AI vs AI reaches a legal game-over", () => {
    let s = setupGame({ seed: 1, first: Human });
    let plies = 0;
    const seen = new Set<string>();
    while (s.phase === "play" && plies < 8000) {
      const legal = legalActions(s);
      expect(legal.length).toBeGreaterThan(0);
      const a = chooseAction(s, s.current);
      expect(legal.some((l) => sameAction(l, a))).toBe(true);
      s = applyAction(s, a);
      const key = JSON.stringify(
        s.players.map((p) => [p.hand.map((c) => c.id), p.caravans.map((c: any) => (c.rows ?? c.cards).map((x: any) => Array.isArray(x) ? x[0].id : x.card.id))]),
      );
      if (seen.has(key)) {
        const disband = legal.find((l) => l.type === "dismissCaravan");
        if (disband) s = applyAction(s, disband);
      } else {
        seen.add(key);
      }
      plies++;
    }
    expect(s.phase).toBe("over");
    expect(s.winner === Human || s.winner === Ai).toBe(true);
  });
});
