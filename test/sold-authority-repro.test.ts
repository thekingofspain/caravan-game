import { describe, expect, it } from "vitest";
import { calcLaneScoreboard } from "../src/model/scoring";
import { Human } from "../src/model/types";
import { Caravan } from "../src/model/types";
import { ValueCard } from "../src/model/types";

function valueCard(id: string, rank: ValueCard["rank"]): ValueCard {
    return { id, rank, suit: "hearts" };
}

function caravanOf(value: ValueCard["rank"]): Caravan {
    return {
        direction: null,
        rows: [
            [valueCard(`${value}-0`, value)],
            [valueCard(`${value}-1`, value)],
            [valueCard(`${value}-2`, value)],
        ],
        suit: null,
    };
}

describe("sold-state authority repro", () => {
    it("leaves tied sellables without a seller", () => {
        expect(calcLaneScoreboard(caravanOf("7"), caravanOf("7")).seller).toBeNull();
    });
    it("awards the higher sellable to the first side", () => {
        expect(calcLaneScoreboard(caravanOf("8"), caravanOf("7")).seller).toBe(Human);
    });
    it("leaves an unsellable pair without a seller", () => {
        expect(calcLaneScoreboard(caravanOf("2"), caravanOf("2")).seller).toBeNull();
    });
    it("shares computed totals with callers", () => {
        expect(calcLaneScoreboard(caravanOf("8"), caravanOf("7")).humanPoints).toBe(24);
    });
});
