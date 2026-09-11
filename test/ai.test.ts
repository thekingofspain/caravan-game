import { describe, it, expect } from "vitest";
import { Move, Human, Ai } from "../src/model/types";
import { applyMove, legalMoves, setupGame } from "../src/model/engine";
import { determineBestMove } from "../src/model/ai";
import { calculatePoints } from "../src/model/scoring";
import { mulberry32 } from "../src/model/rng";

function sameMove(a: Move, b: Move): boolean {
    if (a.type !== b.type) return false;
    if (a.type === "playValueCard" && b.type === "playValueCard")
        return a.player === b.player && a.lane === b.lane && a.handIndex === b.handIndex;
    if (a.type === "playOperationCard" && b.type === "playOperationCard")
        return (
            a.player === b.player &&
            a.handIndex === b.handIndex &&
            a.target.player === b.target.player &&
            a.target.lane === b.target.lane &&
            a.target.cardIndex === b.target.cardIndex
        );
    if (a.type === "discardCard" && b.type === "discardCard")
        return a.player === b.player && a.handIndex === b.handIndex;
    if (a.type === "disbandCaravan" && b.type === "disbandCaravan")
        return a.player === b.player && a.lane === b.lane;
    return false;
}

describe("AI", () => {
    it("always returns a legal action", () => {
        let s = setupGame({ seed: 3, first: Human });
        const rng = mulberry32(3);
        for (let i = 0; i < 200 && s.phase === "play"; i++) {
            const a = determineBestMove(s, s.current, rng);
            const legal = legalMoves(s).some((l) => sameMove(l, a));
            expect(legal).toBe(true);
            s = applyMove(s, a);
        }
    });

    it("plays a caravan into the 21-26 winning range", () => {
        let s = setupGame({ seed: 11, first: Ai });
        const rng = mulberry32(11);
        for (let i = 0; i < 80 && s.phase === "play"; i++) {
            s = applyMove(s, determineBestMove(s, s.current, rng));
            const pointsList = s.players[Ai].caravans.map((c) => calculatePoints(c));
            if (pointsList.some((t) => t >= 21 && t <= 26)) break;
        }
        const pointsList = s.players[Ai].caravans.map((c) => calculatePoints(c));
        expect(pointsList.some((t) => t >= 21 && t <= 26)).toBe(true);
    });

    it("AI vs AI reaches a legal game-over", () => {
        let s = setupGame({ seed: 1, first: Human });
        const rng = mulberry32(1);
        let plies = 0;
        const seen = new Set<string>();
        while (s.phase === "play" && plies < 8000) {
            const legal = legalMoves(s);
            expect(legal.length).toBeGreaterThan(0);
            const a = determineBestMove(s, s.current, rng);
            s = applyMove(s, a);
            const key = JSON.stringify(
                s.players.map((p) => [
                    p.hand.map((c) => c.id),
                    p.caravans.map((c) => c.rows.map((x) => x[0].id))
                ])
            );
            if (seen.has(key)) {
                const disband = legal.find((l) => l.type === "disbandCaravan");
                if (disband) s = applyMove(s, disband);
            } else {
                seen.add(key);
            }
            plies++;
        }
        expect(s.phase).toBe("over");
        expect(s.winner === Human || s.winner === Ai).toBe(true);
    });
});
