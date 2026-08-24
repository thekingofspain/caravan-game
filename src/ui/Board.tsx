import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { GameStore, isHumanTurn, handSelectable } from "../state/useGame";
import { Action, TargetRef } from "../game/types";
import { pairWinner } from "../game/scoring";
import { caravanTotal, isInRange } from "../game/rules";
import { isValueCard } from "../game/types";
import { CardView, PlacedCardView } from "./CardView";

function targetKey(t: TargetRef): string {
  return `${t.player}-${t.caravan}-${t.cardIndex}`;
}

function decorateLog(text: string): ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /AI's caravan|your caravan|\bYou\b|\bAI\b|AI's|\byour\b/g;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const t = m[0];
    if (t === "You") nodes.push(<span key={m.index} className="log__who log__who--human">You</span>);
    else if (t === "AI") nodes.push(<span key={m.index} className="log__who log__who--ai">AI</span>);
    else if (t === "your caravan") nodes.push(<span key={m.index} className="log__caravan log__caravan--human">your caravan</span>);
    else if (t === "AI's caravan") nodes.push(<span key={m.index} className="log__caravan log__caravan--ai">AI's caravan</span>);
    else if (t === "your") nodes.push(<span key={m.index} className="log__caravan log__caravan--human">your</span>);
    else if (t === "AI's") nodes.push(<span key={m.index} className="log__caravan log__caravan--ai">AI's</span>);
    last = re.lastIndex;
    m = re.exec(text);
  }
  if (last < text.length) nodes.push(text.slice(last));
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

  function selectable(i: number): boolean {
    return human && handSelectable(state, legal, i);
  }

  function onHandClick(i: number) {
    if (!selectable(i)) return;
    setSel(sel === i ? null : i);
  }

  function onAiPlacedClick(_e: React.MouseEvent, ci: number, idx: number) {
    if (sel === null) return;
    const card = humanPlayer.hand[sel];
    if (isValueCard(card)) return;
    if (targetSet.has(targetKey({ player: 1, caravan: ci as 0 | 1 | 2, cardIndex: idx }))) {
      act({ type: "playFace", player: 0, target: { player: 1, caravan: ci as 0 | 1 | 2, cardIndex: idx }, handIndex: sel });
      setSel(null);
    }
  }

  function handleHumanStackClick(_e: React.MouseEvent, ci: number, idx: number | null) {
    if (sel === null) return;
    const card = humanPlayer.hand[sel];
    if (isValueCard(card)) {
      const caravanLen = humanPlayer.caravans[ci].cards.length;
      const isTop = idx === null || idx === caravanLen - 1;
      if (legalCaravans.includes(ci as 0 | 1 | 2) && isTop) {
        act({ type: "playValue", player: 0, caravan: ci as 0 | 1 | 2, handIndex: sel });
        setSel(null);
      }
      return;
    }
    if (
      idx !== null &&
      targetSet.has(targetKey({ player: 0, caravan: ci as 0 | 1 | 2, cardIndex: idx }))
    ) {
      act({ type: "playFace", player: 0, target: { player: 0, caravan: ci as 0 | 1 | 2, cardIndex: idx }, handIndex: sel });
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

  const humanPlayer = state.players[0];
  const aiPlayer = state.players[1];

  return (
    <div className="board">
      <div className="playfield">
        <section className="hand-zone hand-zone--ai" aria-label={`AI hand, ${aiPlayer.hand.length} cards`}>
          <span className="hand-zone__label" aria-hidden="true">AI — {aiPlayer.deck.length} cards</span>
          <div className="hand-zone__cards">
            {aiPlayer.hand.map((card) => (
              <div key={card.id} className="hand__slot hand__slot--ai" aria-hidden="true">
                <div className="card card--back" />
              </div>
            ))}
          </div>
        </section>

        <div className="caravans-row">
          {[0, 1, 2].map((ci) => {
            const aiCar = aiPlayer.caravans[ci];
            const huCar = humanPlayer.caravans[ci];
            const aiTotal = caravanTotal(aiCar);
            const huTotal = caravanTotal(huCar);
            const aiInRange = isInRange(aiTotal);
            const huInRange = isInRange(huTotal);
            const aiWinner = pairWinner(state, ci as 0 | 1 | 2) === 1;
            const huWinner = pairWinner(state, ci as 0 | 1 | 2) === 0;
            const huSelectable = human && legalCaravans.includes(ci as 0 | 1 | 2);

            return (
              <div className="caravan-col" key={ci}>
                <div className="caravan-col__scores">
                  <div className={`caravan-col__score caravan-col__score--ai ${aiInRange && aiWinner ? "is-valid" : ""}`}>
                    {aiTotal}
                  </div>
                  <div className={`caravan-col__score caravan-col__score--human ${huInRange && huWinner ? "is-valid" : ""}`}>
                    {huTotal}
                  </div>
                </div>
                <div className="caravan-col__main">
                  <div className="caravan-col__stack caravan-col__stack--ai" style={{ "--count": aiCar.cards.length } as CSSProperties}>
                    {aiCar.cards.map((pc, k) => {
                      const reversedK = aiCar.cards.length - 1 - k;
                      return (
                        <div className="caravan__row" key={pc.card.id} style={{ "--i": reversedK } as CSSProperties}>
                          <button
                            type="button"
                            className="placed-wrap"
                            data-placed=""
                            data-player={1}
                            data-caravan={ci}
                            data-index={k}
                            onClick={(e) => onAiPlacedClick(e, ci, k)}
                          >
                            <PlacedCardView placed={pc} />
                          </button>
                        {(() => {
                          const lastKingIndex = pc.attachments.reduce((last, c, i) => (c.rank === "K" ? i : last), -1);
                          const kingBadge = pc.kingCount > 0 ? `×${Math.pow(2, pc.kingCount)}` : "";
                          return pc.attachments.map((a, j) => (
                            <div key={a.id} className="placed-face" style={{ "--c": j + 1 } as CSSProperties}>
                              <CardView card={a} />
                              {j === lastKingIndex && kingBadge && <span className="card__badge card__badge--king">{kingBadge}</span>}
                            </div>
                          ));
                        })()}
                      </div>
                    );
                  })}
                  {!state.started && aiCar.cards.length === 0 && <div className="caravan__placeholder" />}
                </div>

                <div className="caravan-col__divider">Caravan {ci + 1}</div>

                  <button
                  type="button"
                  className={`caravan-col__stack caravan-col__stack--human ${huSelectable ? "is-selectable" : ""}`}
                  style={{ "--count": huCar.cards.length } as CSSProperties}
                    aria-label={`Your caravan ${ci + 1}`}
                    onClick={(e) => {
                      const wrap = (e.target as HTMLElement).closest(".placed-wrap");
                      const idx = wrap ? Number(wrap.getAttribute("data-index")) : null;
                      handleHumanStackClick(e, ci, idx);
                    }}
                  >
                    {huCar.cards.map((pc, k) => {
                      const isTarget = human && targetSet.has(targetKey({ player: 0, caravan: ci as 0 | 1 | 2, cardIndex: k }));
                      return (
                        <div className="caravan__row" key={pc.card.id} style={{ "--i": k } as CSSProperties}>
                          <div
                            className={`placed-wrap ${isTarget ? "is-target" : ""}`}
                            data-placed=""
                            data-player={0}
                            data-caravan={ci}
                            data-index={k}
                          >
                            <PlacedCardView placed={pc} />
                          </div>
                        {(() => {
                          const lastKingIndex = pc.attachments.reduce((last, c, i) => (c.rank === "K" ? i : last), -1);
                          const kingBadge = pc.kingCount > 0 ? `×${Math.pow(2, pc.kingCount)}` : "";
                          return pc.attachments.map((a, j) => (
                            <div key={a.id} className="placed-face" style={{ "--c": j + 1 } as CSSProperties}>
                              <CardView card={a} />
                              {j === lastKingIndex && kingBadge && <span className="card__badge card__badge--king">{kingBadge}</span>}
                            </div>
                          ));
                        })()}
                      </div>
                    );
                  })}
                  {!state.started && huCar.cards.length === 0 && (
                      <div className={`caravan__placeholder ${huSelectable ? "is-selectable" : ""}`} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <section className="hand-zone hand-zone--human" aria-label={`Your hand, ${humanPlayer.hand.length} cards`}>
          <span className="hand-zone__label" aria-hidden="true">You — {humanPlayer.deck.length} cards</span>
          <div className="hand-zone__cards">
            {humanPlayer.hand.map((card, i) => (
              <button
                type="button"
                className={`hand__slot ${selectable(i) ? "is-selectable" : ""} ${sel === i ? "is-selected" : ""}`}
                key={card.id}
                onClick={() => onHandClick(i)}
                aria-label={`${card.rank} of ${card.suit}${sel === i ? ", selected" : ""}${selectable(i) ? ", playable" : ""}`}
                aria-pressed={sel === i}
              >
                <CardView card={card} className={sel === i ? "is-selected" : ""} />
              </button>
            ))}
          </div>
        </section>
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
        <div className="log">
          {state.log.slice(-12).map((entry) => (
            <div className="log__line" key={entry.id}>
              {decorateLog(entry.text)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
