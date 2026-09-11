import { describe, it, expect } from "vitest";
import { makeCard } from "../src/model/cards";
import { applyMove, legalMoves, setupGame } from "../src/model/engine";
import { determineBestMove, evaluateTacticalBoard, tacticalMoveBonus } from "../src/model/ai";
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

function mkPlayer(caravans: Caravan[], hand: Card[], deck: Card[] = []): PlayerState {
    return { deck, hand, caravans: caravans as [Caravan, Caravan, Caravan], discard: null };
}

function mkGame(ai: PlayerState, human: PlayerState): GameState {
    return {
        players: [human, ai],
        current: Ai,
        phase: "play",
        winner: null,
        log: [],
        started: true
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

describe("tacticalMoveBonus", () => {
    it("rates a Jack on a seller at 60", () => {
        const s = jackSituation();
        const jack = legalMoves(s).find(
            (m) =>
                m.type === "playOperationCard" && m.target.player === Human && m.target.lane === 0
        ) as Move;
        expect(tacticalMoveBonus(s, jack, applyMove(s, jack), Ai)).toBe(60);
    });

    it("rates a Jack on an unsold lane at 10", () => {
        const s = jackSituation();
        const jack = legalMoves(s).find(
            (m) =>
                m.type === "playOperationCard" && m.target.player === Human && m.target.lane === 1
        ) as Move;
        expect(tacticalMoveBonus(s, jack, applyMove(s, jack), Ai)).toBe(10);
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
