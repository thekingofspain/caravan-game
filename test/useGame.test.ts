import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { makeCard } from "../src/model/cards";
import type { TestWindowHooks } from "../src/app/testHooks";
import type { Caravan, GameState } from "../src/model/types";
import { isHumanTurn, handSelectable, useGame, type GameStore } from "../src/viewmodel/useGame";
import { setupGame, legalMoves } from "../src/model/engine";
import { Human, Ai } from "../src/model/types";

describe("isHumanTurn", () => {
    it("true when phase play and current Human", () => {
        const s = setupGame({ seed: 1 });
        s.current = Human;
        s.phase = "play";
        expect(isHumanTurn(s)).toBe(true);
    });
    it("false when AI turn or over", () => {
        const s = setupGame({ seed: 1 });
        s.current = Ai;
        expect(isHumanTurn(s)).toBe(false);
        s.phase = "gameOver";
        s.current = Human;
        expect(isHumanTurn(s)).toBe(false);
    });
});

describe("handSelectable", () => {
    it("marks only legal hand indices as selectable", () => {
        const s = setupGame({ seed: 7 });
        const legal = legalMoves(s);
        const selectable = [];
        for (let i = 0; i < s.players[Human].hand.length; i++) {
            if ((handSelectable as (s: unknown, l: unknown, idx: number) => boolean)(s, legal, i))
                selectable.push(i);
        }
        expect(selectable.length).toBeGreaterThan(0);
        expect(selectable.length).toBeLessThan(8);
        for (const idx of selectable) {
            expect(legal.some((a) => (a as { handIndex: number }).handIndex === idx)).toBe(true);
        }
    });
    it("empty hand has no selectable", () => {
        const s = setupGame({ seed: 7 });
        s.players[Human].hand = [];
        const legal = legalMoves(s);
        expect(handSelectable(s, legal, 0)).toBe(false);
    });
});

// React 19 reads this flag to enable act() outside a test runner with built-in support.
const reactActEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnv.IS_REACT_ACT_ENVIRONMENT = true;

interface StoreHarness {
    store: () => GameStore;
    cleanup: () => void;
}

const mounted: StoreHarness[] = [];
function rowLane(
    rank: "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9",
    suit: "clubs" | "diamonds" | "hearts" | "spades"
): Caravan {
    return { rows: [[makeCard(7, rank, suit)]], direction: null, suit, started: true };
}

function renderStore(): StoreHarness {
    let latest!: GameStore;
    function Probe(): null {
        latest = useGame({ seed: 1 });
        return null;
    }
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    act(() => {
        root.render(createElement(Probe));
    });
    const harness: StoreHarness = {
        store: () => latest,
        cleanup: () => {
            act(() => {
                root.unmount();
            });
            el.remove();
        }
    };
    mounted.push(harness);
    return harness;
}

function setHookState(s: GameState): void {
    // Seam published by publishTestHooks in DEV/test; absent shape is a hard error below.
    const testWindow: TestWindowHooks = window as unknown as TestWindowHooks;
    const set = testWindow.__setCaravanState;
    if (!set) throw new Error("caravan test seam is unavailable");
    act(() => {
        set(s);
    });
}

function aiRemovesState(): GameState {
    return {
        players: [
            {
                shoe: [makeCard(10, "2", "spades")],
                hand: [makeCard(9, "3", "hearts")],
                discard: null,
                caravans: [
                    {
                        rows: [
                            [makeCard(1, "10", "spades")],
                            [makeCard(2, "8", "hearts")],
                            [makeCard(3, "5", "diamonds")]
                        ],
                        direction: null,
                        suit: "diamonds",
                        started: true
                    },
                    rowLane("6", "clubs"),
                    rowLane("7", "diamonds")
                ]
            },
            {
                shoe: [makeCard(8, "4", "clubs"), makeCard(11, "7", "spades")],
                hand: [makeCard(4, "J", "spades")],
                discard: null,
                caravans: [rowLane("2", "clubs"), rowLane("3", "diamonds"), rowLane("4", "hearts")]
            }
        ],
        current: Ai,
        phase: "play",
        winner: null,
        log: []
    };
}

function humanRemovesState(): GameState {
    return {
        players: [
            {
                shoe: [makeCard(10, "2", "spades")],
                hand: [makeCard(4, "J", "spades")],
                discard: null,
                caravans: [rowLane("6", "clubs"), rowLane("7", "diamonds"), rowLane("8", "spades")]
            },
            {
                shoe: [makeCard(6, "6", "diamonds")],
                hand: [makeCard(5, "5", "clubs")],
                discard: null,
                caravans: [rowLane("9", "clubs"), rowLane("2", "diamonds"), rowLane("3", "hearts")]
            }
        ],
        current: Human,
        phase: "play",
        winner: null,
        log: []
    };
}

function aiRemovalPending(): StoreHarness {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const harness = renderStore();
    setHookState(aiRemovesState());
    act(() => {
        vi.advanceTimersByTime(700);
    });
    return harness;
}

function humanJackThenReply(): StoreHarness {
    const harness = renderStore();
    setHookState(humanRemovesState());
    act(() => {
        harness.store().act({
            type: "playOperationCard",
            player: Human,
            target: { player: Ai, lane: 0, cardIndex: 0 },
            handIndex: 0
        });
    });
    act(() => {
        vi.advanceTimersByTime(700);
    });
    return harness;
}

function useTimerLifecycle(): void {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        while (mounted.length) mounted.pop()?.cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });
}

describe("AI auto-reply", () => {
    useTimerLifecycle();

    it("hands the turn back to the human after its timer", () => {
        expect(humanJackThenReply().store().state.current).toBe(Human);
    });
    it("applies an AI move to the log", () => {
        expect(humanJackThenReply().store().state.log.length).toBe(2);
    });
});

describe("blocked until ack", () => {
    useTimerLifecycle();

    it("stages a human-confirmer ack for the AI removal", () => {
        expect(aiRemovalPending().store().transition?.pendingAck?.confirmer).toBe(Human);
    });
    it("holds the AI reply while the ack is pending", () => {
        const harness = aiRemovalPending();
        setHookState({ ...harness.store().state, current: Ai });
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(harness.store().state.current).toBe(Ai);
    });
    it("applies no AI move while the ack is pending", () => {
        const harness = aiRemovalPending();
        const entries = harness.store().state.log.length;
        setHookState({ ...harness.store().state, current: Ai });
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(harness.store().state.log.length).toBe(entries);
    });
    it("clears the pending ack on acknowledge", () => {
        const harness = aiRemovalPending();
        act(() => {
            harness.store().acknowledgeRemovals();
        });
        expect(harness.store().transition).toBeNull();
    });
    it("lets the AI reply through after acknowledge", () => {
        const harness = aiRemovalPending();
        setHookState({ ...harness.store().state, current: Ai });
        act(() => {
            harness.store().acknowledgeRemovals();
        });
        act(() => {
            vi.advanceTimersByTime(700);
        });
        expect(harness.store().state.current).toBe(Human);
    });
    it("records the released AI move in the log", () => {
        const harness = aiRemovalPending();
        const entries = harness.store().state.log.length;
        setHookState({ ...harness.store().state, current: Ai });
        act(() => {
            harness.store().acknowledgeRemovals();
        });
        act(() => {
            vi.advanceTimersByTime(700);
        });
        expect(harness.store().state.log.length).toBeGreaterThan(entries);
    });
    it("still commits a human move made before acknowledging", () => {
        const harness = aiRemovalPending();
        act(() => {
            harness.store().act({ type: "discardCard", player: Human, handIndex: 0 });
        });
        expect(harness.store().state.current).toBe(Ai);
    });
    it("replaces the staged transition when the new move removes nothing", () => {
        const harness = aiRemovalPending();
        act(() => {
            harness.store().act({ type: "discardCard", player: Human, handIndex: 0 });
        });
        expect(harness.store().transition).toBeNull();
    });
});
