import { useCallback, useEffect, useMemo, useState } from "react";
import { GameStore, handSelectable, isHumanTurn } from "../viewmodel/useGame";
import { Ai, Human, PlayerId, TargetRef, isValueCard, type Move } from "../model/types";
import { pairWinner } from "../model/scoring";
import { calculateCaravanState } from "../model/rules/caravanCardRules";
import { caravanName } from "../model/names";
import { Caravan, CaravanScore } from "./Caravan";
import { PlayerHand } from "./PlayerHand";
import { CardView } from "./CardView";
import { Sidebar } from "./Sidebar";
import { useBoardSelection } from "../viewmodel/useBoardSelection";
import { getDisplayedState, targetKey } from "../viewmodel/transition";
import type { SelectionState } from "../model/types";

function CaravanColumn({
  playerId,
  caravans,
  selection,
  state,
  onCardClick,
  onPlaceholderClick,
  onAcknowledge,
  childrenFor,
}: {
  playerId: PlayerId;
  caravans: import("../model/types").Caravan[];
  selection: SelectionState;
  state: import("../model/types").GameState;
  onCardClick: (t: TargetRef) => void;
  onPlaceholderClick: (ci: number) => void;
  onAcknowledge: () => void;
  childrenFor?: (ci: number) => React.ReactNode;
}) {
  const side = playerId === Human ? "human" : "ai";
  return (
    <>
      {[0, 1, 2].map((ci) => {
        const pairWinnerPlayer = pairWinner(state, ci as 0 | 1 | 2);
        const caravan = caravans[ci];
        const sold = calculateCaravanState(caravan).status === "sellable";
        return (
          <div className={sold ? "caravan-col is-sold" : "caravan-col"} key={ci}>
            <div className={`caravan-col__header caravan-col__header--${side}`}>
              <CaravanScore caravan={caravan} highestSold={pairWinnerPlayer === playerId} />
              <span className="caravan-col__title">{caravanName(playerId, ci)}</span>
              <span className="caravan-col__dir" data-dir={caravan.direction} aria-hidden="true" />
            </div>
            <Caravan
              caravan={caravan}
              caravanIndex={ci}
              playerId={playerId}
              highestSold={pairWinnerPlayer === playerId}
              selection={selection}
              onCardClick={onCardClick}
              onPlaceholderClick={onPlaceholderClick}
              onAcknowledge={onAcknowledge}
            >
              {childrenFor?.(ci)}
            </Caravan>
          </div>
        );
      })}
    </>
  );
}
export function Board({ store, confirm = typeof window !== "undefined" ? window.confirm.bind(window) : () => true }: { store: GameStore; confirm?: (msg: string) => boolean }) {
  const { state, legal, act, transition, acknowledge } = store;
  const [sel, setSel] = useState<number | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Set<string>>(new Set());
  const [activityOpen, setActivityOpen] = useState(false);
  const [viewDeck, setViewDeck] = useState<PlayerId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const human = isHumanTurn(state);
  const blocked = !!transition?.needsConfirmation && transition.confirmer === Human;
  // auto-clear toast after 3s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  // Reset all UI state on new game (state with empty log + empty caravans)
  useEffect(() => {
    const isNewGame = state.log.length === 0 && state.players.every((p) => p.caravans.every((c) => c.rows.length === 0));
    if (isNewGame) {
      setSel(null);
      setPendingRemove(new Set());
      setToast(null);
      setViewDeck(null);
      setActivityOpen(false);
    }
  }, [state]);
  // Displayed state is previous + addedTemp when pending AI removal (human must ack)
  const displayedState = useMemo(() => {
    if (!transition?.needsConfirmation || transition.confirmer !== Human) return state;
    return getDisplayedState(store.previous, state, transition);
  }, [state, transition, store.previous]);
  const { legalCaravans, targetSet, canDiscard, pendingKeys } = useBoardSelection(sel, legal, transition);

  const humanPlayer = displayedState.players[Human];
  const aiPlayer = displayedState.players[Ai];
  const canDisbandAny =
    human && !blocked && sel === null && humanPlayer.caravans.every((c) => c.rows.length > 0);

  const selectableIndices = useMemo(() => {
    const set = new Set<number>();
    if (human && !blocked) {
      for (let i = 0; i < humanPlayer.hand.length; i++) {
        if (handSelectable(state, legal, i)) set.add(i);
      }
    }
    return set;
  }, [human, blocked, humanPlayer.hand, state, legal]);

  const tryAct = useCallback((move: Move) => {
    try { act(move); return true; } catch (e) { setToast(e instanceof Error ? e.message : String(e)); return false; }
  }, [act]);

  const onHandClick = useCallback(
    (i: number) => {
      if (blocked || !selectableIndices.has(i)) return;
      setSel((s) => (s === i ? null : i));
    },
    [blocked, selectableIndices],
  );

  const onAcknowledge = useCallback(() => {
    if (!transition?.needsConfirmation) return;
    setPendingRemove(new Set(transition.impacted.map(targetKey)));
    window.setTimeout(() => {
      setPendingRemove(new Set());
      acknowledge();
      setSel(null);
    }, 320);
  }, [transition, acknowledge]);

  const onCardClick = useCallback(
    (target: TargetRef) => {
      if (sel === null || blocked) return;
      const card = humanPlayer.hand[sel];
      if (!card) return;
      if (target.player === Ai) {
        if (targetSet.has(targetKey(target))) { tryAct({ type: "playFaceCard", player: Human, target, handIndex: sel }); setSel(null); }
        return;
      }
      if (target.player === Human) {
        if (isValueCard(card)) {
          const caravanLen = humanPlayer.caravans[target.caravan].rows.length;
          const isTop = target.cardIndex === caravanLen - 1;
          if (legalCaravans.includes(target.caravan) && isTop) { tryAct({ type: "playValueCard", player: Human, caravan: target.caravan, handIndex: sel }); setSel(null); }
          return;
        }
        if (targetSet.has(targetKey(target))) { tryAct({ type: "playFaceCard", player: Human, target, handIndex: sel }); setSel(null); }
      }
    },
    [sel, blocked, humanPlayer, targetSet, legalCaravans, tryAct],
  );

  const onPlaceholderClick = useCallback(
    (caravanIndex: number) => {
      if (sel === null) return;
      const card = humanPlayer.hand[sel];
      if (!card) return;
      const ci = caravanIndex as 0 | 1 | 2;
      if (isValueCard(card) && legalCaravans.includes(ci)) { tryAct({ type: "playValueCard", player: Human, caravan: ci, handIndex: sel }); setSel(null); }
    },
    [sel, humanPlayer, legalCaravans, tryAct],
  );

  const onDiscard = useCallback(() => {
    if (sel === null) return;
    const d = legal.find((a) => a.type === "discardCard" && a.handIndex === sel);
    if (d) { tryAct(d as Move); setSel(null); }
  }, [sel, legal, tryAct]);

  const onNewGame = useCallback(() => {
    setSel(null);
    setPendingRemove(new Set());
    setToast(null);
    setViewDeck(null);
    setActivityOpen(false);
    store.reset({ seed: Math.floor(Math.random() * 1e9) });
  }, [store.reset]);

  const onDeckClick = useCallback(() => {
    if (sel !== null && canDiscard) onDiscard();
    else setViewDeck(Human);
  }, [sel, canDiscard, onDiscard]);

  const onDisband = useCallback(
    (ci: number) => {
      if (!canDisbandAny) return;
      if (!confirm(`Disband ${caravanName(Human, ci)}? All its cards will be discarded.`)) return;
      tryAct({ type: "dismissCaravan", player: Human, caravan: ci as 0 | 1 | 2 }); setSel(null);
    },
    [canDisbandAny, tryAct, confirm],
  );

  const aiSelection = useMemo(
    () => ({
      selectedHandIndex: null,
      selectedCard: null,
      legalCaravans: [] as number[],
      targetSet,
      pendingRemovalSet: pendingKeys,
      removingSet: pendingRemove,
      canDiscard: false,
    }),
    [targetSet, pendingKeys, pendingRemove],
  );

  const humanSelection = useMemo(
    () => ({
      selectedHandIndex: sel,
      selectedCard: sel !== null ? humanPlayer.hand[sel] ?? null : null,
      legalCaravans,
      targetSet,
      pendingRemovalSet: pendingKeys,
      removingSet: pendingRemove,
      canDiscard,
    }),
    [sel, humanPlayer.hand, legalCaravans, targetSet, pendingKeys, pendingRemove, canDiscard],
  );


   return (
    <div className="board">
      {toast && (
        <div role="alert" className="toast" style={{ position: "absolute", top: "1rem", left: "50%", transform: "translateX(-50%)", background: "#c0392b", color: "#fff", padding: "0.5rem 1rem", borderRadius: "0.5rem", zIndex: 100 }}>
          {toast}
        </div>
      )}
      <div className="playfield">
        <div className="board-cols">
          <div className="board-col board-col--caravans">
            <div className="play-row play-row--ai">
              <div className="caravans-row">
                <CaravanColumn playerId={Ai} caravans={aiPlayer.caravans} selection={aiSelection} state={state} onCardClick={onCardClick} onPlaceholderClick={() => {}} onAcknowledge={onAcknowledge} />
              </div>
            </div>
            <div className="play-row play-row--human">
              <div className="caravans-row">
                <CaravanColumn
                  playerId={Human}
                  caravans={humanPlayer.caravans}
                  selection={humanSelection}
                  state={state}
                  onCardClick={onCardClick}
                  onPlaceholderClick={onPlaceholderClick}
                  onAcknowledge={onAcknowledge}
                  childrenFor={(ci) =>
                    canDisbandAny ? (
                      <button type="button" className="caravan__disband" onClick={() => onDisband(ci)} aria-label={`Disband your ${caravanName(Human, ci)}`}>
                        Disband
                      </button>
                    ) : null
                  }
                />
              </div>
            </div>
          </div>

          <div className="board-col board-col--hands">
            <div className="hand-half">
              <button
                type="button"
                className="deck-pile deck-pile--ai"
                onClick={() => setViewDeck(Ai)}
                aria-label={`AI deck, ${aiPlayer.deck.length} cards remaining. View the deck.`}
              >
                <div className="card card--back card--deck2" />
                <span className="deck-pile__count">{aiPlayer.deck.length}</span>
              </button>
              <PlayerHand
                playerId={Ai}
                player={aiPlayer}
                selectedHandIndex={null}
                selectableIndices={new Set()}
                onCardClick={() => {}}
              />
            </div>

            <div className="play-controls">
              <button type="button" className="btn" onClick={onNewGame}>
                New game
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setActivityOpen((v) => !v)}
                aria-expanded={activityOpen}
              >
                Activity
              </button>
            </div>

            <div className="hand-half hand-half--human">
              <PlayerHand
                playerId={Human}
                player={humanPlayer}
                selectedHandIndex={sel}
                selectableIndices={selectableIndices}
                onCardClick={onHandClick}
              />
              <button
                type="button"
                className="deck-pile"
                onClick={onDeckClick}
                aria-label={`Your deck, ${humanPlayer.deck.length} cards remaining. Click to discard the selected card and draw a new one, or view the deck.`}
              >
                <div className="card card--back card--deck1" />
                <span className="deck-pile__count">{humanPlayer.deck.length}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {activityOpen && (
        <div className="activity-flyout" role="dialog" aria-label="Activity log">
          <div className="activity-flyout__header">
            <span>Activity</span>
            <button
              type="button"
              className="activity-flyout__close"
              onClick={() => setActivityOpen(false)}
              aria-label="Close activity log"
            >
              ×
            </button>
          </div>
          <Sidebar log={state.log} />
        </div>
      )}

      {viewDeck !== null && (
        <div className="deck-overlay" role="dialog" aria-label={`${viewDeck === Human ? "Your" : "AI"} remaining deck`}>
          <div className="deck-overlay__header">
            <span>
              {viewDeck === Human ? "Your" : "AI"} deck — {state.players[viewDeck].deck.length} cards
            </span>
            <button
              type="button"
              className="deck-overlay__close"
              onClick={() => setViewDeck(null)}
              aria-label="Close deck view"
            >
              ×
            </button>
          </div>
          <div className="deck-overlay__cards">
            {state.players[viewDeck].deck.map((c) => (
              <CardView key={c.id} card={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
