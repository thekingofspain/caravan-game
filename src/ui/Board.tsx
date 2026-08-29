import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { GameStore, isHumanTurn, handSelectable } from "../state/useGame";
import { PlayerType, TargetRef } from "../game/types";
import { pairWinner } from "../game/scoring";
import { caravanName } from "../game/names";
import { Caravan, CaravanScore } from "./Caravan";
import { PlayerHand } from "./PlayerHand";
import { CardView } from "./CardView";
import { Sidebar } from "./Sidebar";

function targetKey(t: TargetRef): string {
  return `${t.player}-${t.caravan}-${t.cardIndex}`;
}

const noop = () => {};

export function Board({ store }: { store: GameStore }) {
  const { state, legal, act } = store;
  const [sel, setSel] = useState<number | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Set<string>>(new Set());
  const [activityOpen, setActivityOpen] = useState(false);
  const [viewDeck, setViewDeck] = useState<0 | 1 | null>(null);

  const human = isHumanTurn(state);
  const blocked = state.pending.length > 0;

  const { legalCaravans, targetSet, canDiscard } = useMemo(() => {
    if (sel === null) {
      return { legalCaravans: [] as number[], targetSet: new Set<string>(), canDiscard: false };
    }
    const caravans: number[] = [];
    const targets = new Set<string>();
    let discard = false;
    for (const a of legal) {
      if (a.type !== "playValue" && a.type !== "playFace" && a.type !== "discard") continue;
      if (a.handIndex !== sel) continue;
      if (a.type === "playValue") caravans.push(a.caravan);
      else if (a.type === "playFace") targets.add(targetKey(a.target));
      else discard = true;
    }
    return { legalCaravans: caravans, targetSet: targets, canDiscard: discard };
  }, [sel, legal]);
  const pendingKeys = useMemo(() => new Set(state.pending.map(targetKey)), [state.pending]);
  const jackRemovableSet = pendingKeys;

  const humanPlayer = state.players[0];
  const aiPlayer = state.players[1];

  const canDisbandAny =
    human && !blocked && sel === null && humanPlayer.caravans.every((c) => c.cards.length > 0);

  const selectableIndices = useMemo(() => {
    const set = new Set<number>();
    if (human && !blocked) {
      for (let i = 0; i < humanPlayer.hand.length; i++) {
        if (handSelectable(state, legal, i)) set.add(i);
      }
    }
    return set;
  }, [human, blocked, humanPlayer.hand, state, legal]);

  const onHandClick = useCallback(
    (i: number) => {
      if (blocked || !selectableIndices.has(i)) return;
      setSel((s) => (s === i ? null : i));
    },
    [blocked, selectableIndices],
  );

  const onAcknowledge = useCallback(() => {
    if (state.pending.length === 0) return;
    setPendingRemove(new Set(state.pending.map(targetKey)));
    window.setTimeout(() => {
      setPendingRemove(new Set());
      act({ type: "acknowledge", player: 0 });
      setSel(null);
    }, 320);
  }, [state.pending, act]);

  const onCardClick = useCallback(
    (target: TargetRef) => {
      if (sel === null || blocked) return;
      const card = humanPlayer.hand[sel];
      if (!card) return;

      if (target.player === 1) {
        if (targetSet.has(targetKey(target))) {
          act({ type: "playFace", player: 0, target, handIndex: sel });
          setSel(null);
        }
        return;
      }

      if (target.player === 0) {
        if (jackRemovableSet.has(targetKey(target))) {
          act({ type: "removeJacked", player: 0, target });
          setSel(null);
          return;
        }

        const isValueCard = card.rank !== "J" && card.rank !== "Q" && card.rank !== "K" && card.rank !== "JOKER";
        if (isValueCard) {
          const caravanLen = humanPlayer.caravans[target.caravan].cards.length;
          const isTop = target.cardIndex === caravanLen - 1;
          if (legalCaravans.includes(target.caravan) && isTop) {
            act({ type: "playValue", player: 0, caravan: target.caravan, handIndex: sel });
            setSel(null);
          }
          return;
        }

        if (targetSet.has(targetKey(target))) {
          act({ type: "playFace", player: 0, target, handIndex: sel });
          setSel(null);
        }
      }
    },
    [sel, blocked, humanPlayer, targetSet, jackRemovableSet, legalCaravans, act],
  );

  const onPlaceholderClick = useCallback(
    (caravanIndex: number) => {
      if (sel === null) return;
      const card = humanPlayer.hand[sel];
      if (!card) return;
      const isValue = card.rank !== "J" && card.rank !== "Q" && card.rank !== "K" && card.rank !== "JOKER";
      const ci = caravanIndex as 0 | 1 | 2;
      if (isValue && legalCaravans.includes(ci)) {
        act({ type: "playValue", player: 0, caravan: ci, handIndex: sel });
        setSel(null);
      }
    },
    [sel, humanPlayer, legalCaravans, act],
  );

  const onDiscard = useCallback(() => {
    if (sel === null) return;
    const d = legal.find((a) => a.type === "discard" && a.handIndex === sel);
    if (d) {
      act(d);
      setSel(null);
    }
  }, [sel, legal, act]);

  const onNewGame = useCallback(
    () => store.reset({ seed: Math.floor(Math.random() * 1e9) }),
    [store.reset],
  );

  const onDeckClick = useCallback(() => {
    if (sel !== null && canDiscard) {
      onDiscard();
    } else {
      setViewDeck(0);
    }
  }, [sel, canDiscard, onDiscard]);

  const onDisband = useCallback(
    (ci: number) => {
      if (!canDisbandAny) return;
      if (!window.confirm(`Disband ${caravanName(0, ci)}? All its cards will be discarded.`)) return;
      act({ type: "disband", player: 0, caravan: ci as 0 | 1 | 2 });
      setSel(null);
    },
    [canDisbandAny, act],
  );

  const aiSelection = useMemo(
    () => ({
      selectedHandIndex: null,
      selectedCard: null,
      legalCaravans: [] as number[],
      targetSet,
      jackRemovableSet,
      pendingSet: pendingKeys,
      pendingRemoveSet: pendingRemove,
      canDiscard: false,
    }),
    [targetSet, jackRemovableSet, pendingKeys, pendingRemove],
  );

  const humanSelection = useMemo(
    () => ({
      selectedHandIndex: sel,
      selectedCard: sel !== null ? humanPlayer.hand[sel] ?? null : null,
      legalCaravans,
      targetSet,
      jackRemovableSet,
      pendingSet: pendingKeys,
      pendingRemoveSet: pendingRemove,
      canDiscard,
    }),
    [sel, humanPlayer.hand, legalCaravans, targetSet, jackRemovableSet, pendingKeys, pendingRemove, canDiscard],
  );

  // permanently raise the human hand by ~50% of its own height
  useLayoutEffect(() => {
    const apply = () => {
      const hand = document.querySelector<HTMLElement>(".hand-half--human");
      if (!hand) return;
      hand.style.removeProperty("--hand-lift");
      const h = hand.getBoundingClientRect().height;
      hand.style.setProperty("--hand-lift", `${-0.12 * h}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

   return (
    <div className="board">
      <div className="playfield">
        <div className="board-cols">
          <div className="board-col board-col--caravans">
            <div className="play-row play-row--ai">
              <div className="caravans-row">
                {[0, 1, 2].map((ci) => {
                  const pairWinnerPlayer = pairWinner(state, ci as 0 | 1 | 2);
                  const side: PlayerType = "ai";
                  return (
                    <div className="caravan-col" key={ci}>
                      <div className={`caravan-col__header caravan-col__header--${side}`}>
                          <CaravanScore
                            caravan={aiPlayer.caravans[ci]}
                            highestSold={pairWinnerPlayer === 1}
                          />
                          <span className="caravan-col__title">{caravanName(1, ci)}</span>
                      </div>
                      <Caravan
                        playerType="ai"
                        caravan={aiPlayer.caravans[ci]}
                        caravanIndex={ci}
                        playerId={1}
                        highestSold={pairWinnerPlayer === 1}
                        selection={aiSelection}
                        onCardClick={onCardClick}
                        onPlaceholderClick={noop}
                        onAcknowledge={onAcknowledge}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="play-row play-row--human">
              <div className="caravans-row">
                {[0, 1, 2].map((ci) => {
                  const pairWinnerPlayer = pairWinner(state, ci as 0 | 1 | 2);
                  const side: PlayerType = "human";
                  return (
                    <div className="caravan-col" key={ci}>
                      <div className={`caravan-col__header caravan-col__header--${side}`}>
                          <CaravanScore
                            caravan={humanPlayer.caravans[ci]}
                            highestSold={pairWinnerPlayer === 0}
                          />
                          <span className="caravan-col__title">{caravanName(0, ci)}</span>
                      </div>
                      <Caravan
                        playerType="human"
                        caravan={humanPlayer.caravans[ci]}
                        caravanIndex={ci}
                        playerId={0}
                        highestSold={pairWinnerPlayer === 0}
                        selection={humanSelection}
                        onCardClick={onCardClick}
                        onPlaceholderClick={onPlaceholderClick}
                        onAcknowledge={onAcknowledge}
                      >
                        {canDisbandAny ? (
                          <button
                            type="button"
                            className="caravan__disband"
                            onClick={() => onDisband(ci)}
                            aria-label={`Disband your ${caravanName(0, ci)}`}
                          >
                            Disband
                          </button>
                        ) : null}
                      </Caravan>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="board-col board-col--hands">
            <div className="hand-half">
              <button
                type="button"
                className="deck-pile deck-pile--ai"
                onClick={() => setViewDeck(1)}
                aria-label={`AI deck, ${aiPlayer.deck.length} cards remaining. View the deck.`}
              >
                <div className="card card--back card--deck2" />
                <span className="deck-pile__count">{aiPlayer.deck.length}</span>
              </button>
              <PlayerHand
                playerType="ai"
                player={aiPlayer}
                selectedHandIndex={null}
                selectableIndices={new Set()}
                onCardClick={noop}
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
                playerType="human"
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
        <div className="deck-overlay" role="dialog" aria-label={`${viewDeck === 0 ? "Your" : "AI"} remaining deck`}>
          <div className="deck-overlay__header">
            <span>
              {viewDeck === 0 ? "Your" : "AI"} deck — {state.players[viewDeck].deck.length} cards
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
