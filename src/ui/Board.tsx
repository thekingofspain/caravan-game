import { useState } from "react";
import type { CSSProperties } from "react";
import { GameStore, isHumanTurn, handSelectable } from "../state/useGame";
import { Action, PlayerId, TargetRef } from "../game/types";
import { pairWinner } from "../game/scoring";
import { caravanTotal, isInRange } from "../game/rules";
import { CardView, PlacedCardView } from "./CardView";

function targetKey(t: TargetRef): string {
  return `${t.player}-${t.caravan}-${t.cardIndex}`;
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

  function onPlacedClick(_e: React.MouseEvent, pid: PlayerId, ci: number, idx: number) {
    if (sel === null) return;
    if (targetSet.has(targetKey({ player: pid, caravan: ci as 0 | 1 | 2, cardIndex: idx }))) {
      act({ type: "playFace", player: 0, target: { player: pid, caravan: ci as 0 | 1 | 2, cardIndex: idx }, handIndex: sel });
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
                <div className="caravan-col__stack caravan-col__stack--ai">
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
                          onClick={(e) => onPlacedClick(e, 1, ci, k)}
                        >
                          <PlacedCardView placed={pc} />
                        </button>
                        {pc.attachments.map((a, j) => (
                          <CardView key={a.id} card={a} className="placed-face" style={{ "--c": j + 1 } as CSSProperties} />
                        ))}
                      </div>
                    );
                  })}
                  {aiCar.cards.length === 0 && <div className="caravan__placeholder" />}
                </div>

                <div className="caravan-col__divider-row">
                  <div className={`caravan-col__score ${aiInRange && aiWinner ? "is-valid" : ""}`}>
                    {aiTotal}
                  </div>
                  <div className="caravan-col__divider">Caravan {ci + 1}</div>
                  <div className={`caravan-col__score ${huInRange && huWinner ? "is-valid" : ""}`}>
                    {huTotal}
                  </div>
                </div>

                <button
                  type="button"
                  className={`caravan-col__stack caravan-col__stack--human ${huSelectable ? "is-selectable" : ""}`}
                  onClick={() => {
                    if (huSelectable && sel !== null) {
                      act({ type: "playValue", player: 0, caravan: ci as 0 | 1 | 2, handIndex: sel });
                      setSel(null);
                    }
                  }}
                >
                  {huCar.cards.map((pc, k) => {
                    const isTarget = human && targetSet.has(targetKey({ player: 0, caravan: ci as 0 | 1 | 2, cardIndex: k }));
                    return (
                      <div className="caravan__row" key={pc.card.id} style={{ "--i": k } as CSSProperties}>
                        <button
                          type="button"
                          className={`placed-wrap ${isTarget ? "is-target" : ""}`}
                          data-placed=""
                          data-player={0}
                          data-caravan={ci}
                          data-index={k}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlacedClick(e, 0, ci, k);
                          }}
                        >
                          <PlacedCardView placed={pc} />
                        </button>
                        {pc.attachments.map((a, j) => (
                          <CardView key={a.id} card={a} className="placed-face" style={{ "--c": j + 1 } as CSSProperties} />
                        ))}
                      </div>
                    );
                  })}
                  {huCar.cards.length === 0 && (
                    <div className={`caravan__placeholder ${huSelectable ? "is-selectable" : ""}`} />
                  )}
                </button>
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
              {entry.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
