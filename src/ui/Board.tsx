import { useState } from "react";
import type { ReactNode } from "react";
import { GameStore, isHumanTurn, handSelectable } from "../state/useGame";
import { Action, TargetRef } from "../game/types";
import { pairWinner } from "../game/scoring";
import { Caravan } from "./Caravan";
import { PlayerHand } from "./PlayerHand";

function targetKey(t: TargetRef): string {
  return `${t.player}-${t.caravan}-${t.cardIndex}`;
}

function decorateWho(text: string, keyBase: number): ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /AI's caravan|your caravan|\bYou\b|\bAI\b|AI's|\byour\b/g;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  let k = 0;
  while (m !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${keyBase}-${k++}`;
    if (t === "You") nodes.push(<span key={key} className="log__who log__who--human">You</span>);
    else if (t === "AI") nodes.push(<span key={key} className="log__who log__who--ai">AI</span>);
    else if (t === "your caravan") nodes.push(<span key={key} className="log__caravan log__caravan--human">your caravan</span>);
    else if (t === "AI's caravan") nodes.push(<span key={key} className="log__caravan log__caravan--ai">AI's caravan</span>);
    else if (t === "your") nodes.push(<span key={key} className="log__caravan log__caravan--human">your</span>);
    else if (t === "AI's") nodes.push(<span key={key} className="log__caravan log__caravan--ai">AI's</span>);
    last = re.lastIndex;
    m = re.exec(text);
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function decorateLog(text: string): ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  let k = 0;
  while (m !== null) {
    if (m.index > last) nodes.push(...decorateWho(text.slice(last, m.index), k));
    if (m[1] !== undefined) nodes.push(<span key={`s${k}`} className="log__sold">{m[1]}</span>);
    else nodes.push(<span key={`s${k}`} className="log__sellable">{m[2]}</span>);
    k += 1;
    last = re.lastIndex;
    m = re.exec(text);
  }
  if (last < text.length) nodes.push(...decorateWho(text.slice(last), k));
  return nodes;
}

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
  const jackRemovableSet = new Set(
    legal.filter((a): a is Extract<Action, { type: "removeJacked" }> => a.type === "removeJacked").map((a) => targetKey(a.target)),
  );

  const humanPlayer = state.players[0];
  const aiPlayer = state.players[1];

  const selectableIndices = new Set<number>();
  if (human) {
    for (let i = 0; i < humanPlayer.hand.length; i++) {
      if (handSelectable(state, legal, i)) selectableIndices.add(i);
    }
  }

  const [hoverTarget, setHoverTarget] = useState<TargetRef | null>(null);

  function onHandClick(i: number) {
    if (!selectableIndices.has(i)) return;
    setSel(sel === i ? null : i);
  }

  function onCardClick(target: TargetRef) {
    if (sel === null) return;
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
          onCardClick={() => {}}
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
                    canDiscard: false,
                  }}
                  hoverTarget={hoverTarget}
                  onCardClick={onCardClick}
                  onPlaceholderClick={() => {}}
                  onHoverTarget={setHoverTarget}
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
                    canDiscard,
                  }}
                  hoverTarget={hoverTarget}
                  onCardClick={onCardClick}
                  onPlaceholderClick={onPlaceholderClick}
                  onHoverTarget={setHoverTarget}
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

      <div className="sidebar">
        <div className="controls">
          <button type="button" className="btn" disabled={!canDiscard} onClick={onDiscard}>
            Discard
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => store.reset({ seed: Math.floor(Math.random() * 1e9) })}
          >
            New game
          </button>
        </div>
        <ol className="log">
          {state.log.slice(-12).map((entry) => (
            <li className="log__line" key={entry.id}>
              <span className="log__text">{decorateLog(entry.text)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
