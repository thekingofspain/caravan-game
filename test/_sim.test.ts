import { describe, it, expect } from "vitest";
import { setupGame, applyAction } from "../src/game/engine";
import { chooseAction } from "../src/game/ai";
import {Action, GameState, PlayerId, Human, Ai} from "../src/game/types";

function playOut(seed: number) {
  let s: GameState = setupGame({ first: Human, seed });
  let steps = 0;
  while (s.phase === "play" && steps < 2000) {
    const a: Action = chooseAction(s, s.current as PlayerId);
    s = applyAction(s, a);
    steps++;
  }
  return { winner: s.winner, steps, over: s.phase === "over" };
}

describe("balance sim", () => {
  it("completes 300 AI-vs-AI games, always with a winner", () => {
    let p0 = 0;
    let p1 = 0;
    let unfinished = 0;
    let steps = 0;
    for (let i = 1; i <= 300; i++) {
      const r = playOut(i);
      if (!r.over) unfinished++;
      else if (r.winner === 0) p0++;
      else if (r.winner === 1) p1++;
      steps += r.steps;
    }
    console.log(
      `games=300 p0=${p0} p1=${p1} unfinished=${unfinished} avgSteps=${(steps / 300).toFixed(1)}`,
    );
    expect(unfinished).toBe(0);
  });
});
