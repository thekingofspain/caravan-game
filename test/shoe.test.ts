import { describe, it, expect } from "vitest";
import { makeCard } from "../src/model/cards";
import { setupGame, legalMoves } from "../src/model/engine";
import {
    Card,
    Caravan,
    CaravanRow,
    Direction,
    GameState,
    PlayerId,
    PlayerState,
    Human,
    Ai,
    Suit,
    ValueRank,
    Nullable
} from "../src/model/types";

function caravanOf(ranks: ValueRank[], suit: Suit): Caravan {
    const rows: CaravanRow[] = ranks.map((r) => [makeCard(1, r, suit)]);
    let direction: Nullable<Direction> = null;
    if (rows.length >= 2) {
        const av = rows[0][0].rank === "A" ? 1 : Number(rows[0][0].rank) || 0;
        const bv = rows[1][0].rank === "A" ? 1 : Number(rows[1][0].rank) || 0;
        direction = bv > av ? "asc" : "desc";
    }
    return { rows, direction, suit: ranks.length ? suit : null };
}
const EMPTY: Caravan[] = [caravanOf([], "spades"), caravanOf([], "spades"), caravanOf([], "spades")];
function mkPlayer(caravans: Caravan[], hand: Card[]): PlayerState {
    return { deck: [], hand, discard: null, caravans };
}
function mkGame(p0: PlayerState, p1: PlayerState, current: PlayerId = 0): GameState {
    return { players: [p0, p1], current, phase: "play", winner: null, log: [], started: false };
}
function unfillableShoeSituation(deck: Card[], hand: Card[]) {
    const p0: PlayerState = {
        deck,
        hand,
        discard: null,
        caravans: [caravanOf([], "spades"), caravanOf(["10"], "clubs"), caravanOf(["9"], "hearts")]
    };
    return { s: mkGame(p0, mkPlayer(EMPTY, []), 0) };
}

// Chronological: deal asserts duplicate engine.test.ts "setup" (single-seed smoke vs its
// 200-seed loops) → exhaustion edges cover the must-fill-empty bind in legalMoves.
describe("shoe / setup deal", () => {
    it("deals Human an 8-card hand", () => {
        expect(setupGame({ seed: 7 }).players[Human].hand.length).toBe(8);
    });
    it("leaves Human a 22-card shoe", () => {
        expect(setupGame({ seed: 7 }).players[Human].deck.length).toBe(22);
    });
    it("deals Ai an 8-card hand", () => {
        expect(setupGame({ seed: 7 }).players[Ai].hand.length).toBe(8);
    });
    it("starts with Human to move", () => {
        expect(setupGame({ seed: 7 }).current).toBe(0);
    });
});

describe("shoe exhaustion (unfillable empties)", () => {
    it("offers no moves when empties are unfillable, even with a stocked shoe", () => {
        const { s } = unfillableShoeSituation(
            [makeCard(1, "2", "clubs")],
            [makeCard(1, "K", "clubs"), makeCard(1, "J", "diamonds")]
        );
        expect(legalMoves(s)).toEqual([]);
    });
    it("has no moves when empties are unfillable and the shoe is empty", () => {
        const { s } = unfillableShoeSituation([], [makeCard(1, "K", "clubs")]);
        expect(legalMoves(s)).toEqual([]);
    });
});
