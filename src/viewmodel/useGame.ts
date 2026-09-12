import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { publishTestHooks } from "../app/testHooks";
import { determineBestMove } from "../model/ai";
import { applyMove, forfeitNoMoves, legalMoves, setupGame } from "../model/engine";
import { Ai, AiLevel, GameConfig, GameState, Human, Move, Nullable } from "../model/types";
import { getTransitionInfo, type TransitionInfo } from "./transition";

export type { GameConfig };
export type { AiLevel };

const AI_LEVEL_KEY = "caravan:aiLevel";

function loadAiLevel(): AiLevel {
    try {
        const raw =
            typeof window === "undefined" ? null : window.localStorage.getItem(AI_LEVEL_KEY);

        if (raw === "hard" || raw === "expert" || raw === "normal" || raw === "master") return raw;
    } catch {
        // private mode / SSR: fall through to default.
    }

    return "normal";
}

export interface GameStore {
    state: GameState;
    legal: Move[];
    act: (a: Move) => void;
    reset: (cfg: GameConfig) => void;
    aiLevel: AiLevel;
    setAiLevel: (level: AiLevel) => void;

    /** UX transition derived from f(previous, move, current) */

    transition: Nullable<TransitionInfo>;
    previous: Nullable<GameState>;
    lastMove: Nullable<Move>;
    acknowledgeRemovals: () => void;
}

export type ReducerMove =
    Move | { type: "reset"; config: GameConfig } | { type: "__setState"; state: GameState };

function reducer(state: GameState, action: ReducerMove): GameState {
    if (action.type === "reset") return setupGame({ ...action.config, first: Human });

    if (action.type === "__setState") return action.state;

    return applyMove(state, action);
}

export function useGame(initial: GameConfig): GameStore {
    const [cfg, setCfg] = useState<GameConfig>(initial);
    const [state, dispatch] = useReducer(reducer, cfg, (c) => setupGame({ ...c, first: Human }));
    const [aiLevel, setAiLevelState] = useState<AiLevel>(loadAiLevel);
    const [ui, setUi] = useState<{
        previous: Nullable<GameState>;
        lastMove: Nullable<Move>;
        transition: Nullable<TransitionInfo>;
    }>({ previous: null, lastMove: null, transition: null });

    useEffect(
        () =>
            publishTestHooks({
                __setCaravanState: (s: GameState) => {
                    dispatch({ type: "__setState", state: s });
                },
                __caravanDispatch: dispatch
            }),
        [dispatch]
    );

    const commitOrStage = useCallback((prev: GameState, move: Move, next: GameState) => {
        const info = getTransitionInfo(prev, move, next);

        // Always commit so the move (including its log entry) is visible immediately,
        // even while a confirmation X is still displayed. The pre-move board stays
        // available via `previous` for the confirmation visuals until acknowledged.

        setUi({
            previous: prev,
            lastMove: move,
            transition: info.pendingAck ? info : null
        });
        dispatch(move);
    }, []);

    const { previous, lastMove, transition } = ui;

    useEffect(() => {
        if (state.phase === "over" || state.current !== Ai) return;

        if (transition?.pendingAck?.confirmer === Human) return;

        // AI with no legal moves (e.g. unfillable empties, no value cards)
        // forfeits at turn start instead of crashing move selection.

        if (legalMoves(state).length === 0) {
            dispatch({ type: "__setState", state: forfeitNoMoves(state) });

            return;
        }

        const t = window.setTimeout(() => {
            const a = determineBestMove(state, Ai, { level: aiLevel });
            const next = applyMove(state, a);

            commitOrStage(state, a, next);
        }, 650);

        return () => {
            window.clearTimeout(t);
        };
    }, [state, transition, commitOrStage, aiLevel]);

    const act = useCallback(
        (a: Move) => {
            // Silent no-op on stale dispatches (fast double-activation after
            // the turn flipped, effect races): previously applyMove threw
            // IllegalMoveError into an error toast. Genuine illegal moves for
            // the current player still throw from applyMove below.

            if (state.phase !== "play" || a.player !== state.current) return;

            const next = applyMove(state, a);

            commitOrStage(state, a, next);
        },
        [state, commitOrStage]
    );
    const reset = useCallback((c: GameConfig) => {
        setCfg(c);
        setUi({ previous: null, lastMove: null, transition: null });
        dispatch({ type: "reset", config: c });
    }, []);
    const setAiLevel = useCallback((level: AiLevel) => {
        setAiLevelState(level);

        try {
            window.localStorage.setItem(AI_LEVEL_KEY, level);
        } catch {
            // storage unavailable: level still applies for this session.
        }
    }, []);
    const acknowledgeRemovals = useCallback(() => {
        // The move was already committed when played; acknowledging only clears
        // the confirmation visuals. At game over the winning card keeps
        // flashing, so the move is retained for the highlight.

        if (state.phase === "over") {
            setUi((prev) => ({ ...prev, transition: null }));

            return;
        }

        setUi((prev) => ({ ...prev, transition: null, previous: null, lastMove: null }));
    }, [state]);

    const legal = useMemo(() => legalMoves(state), [state]);

    return {
        state,
        legal,
        act,
        reset,
        aiLevel,
        setAiLevel,
        transition,
        previous,
        lastMove,
        acknowledgeRemovals
    };
}

export function isHumanTurn(state: GameState): boolean {
    return state.phase === "play" && state.current === Human;
}

export function handSelectable(state: GameState, legal: Move[], handIndex: number): boolean {
    return legal.some(
        (a) =>
            (a.type === "playValueCard" ||
                a.type === "playOperationCard" ||
                a.type === "discardCard") &&
            a.player === state.current &&
            a.handIndex === handIndex
    );
}
