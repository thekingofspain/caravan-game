import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Action, GameState, PlayerId } from "../game/types";
import { applyAction, legalActions, setupGame } from "../game/engine";
import { chooseAction } from "../game/ai";

export interface GameConfig {
  seed?: number;
}

export interface GameStore {
  state: GameState;
  legal: Action[];
  act: (a: Action) => void;
  reset: (cfg: GameConfig) => void;
  thinking: boolean;
}

type ReducerAction = Action | { type: "reset"; config: GameConfig };

function reducer(state: GameState, action: ReducerAction): GameState {
  if (action.type === "reset") return setupGame({ ...action.config, first: 0 });
  return applyAction(state, action);
}

export function useGame(initial: GameConfig): GameStore {
  const [cfg, setCfg] = useState<GameConfig>(initial);
  const [state, dispatch] = useReducer(reducer, cfg, (c) => setupGame({ ...c, first: 0 }));
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    if (state.phase === "over" || state.current !== 1) return;
    setThinking(true);
    const t = setTimeout(() => {
      const a = chooseAction(state, 1);
      dispatch(a);
      setThinking(false);
    }, 650);
    return () => clearTimeout(t);
  }, [state]);

  const act = useCallback((a: Action) => dispatch(a), []);
  const reset = useCallback((c: GameConfig) => {
    setCfg(c);
    dispatch({ type: "reset", config: c });
  }, []);

  const legal = useMemo(() => legalActions(state), [state]);
  return { state, legal, act, reset, thinking };
}

export function isHumanTurn(state: GameState): boolean {
  return state.phase === "play" && state.current === 0;
}

export function handSelectable(state: GameState, legal: Action[], handIndex: number): boolean {
  return legal.some(
    (a) =>
      (a.type === "playValue" || a.type === "playFace" || a.type === "discard") &&
      a.player === (state.current as PlayerId) &&
      a.handIndex === handIndex,
  );
}
