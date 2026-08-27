import { useCallback, useMemo, useState } from "react";
import { GameStore, isHumanTurn, handSelectable } from "../state/useGame";
import { TargetRef } from "../game/types";
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
  const [pendingRemove, setPendingRemove] = useState<Set<string>>(new Set());

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

  return (
    <div className="board">
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
                  selection={aiSelection}
                  onCardClick={onCardClick}
                  onPlaceholderClick={noop}
                  onAcknowledge={onAcknowledge}
                />

                <div className="caravan-col__divider">Caravan {ci + 1}</div>

                <Caravan
                  playerType="human"
                  caravan={huCar}
                  caravanIndex={ci}
                  playerId={0}
                  highestSold={pairWinnerPlayer === 0}
                  selection={humanSelection}
                  onCardClick={onCardClick}
                  onPlaceholderClick={onPlaceholderClick}
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
        onNewGame={onNewGame}
      />
    </div>
  );
}
