import { describe, it, expect } from "vitest";
import { makeCard } from "../src/model/cards";
import {
    setupGame,
    applyMove,
    legalMoves,
    resolveTerminal,
    forfeitNoMoves
} from "../src/model/engine";
import { canPlaceCard } from "../src/model/rules/caravanCardRules";
import { calculatePoints } from "../src/model/scoring";
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
    isValueCard,
    Suit,
    ValueCard,
    ValueRank,
    OperationCard,
    Nullable
} from "../src/model/types";
import { getDisplayedState, getTransitionInfo } from "../src/viewmodel/transition";

function rowOf(head: ValueCard, ...attachments: OperationCard[]): CaravanRow {
    return [head, ...attachments];
}
function caravanOf(ranks: ValueRank[], suit: Suit): Caravan {
    const rows: CaravanRow[] = ranks.map((r) => rowOf(makeCard(1, r, suit)));
    let direction: Nullable<Direction> = null;
    if (rows.length >= 2) {
        const av = rows[0][0].rank === "A" ? 1 : Number(rows[0][0].rank) || 0;
        const bv = rows[1][0].rank === "A" ? 1 : Number(rows[1][0].rank) || 0;
        direction = bv > av ? "asc" : "desc";
    }
    return { rows, direction, suit: ranks.length ? suit : null };
}
const EMPTY: Caravan[] = [
    caravanOf([], "spades"),
    caravanOf([], "spades"),
    caravanOf([], "spades")
];
function mkPlayer(caravans: Caravan[], hand: Card[]): PlayerState {
    return { shoe: [], hand, discard: null, caravans };
}
function mkGame(p0: PlayerState, p1: PlayerState, current: PlayerId = 0): GameState {
    return { players: [p0, p1], current, phase: "play", winner: null, log: [] };
}

// Game-chronological order: 1. setup deal → 2. opening must-start → 3. operation-card
// operations (Move type order: J/Q/K/Joker) → 4. disbandCaravan → 5. terminal guards.
// Value-placement legality/scoring live in rules.test.ts; settlement in scoring.test.ts.
describe("setup", () => {
    it("has exactly two players", () => {
        for (let seed = 1; seed <= 20; seed++) {
            const s = setupGame({ seed });
            expect(s.players).toHaveLength(2);
        }
    });
    it("deals 8-card opening hands", () => {
        for (let seed = 1; seed <= 200; seed++) {
            const s = setupGame({ seed });

            for (const p of s.players) {
                expect(p.hand.length).toBe(8);
            }
        }
    });
    it("leaves 22 cards in each shoe after the deal", () => {
        for (let seed = 1; seed <= 200; seed++) {
            const s = setupGame({ seed });

            for (const p of s.players) {
                expect(p.shoe.length).toBe(22);
            }
        }
    });
    it("reshuffles opening hands below three value cards", () => {
        for (let seed = 1; seed <= 200; seed++) {
            const s = setupGame({ seed });

            for (const p of s.players) {
                expect(p.hand.filter((c) => isValueCard(c)).length).toBeGreaterThanOrEqual(3);
            }
        }
    });
});

describe("initial round (must-start constraint)", () => {
    it("offers opening moves", () => {
        const s = setupGame({ seed: 7 });
        expect(legalMoves(s).length).toBeGreaterThan(0);
    });
    it("plays only value cards while caravans are empty", () => {
        const s = setupGame({ seed: 7 });
        for (const a of legalMoves(s)) {
            expect(a.type).toBe("playValueCard");
        }
    });
    it("targets only empty caravans while caravans are empty", () => {
        const s = setupGame({ seed: 7 });
        for (const a of legalMoves(s)) {
            if (a.type === "playValueCard")
                expect(s.players[a.player].caravans[a.lane].rows.length).toBe(0);
        }
    });
    it("disallows discard while a caravan is empty", () => {
        const s = setupGame({ seed: 7 });
        const discards = legalMoves(s).filter((a) => a.type === "discardCard");
        expect(discards.length).toBe(0);
    });
    it("does not restrict moves for a started caravan emptied mid-game", () => {
        const emptied: Caravan = { rows: [], direction: null, suit: null, started: true };
        const p0 = mkPlayer(
            [emptied, caravanOf(["10"], "clubs"), caravanOf(["9"], "hearts")],
            [makeCard(1, "5", "spades"), makeCard(1, "J", "diamonds")]
        );
        const s = mkGame(p0, mkPlayer(EMPTY, []), 0);
        const moves = legalMoves(s);
        expect(moves.some((m) => m.type === "discardCard")).toBe(true);
        expect(moves.some((m) => m.type === "disbandCaravan")).toBe(true);
        expect(moves.some((m) => m.type === "playValueCard" && m.lane !== 0)).toBe(true);
    });

    it("throws when discarding while a value card could fill an empty", () => {
        const p0: PlayerState = {
            shoe: [],
            hand: [makeCard(1, "5", "hearts")],
            discard: null,
            caravans: [
                caravanOf([], "spades"),
                caravanOf(["10"], "clubs"),
                caravanOf(["9"], "hearts")
            ]
        };
        const s = mkGame(p0, mkPlayer(EMPTY, []), 0);
        expect(() => applyMove(s, { type: "discardCard", player: 0, handIndex: 0 })).toThrow(
            /must fill empty/
        );
    });
    it("starts a caravan when a value card is played", () => {
        const s = setupGame({ seed: 7 });
        const act = legalMoves(s)[0];
        if (act.type !== "playValueCard") throw new Error("expected value open");
        const next = applyMove(s, act);
        expect(next.players[Human].caravans[act.lane].rows.length).toBe(1);
    });
    it("starts the caravan in the played card's suit", () => {
        const s = setupGame({ seed: 7 });
        const act = legalMoves(s)[0];
        if (act.type !== "playValueCard") throw new Error("expected value open");
        const card = s.players[Human].hand[act.handIndex];
        const next = applyMove(s, act);
        expect(next.players[Human].caravans[act.lane].suit).toBe(card.suit);
    });
    it("leaves direction unset on a single-row caravan", () => {
        const s = setupGame({ seed: 7 });
        const act = legalMoves(s)[0];
        if (act.type !== "playValueCard") throw new Error("expected value open");
        const car = applyMove(s, act).players[Human].caravans[act.lane];
        expect(car.rows.length).toBe(1);
        expect(car.direction).toBeNull();
    });
    it("passes the turn after a value card is played", () => {
        const s = setupGame({ seed: 7 });
        const act = legalMoves(s)[0];
        if (act.type !== "playValueCard") throw new Error("expected value open");
        const next = applyMove(s, act);
        expect(next.current).toBe(1);
    });
});

describe("operation cards", () => {
    describe("jacks", () => {
        it("Jack removes the targeted card immediately on the player's own move", () => {
            const p0 = mkPlayer(EMPTY, [makeCard(1, "J", "spades"), makeCard(1, "3", "hearts")]);
            const p1 = mkPlayer(
                [caravanOf([], "spades"), caravanOf([], "spades"), caravanOf(["10"], "spades")],
                []
            );
            const s = mkGame(p0, p1);
            const next = applyMove(s, {
                type: "playOperationCard",
                player: 0,
                target: { player: 1, lane: 2, cardIndex: 0 },
                handIndex: 0
            });
            expect(next.players[Ai].caravans[2].rows.length).toBe(0);
        });

        it("passes the turn after a Jack", () => {
            const p0 = mkPlayer(EMPTY, [makeCard(1, "J", "spades"), makeCard(1, "3", "hearts")]);
            const p1 = mkPlayer(
                [caravanOf([], "spades"), caravanOf([], "spades"), caravanOf(["10"], "spades")],
                [makeCard(2, "4", "diamonds")]
            );
            const s = mkGame(p0, p1);
            const next = applyMove(s, {
                type: "playOperationCard",
                player: 0,
                target: { player: 1, lane: 2, cardIndex: 0 },
                handIndex: 0
            });
            expect(next.current).toBe(1);
        });

        function oppJackSituation() {
            const p0 = mkPlayer(
                [caravanOf([], "spades"), caravanOf([], "spades"), caravanOf(["10"], "spades")],
                [makeCard(1, "3", "hearts")]
            );
            const p1 = mkPlayer(EMPTY, [makeCard(1, "J", "spades")]);
            const s = mkGame(p0, p1, 1);
            const move = {
                type: "playOperationCard",
                player: 1,
                target: { player: 0, lane: 2, cardIndex: 0 },
                handIndex: 0
            } as const;
            const next = applyMove(s, move);
            const info = getTransitionInfo(s, move, next);
            return { next, info };
        }

        it("commits an opponent jack immediately", () => {
            expect(oppJackSituation().next.players[Human].caravans[2].rows.length).toBe(0);
        });
        it("flags an opponent jack for confirmation", () => {
            expect(oppJackSituation().info.pendingAck).not.toBeNull();
        });
        it("names Human as the confirmer of an opponent jack", () => {
            expect(oppJackSituation().info.pendingAck?.confirmer).toBe(Human);
        });
        it("points at the jacked card", () => {
            expect(oppJackSituation().info.pendingAck?.removed).toEqual([
                { player: 0, lane: 2, cardIndex: 0 }
            ]);
        });
        it("shows the Jack as the played card", () => {
            expect(oppJackSituation().info.pendingAck?.played?.card.rank).toBe("J");
        });
    });

    describe("joker acknowledgement", () => {
        function jokerAckSituation(host: { player: PlayerId; lane: 0 | 1 | 2; cardIndex: number }) {
            const p0 = mkPlayer(
                [
                    caravanOf(["5"], "hearts"),
                    caravanOf(["5"], "diamonds"),
                    caravanOf(["9"], "clubs")
                ],
                [makeCard(1, "3", "hearts")]
            );
            const p1 = mkPlayer(
                [caravanOf(["5"], "spades"), caravanOf([], "spades"), caravanOf([], "spades")],
                [makeCard(1, "Joker", "Red")]
            );
            const s = mkGame(p0, p1, 1);
            const move = {
                type: "playOperationCard",
                player: 1,
                target: { ...host },
                handIndex: 0
            } as const;
            const next = applyMove(s, move);
            return { s, next, move, info: getTransitionInfo(s, move, next) };
        }

        it("names Human as the confirmer of an opponent-hosted Joker", () => {
            expect(
                jokerAckSituation({ player: 0, lane: 0, cardIndex: 0 }).info.pendingAck?.confirmer
            ).toBe(Human);
        });
        it("lists Joker removals across both players' lanes", () => {
            expect(
                jokerAckSituation({ player: 0, lane: 0, cardIndex: 0 }).info.pendingAck?.removed
            ).toEqual([
                { player: 0, lane: 1, cardIndex: 0 },
                { player: 1, lane: 0, cardIndex: 0 }
            ]);
        });
        it("shows the Joker as the played card", () => {
            expect(
                jokerAckSituation({ player: 0, lane: 0, cardIndex: 0 }).info.pendingAck?.played
                    ?.card.rank
            ).toBe("Joker");
        });
        it("records the Joker host as the played target", () => {
            expect(
                jokerAckSituation({ player: 0, lane: 0, cardIndex: 0 }).info.pendingAck?.played?.at
            ).toEqual({
                player: 0,
                lane: 0,
                cardIndex: 0
            });
        });
        it("names Human as the confirmer of an own-caravan Joker", () => {
            expect(
                jokerAckSituation({ player: 1, lane: 0, cardIndex: 0 }).info.pendingAck?.confirmer
            ).toBe(Human);
        });
        it("lists the opponent rows cleared by an own-caravan Joker", () => {
            expect(
                jokerAckSituation({ player: 1, lane: 0, cardIndex: 0 }).info.pendingAck?.removed
            ).toEqual([
                { player: 0, lane: 0, cardIndex: 0 },
                { player: 0, lane: 1, cardIndex: 0 }
            ]);
        });
        it("needs no ack when the Joker matches nothing", () => {
            const p0 = mkPlayer(
                [
                    caravanOf(["9"], "hearts"),
                    caravanOf(["8"], "diamonds"),
                    caravanOf(["7"], "clubs")
                ],
                []
            );
            const p1 = mkPlayer(
                [caravanOf(["5"], "spades"), caravanOf([], "spades"), caravanOf([], "spades")],
                [makeCard(1, "Joker", "Red")]
            );
            const s = mkGame(p0, p1, 1);
            const move = {
                type: "playOperationCard",
                player: 1,
                target: { player: 1, lane: 0, cardIndex: 0 },
                handIndex: 0
            } as const;
            const next = applyMove(s, move);
            expect(getTransitionInfo(s, move, next).pendingAck).toBeNull();
        });
    });

    describe("displayed state during ack", () => {
        function jackSituation() {
            const p0 = mkPlayer(
                [caravanOf([], "spades"), caravanOf([], "spades"), caravanOf(["10"], "spades")],
                [makeCard(1, "3", "hearts")]
            );
            const p1 = mkPlayer(EMPTY, [makeCard(1, "J", "spades")]);
            const s = mkGame(p0, p1, 1);
            const move = {
                type: "playOperationCard",
                player: 1,
                target: { player: 0, lane: 2, cardIndex: 0 },
                handIndex: 0
            } as const;
            const next = applyMove(s, move);
            const info = getTransitionInfo(s, move, next);
            return { s, next, info };
        }

        it("keeps the removed row on the pre-removal board", () => {
            const { s, next, info } = jackSituation();
            expect(getDisplayedState(s, next, info).players[Human].caravans[2].rows.length).toBe(1);
        });
        it("re-attaches the Jack onto the kept row", () => {
            const { s, next, info } = jackSituation();
            expect(
                getDisplayedState(s, next, info).players[Human].caravans[2].rows[0]?.[1]?.rank
            ).toBe("J");
        });
        it("shows the row gone on the committed board", () => {
            expect(jackSituation().next.players[Human].caravans[2].rows.length).toBe(0);
        });
        it("returns current when there is no transition", () => {
            const { s, next } = jackSituation();
            expect(getDisplayedState(s, next, null)).toBe(next);
        });
        it("returns current when there is no previous board", () => {
            const { next, info } = jackSituation();
            expect(getDisplayedState(null, next, info)).toBe(next);
        });
    });

    describe("queens", () => {
        function queenReverseSituation() {
            const p0 = mkPlayer(EMPTY, [makeCard(1, "Q", "hearts")]);
            const p1 = mkPlayer(
                [caravanOf([], "spades"), caravanOf([], "spades"), caravanOf(["3", "7"], "spades")],
                []
            );
            const s = mkGame(p0, p1);
            const next = applyMove(s, {
                type: "playOperationCard",
                player: 0,
                target: { player: 1, lane: 2, cardIndex: 1 },
                handIndex: 0
            });
            return { car: next.players[Ai].caravans[2] };
        }

        it("Queen reverses the direction", () => {
            expect(queenReverseSituation().car.direction).toBe("desc");
        });
        it("Queen changes the suit", () => {
            expect(queenReverseSituation().car.suit).toBe("hearts");
        });
        it("Queen attaches to the row", () => {
            expect(queenReverseSituation().car.rows[1].length).toBe(2);
        });
        it("Queen must target the last row", () => {
            const p0 = mkPlayer(EMPTY, [makeCard(1, "Q", "hearts")]);
            const p1 = mkPlayer(
                [caravanOf([], "spades"), caravanOf([], "spades"), caravanOf(["3", "7"], "spades")],
                []
            );
            const s = mkGame(p0, p1);
            expect(() =>
                applyMove(s, {
                    type: "playOperationCard",
                    player: 0,
                    target: { player: 1, lane: 2, cardIndex: 0 },
                    handIndex: 0
                })
            ).toThrow(/last row/);
        });
        it("offers no operation move to a non-last row", () => {
            const p0 = mkPlayer(EMPTY, [makeCard(1, "Q", "hearts")]);
            const p1 = mkPlayer(
                [caravanOf([], "spades"), caravanOf([], "spades"), caravanOf(["3", "7"], "spades")],
                []
            );
            const s = mkGame(p0, p1);
            expect(
                legalMoves(s).filter(
                    (m) => m.type === "playOperationCard" && m.target.cardIndex === 0
                ).length
            ).toBe(0);
        });

        function queenFallbackSituation() {
            const queenRow: CaravanRow = [makeCard(1, "9", "spades"), makeCard(1, "Q", "hearts")];
            const target: Caravan = {
                rows: [[makeCard(1, "3", "spades")], queenRow, [makeCard(1, "4", "clubs")]],
                direction: "asc",
                suit: "clubs"
            };
            const p0 = mkPlayer(EMPTY, [makeCard(1, "J", "clubs")]);
            const p1 = mkPlayer([target, caravanOf([], "spades"), caravanOf([], "spades")], []);
            const s = mkGame(p0, p1);
            const next = applyMove(s, {
                type: "playOperationCard",
                player: 0,
                target: { player: 1, lane: 0, cardIndex: 2 },
                handIndex: 0
            });
            return { car: next.players[Ai].caravans[0] };
        }

        it("removal drops the targeted row", () => {
            expect(queenFallbackSituation().car.rows.length).toBe(2);
        });
        it("removal keeps the remaining row intact", () => {
            expect(queenFallbackSituation().car.rows[1].length).toBe(2);
        });
        it("removal leaves the Queen attached", () => {
            expect(queenFallbackSituation().car.rows[1][1].rank).toBe("Q");
        });
        it("removal keeps the ascending direction", () => {
            expect(queenFallbackSituation().car.direction).toBe("asc");
        });
        it("removal falls back to the attached queen suit", () => {
            expect(queenFallbackSituation().car.suit).toBe("hearts");
        });
    });

    describe("kings", () => {
        it("King doubles the targeted row value", () => {
            const p0 = mkPlayer(EMPTY, [makeCard(1, "K", "spades")]);
            const p1 = mkPlayer(
                [caravanOf([], "spades"), caravanOf([], "spades"), caravanOf(["10"], "spades")],
                []
            );
            const s = mkGame(p0, p1);
            const next = applyMove(s, {
                type: "playOperationCard",
                player: 0,
                target: { player: 1, lane: 2, cardIndex: 0 },
                handIndex: 0
            });
            expect(calculatePoints(next.players[Ai].caravans[2])).toBe(20);
        });
    });

    describe("jokers", () => {
        it("Joker on value spares its host while wiping the same rank", () => {
            const joker = makeCard(1, "Joker", "Red");
            const p0 = mkPlayer(EMPTY, [joker]);
            const p1 = mkPlayer(
                [
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "hearts"),
                    caravanOf(["5"], "hearts")
                ],
                []
            );
            const s = mkGame(p0, p1);
            // Joker on 10 of spades removes all other 10s; the host row is spared.
            const next = applyMove(s, {
                type: "playOperationCard",
                player: 0,
                target: { player: 1, lane: 0, cardIndex: 0 },
                handIndex: 0
            });
            expect(next.players[Ai].caravans[0].rows.length).toBe(1);
            expect(next.players[Ai].caravans[1].rows.length).toBe(0);
            expect(next.players[Ai].caravans[2].rows.length).toBe(1);
        });
    });

    describe("operation-card limits", () => {
        function maxedRowSituation() {
            const row: CaravanRow = [
                makeCard(1, "10", "spades"),
                makeCard(1, "K", "spades"),
                makeCard(1, "K", "hearts"),
                makeCard(1, "Q", "diamonds")
            ];
            const car: Caravan = { rows: [row], direction: null, suit: "spades" };
            const p0 = mkPlayer(EMPTY, [makeCard(1, "K", "clubs")]);
            const p1 = mkPlayer([car, caravanOf([], "spades"), caravanOf([], "spades")], []);
            return { s: mkGame(p0, p1, 0) };
        }

        it("offers no operation move to a maxed row", () => {
            const { s } = maxedRowSituation();
            expect(legalMoves(s).filter((m) => m.type === "playOperationCard").length).toBe(0);
        });
        it("refuses a fourth operation card on a maxed row", () => {
            const { s } = maxedRowSituation();
            expect(() =>
                applyMove(s, {
                    type: "playOperationCard",
                    player: 0,
                    target: { player: 1, lane: 0, cardIndex: 0 },
                    handIndex: 0
                })
            ).toThrow(/three operation cards/);
        });
    });
});

describe("disbandCaravan", () => {
    it("disbands a caravan", () => {
        const p0 = mkPlayer(
            [caravanOf(["10"], "spades"), caravanOf(["10"], "spades"), caravanOf(["10"], "spades")],
            []
        );
        const p1 = mkPlayer(EMPTY, []);
        const s = mkGame(p0, p1, 0);
        const next = applyMove(s, { type: "disbandCaravan", player: 0, lane: 1 });
        expect(next.players[0].caravans[1].rows.length).toBe(0);
    });
    it("cannot disband while any empty", () => {
        const s = mkGame(mkPlayer(EMPTY, []), mkPlayer(EMPTY, []), 0);
        expect(() => applyMove(s, { type: "disbandCaravan", player: 0, lane: 0 })).toThrow();
    });
    it("cannot disband a filled caravan while others are empty", () => {
        const p0 = mkPlayer(
            [caravanOf(["10"], "spades"), caravanOf([], "spades"), caravanOf([], "spades")],
            []
        );
        const s = mkGame(p0, mkPlayer(EMPTY, []), 0);
        expect(() => applyMove(s, { type: "disbandCaravan", player: 0, lane: 0 })).toThrow();
    });
    it("disbands a started caravan that was emptied", () => {
        const emptied: Caravan = { rows: [], direction: null, suit: null, started: true };
        const p0 = mkPlayer([caravanOf(["10"], "spades"), emptied, caravanOf(["9"], "spades")], []);
        const s = mkGame(p0, mkPlayer(EMPTY, []), 0);
        const next = applyMove(s, { type: "disbandCaravan", player: 0, lane: 0 });
        expect(next.players[0].caravans[0].rows.length).toBe(0);
    });
    it("keeps the started marker after disbanding an emptied caravan", () => {
        const emptied: Caravan = { rows: [], direction: null, suit: null, started: true };
        const p0 = mkPlayer([caravanOf(["10"], "spades"), emptied, caravanOf(["9"], "spades")], []);
        const s = mkGame(p0, mkPlayer(EMPTY, []), 0);
        const next = applyMove(s, { type: "disbandCaravan", player: 0, lane: 0 });
        expect(next.players[0].caravans[0].started).toBe(true);
    });
});

describe("illegal actions throw", () => {
    it("not current player", () => {
        const s = setupGame({ seed: 1 });
        s.current = Human;
        expect(() => applyMove(s, { type: "discardCard", player: Ai, handIndex: 0 })).toThrow();
    });
    it("game over blocks moves", () => {
        const s = setupGame({ seed: 1 });
        s.phase = "gameOver";
        expect(() => applyMove(s, legalMoves(setupGame({ seed: 1 }))[0])).toThrow();
    });
    it("is pure (does not mutate input state)", () => {
        const s = setupGame({ seed: 7 });
        const before = JSON.stringify(s);
        applyMove(s, legalMoves(s)[0]);
        expect(JSON.stringify(s)).toBe(before);
    });
});

describe("reddit atomic coverage", () => {
    it("deals two decks, one per player", () => {
        const s = setupGame({ seed: 7 });
        for (const c of [...s.players[Human].hand, ...s.players[Human].shoe])
            expect(c.id.startsWith("D1-")).toBe(true);
        for (const c of [...s.players[Ai].hand, ...s.players[Ai].shoe])
            expect(c.id.startsWith("D2-")).toBe(true);
    });
    it("alternates turns after each move", () => {
        const p0: PlayerState = {
            shoe: [makeCard(1, "2", "clubs")],
            hand: [makeCard(1, "5", "hearts")],
            discard: null,
            caravans: [
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades")
            ]
        };
        const next = applyMove(mkGame(p0, mkPlayer(EMPTY, [makeCard(2, "4", "diamonds")]), 0), {
            type: "playValueCard",
            player: 0,
            lane: 0,
            handIndex: 0
        });
        expect(next.current).toBe(1);
    });
    it("refills the hand after a value play", () => {
        const p0: PlayerState = {
            shoe: [makeCard(1, "2", "clubs")],
            hand: [makeCard(1, "5", "hearts")],
            discard: null,
            caravans: [
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades")
            ]
        };
        const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
            type: "playValueCard",
            player: 0,
            lane: 0,
            handIndex: 0
        });
        expect(next.players[Human].hand.length).toBe(1);
        expect(next.players[Human].shoe.length).toBe(0);
        expect(next.players[Human].hand[0].rank).toBe("2");
    });
    it("refills the hand after a discard", () => {
        const p0: PlayerState = {
            shoe: [makeCard(1, "4", "diamonds")],
            hand: [makeCard(1, "K", "clubs")],
            discard: null,
            caravans: [
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades")
            ]
        };
        const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
            type: "discardCard",
            player: 0,
            handIndex: 0
        });
        expect(next.players[Human].hand.length).toBe(1);
        expect(next.players[Human].shoe.length).toBe(0);
        expect(next.players[Human].hand[0].rank).toBe("4");
    });
    it("plays value cards only in your own caravans", () => {
        const own: Caravan[] = [
            caravanOf(["5", "3"], "spades"),
            caravanOf(["5", "3"], "spades"),
            caravanOf(["5", "3"], "spades")
        ];
        const opp: Caravan[] = [
            caravanOf(["9", "7"], "clubs"),
            caravanOf(["10"], "clubs"),
            caravanOf(["10"], "clubs")
        ];
        const s = mkGame(mkPlayer(own, [makeCard(1, "4", "clubs")]), mkPlayer(opp, []), 0);
        expect(legalMoves(s).filter((m) => m.type === "playValueCard").length).toBe(0);
        expect(legalMoves(s).length).toBeGreaterThan(0);
    });
    it("plays operation cards on both your and opponent caravans", () => {
        const full: Caravan[] = [
            caravanOf(["10"], "spades"),
            caravanOf(["10"], "spades"),
            caravanOf(["10"], "spades")
        ];
        const s = mkGame(mkPlayer(full, [makeCard(1, "J", "spades")]), mkPlayer(full, []), 0);
        const targets = legalMoves(s).filter((m) => m.type === "playOperationCard");
        expect(targets.some((m) => m.type === "playOperationCard" && m.target.player === 0)).toBe(
            true
        );
        expect(targets.some((m) => m.type === "playOperationCard" && m.target.player === 1)).toBe(
            true
        );
    });
    it("operation cards ignore suit and direction", () => {
        const p0 = mkPlayer(
            [
                caravanOf(["3", "5"], "spades"),
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades")
            ],
            [makeCard(1, "K", "spades"), makeCard(1, "4", "clubs")]
        );
        const s = mkGame(p0, mkPlayer(EMPTY, []), 0);
        expect(legalMoves(s).filter((m) => m.type === "playValueCard" && m.lane === 0).length).toBe(
            0
        );
        expect(
            legalMoves(s).filter((m) => m.type === "playOperationCard" && m.target.lane === 0)
                .length
        ).toBeGreaterThan(0);
    });
    it("removes the jacked row and its attached operation cards", () => {
        const loaded: Caravan = {
            rows: [[makeCard(1, "10", "spades"), makeCard(1, "K", "spades")]],
            direction: null,
            suit: "spades"
        };
        const p0 = mkPlayer(
            [caravanOf(["10"], "spades"), caravanOf(["10"], "spades"), loaded],
            [makeCard(1, "J", "spades")]
        );
        const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        expect(next.players[Human].caravans[2].rows.length).toBe(0);
    });
    it("reverses again on a second Queen", () => {
        const p0: PlayerState = {
            shoe: [makeCard(1, "9", "diamonds")],
            // 5♥ keeps Human out of the opening bind (no discards until
            // every caravan is initialized): without it s1a would end the
            // game with Human to move and no legal moves.
            hand: [
                makeCard(1, "Q", "hearts"),
                makeCard(1, "Q", "clubs"),
                makeCard(1, "5", "hearts")
            ],
            discard: null,
            caravans: EMPTY
        };
        const p1: PlayerState = {
            shoe: [makeCard(2, "5", "diamonds")],
            hand: [makeCard(2, "2", "clubs"), makeCard(2, "4", "diamonds")],
            discard: null,
            caravans: [
                caravanOf([], "spades"),
                caravanOf([], "spades"),
                caravanOf(["3", "7"], "spades")
            ]
        };
        const s1 = applyMove(mkGame(p0, p1, 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 1, lane: 2, cardIndex: 1 },
            handIndex: 0
        });
        expect(s1.players[Ai].caravans[2].direction).toBe("desc");
        const s1a = applyMove(s1, { type: "playValueCard", player: 1, lane: 0, handIndex: 0 });
        const s2 = applyMove(s1a, {
            type: "playOperationCard",
            player: 0,
            target: { player: 1, lane: 2, cardIndex: 1 },
            handIndex: 0
        });
        expect(s2.players[Ai].caravans[2].direction).toBe("asc");
        expect(s2.players[Ai].caravans[2].suit).toBe("clubs");
    });
    it("removes same-suit rows on Joker-on-Ace", () => {
        const p0 = mkPlayer(
            [caravanOf(["10"], "spades"), caravanOf(["5"], "hearts"), caravanOf(["A"], "spades")],
            [makeCard(1, "Joker", "Red")]
        );
        const p1 = mkPlayer(
            [caravanOf(["7"], "spades"), caravanOf(["9"], "diamonds"), caravanOf(["2"], "clubs")],
            []
        );
        const next = applyMove(mkGame(p0, p1, 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        expect(next.players[Human].caravans[0].rows.length).toBe(0);
        expect(next.players[Ai].caravans[0].rows.length).toBe(0);
        expect(next.players[Human].caravans[1].rows.length).toBe(1);
        expect(next.players[Ai].caravans[1].rows.length).toBe(1);
    });
    it("removes printed-suit rows despite attached Queens", () => {
        const queenRow: Caravan = {
            rows: [[makeCard(1, "5", "spades"), makeCard(1, "Q", "hearts")]],
            direction: null,
            suit: "hearts"
        };
        const p0 = mkPlayer(
            [queenRow, caravanOf(["7"], "hearts"), caravanOf(["A"], "spades")],
            [makeCard(1, "Joker", "Red")]
        );
        const p1 = mkPlayer(
            [caravanOf(["9"], "spades"), caravanOf(["2"], "clubs"), caravanOf(["3"], "diamonds")],
            []
        );
        const next = applyMove(mkGame(p0, p1, 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        expect(next.players[Human].caravans[0].rows.length).toBe(0);
        expect(next.players[Ai].caravans[0].rows.length).toBe(0);
        expect(next.players[Human].caravans[1].rows.length).toBe(1);
    });
    it("removes same-rank rows on Joker-on-value", () => {
        const p0 = mkPlayer(
            [caravanOf(["10"], "hearts"), caravanOf(["5"], "hearts"), caravanOf(["10"], "spades")],
            [makeCard(1, "Joker", "Red")]
        );
        const p1 = mkPlayer(
            [
                caravanOf(["9"], "diamonds"),
                caravanOf(["10"], "diamonds"),
                caravanOf(["2"], "clubs")
            ],
            []
        );
        const next = applyMove(mkGame(p0, p1, 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        expect(next.players[Human].caravans[0].rows.length).toBe(0);
        expect(next.players[Ai].caravans[1].rows.length).toBe(0);
        expect(next.players[Human].caravans[1].rows.length).toBe(1);
        expect(next.players[Ai].caravans[0].rows.length).toBe(1);
    });
    it("keeps full effect on loaded rows", () => {
        const loaded: Caravan = {
            rows: [[makeCard(1, "10", "spades"), makeCard(1, "Q", "hearts")]],
            direction: null,
            suit: "hearts"
        };
        const p0 = mkPlayer(
            [caravanOf(["10"], "spades"), caravanOf(["10"], "spades"), loaded],
            [makeCard(1, "K", "spades")]
        );
        const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        expect(next.players[Human].caravans[2].rows[0].length).toBe(3);
        expect(calculatePoints(next.players[Human].caravans[2])).toBe(20);
    });
    it("disbands a maxed row", () => {
        const maxed: Caravan = {
            rows: [
                [
                    makeCard(1, "10", "spades"),
                    makeCard(1, "K", "spades"),
                    makeCard(1, "K", "hearts"),
                    makeCard(1, "Q", "diamonds")
                ]
            ],
            direction: null,
            suit: "spades"
        };
        const p0 = mkPlayer([caravanOf(["10"], "spades"), caravanOf(["9"], "spades"), maxed], []);
        const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
            type: "disbandCaravan",
            player: 0,
            lane: 2
        });
        expect(next.players[Human].caravans[2].rows.length).toBe(0);
    });
    it("refuses a Jack on a maxed row", () => {
        const maxed: Caravan = {
            rows: [
                [
                    makeCard(1, "10", "spades"),
                    makeCard(1, "K", "spades"),
                    makeCard(1, "K", "hearts"),
                    makeCard(1, "Q", "diamonds")
                ]
            ],
            direction: null,
            suit: "spades"
        };
        const p0 = mkPlayer(
            [caravanOf(["10"], "spades"), caravanOf(["10"], "spades"), maxed],
            [makeCard(1, "J", "spades")]
        );
        expect(() =>
            applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
                type: "playOperationCard",
                player: 0,
                target: { player: 0, lane: 2, cardIndex: 0 },
                handIndex: 0
            })
        ).toThrow(/three operation cards/);
    });
    it("keeps direction on identical heads after removal", () => {
        const car: Caravan = {
            rows: [
                [makeCard(1, "6", "spades")],
                [makeCard(1, "7", "hearts")],
                [makeCard(1, "6", "clubs")]
            ],
            direction: "desc",
            suit: "clubs"
        };
        const p0 = mkPlayer(
            [caravanOf(["10"], "spades"), caravanOf(["10"], "spades"), car],
            [makeCard(1, "J", "spades")]
        );
        const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 1 },
            handIndex: 0
        });
        expect(next.players[Human].caravans[2].rows.length).toBe(2);
        expect(next.players[Human].caravans[2].direction).toBe("desc");
    });
    it("recomputes direction after removal otherwise", () => {
        const car: Caravan = {
            rows: [
                [makeCard(1, "2", "hearts")],
                [makeCard(1, "6", "hearts")],
                [makeCard(1, "4", "hearts")]
            ],
            direction: "desc",
            suit: "hearts"
        };
        const p0 = mkPlayer(
            [caravanOf(["10"], "spades"), caravanOf(["10"], "spades"), car],
            [makeCard(1, "J", "spades")]
        );
        const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 1 },
            handIndex: 0
        });
        expect(next.players[Human].caravans[2].rows.length).toBe(2);
        expect(next.players[Human].caravans[2].direction).toBe("asc");
    });
    describe("reddit gap coverage", () => {
        it("adds onto a sold caravan and updates the bid", () => {
            const p0 = mkPlayer(
                [
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades"),
                    caravanOf(["10", "9", "2"], "spades")
                ],
                [makeCard(1, "5", "spades")]
            );
            const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
                type: "playValueCard",
                player: 0,
                lane: 2,
                handIndex: 0
            });
            expect(next.players[Human].caravans[2].rows.length).toBe(4);
            expect(calculatePoints(next.players[Human].caravans[2])).toBe(26);
        });
        it("sets direction and suit on the second card", () => {
            const p0 = mkPlayer(
                [
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades")
                ],
                [makeCard(1, "5", "hearts")]
            );
            const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
                type: "playValueCard",
                player: 0,
                lane: 2,
                handIndex: 0
            });
            expect(next.players[Human].caravans[2].direction).toBe("desc");
            expect(next.players[Human].caravans[2].suit).toBe("hearts");
        });
        it("establishes a new direction and suit on a suit-break", () => {
            const p0 = mkPlayer(
                [
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades"),
                    caravanOf(["3", "5"], "spades")
                ],
                [makeCard(1, "2", "spades")]
            );
            const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
                type: "playValueCard",
                player: 0,
                lane: 2,
                handIndex: 0
            });
            expect(next.players[Human].caravans[2].direction).toBe("desc");
            expect(next.players[Human].caravans[2].suit).toBe("spades");
        });
        it("flips desc to asc on a suit-break", () => {
            const p0 = mkPlayer(
                [
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades"),
                    caravanOf(["9", "7"], "spades")
                ],
                [makeCard(1, "8", "spades")]
            );
            const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
                type: "playValueCard",
                player: 0,
                lane: 2,
                handIndex: 0
            });
            expect(next.players[Human].caravans[2].direction).toBe("asc");
        });
        it("throws on equal rank in the engine", () => {
            const p0 = mkPlayer(
                [
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades"),
                    caravanOf(["5"], "spades")
                ],
                [makeCard(1, "5", "hearts")]
            );
            expect(() =>
                applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
                    type: "playValueCard",
                    player: 0,
                    lane: 2,
                    handIndex: 0
                })
            ).toThrow(/cannot place/);
        });
        it("attaches a face onto the row", () => {
            const p0 = mkPlayer(
                [
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades")
                ],
                [makeCard(1, "K", "spades")]
            );
            const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
                type: "playOperationCard",
                player: 0,
                target: { player: 0, lane: 2, cardIndex: 0 },
                handIndex: 0
            });
            expect(next.players[Human].caravans[2].rows.length).toBe(1);
            expect(next.players[Human].caravans[2].rows[0].length).toBe(2);
        });
        it("opens a new row per value card", () => {
            const p0 = mkPlayer(
                [
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades")
                ],
                [makeCard(1, "5", "hearts")]
            );
            const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
                type: "playValueCard",
                player: 0,
                lane: 2,
                handIndex: 0
            });
            expect(next.players[Human].caravans[2].rows.length).toBe(2);
        });
        it("removes a maxed-row card with a Joker elsewhere", () => {
            const maxed: Caravan = {
                rows: [
                    [
                        makeCard(1, "10", "spades"),
                        makeCard(1, "K", "spades"),
                        makeCard(1, "K", "hearts"),
                        makeCard(1, "Q", "diamonds")
                    ]
                ],
                direction: null,
                suit: "spades"
            };
            const p0 = mkPlayer(
                [caravanOf(["10"], "hearts"), caravanOf(["10"], "spades"), maxed],
                [makeCard(1, "Joker", "Red")]
            );
            const p1 = mkPlayer(
                [
                    caravanOf(["9"], "diamonds"),
                    caravanOf(["2"], "clubs"),
                    caravanOf(["3"], "diamonds")
                ],
                []
            );
            const next = applyMove(mkGame(p0, p1, 0), {
                type: "playOperationCard",
                player: 0,
                target: { player: 0, lane: 0, cardIndex: 0 },
                handIndex: 0
            });
            expect(next.players[Human].caravans[2].rows.length).toBe(0);
        });
    });
});

describe("reddit red coverage", () => {
    it("does not redraw during the opening round", () => {
        const s = setupGame({ seed: 7 });
        const act = legalMoves(s).find((m) => m.type === "playValueCard");
        if (act === undefined) throw new Error("expected opening value move");
        const next = applyMove(s, act);
        expect(next.players[Human].hand.length).toBe(7);
    });
    it("continues with five cards after the opening round", () => {
        let s = setupGame({ seed: 7 });
        for (let i = 0; i < 6; i++) {
            const act = legalMoves(s).find((m) => m.type === "playValueCard");
            if (act === undefined) throw new Error("expected opening value move");
            s = applyMove(s, act);
        }
        expect(s.players[Human].hand.length).toBe(5);
        expect(s.players[Ai].hand.length).toBe(5);
    });
    it("completes the opening in three turns with one card per caravan", () => {
        let s = setupGame({ seed: 7 });
        for (let i = 0; i < 6; i++) {
            const act = legalMoves(s).find((m) => m.type === "playValueCard");
            if (act === undefined) throw new Error("expected opening value move");
            s = applyMove(s, act);
        }
        expect(s.players[Human].caravans.every((c) => c.rows.length === 1)).toBe(true);
        expect(s.players[Ai].caravans.every((c) => c.rows.length === 1)).toBe(true);
    });
    it("disbanded cards vanish with the caravan (no discard pile)", () => {
        const target = makeCard(1, "10", "spades");
        const loaded: Caravan = { rows: [[target]], direction: null, suit: "spades" };
        const p0 = mkPlayer([caravanOf(["10"], "spades"), caravanOf(["9"], "spades"), loaded], []);
        const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
            type: "disbandCaravan",
            player: 0,
            lane: 2
        });
        expect(next.players[Human].caravans[2].rows).toHaveLength(0);
        expect(next.players[Human].discard).toBeNull();
    });
    it("affects only cards played before the Joker", () => {
        const p0 = mkPlayer(
            [caravanOf(["10"], "spades"), caravanOf(["9"], "hearts"), caravanOf(["A"], "spades")],
            [makeCard(1, "Joker", "Red"), makeCard(1, "5", "spades")]
        );
        const p1: PlayerState = {
            shoe: [makeCard(2, "8", "clubs")],
            hand: [makeCard(2, "K", "clubs"), makeCard(2, "Q", "hearts")],
            discard: null,
            caravans: [
                { ...caravanOf(["10"], "spades"), started: true },
                { ...caravanOf(["10"], "spades"), started: true },
                { ...caravanOf(["10"], "spades"), started: true }
            ]
        };
        const s1 = applyMove(mkGame(p0, p1, 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        const s1a = applyMove(s1, { type: "discardCard", player: 1, handIndex: 0 });
        const s2 = applyMove(s1a, { type: "playValueCard", player: 0, lane: 0, handIndex: 0 });
        expect(s2.players[Human].caravans[0].rows.length).toBe(1);
    });
    it("spares the Jokered card", () => {
        const p0 = mkPlayer(
            [caravanOf(["10"], "spades"), caravanOf(["5"], "hearts"), caravanOf(["A"], "spades")],
            [makeCard(1, "Joker", "Red")]
        );
        const p1 = mkPlayer(
            [caravanOf(["7"], "spades"), caravanOf(["9"], "diamonds"), caravanOf(["2"], "clubs")],
            []
        );
        const next = applyMove(mkGame(p0, p1, 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        expect(next.players[Human].caravans[2].rows.length).toBe(1);
    });
    it("Joker-removed cards vanish (no discard pile)", () => {
        const target = makeCard(1, "10", "spades");
        const p0 = mkPlayer(
            [
                { rows: [[target]], direction: null, suit: "spades" },
                caravanOf(["5"], "hearts"),
                caravanOf(["A"], "spades")
            ],
            [makeCard(1, "Joker", "Red")]
        );
        const p1 = mkPlayer(
            [caravanOf(["7"], "spades"), caravanOf(["9"], "diamonds"), caravanOf(["2"], "clubs")],
            []
        );
        const next = applyMove(mkGame(p0, p1, 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        expect(next.players[Human].caravans[0].rows.length).toBe(0);
        expect(next.players[Human].discard).toBeNull();
    });
    it("leaves empty caravans unfilled while playing elsewhere", () => {
        const emptied: Caravan = { rows: [], direction: null, suit: null, started: true };
        const p0: PlayerState = {
            shoe: [makeCard(1, "2", "clubs")],
            hand: [makeCard(1, "K", "spades")],
            discard: null,
            caravans: [caravanOf(["10"], "spades"), emptied, emptied]
        };
        const s = mkGame(p0, mkPlayer(EMPTY, []), 0);
        expect(legalMoves(s).filter((m) => m.type === "playOperationCard").length).toBeGreaterThan(
            0
        );
    });
    it("removed cards leave the face-up discard untouched", () => {
        const removed = makeCard(1, "10", "spades");
        const loaded: Caravan = {
            rows: [[removed]],
            direction: null,
            suit: "spades"
        };
        const p0: PlayerState = {
            shoe: [],
            hand: [makeCard(1, "K", "clubs"), makeCard(1, "J", "spades")],
            discard: null,
            caravans: [caravanOf(["10"], "hearts"), caravanOf(["9"], "hearts"), loaded]
        };
        const p1: PlayerState = {
            shoe: [makeCard(2, "3", "diamonds")],
            hand: [makeCard(2, "2", "clubs")],
            discard: null,
            caravans: EMPTY
        };
        const s1 = applyMove(mkGame(p0, p1, 0), {
            type: "discardCard",
            player: 0,
            handIndex: 0
        });
        expect(s1.players[Human].discard?.rank).toBe("K");
        const s2 = applyMove(
            { ...s1, current: 0 },
            {
                type: "playOperationCard",
                player: 0,
                target: { player: 0, lane: 2, cardIndex: 0 },
                handIndex: 0
            }
        );
        expect(s2.players[Human].caravans[2].rows).toHaveLength(0);
        expect(s2.players[Human].discard?.rank).toBe("K");
    });
    it("keeps discard-pile cards unrecoverable", () => {
        const p0: PlayerState = {
            shoe: [makeCard(1, "A", "hearts")],
            hand: [makeCard(1, "K", "clubs")],
            discard: null,
            caravans: [
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades")
            ]
        };
        const next = applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
            type: "discardCard",
            player: 0,
            handIndex: 0
        });
        const ids = [...next.players[Human].hand, ...next.players[Human].shoe].map((c) => c.id);
        expect(ids.some((id) => id.endsWith("KC"))).toBe(false);
    });
    it("declares the opponent winner when cards run out", () => {
        const full: Caravan[] = [
            caravanOf(["10"], "spades"),
            caravanOf(["9"], "spades"),
            caravanOf(["8"], "spades")
        ];
        const s: GameState = {
            players: [
                { shoe: [], hand: [], discard: null, caravans: full },
                {
                    shoe: [],
                    hand: [],
                    discard: null,
                    caravans: [
                        caravanOf(["10"], "spades"),
                        caravanOf(["9"], "spades"),
                        caravanOf(["8"], "spades")
                    ]
                }
            ],
            current: 0,
            phase: "play",
            winner: null,
            log: []
        };
        resolveTerminal(s);
        expect(s.winner).toBe(Ai);
    });
    it("reverses the caravan's numerical direction", () => {
        const p0 = mkPlayer(EMPTY, [makeCard(1, "Q", "hearts")]);
        const p1 = mkPlayer(
            [caravanOf([], "spades"), caravanOf([], "spades"), caravanOf(["3", "7"], "spades")],
            []
        );
        const next = applyMove(mkGame(p0, p1, 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 1, lane: 2, cardIndex: 1 },
            handIndex: 0
        });
        expect(next.players[Ai].caravans[2].direction).toBe("desc");
    });
    it("changes the caravan suit to the Queen's suit", () => {
        const p0 = mkPlayer(EMPTY, [makeCard(1, "Q", "hearts")]);
        const p1 = mkPlayer(
            [caravanOf([], "spades"), caravanOf([], "spades"), caravanOf(["3", "7"], "spades")],
            []
        );
        const next = applyMove(mkGame(p0, p1, 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 1, lane: 2, cardIndex: 1 },
            handIndex: 0
        });
        expect(next.players[Ai].caravans[2].suit).toBe("hearts");
    });
    it("forbids discarding during the opening round", () => {
        const s = setupGame({ seed: 7 });
        expect(legalMoves(s).filter((m) => m.type === "discardCard").length).toBe(0);
    });
    it("never plays a value card on the same value", () => {
        const p0 = mkPlayer(
            [caravanOf(["10"], "spades"), caravanOf(["10"], "spades"), caravanOf(["10"], "spades")],
            [makeCard(1, "10", "hearts")]
        );
        expect(() =>
            applyMove(mkGame(p0, mkPlayer(EMPTY, []), 0), {
                type: "playValueCard",
                player: 0,
                lane: 2,
                handIndex: 0
            })
        ).toThrow(/cannot place/);
    });
    it("allows at most three operation cards on one value card", () => {
        const p0: PlayerState = {
            shoe: [makeCard(1, "9", "diamonds")],
            hand: [
                makeCard(1, "K", "spades"),
                makeCard(1, "K", "hearts"),
                makeCard(1, "Q", "diamonds")
            ],
            discard: null,
            caravans: [
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades")
            ]
        };
        const p1: PlayerState = {
            shoe: [makeCard(2, "8", "clubs")],
            hand: [makeCard(2, "2", "clubs"), makeCard(2, "4", "diamonds")],
            discard: null,
            caravans: [
                caravanOf(["10"], "hearts"),
                caravanOf(["10"], "hearts"),
                caravanOf(["10"], "hearts")
            ]
        };
        const s1 = applyMove(mkGame(p0, p1, 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        const s1a = applyMove(s1, { type: "discardCard", player: 1, handIndex: 0 });
        const s2 = applyMove(s1a, {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        const s2a = applyMove(s2, { type: "discardCard", player: 1, handIndex: 0 });
        const s3 = applyMove(s2a, {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        expect(s3.players[Human].caravans[2].rows[0].length).toBe(4);
    });
    it("doubles twice for a double King on play", () => {
        const p0: PlayerState = {
            shoe: [],
            hand: [makeCard(1, "K", "spades"), makeCard(1, "K", "hearts")],
            discard: null,
            caravans: [
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades"),
                caravanOf(["10"], "spades")
            ]
        };
        const p1: PlayerState = {
            shoe: [makeCard(2, "5", "diamonds")],
            hand: [makeCard(2, "2", "clubs")],
            discard: null,
            caravans: [
                caravanOf(["10"], "hearts"),
                caravanOf(["10"], "hearts"),
                caravanOf(["10"], "hearts")
            ]
        };
        const s1 = applyMove(mkGame(p0, p1, 0), {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        expect(calculatePoints(s1.players[Human].caravans[2])).toBe(20);
        const s1a = applyMove(s1, { type: "playValueCard", player: 1, lane: 0, handIndex: 0 });
        const s2 = applyMove(s1a, {
            type: "playOperationCard",
            player: 0,
            target: { player: 0, lane: 2, cardIndex: 0 },
            handIndex: 0
        });
        expect(calculatePoints(s2.players[Human].caravans[2])).toBe(40);
    });
});

describe("opening determinism", () => {
    function handsOf(seed: number) {
        const s = setupGame({ seed });
        return [s.players[Human].hand, s.players[Ai].hand];
    }
    it("deals the same Human hand for the same seed", () => {
        expect(handsOf(42)[0]).toEqual(handsOf(42)[0]);
    });
    it("deals the same Ai hand for the same seed", () => {
        expect(handsOf(42)[1]).toEqual(handsOf(42)[1]);
    });
    it("deals the same Human shoe for the same seed", () => {
        expect(setupGame({ seed: 42 }).players[Human].shoe).toEqual(
            setupGame({ seed: 42 }).players[Human].shoe
        );
    });
});

describe("canPlaceCard queen-suit override", () => {
    function queenImposed(): Caravan {
        return {
            rows: [rowOf(makeCard(1, "2", "clubs")), rowOf(makeCard(1, "5", "clubs"))],
            direction: "asc",
            suit: "diamonds"
        };
    }
    it("allows a direction break that matches the Queen-imposed suit", () => {
        expect(canPlaceCard(makeCard(1, "3", "diamonds"), queenImposed())).toBe(true);
    });
    it("rejects a direction break matching neither the head suit nor the imposed suit", () => {
        expect(canPlaceCard(makeCard(1, "3", "spades"), queenImposed())).toBe(false);
    });
});

describe("joker ace-suit vs rank clearing (state after applyMove)", () => {
    function jokerNext(hostHead: ValueCard, p0lanes: Caravan[], p1extra: Caravan[]): GameState {
        const p0 = mkPlayer(p0lanes, [makeCard(1, "3", "hearts"), makeCard(1, "4", "diamonds")]);
        const host: Caravan = { rows: [rowOf(hostHead)], direction: null, suit: hostHead.suit };
        const p1 = mkPlayer([host, ...p1extra] as Caravan[], [
            makeCard(1, "Joker", "Red"),
            makeCard(2, "6", "clubs")
        ]);
        return applyMove(mkGame(p0, p1, 1), {
            type: "playOperationCard",
            player: 1,
            target: { player: 1, lane: 0, cardIndex: 0 },
            handIndex: 0
        });
    }
    it("clears same-suit rows on an Ace host", () => {
        const next = jokerNext(
            makeCard(1, "A", "hearts"),
            [caravanOf(["5"], "hearts"), caravanOf(["5"], "diamonds"), caravanOf(["9"], "clubs")],
            [caravanOf(["7"], "hearts"), caravanOf([], "spades")]
        );
        expect(next.players[Human].caravans[0].rows.length).toBe(0);
    });
    it("keeps a different-suit row on an Ace host", () => {
        const next = jokerNext(
            makeCard(1, "A", "hearts"),
            [caravanOf(["5"], "hearts"), caravanOf(["5"], "diamonds"), caravanOf(["9"], "clubs")],
            [caravanOf(["7"], "hearts"), caravanOf([], "spades")]
        );
        expect(next.players[Human].caravans[1].rows.length).toBe(1);
    });
    it("clears a same-suit row on the Joker owner's other lane for an Ace host", () => {
        const next = jokerNext(
            makeCard(1, "A", "hearts"),
            [caravanOf(["5"], "hearts"), caravanOf(["5"], "diamonds"), caravanOf(["9"], "clubs")],
            [caravanOf(["7"], "hearts"), caravanOf([], "spades")]
        );
        expect(next.players[Ai].caravans[1].rows.length).toBe(0);
    });
    it("attaches the Joker to an Ace host row", () => {
        const next = jokerNext(
            makeCard(1, "A", "hearts"),
            [caravanOf(["5"], "hearts"), caravanOf(["5"], "diamonds"), caravanOf(["9"], "clubs")],
            [caravanOf(["7"], "hearts"), caravanOf([], "spades")]
        );
        expect(next.players[Ai].caravans[0].rows[0][1]?.rank).toBe("Joker");
    });
    it("clears same-rank rows on a non-Ace host", () => {
        const next = jokerNext(
            makeCard(1, "5", "hearts"),
            [caravanOf(["5"], "diamonds"), caravanOf(["6"], "hearts"), caravanOf(["9"], "clubs")],
            [caravanOf([], "spades"), caravanOf([], "spades")]
        );
        expect(next.players[Human].caravans[0].rows.length).toBe(0);
    });
    it("keeps a same-suit different-rank row on a non-Ace host", () => {
        const next = jokerNext(
            makeCard(1, "5", "hearts"),
            [caravanOf(["5"], "diamonds"), caravanOf(["6"], "hearts"), caravanOf(["9"], "clubs")],
            [caravanOf([], "spades"), caravanOf([], "spades")]
        );
        expect(next.players[Human].caravans[1].rows.length).toBe(1);
    });
    it("attaches the Joker to a non-Ace host row", () => {
        const next = jokerNext(
            makeCard(1, "5", "hearts"),
            [caravanOf(["5"], "diamonds"), caravanOf(["6"], "hearts"), caravanOf(["9"], "clubs")],
            [caravanOf([], "spades"), caravanOf([], "spades")]
        );
        expect(next.players[Ai].caravans[0].rows[0][1]?.rank).toBe("Joker");
    });
    it("clears nothing when the Joker matches no row", () => {
        const next = jokerNext(
            makeCard(1, "5", "spades"),
            [caravanOf(["9"], "hearts"), caravanOf(["8"], "diamonds"), caravanOf(["7"], "clubs")],
            [caravanOf([], "spades"), caravanOf([], "spades")]
        );
        expect(next.players[Human].caravans[0].rows.length).toBe(1);
    });
    it("keeps every other row when the Joker matches nothing", () => {
        const next = jokerNext(
            makeCard(1, "5", "spades"),
            [caravanOf(["9"], "hearts"), caravanOf(["8"], "diamonds"), caravanOf(["7"], "clubs")],
            [caravanOf([], "spades"), caravanOf([], "spades")]
        );
        expect(next.players[Human].caravans[2].rows.length).toBe(1);
    });
    it("still attaches the Joker when it matches nothing", () => {
        const next = jokerNext(
            makeCard(1, "5", "spades"),
            [caravanOf(["9"], "hearts"), caravanOf(["8"], "diamonds"), caravanOf(["7"], "clubs")],
            [caravanOf([], "spades"), caravanOf([], "spades")]
        );
        expect(next.players[Ai].caravans[0].rows[0][1]?.rank).toBe("Joker");
    });
});

describe("terminal exhaustion guards", () => {
    it("ends the game when a hand runs empty with no winner", () => {
        const s = mkGame(
            mkPlayer(
                [
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades")
                ],
                []
            ),
            mkPlayer(
                [
                    caravanOf(["10"], "hearts"),
                    caravanOf(["10"], "hearts"),
                    caravanOf(["10"], "hearts")
                ],
                [makeCard(2, "2", "clubs")]
            ),
            0
        );
        resolveTerminal(s);
        expect(s.phase).toBe("gameOver");
    });
    it("names the opponent as winner when a hand runs empty", () => {
        const s = mkGame(
            mkPlayer(
                [
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades")
                ],
                []
            ),
            mkPlayer(
                [
                    caravanOf(["10"], "hearts"),
                    caravanOf(["10"], "hearts"),
                    caravanOf(["10"], "hearts")
                ],
                [makeCard(2, "2", "clubs")]
            ),
            0
        );
        resolveTerminal(s);
        expect(s.winner).toBe(Ai);
    });
    it("throws from forfeitNoMoves while legal moves remain", () => {
        const s = mkGame(
            mkPlayer(
                [
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades"),
                    caravanOf(["10"], "spades")
                ],
                [makeCard(1, "5", "hearts")]
            ),
            mkPlayer(EMPTY, []),
            0
        );
        expect(() => forfeitNoMoves(s)).toThrow();
    });
    it("ends the game when forfeiting with no moves", () => {
        const p0: PlayerState = {
            shoe: [],
            hand: [makeCard(1, "K", "clubs")],
            discard: null,
            caravans: [
                caravanOf([], "spades"),
                caravanOf(["10"], "clubs"),
                caravanOf(["9"], "hearts")
            ]
        };
        expect(forfeitNoMoves(mkGame(p0, mkPlayer(EMPTY, []), 0)).phase).toBe("gameOver");
    });
    it("names the opponent as winner when forfeiting with no moves", () => {
        const p0: PlayerState = {
            shoe: [],
            hand: [makeCard(1, "K", "clubs")],
            discard: null,
            caravans: [
                caravanOf([], "spades"),
                caravanOf(["10"], "clubs"),
                caravanOf(["9"], "hearts")
            ]
        };
        expect(forfeitNoMoves(mkGame(p0, mkPlayer(EMPTY, []), 0)).winner).toBe(Ai);
    });
});
