import { describe, it, expect } from "vitest";
import { buildDeck } from "../src/model/cards";
import {
    Card,
    isJokerCard,
    JokerType,
    JokerRank,
    SUITED_RANKS,
    Rank,
    Suit,
    SuitedRank,
    SUITS
} from "../src/model/types";

function hasCard(deck: Card[], rank: SuitedRank, suit: Suit): boolean;
function hasCard(deck: Card[], rank: JokerRank, jokerType: JokerType): boolean;
function hasCard(deck: Card[], rank: Rank, x: Suit | JokerType): boolean {
    if (rank === "Joker") return deck.some((c) => isJokerCard(c) && c.jokerType === x);
    return deck.some((c) => !isJokerCard(c) && c.rank === rank && c.suit === x);
}

describe("deck", () => {
    it("has 54 cards", () => {
        expect(buildDeck(1)).toHaveLength(54);
    });
    it("has no duplicate card ids", () => {
        const d = buildDeck(1);
        expect(new Set(d.map((c) => c.id)).size).toBe(d.length);
    });

    it("namespaces card ids by deckId", () => {
        const a = new Set(buildDeck(1).map((c) => c.id));
        expect(buildDeck(2).some((c) => a.has(c.id))).toBe(false);
    });

    it("has both Jokers", () => {
        const d = buildDeck(1);
        expect(hasCard(d, "Joker", "Red")).toBe(true);
        expect(hasCard(d, "Joker", "Black")).toBe(true);
    });
    it("has four complete suits", () => {
        const d = buildDeck(1);
        for (const s of SUITS)
            for (const r of SUITED_RANKS)
                expect(hasCard(d, r, s)).toBe(true);
    });
    it("holds 52 suited cards", () => {
        expect(buildDeck(1).filter((c) => !isJokerCard(c))).toHaveLength(52);
    });
});
