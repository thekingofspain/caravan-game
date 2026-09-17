import { describe, expect, it } from "vitest";
import { calcLaneScoreboard, caravanSeller } from "../src/model/scoring";
import { Ai, Human } from "../src/model/types";
import { Caravan } from "../src/model/types";
import { GameState } from "../src/model/types";
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
            [valueCard(`${value}-2`, value)]
        ],
        suit: null
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

describe("sold-state authority equivalence", () => {
    it("caravanSeller agrees with calcLaneScoreboard on every lane", () => {
        const human = [caravanOf("8"), caravanOf("7"), caravanOf("2")];
        const ai = [caravanOf("7"), caravanOf("7"), caravanOf("2")];
        const game: GameState = {
            players: [
                { shoe: [], hand: [], discard: null, caravans: human },
                { shoe: [], hand: [], discard: null, caravans: ai }
            ],
            current: Human,
            phase: "play",
            winner: null,
            log: []
        };
        const lanes = [0, 1, 2] as const;

        expect(
            lanes.every(
                (lane) =>
                    caravanSeller(game, lane) ===
                    calcLaneScoreboard(
                        game.players[Human].caravans[lane],
                        game.players[Ai].caravans[lane]
                    ).seller
            )
        ).toBe(true);
    });
});
