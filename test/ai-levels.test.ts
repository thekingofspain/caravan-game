import { describe, it, expect } from "vitest";
import { makeCard } from "../src/model/cards";
import { applyMove, legalMoves, setupGame } from "../src/model/engine";
import { gameWinner } from "../src/model/scoring";
import {
    determineBestMove,
    difficultyWeight,
    evaluateTacticalBoard,
    operationShapingWeight,
    riskRewardWeight
} from "../src/model/ai";
import { mulberry32 } from "../src/model/rng";
import { Ai, Caravan, Card, GameState, Human, Move, PlayerState } from "../src/model/types";

function caravanEmpty(): Caravan {
    return { rows: [], direction: null, suit: null };
}

function startedCaravan(
    rows: Card[][],
    direction: Caravan["direction"],
    suit: Caravan["suit"]
): Caravan {
    return { rows, direction, suit, started: true };
}

function mkPlayer(caravans: Caravan[], hand: Card[], shoe: Card[] = []): PlayerState {
    return { shoe, hand, caravans: caravans as [Caravan, Caravan, Caravan], discard: null };
}

function mkGame(ai: PlayerState, human: PlayerState): GameState {
    return {
        players: [human, ai],
        current: Ai,
        phase: "play",
        winner: null,
        log: []
    };
}

function smallLane(): Caravan {
    return startedCaravan([[makeCard(11, "5", "hearts")]], null, "hearts");
}

function sold21Lane(): Caravan {
    return startedCaravan(
        [
            [makeCard(21, "10", "hearts")],
            [makeCard(22, "8", "clubs")],
            [makeCard(23, "3", "spades")]
        ],
        "desc",
        "spades"
    );
}

/** AI to move: human sells lane 0, AI holds a Jack plus a playable number. */
function jackSituation(): GameState {
    // Human keeps cards in hand: empty hands end the game on cards-exhaustion,
    // which would make every AI move an immediate win.
    const human = mkPlayer(
        [sold21Lane(), smallLane(), smallLane()],
        [makeCard(91, "2", "clubs"), makeCard(92, "4", "diamonds")]
    );
    const ai = mkPlayer(
        [smallLane(), smallLane(), smallLane()],
        [makeCard(31, "J", "spades"), makeCard(32, "9", "hearts")]
    );

    return mkGame(ai, human);
}

/** AI to move: human sells lane 0, AI holds a Queen plus a playable number. */
function queenSituation(): GameState {
    const opp = mkPlayer(
        [sold21Lane(), smallLane(), smallLane()],
        [makeCard(93, "2", "clubs"), makeCard(94, "4", "diamonds")]
    );
    const ai = mkPlayer(
        [smallLane(), smallLane(), smallLane()],
        [makeCard(41, "Q", "spades"), makeCard(42, "9", "hearts")]
    );

    return mkGame(ai, opp);
}
function sameMove(a: Move, b: Move): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

describe("hard", () => {
    it("plays only legal moves across a full game", () => {
        let s = setupGame({ seed: 5, first: Human });
        const rng = mulberry32(5);
        let allLegal = true;
        for (let i = 0; i < 120 && s.phase === "play"; i++) {
            const a = determineBestMove(s, s.current, { level: "hard", rng });
            if (!legalMoves(s).some((l) => sameMove(l, a))) allLegal = false;
            s = applyMove(s, a);
        }
        expect(allLegal).toBe(true);
    });

    it("removes the opponent seller with a Jack", () => {
        const s = jackSituation();
        const move = determineBestMove(s, Ai, { level: "hard", rng: mulberry32(1) });
        expect(move).toMatchObject({
            type: "playOperationCard",
            target: { player: Human, lane: 0 }
        });
    });

    it("strangles the opponent seller with a Queen", () => {
        const s = queenSituation();
        const move = determineBestMove(s, Ai, { level: "hard", rng: mulberry32(1) });
        expect(move).toMatchObject({
            type: "playOperationCard",
            target: { player: Human, lane: 0 }
        });
    });
});

describe("normal control", () => {
    it("ignores the scoreless Queen play and builds instead", () => {
        const s = queenSituation();
        const move = determineBestMove(s, Ai, { level: "normal", rng: mulberry32(1) });
        expect(move).toMatchObject({ type: "playValueCard" });
    });
});

describe("operationShapingWeight", () => {
    it("rates a Jack on a seller above a Jack on a small lane", () => {
        const s = jackSituation();
        const seller = legalMoves(s).find(
            (m) =>
                m.type === "playOperationCard" && m.target.player === Human && m.target.lane === 0
        ) as Move;
        const small = legalMoves(s).find(
            (m) =>
                m.type === "playOperationCard" && m.target.player === Human && m.target.lane === 1
        ) as Move;
        expect(operationShapingWeight(s, seller, applyMove(s, seller), Ai)).toBeGreaterThan(
            operationShapingWeight(s, small, applyMove(s, small), Ai)
        );
    });

    it("rates a Jack on a one-away lane at full row points, fattest first", () => {
        const human = mkPlayer(
            [
                sold21Lane(),
                startedCaravan(
                    [[makeCard(221, "10", "hearts")], [makeCard(222, "9", "diamonds")]],
                    "desc",
                    "diamonds"
                ),
                smallLane()
            ],
            [makeCard(223, "2", "clubs"), makeCard(224, "4", "diamonds")]
        );
        const ai = mkPlayer(
            [smallLane(), smallLane(), smallLane()],
            [makeCard(225, "J", "spades"), makeCard(226, "9", "hearts")]
        );
        const s = mkGame(ai, human);
        const fat = legalMoves(s).find(
            (m) =>
                m.type === "playOperationCard" &&
                m.target.player === Human &&
                m.target.lane === 1 &&
                m.target.cardIndex === 0
        ) as Move;
        const thin = legalMoves(s).find(
            (m) =>
                m.type === "playOperationCard" &&
                m.target.player === Human &&
                m.target.lane === 1 &&
                m.target.cardIndex === 1
        ) as Move;
        expect(operationShapingWeight(s, fat, applyMove(s, fat), Ai)).toBeGreaterThan(
            operationShapingWeight(s, thin, applyMove(s, thin), Ai)
        );
    });
    /** Joker removes 5 of yours and 5 of mine: net 0, breaks no sale. */
    function scorelessJokerSituation() {
        const ai = mkPlayer(
            [
                startedCaravan(
                    [
                        [makeCard(231, "10", "hearts")],
                        [makeCard(232, "8", "clubs")],
                        [makeCard(233, "3", "spades")],
                        [makeCard(234, "5", "diamonds")]
                    ],
                    "desc",
                    "spades"
                ),
                startedCaravan(
                    [[makeCard(240, "10", "hearts")], [makeCard(241, "9", "diamonds")]],
                    "desc",
                    "diamonds"
                ),
                smallLane()
            ],
            [makeCard(235, "Joker", "Red"), makeCard(236, "2", "clubs")]
        );
        const human = mkPlayer(
            [
                startedCaravan([[makeCard(237, "5", "clubs")]], null, "clubs"),
                smallLane(),
                smallLane()
            ],
            [makeCard(238, "2", "clubs"), makeCard(239, "4", "diamonds")]
        );

        return mkGame(ai, human);
    }
    it("builds instead of playing the scoreless Joker", () => {
        const s = scorelessJokerSituation();
        // Completing the 19 into a second seller beats the scoreless Joker.
        expect(determineBestMove(s, Ai, { level: "hard", rng: mulberry32(1) })).toMatchObject({
            type: "playValueCard"
        });
    });

    it("rewards the value play that closes the second seller, expert only", () => {
        const ai = mkPlayer(
            [
                sold21Lane(),
                smallLane(),
                startedCaravan(
                    [[makeCard(241, "10", "hearts")], [makeCard(242, "9", "diamonds")]],
                    "desc",
                    "diamonds"
                )
            ],
            [makeCard(243, "2", "clubs"), makeCard(244, "9", "hearts")]
        );
        const human = mkPlayer(
            [smallLane(), sold21Lane(), smallLane()],
            [makeCard(245, "2", "clubs"), makeCard(246, "4", "diamonds")]
        );
        const s = mkGame(ai, human);
        // 19 + 2 = 21 against a 5: sellers go 1 to 2.
        const closer = legalMoves(s).find(
            (m) => m.type === "playValueCard" && m.handIndex === 0 && m.lane === 2
        ) as Move;
        const next = applyMove(s, closer);
        expect(difficultyWeight(s, closer, next, Ai, "expert")).toBeGreaterThan(
            difficultyWeight(s, closer, next, Ai, "hard")
        );
    });

    it("punishes the bust that hands the opponent the second seller, expert only", () => {
        const ai = mkPlayer(
            [
                startedCaravan(
                    [
                        [makeCard(251, "10", "hearts")],
                        [makeCard(252, "8", "clubs")],
                        [makeCard(253, "3", "spades")],
                        [makeCard(254, "5", "diamonds")]
                    ],
                    "desc",
                    "spades"
                ),
                smallLane(),
                smallLane()
            ],
            [makeCard(255, "A", "hearts"), makeCard(256, "9", "hearts")]
        );
        const human = mkPlayer(
            [
                startedCaravan(
                    [
                        [makeCard(257, "10", "spades")],
                        [makeCard(258, "9", "clubs")],
                        [makeCard(259, "3", "diamonds")]
                    ],
                    "desc",
                    "diamonds"
                ),
                sold21Lane(),
                smallLane()
            ],
            [makeCard(260, "2", "clubs"), makeCard(261, "4", "diamonds")]
        );
        const s = mkGame(ai, human);
        // 26 + Ace = 27 bust: lane 0 flips from mine to yours, sellers go 1 to 2.
        const bust = legalMoves(s).find(
            (m) => m.type === "playValueCard" && m.handIndex === 0 && m.lane === 0
        ) as Move;
        const next = applyMove(s, bust);
        expect(difficultyWeight(s, bust, next, Ai, "expert")).toBeLessThan(
            difficultyWeight(s, bust, next, Ai, "hard")
        );
    });
});

describe("evaluateTacticalBoard", () => {
    it("scores two opponent sellers below one", () => {
        const one = mkGame(
            mkPlayer([smallLane(), smallLane(), smallLane()], []),
            mkPlayer([sold21Lane(), smallLane(), smallLane()], [])
        );
        const two = mkGame(
            mkPlayer([smallLane(), smallLane(), smallLane()], []),
            mkPlayer(
                [
                    sold21Lane(),
                    startedCaravan(
                        [
                            [makeCard(51, "10", "hearts")],
                            [makeCard(52, "8", "clubs")],
                            [makeCard(53, "4", "spades")]
                        ],
                        "desc",
                        "spades"
                    ),
                    smallLane()
                ],
                []
            )
        );
        expect(evaluateTacticalBoard(two, Ai)).toBeLessThan(evaluateTacticalBoard(one, Ai));
    });
});

describe("expert", () => {
    it("plays only legal moves across a game", () => {
        let s = setupGame({ seed: 9, first: Human });
        const rng = mulberry32(9);
        let allLegal = true;
        for (let i = 0; i < 40 && s.phase === "play"; i++) {
            const a = determineBestMove(s, s.current, { level: "expert", rng });
            if (!legalMoves(s).some((l) => sameMove(l, a))) allLegal = false;
            s = applyMove(s, a);
        }
        expect(allLegal).toBe(true);
    });

    it("takes the immediate winning value card", () => {
        const ai = mkPlayer(
            [
                startedCaravan(
                    [
                        [makeCard(61, "10", "hearts")],
                        [makeCard(62, "6", "clubs")],
                        [makeCard(63, "5", "spades")]
                    ],
                    "desc",
                    "spades"
                ),
                startedCaravan(
                    [
                        [makeCard(64, "9", "hearts")],
                        [makeCard(65, "8", "clubs")],
                        [makeCard(66, "5", "spades")]
                    ],
                    "desc",
                    "spades"
                ),
                startedCaravan(
                    [[makeCard(67, "10", "diamonds")], [makeCard(68, "8", "clubs")]],
                    "desc",
                    "clubs"
                )
            ],
            [makeCard(69, "3", "clubs"), makeCard(70, "2", "hearts")]
        );
        const human = mkPlayer(
            [smallLane(), smallLane(), smallLane()],
            [makeCard(95, "2", "clubs"), makeCard(96, "4", "diamonds")]
        );
        const move = determineBestMove(mkGame(ai, human), Ai, {
            level: "expert",
            rng: mulberry32(1)
        });
        expect(move).toMatchObject({ type: "playValueCard", lane: 2 });
    });
});

describe("immediate-loss guardrail", () => {
    /** AI selling lane 2 completes an H/H/A board and loses on the spot. */
    function losingSaleSituation(): GameState {
        const human = mkPlayer(
            [
                sold21Lane(),
                startedCaravan(
                    [
                        [makeCard(101, "10", "hearts")],
                        [makeCard(102, "8", "clubs")],
                        [makeCard(103, "4", "spades")]
                    ],
                    "desc",
                    "spades"
                ),
                startedCaravan(
                    [
                        [makeCard(104, "10", "spades")],
                        [makeCard(105, "7", "diamonds")],
                        [makeCard(106, "3", "clubs")]
                    ],
                    "desc",
                    "clubs"
                )
            ],
            [makeCard(107, "2", "clubs"), makeCard(108, "4", "diamonds")]
        );
        const ai = mkPlayer(
            [
                startedCaravan([[makeCard(109, "10", "hearts")]], null, "hearts"),
                startedCaravan([[makeCard(110, "9", "hearts")]], null, "hearts"),
                startedCaravan(
                    [[makeCard(111, "10", "diamonds")], [makeCard(112, "9", "clubs")]],
                    "desc",
                    "clubs"
                )
            ],
            [makeCard(113, "2", "clubs")],
            [makeCard(114, "K", "spades"), makeCard(115, "Q", "hearts")]
        );

        return mkGame(ai, human);
    }

    it("normal gives up a lane instead of selling into a loss", () => {
        const move = determineBestMove(losingSaleSituation(), Ai, {
            level: "normal",
            rng: mulberry32(1)
        });
        expect(move).toMatchObject({ type: "disbandCaravan" });
    });

    it("hard avoids the sale that hands the game over", () => {
        const move = determineBestMove(losingSaleSituation(), Ai, {
            level: "hard",
            rng: mulberry32(1)
        });
        expect(move).not.toMatchObject({ type: "playValueCard", lane: 2 });
    });

    it("expert avoids the sale that hands the game over", () => {
        const move = determineBestMove(losingSaleSituation(), Ai, {
            level: "expert",
            rng: mulberry32(1)
        });
        expect(move).not.toMatchObject({ type: "playValueCard", lane: 2 });
    });

    it("normal still moves when every move loses", () => {
        const ai = mkPlayer(
            [caravanEmpty(), caravanEmpty(), caravanEmpty()],
            [makeCard(121, "2", "clubs")]
        );
        const human = mkPlayer(
            [smallLane(), smallLane(), smallLane()],
            [makeCard(122, "2", "clubs"), makeCard(123, "4", "diamonds")]
        );
        const s = mkGame(ai, human);
        expect(applyMove(s, determineBestMove(s, Ai, mulberry32(1))).winner).toBe(Human);
    });
});

describe("master", () => {
    /** Human sells lane 0 and sits at 19 in lane 1; AI holds a Jack plus a buildable 9. */
    function masterRiskSituation(): GameState {
        const human = mkPlayer(
            [
                sold21Lane(),
                startedCaravan(
                    [[makeCard(201, "10", "hearts")], [makeCard(202, "9", "diamonds")]],
                    "desc",
                    "diamonds"
                ),
                smallLane()
            ],
            [makeCard(203, "2", "clubs"), makeCard(204, "4", "diamonds")]
        );
        const ai = mkPlayer(
            [smallLane(), smallLane(), smallLane()],
            [makeCard(205, "J", "spades"), makeCard(206, "9", "hearts")]
        );

        return mkGame(ai, human);
    }

    it("plays only legal moves across a full game", () => {
        let s = setupGame({ seed: 5, first: Human });
        const rng = mulberry32(5);
        let allLegal = true;
        // 2-ply search is slow (expert has no full-game loop for the same
        // reason); 25 plies still covers opening play on every level.
        for (let i = 0; i < 25 && s.phase === "play"; i++) {
            const a = determineBestMove(s, s.current, { level: "master", rng });
            if (!legalMoves(s).some((l) => sameMove(l, a))) allLegal = false;
            s = applyMove(s, a);
        }
        expect(allLegal).toBe(true);
    }, 30000);

    it("prices blocking the near-win above building", () => {
        const s = masterRiskSituation();
        const jack = legalMoves(s).find(
            (m) =>
                m.type === "playOperationCard" && m.target.player === Human && m.target.lane === 1
        ) as Move;
        const build = legalMoves(s).find((m) => m.type === "playValueCard") as Move;
        const jackWeight = riskRewardWeight(s, jack, applyMove(s, jack), Ai);
        const buildWeight = riskRewardWeight(s, build, applyMove(s, build), Ai);
        expect(jackWeight).toBeGreaterThan(buildWeight);
    });

    it("prices bigger progress above smaller progress when the opponent is far", () => {
        const human = mkPlayer(
            [smallLane(), smallLane(), smallLane()],
            [makeCard(211, "2", "clubs"), makeCard(212, "4", "diamonds")]
        );
        const ai = mkPlayer(
            [smallLane(), smallLane(), smallLane()],
            [makeCard(213, "9", "hearts"), makeCard(214, "2", "hearts")]
        );
        const s = mkGame(ai, human);
        const big = legalMoves(s).find(
            (m) => m.type === "playValueCard" && m.handIndex === 0
        ) as Move;
        const small = legalMoves(s).find(
            (m) => m.type === "playValueCard" && m.handIndex === 1
        ) as Move;
        expect(riskRewardWeight(s, big, applyMove(s, big), Ai)).toBeGreaterThan(
            riskRewardWeight(s, small, applyMove(s, small), Ai)
        );
    });

    it("breaks the opponent seller instead of building", () => {
        const move = determineBestMove(masterRiskSituation(), Ai, {
            level: "master",
            rng: mulberry32(1)
        });
        expect(move).toMatchObject({
            type: "playOperationCard",
            target: { player: Human, lane: 0 }
        });
    });
});
