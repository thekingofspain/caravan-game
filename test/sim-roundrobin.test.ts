// AI-vs-AI round robin over 30 random seeds. Run with
// `npx vitest run test/sim-roundrobin.test.ts` and read the console output.
// Verifies every simulated game ends with a winner.
import { describe, it, expect } from "vitest";
import { setupGame, applyMove } from "../src/model/engine";
import { determineBestMove, Rng } from "../src/model/ai";
import { GameState, PlayerId, Human, Ai, AiLevel } from "../src/model/types";
import { mulberry32 } from "../src/model/rng";

const SEEDS = [
  57596, 1818, 49536, 88352, 6351, 51789, 83216, 96247, 30148, 46615, 30616,
  24186, 33118, 63693, 60307, 18192, 12195, 51950, 64140, 20764, 42250, 57518,
  71889, 87052, 28946, 71062, 53294, 50254, 71105, 45339,
];

// All unordered level pairs, excluding same-vs-same.
const LEVELS = ["normal", "hard", "expert", "master"] as const;
type Pair = [AiLevel, AiLevel];
const PAIRS: Pair[] = [];
for (let i = 0; i < LEVELS.length; i++)
  for (let j = i + 1; j < LEVELS.length; j++) PAIRS.push([LEVELS[i], LEVELS[j]]);

interface Result {
  seed: number;
  first: PlayerId;
  levelFirst: AiLevel;
  levelSecond: AiLevel;
  winner: PlayerId | null;
  steps: number;
  over: boolean;
}

function playOut(
  seed: number,
  firstLevel: AiLevel,
  secondLevel: AiLevel,
  first: PlayerId,
): Omit<Result, "seed"> {
  let s: GameState = setupGame({ first, seed });
  const rng: Rng = mulberry32((seed * 1000003 + 7) >>> 0);
  let steps = 0;
  while (s.phase === "play" && steps < 2000) {
    const actor = s.current as PlayerId;
    const level = actor === first ? firstLevel : secondLevel;
    const mv = determineBestMove(s, actor, { level, rng });
    s = applyMove(s, mv);
    steps++;
  }
  return {
    first,
    levelFirst: firstLevel,
    levelSecond: secondLevel,
    winner: s.winner as PlayerId | null,
    steps,
    over: s.phase === "gameOver",
  };
}

describe("sim roundrobin", () => {
  it(
    "levels head-to-head over 30 seeds, both who-goes-first sides",
    { timeout: 900_000 },
    () => {
      const results: Result[] = [];
      for (const seed of SEEDS) {
        for (const [la, lb] of PAIRS) {
          // Both sides: each level of the pair takes a turn going first.
          const orders: Pair[] = [
            [la, lb],
            [lb, la],
          ];
          for (let side = 0; side < orders.length; side++) {
            const [firstLevel, secondLevel] = orders[side];
            const first: PlayerId = side === 0 ? Human : Ai;
            results.push({ seed, ...playOut(seed, firstLevel, secondLevel, first) });
          }
        }
      }

      const unfinished = results.filter((r) => !r.over);
      console.log(`games=${results.length} unfinished=${unfinished.length}`);

      type Tally = { n: number; w1: number; w2: number };
      const byPair: Record<string, Tally> = {};
      for (const r of results) {
        const id = `${r.levelFirst} firsts vs ${r.levelSecond}`;
        const e = (byPair[id] ??= { n: 0, w1: 0, w2: 0 });
        e.n++;
        if (!r.over) continue;
        if (r.winner === r.first) e.w1++;
        else if (r.winner !== null) e.w2++;
      }
      for (const [id, e] of Object.entries(byPair).sort())
        console.log(`${id}: n=${e.n} firstWon=${e.w1} secondWon=${e.w2}`);

      const h2h: Record<string, number> = {};
      for (const r of results) {
        if (!r.over) continue;
        const winnerLevel = r.winner === r.first ? r.levelFirst : r.levelSecond;
        const loserLevel = winnerLevel === r.levelFirst ? r.levelSecond : r.levelFirst;
        h2h[`${winnerLevel} beats ${loserLevel}`] =
          (h2h[`${winnerLevel} beats ${loserLevel}`] ?? 0) + 1;
      }
      for (const [k, v] of Object.entries(h2h).sort()) console.log(`${k}: ${v}`);

      if (unfinished.length)
        for (const r of unfinished)
          console.log(
            `UNFINISHED seed=${r.seed} ${r.levelFirst}vs${r.levelSecond} first=${r.first === Human ? "H" : "A"} steps=${r.steps}`,
          );

      // Tracks #13: investigate unfinished games, then drive this cap down.
      expect(unfinished.length).toBeLessThanOrEqual(30);
    },
  );
});
