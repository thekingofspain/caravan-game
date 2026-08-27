import { useState } from "react";
import { GameStore, isHumanTurn, handSelectable } from "../state/useGame";
import { Action, TargetRef } from "../game/types";
import { pairWinner } from "../game/scoring";
import { Caravan } from "./Caravan";
import { PlayerHand } from "./PlayerHand";
import { Sidebar } from "./Sidebar";

function targetKey(t: TargetRef): string {
  return `${t.player}-${t.caravan}-${t.cardIndex}`;
}

const noop = () => {};

export function Board({ store }: { store: GameStore }) {
  const { state, legal, act } = store;
  const [sel, setSel] = useState<number | null>(null);
  const human = isHumanTurn(state);

  const legalCaravans =
    sel !== null
      ? legal
          .filter((a): a is Extract<Action, { type: "playValue" }> => a.type === "playValue" && a.handIndex === sel)
          .map((a) => a.caravan)
      : [];
  const legalTargets =
    sel !== null
      ? legal.filter((a): a is Extract<Action, { type: "playFace" }> => a.type === "playFace" && a.handIndex === sel)
      : [];
  const targetSet = new Set(legalTargets.map((a) => targetKey(a.target)));
  const canDiscard = sel !== null && legal.some((a) => a.type === "discard" && a.handIndex === sel);
  // Cards awaiting acknowledgment (an opponent's removal); the red X is shown on
  // each of them, and the human may not play until they acknowledge.
  const pendingKeys = new Set(state.pending.map(targetKey));
  const blocked = state.pending.length > 0;
  const jackRemovableSet = pendingKeys;

  const humanPlayer = state.players[0];
  const aiPlayer = state.players[1];

  const selectableIndices = new Set<number>();
  if (human && !blocked) {
    for (let i = 0; i < humanPlayer.hand.length; i++) {
      if (handSelectable(state, legal, i)) selectableIndices.add(i);
    }
  }

  const [hoverTarget, setHoverTarget] = useState<TargetRef | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Set<string>>(new Set());

  function onHandClick(i: number) {
    if (blocked || !selectableIndices.has(i)) return;
    setSel(sel === i ? null : i);
  }

  function onAcknowledge() {
    if (state.pending.length === 0) return;
    setPendingRemove(new Set(state.pending.map(targetKey)));
    window.setTimeout(() => {
      setPendingRemove(new Set());
      act({ type: "acknowledge", player: 0 });
      setSel(null);
    }, 320);
  }

  function onCardClick(target: TargetRef) {
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
  }

  function onPlaceholderClick(caravanIndex: number) {
    if (sel === null) return;
    const card = humanPlayer.hand[sel];
    if (!card) return;
    const isValue = card.rank !== "J" && card.rank !== "Q" && card.rank !== "K" && card.rank !== "JOKER";
    const ci = caravanIndex as 0 | 1 | 2;
    if (isValue && legalCaravans.includes(ci)) {
      act({ type: "playValue", player: 0, caravan: ci, handIndex: sel });
      setSel(null);
    }
  }

  function onDiscard() {
    if (sel === null) return;
    const d = legal.find((a) => a.type === "discard" && a.handIndex === sel);
    if (d) {
      act(d);
      setSel(null);
    }
  }

  return (
    <div className="board" onMouseLeave={() => setHoverTarget(null)}>
      <div className="playfield">
        <PlayerHand
          playerType="ai"
          player={aiPlayer}
          selectedHandIndex={null}
          selectableIndices={new Set()}
          onCardClick={noop}
        />

        <div className="caravans-row">
          {[0, 1, 2].map((ci) => {
            const aiCar = aiPlayer.caravans[ci];
            const huCar = humanPlayer.caravans[ci];
            const pairWinnerPlayer = pairWinner(state, ci as 0 | 1 | 2);

            return (
              <div className="caravan-col" key={ci}>
                <Caravan
                  playerType="ai"
                  caravan={aiCar}
                  caravanIndex={ci}
                  playerId={1}
                  highestSold={pairWinnerPlayer === 1}
                  selection={{
                    selectedHandIndex: null,
                    selectedCard: null,
                    legalCaravans: [],
                    targetSet,
                    jackRemovableSet,
                    pendingSet: pendingKeys,
                    pendingRemoveSet: pendingRemove,
                    canDiscard: false,
                  }}
                  hoverTarget={hoverTarget}
                  onCardClick={onCardClick}
                  onPlaceholderClick={noop}
                  onHoverTarget={setHoverTarget}
                  onAcknowledge={onAcknowledge}
                />

                <div className="caravan-col__divider">Caravan {ci + 1}</div>

                <Caravan
                  playerType="human"
                  caravan={huCar}
                  caravanIndex={ci}
                  playerId={0}
                  highestSold={pairWinnerPlayer === 0}
                  selection={{
                    selectedHandIndex: sel,
                    selectedCard: sel !== null ? humanPlayer.hand[sel] ?? null : null,
                    legalCaravans,
                    targetSet,
                    jackRemovableSet,
                    pendingSet: pendingKeys,
                    pendingRemoveSet: pendingRemove,
                    canDiscard,
                  }}
                  hoverTarget={hoverTarget}
                  onCardClick={onCardClick}
                  onPlaceholderClick={onPlaceholderClick}
                  onHoverTarget={setHoverTarget}
                  onAcknowledge={onAcknowledge}
                />
              </div>
            );
          })}
        </div>

        <PlayerHand
          playerType="human"
          player={humanPlayer}
          selectedHandIndex={sel}
          selectableIndices={selectableIndices}
          onCardClick={onHandClick}
        />
      </div>

      <Sidebar
        log={state.log}
        canDiscard={canDiscard}
        onDiscard={onDiscard}
        onNewGame={() => store.reset({ seed: Math.floor(Math.random() * 1e9) })}
      />
    </div>
  );
}
