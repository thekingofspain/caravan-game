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

const SIDE_ICON = { human: "👤", ai: "🤖" } as const;

function decorateWho(text: string, keyBase: string): ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(?:row (\d+) of )?(AI's|your) caravan (\d+)|\bYou\b|\bAI\b|AI's|\byour\b/g;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  let k = 0;
  while (m !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyBase}-${k++}`;
    if (m[2] !== undefined) {
      const side = m[2] === "AI's" ? "ai" : "human";
      const ref = `@${m[3]}${m[1] ? `-${m[1]}` : ""}`;
      nodes.push(
        <span
          key={key}
          className={`log__who log__who--${side}`}
          title={side === "ai" ? "AI" : "You"}
        >
          <span className="log__icon">{SIDE_ICON[side]}</span>
          <span className="log__caravan">
            🐎<span className="log__who-ref">{ref}</span>
          </span>
        </span>,
      );
    } else {
      const side = m[0].startsWith("AI") ? "ai" : "human";
      nodes.push(
        <span
          key={key}
          className={`log__who log__who--${side}`}
          title={side === "ai" ? "AI" : "You"}
        >
          {SIDE_ICON[side]}
        </span>,
      );
    }
    last = re.lastIndex;
    m = re.exec(text);
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function decorateCardTokens(text: string, keyBase: string | number): ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\{([^{}]+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  let k = 0;
  while (m !== null) {
    if (m.index > last) nodes.push(...decorateLog(text.slice(last, m.index), `${keyBase}-${k++}`));
    const red = /♥|♦|Red/.test(m[1]);
    let cls = "log__card--black";
    if (red && !/♦/.test(m[1])) cls = "log__card--red";
    else if (/♦/.test(m[1])) cls = "log__card--diamonds";
    else if (/♣/.test(m[1])) cls = "log__card--clubs";
    nodes.push(
      <span key={`c${keyBase}-${k++}`} className={`log__card ${cls}`}>
        {m[1]}
      </span>,
    );
    last = re.lastIndex;
    m = re.exec(text);
  }
  if (last < text.length) nodes.push(...decorateLog(text.slice(last), `${keyBase}-${k++}`));
  return nodes;
}

function decorateLog(text: string, keyBase: string | number = 0): ReactNode[] {
  if (text.includes("{")) return decorateCardTokens(text, keyBase);
  const nodes: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  let k = 0;
  while (m !== null) {
    if (m.index > last) nodes.push(...decorateWho(text.slice(last, m.index), `${keyBase}w${k}`));
    if (m[1] !== undefined) nodes.push(<span key={`${keyBase}s${k}`} className="log__sold">{m[1]}</span>);
    else nodes.push(<span key={`${keyBase}s${k}`} className="log__sellable">{m[2]}</span>);
    k += 1;
    last = re.lastIndex;
    m = re.exec(text);
  }
  if (last < text.length) nodes.push(...decorateWho(text.slice(last), `${keyBase}w${k}`));
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
              <span className="log__text">
                {decorateLog(entry.text)}
                {entry.detail && entry.detail.length > 0 && (
                  <ul className="log__bullets">
                    {entry.detail.map((d, i) => (
                      <li key={`${entry.id}-${i}`}>{decorateLog(d, `${entry.id}-${i}`)}</li>
                    ))}
                  </ul>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
