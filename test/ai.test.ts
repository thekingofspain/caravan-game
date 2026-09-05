import { describe, it, expect } from "vitest";
import { Move, Human, Ai } from "../src/model/types";
import { applyMove, legalMoves, setupGame } from "../src/model/engine";
import { determineBestMove } from "../src/model/ai";
import { calculateScore } from "../src/model/rules/caravanCardRules";

function sameMove(a: Move, b: Move): boolean {
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
    if (a.type === "disbandCaravan" && b.type === "disbandCaravan")
        return a.player === b.player && a.caravan === b.caravan;
    return false;
}

describe("AI", () => {
    it("always returns a legal action", () => {
        let s = setupGame({ seed: 3, first: Human });
        for (let i = 0; i < 200 && s.phase === "play"; i++) {
            const a = determineBestMove(s, s.current);
            const legal = legalMoves(s).some((l) => sameMove(l, a));
            expect(legal).toBe(true);
            s = applyMove(s, a);
        }
    });

    it("plays a caravan into the 21-26 winning range", () => {
        let s = setupGame({ seed: 11, first: Ai });
        for (let i = 0; i < 80 && s.phase === "play"; i++) {
            s = applyMove(s, determineBestMove(s, s.current));
            const totals = s.players[Ai].caravans.map((c) => calculateScore(c));
            if (totals.some((t) => t >= 21 && t <= 26)) break;
        }
        const totals = s.players[Ai].caravans.map((c) => calculateScore(c));
        expect(totals.some((t) => t >= 21 && t <= 26)).toBe(true);
    });

    it("AI vs AI reaches a legal game-over", () => {
        let s = setupGame({ seed: 1, first: Human });
        let plies = 0;
        const seen = new Set<string>();
        while (s.phase === "play" && plies < 8000) {
            const legal = legalMoves(s);
            expect(legal.length).toBeGreaterThan(0);
            const a = determineBestMove(s, s.current);
            expect(legal.some((l) => sameMove(l, a))).toBe(true);
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
