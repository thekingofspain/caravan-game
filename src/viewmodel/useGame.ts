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
  const [previous, setPrevious] = useState<GameState | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [transition, setTransition] = useState<TransitionInfo | null>(null);
  const [stagedNext, setStagedNext] = useState<GameState | null>(null);
  const [pendingMove, setPendingMove] = useState<Move | null>(null);

  // Test harness: allow e2e to program particular hand/deck/ops
  if (typeof window !== "undefined") {
    const w = window as unknown as { __setCaravanState?: (s: GameState)=>void; __caravanDispatch?: (a: ReducerMove)=>void };
    w.__setCaravanState = (s: GameState) => dispatch({ type: "__setState", state: s });
    w.__caravanDispatch = dispatch;
  }

  useEffect(() => {
    if (state.phase === "over" || state.current !== Ai) return;
    // If UX is waiting for human ack, don't let AI play
    if (transition?.needsConfirmation && transition.confirmer === Human) return;
    setThinking(true);
    const t = setTimeout(() => {
      const a = determineBestMove(state, Ai);
      const next = applyMove(state, a);
      const info = getTransitionInfo(state, a, next);
      if (info.needsConfirmation && info.confirmer === Human) {
        // Hold for human ack — keep previous displayed grey until ack
        setPrevious(state);
        setLastMove(a);
        setTransition(info);
        setStagedNext(next);
        setPendingMove(a);
      } else {
        setPrevious(state);
        setLastMove(a);
        setTransition(null);
        dispatch(a);
      }
      setThinking(false);
    }, 650);
    return () => clearTimeout(t);
  }, [state, transition]);

  const act = useCallback(
    (a: Move) => {
      const next = applyMove(state, a);
      const info = getTransitionInfo(state, a, next);
      // Only hold for display + require human ack when AI removed cards (confirmer===Human)
      // Human's own Jack/Joker (confirmer===Ai) commits immediately — no ack, per spec: "since the human made the move, there is not acknowledgement"
      if (info.needsConfirmation && info.confirmer === Human) {
        setPrevious(state);
        setLastMove(a);
        setTransition(info);
        setStagedNext(next);
        setPendingMove(a);
        return;
      }
      // Immediate commit — no pending grey
      setPrevious(state);
      setLastMove(a);
      setTransition(null);
      dispatch(a);
    },
    [state],
  );
  const reset = useCallback((c: GameConfig) => {
    setCfg(c);
    setPrevious(null);
    setLastMove(null);
    setTransition(null);
    setStagedNext(null);
    setPendingMove(null);
    dispatch({ type: "reset", config: c });
  }, []);
  const acknowledge = useCallback(() => {
    if (stagedNext && pendingMove) {
      // Commit the held move's resulting state
      dispatch(pendingMove);
      setPrevious(null);
      setLastMove(null);
      setTransition(null);
      setStagedNext(null);
      setPendingMove(null);
      return;
    }
    // Fallback: just clear transition if no staged move (e.g., forced via __act)
    setTransition(null);
    setPrevious(null);
    setLastMove(null);
  }, [stagedNext, pendingMove]);

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
