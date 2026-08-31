import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Move, Ai, GameState, Human, PlayerId } from "../model/types";
import { applyMove, legalMoves, setupGame } from "../model/engine";
import { determineBestMove } from "../model/ai";
import { getTransitionInfo, type TransitionInfo } from "./transition";

export interface GameConfig {
  seed?: number;
}

export interface GameStore {
  state: GameState;
  legal: Move[];
  act: (a: Move) => void;
  reset: (cfg: GameConfig) => void;
  thinking: boolean;
  /** UX transition derived from f(previous, move, current) */
  transition: TransitionInfo | null;
  previous: GameState | null;
  lastMove: Move | null;
  acknowledge: () => void;
}

type ReducerMove = Move | { type: "reset"; config: GameConfig } | { type: "__setState"; state: GameState };

function reducer(state: GameState, action: ReducerMove): GameState {
  if (action.type === "reset") return setupGame({ ...action.config, first: Human });
  if (action.type === "__setState") return action.state;
  return applyMove(state, action);
}
export function useGame(initial: GameConfig): GameStore {
  const [cfg, setCfg] = useState<GameConfig>(initial);
  const [state, dispatch] = useReducer(reducer, cfg, (c) => setupGame({ ...c, first: Human }));
  const [thinking, setThinking] = useState(false);
  const [ui, setUi] = useState<{
    previous: GameState | null;
    lastMove: Move | null;
    transition: TransitionInfo | null;
    stagedNext: GameState | null;
    pendingMove: Move | null;
  }>({ previous: null, lastMove: null, transition: null, stagedNext: null, pendingMove: null });

  // Test harness: allow e2e to program particular hand/deck/ops
  if (typeof window !== "undefined") {
    const w = window as unknown as { __setCaravanState?: (s: GameState) => void; __caravanDispatch?: (a: ReducerMove) => void };
    w.__setCaravanState = (s: GameState) => dispatch({ type: "__setState", state: s });
    w.__caravanDispatch = dispatch;
  }

  const commitOrStage = useCallback(
    (prev: GameState, move: Move, next: GameState) => {
      const info = getTransitionInfo(prev, move, next);
      if (info.needsConfirmation && info.confirmer === Human) {
        setUi({ previous: prev, lastMove: move, transition: info, stagedNext: next, pendingMove: move });
      } else {
        setUi({ previous: prev, lastMove: move, transition: null, stagedNext: null, pendingMove: null });
        dispatch(move);
      }
    },
    [],
  );

  const { previous, lastMove, transition, stagedNext, pendingMove } = ui;

  useEffect(() => {
    if (state.phase === "over" || state.current !== Ai) return;
    if (transition?.needsConfirmation && transition.confirmer === Human) return;
    setThinking(true);
    const t = setTimeout(() => {
      const a = determineBestMove(state, Ai);
      const next = applyMove(state, a);
      commitOrStage(state, a, next);
      setThinking(false);
    }, 650);
    return () => clearTimeout(t);
  }, [state, transition, commitOrStage]);

  const act = useCallback(
    (a: Move) => {
      const next = applyMove(state, a);
      commitOrStage(state, a, next);
    },
    [state, commitOrStage],
  );
  const reset = useCallback((c: GameConfig) => {
    setCfg(c);
    setUi({ previous: null, lastMove: null, transition: null, stagedNext: null, pendingMove: null });
    dispatch({ type: "reset", config: c });
  }, []);
  const acknowledge = useCallback(() => {
    if (ui.stagedNext && ui.pendingMove) {
      dispatch(ui.pendingMove);
      setUi({ previous: null, lastMove: null, transition: null, stagedNext: null, pendingMove: null });
      return;
    }
    setUi((prev) => ({ ...prev, transition: null, previous: null, lastMove: null }));
  }, [ui.stagedNext, ui.pendingMove]);

  const legal = useMemo(() => legalMoves(state), [state]);
  return { state, legal, act, reset, thinking, transition, previous, lastMove, acknowledge };
}
export function isHumanTurn(state: GameState): boolean {
  return state.phase === "play" && state.current === Human;
}

export function handSelectable(state: GameState, legal: Move[], handIndex: number): boolean {
  return legal.some(
    (a) =>
      (a.type === "playValueCard" || a.type === "playFaceCard" || a.type === "discardCard") &&
      a.player === (state.current as PlayerId) &&
      a.handIndex === handIndex,
  );
}
