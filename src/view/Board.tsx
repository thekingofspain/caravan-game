import { useCallback, useEffect, useMemo, useState } from "react";
import { GameStore, handSelectable, isHumanTurn } from "../viewmodel/useGame";
import { Ai, Human, PlayerId, TargetRef, isValueCard, type Move } from "../model/types";
import type { Caravan as CaravanModel, GameState, SelectionState } from "../model/types";
import { caravanSeller } from "../model/scoring";
import { calculateCaravanState } from "../model/rules/caravanCardRules";
import { caravanName } from "../model/names";
import { cardLabel } from "../model/cards";
import { Caravan, CaravanScore } from "./Caravan";
import { PlayerHand } from "./PlayerHand";
import { CardView } from "./CardView";
import { Sidebar } from "./Sidebar";
import { useBoardSelection } from "../viewmodel/useBoardSelection";
import { getDisplayedState, targetKey } from "../viewmodel/transition";

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
  caravans: CaravanModel[];
  selection: SelectionState;
  state: GameState;
  onCardClick: (t: TargetRef) => void;
  onPlaceholderClick: (ci: number) => void;
  onAcknowledge: () => void;
  childrenFor?: (ci: number) => React.ReactNode;
}) {
  const side = playerId === Human ? "human" : "ai";

  return (
    <>
      {[0, 1, 2].map((ci) => {
        const pairWinnerPlayer = caravanSeller(state, ci as 0 | 1 | 2);
        const caravan = caravans[ci];
        const st = calculateCaravanState(caravan);
        const sold = st.status === "sellable";
        const isEmpty = caravan.rows.length === 0;
        return (
          <div className={`caravan ${side} ${sold ? "sold" : ""} ${isEmpty ? "is-empty" : ""}`} key={ci}>
            <header>
              <CaravanScore caravan={caravan} highestSold={pairWinnerPlayer === playerId} playerId={playerId} />
              <span className="title">{caravanName(playerId, ci)}</span>
              <span className="direction" data-dir={caravan.direction} aria-hidden="true" />
            </header>
            <Caravan
              caravan={caravan}
              caravanIndex={ci as 0 | 1 | 2}
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
  const deckPeekEnabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("peekDeck");
  const human = isHumanTurn(state);
  const blocked = !!transition?.needsConfirmation && transition.confirmer === Human;

  const onCopyActivity = async () => {
    const lines: string[] = [];
    lines.push(`# Caravan Activity — ${new Date().toISOString()}`);
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("seed") : null;
    lines.push(`Seed: ${params ?? "(random)"} | Phase: ${state.phase} | Current: ${state.current === Human ? "Human" : "AI"} | Winner: ${String(state.winner ?? "none")}`);
    for (const pid of [Human, Ai] as const) {
      const p = state.players[pid];
      const label = pid === Human ? "Human" : "AI";
      lines.push(`${label} — hand:${String(p.hand.length)} deck:${String(p.deck.length)} | hand: ${p.hand.map(cardLabel).join(", ")}`);
      p.caravans.forEach((c, idx) => {
        const st = calculateCaravanState(c);
        const total = st.total;
        lines.push(`  ${caravanName(pid, idx)}: ${String(total)} (${st.status}) — rows:${String(c.rows.length)} dir:${c.direction ?? "-"} suit:${c.suit ?? "-"}`);
      });
    }

    lines.push("");
    lines.push("Activity Log:");
    if (state.log.length === 0) lines.push("(empty)");

    else state.log.forEach((e) => {
      lines.push(`- ${e.text}`);
      if (e.detail) e.detail.forEach((d) => lines.push(`  - ${d}`));
    });

    const text = lines.join("\n");
    
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied activity + debug to clipboard");
    } catch {
      setToast("Copy failed");
    }
  };
  // auto-clear toast after 3s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => { setToast(null); }, 3000);
    return () => { clearTimeout(t); };
  }, [toast]);

  // Reset all UI state on new game (state with empty log + empty caravans)
  useEffect(() => {
    const isNewGame = state.log.length === 0 && state.players.every((p) => p.caravans.every((c) => c.rows.length === 0));
    if (isNewGame) {
      const id = setTimeout(() => {
        setSel(null);
        setPendingRemove(new Set());
        setToast(null);
        setViewDeck(null);
        setActivityOpen(false);
      }, 0);
      return () => { clearTimeout(id); };
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
      if (target.player === Ai) {
        if (targetSet.has(targetKey(target))) { tryAct({ type: "playFaceCard", player: Human, target, handIndex: sel }); setSel(null); }
        return;
      }
      if (isValueCard(card)) {
        const caravanLen = humanPlayer.caravans[target.caravan].rows.length;
        const isTop = target.cardIndex === caravanLen - 1;
        if (legalCaravans.includes(target.caravan) && isTop) { tryAct({ type: "playValueCard", player: Human, caravan: target.caravan, handIndex: sel }); setSel(null); }
        return;
      }
      if (targetSet.has(targetKey(target))) { tryAct({ type: "playFaceCard", player: Human, target, handIndex: sel }); setSel(null); }
    },
    [sel, blocked, humanPlayer, targetSet, legalCaravans, tryAct],
  );

  const onPlaceholderClick = useCallback(
    (caravanIndex: number) => {
      if (sel === null) return;
      const card = humanPlayer.hand[sel];
      const ci = caravanIndex as 0 | 1 | 2;
      if (isValueCard(card) && legalCaravans.includes(ci)) { tryAct({ type: "playValueCard", player: Human, caravan: ci, handIndex: sel }); setSel(null); }
    },
    [sel, humanPlayer, legalCaravans, tryAct],
  );

  const onDiscard = useCallback(() => {
    if (sel === null) return;
    const d = legal.find((a) => a.type === "discardCard" && a.handIndex === sel);
    if (d) { tryAct(d); setSel(null); }
  }, [sel, legal, tryAct]);

  const onNewGame = useCallback(() => {
    setSel(null);
    setPendingRemove(new Set());
    setToast(null);
    setViewDeck(null);
    setActivityOpen(false);
    store.reset({ seed: Math.floor(Math.random() * 1e9) });
  }, [store]);

  const onDeckClick = useCallback(() => {
    if (sel !== null && canDiscard) onDiscard();
    else if (deckPeekEnabled) setViewDeck(Human);
  }, [sel, canDiscard, onDiscard, deckPeekEnabled]);

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
      <div className="field">
        <div className="columns">
          <div className="column caravans">
            <div className="play-row ai">
              <div className="caravans">
                <CaravanColumn playerId={Ai} caravans={aiPlayer.caravans} selection={aiSelection} state={state} onCardClick={onCardClick} onPlaceholderClick={() => undefined} onAcknowledge={onAcknowledge} />
              </div>
            </div>
            <div className="play-row human">
              <div className="caravans">
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
                      <button type="button" className="disband" onClick={() => { onDisband(ci); }} aria-label={`Disband your ${caravanName(Human, ci)}`}>
                        Disband
                      </button>
                    ) : null
                  }
                />
              </div>
            </div>
          </div>

          <div className="column hands">
            <div className="hand-half">
              <button
                type="button"
                className={`deck ai ${aiPlayer.deck.length === 0 ? "empty" : ""}`}
                onClick={deckPeekEnabled ? () => { setViewDeck(Ai); } : undefined}
                aria-label={deckPeekEnabled ? `AI deck, ${String(aiPlayer.deck.length)} cards remaining. View the deck.` : `AI deck, ${String(aiPlayer.deck.length)} cards remaining.`}
                aria-disabled={deckPeekEnabled ? undefined : true}
              >
                {aiPlayer.deck.length === 0 ? <div className="empty" aria-hidden="true" /> : <div className="card back deck2" />}
                <span className="count">{aiPlayer.deck.length}</span>
              </button>
              <PlayerHand
                playerId={Ai}
                player={aiPlayer}
                selectedHandIndex={null}
                selectableIndices={new Set()}
                onCardClick={() => undefined}
              />
            </div>

            <div className="controls">
              <button type="button" className="btn" onClick={onNewGame}>
                New game
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => { setActivityOpen((v) => !v); }}
                aria-expanded={activityOpen}
              >
                Activity
              </button>
            </div>

            <div className="hand-half human">
              <PlayerHand
                playerId={Human}
                player={humanPlayer}
                selectedHandIndex={sel}
                selectableIndices={selectableIndices}
                onCardClick={onHandClick}
              />
              <button
                type="button"
                className={`deck ${humanPlayer.deck.length === 0 ? "empty" : ""}`}
                onClick={onDeckClick}
                aria-label={deckPeekEnabled ? `Your deck, ${String(humanPlayer.deck.length)} cards remaining. Click to discard the selected card and draw a new one, or view the deck.` : `Your deck, ${String(humanPlayer.deck.length)} cards remaining. Click to discard the selected card and draw a new one.`}
              >
                {humanPlayer.deck.length === 0 ? <div className="empty" aria-hidden="true" /> : <div className="card back deck1" />}
                <span className="count">{humanPlayer.deck.length}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {activityOpen && (
        <div className="activity" role="dialog" aria-label="Activity log">
          <header>
            <span>Activity</span>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button type="button" className="copy" onClick={() => { void onCopyActivity(); }} aria-label="Copy activity log and debug info">
                Copy
              </button>
              <button
                type="button"
                className="close"
                onClick={() => { setActivityOpen(false); }}
                aria-label="Close activity log"
              >
                ×
              </button>
            </div>
          </header>
          <Sidebar log={state.log} state={state} />
        </div>
      )}

      {deckPeekEnabled && viewDeck !== null && (
        <div className="overlay" role="dialog" aria-label={`${viewDeck === Human ? "Your" : "AI"} remaining deck`}>
          <header>
            <span>
              {viewDeck === Human ? "Your" : "AI"} deck — {String(state.players[viewDeck].deck.length)} cards
            </span>
            <button
              type="button"
              className="close"
              onClick={() => { setViewDeck(null); }}
              aria-label="Close deck view"
            >
              ×
            </button>
          </header>
          <div className="cards">
            {state.players[viewDeck].deck.map((c) => (
              <CardView key={c.id} card={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
