import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { GameStore, isHumanTurn, handSelectable } from "../state/useGame";
import { Action, TargetRef } from "../game/types";
import { pairWinner } from "../game/scoring";
import { caravanTotal, isInRange, isJacked, isJokered } from "../game/rules";
import { isValueCard } from "../game/types";
import { CardView, PlacedCardView } from "./CardView";

function dirArrow(dir: "asc" | "desc" | null): string {
  if (dir === "asc") return "▲";
  if (dir === "desc") return "▼";
  return "";
}

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
  const jackRemovableSet = new Set(
    legal.filter((a): a is Extract<Action, { type: "removeJacked" }> => a.type === "removeJacked").map((a) => targetKey(a.target)),
  );

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

  function handleHumanStackClick(e: React.MouseEvent, ci: number, idx: number | null) {
    if (sel === null) {
      if (idx !== null && human && jackRemovableSet.has(targetKey({ player: 0, caravan: ci as 0 | 1 | 2, cardIndex: idx }))) {
        e.stopPropagation();
        act({ type: "removeJacked", player: 0, target: { player: 0, caravan: ci as 0 | 1 | 2, cardIndex: idx } });
      }
      return;
    }
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

  function onRemoveJacked(e: React.MouseEvent, player: 0 | 1, ci: number, idx: number) {
    e.stopPropagation();
    e.preventDefault();
    const key = targetKey({ player, caravan: ci as 0 | 1 | 2, cardIndex: idx });
    if (human && jackRemovableSet.has(key)) {
      act({ type: "removeJacked", player: 0, target: { player, caravan: ci as 0 | 1 | 2, cardIndex: idx } });
    }
  }

  const humanPlayer = state.players[0];
  const aiPlayer = state.players[1];

  const [hoverTarget, setHoverTarget] = useState<TargetRef | null>(null);
  const selectedCard = sel !== null ? humanPlayer.hand[sel] : null;
  const hoverImpactedSet = (() => {
    if (sel === null || !selectedCard || !hoverTarget) return new Set<string>();
    const key = targetKey(hoverTarget);
    if (!targetSet.has(key)) return new Set<string>();
    // Jack / Joker / King / Queen hover same as King: single target only (no multi-highlight)
    return new Set<string>([key]);
  })();

  return (
    <div className="board" onMouseLeave={() => setHoverTarget(null)}>
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
                <div className="caravan-col__main">
                  <div className="caravan-col__stack caravan-col__stack--ai" style={{ "--count": aiCar.cards.length } as CSSProperties}>
                    <div className={`caravan-col__score caravan-col__score--ai caravan-col__score--in-stack ${aiInRange && aiWinner ? "is-valid" : ""}`}>
                      {aiTotal}
                      {aiCar.direction ? (
                        <span className="caravan-col__dir" aria-hidden="true">
                          {dirArrow(aiCar.direction)}
                        </span>
                      ) : null}
                    </div>
                    {aiCar.cards.map((pc, k) => {
                      const reversedK = aiCar.cards.length - 1 - k;
                      const jacked = isJacked(pc);
                      const jokered = isJokered(pc);
                      const key = targetKey({ player: 1, caravan: ci as 0 | 1 | 2, cardIndex: k });
                      const removable = human && jackRemovableSet.has(key);
                      const isImpacted = hoverImpactedSet.has(key);
                      const isTarget = human && targetSet.has(key);
                      const isTopForValueHover = selectedCard ? !isValueCard(selectedCard) || k === 0 : true;
                      return (
                        <div className={`caravan__row ${jacked ? "is-jacked" : ""} ${jokered ? "is-jokered" : ""} ${isImpacted ? "is-impacted" : ""} ${isTarget ? "is-target" : ""}`} key={pc.card.id} style={{ "--i": reversedK } as CSSProperties}>
                          <div
                            role="button"
                            tabIndex={0}
                            className={`placed-wrap ${jacked ? "is-jacked" : ""} ${jokered ? "is-jokered" : ""} ${isImpacted ? "is-impacted" : ""} ${isTarget ? "is-target" : ""}`}
                            data-placed=""
                            data-player={1}
                            data-caravan={ci}
                            data-index={k}
                            onMouseEnter={() => { if (isTopForValueHover) setHoverTarget({ player: 1, caravan: ci as 0 | 1 | 2, cardIndex: k }); }}
                            onMouseLeave={() => setHoverTarget(null)}
                            style={isTopForValueHover ? undefined : ({ pointerEvents: "none" } as CSSProperties)}
                            onClick={(e) => {
                              if (removable && sel === null) {
                                onRemoveJacked(e as unknown as React.MouseEvent, 1, ci, k);
                                return;
                              }
                              onAiPlacedClick(e as unknown as React.MouseEvent, ci, k);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                if (removable && sel === null) {
                                  onRemoveJacked(e as unknown as React.MouseEvent, 1, ci, k);
                                  return;
                                }
                                onAiPlacedClick(e as unknown as React.MouseEvent, ci, k);
                              }
                            }}
                          >
                            <PlacedCardView placed={pc} />
                          </div>
                        {(() => {
                          const lastKingIndex = pc.attachments.reduce((last, c, i) => (c.rank === "K" ? i : last), -1);
                          const jackIdx = pc.attachments.findIndex((c) => c.rank === "J");
                          const kingBadge = pc.kingCount > 0 ? `×${Math.pow(2, pc.kingCount)}` : "";
                          return pc.attachments.map((a, j) => (
                            <div key={a.id} className="placed-face" style={{ "--c": j + 1 } as CSSProperties}>
                              <CardView card={a} />
                              {j === lastKingIndex && kingBadge && <span className="card__badge card__badge--king">{kingBadge}</span>}
                              {jacked && j === jackIdx && removable && (
                                <button type="button" className="jack-remove" aria-label={`Remove jacked card ${pc.card.rank} of ${pc.card.suit}`} onClick={(e) => onRemoveJacked(e, 1, ci, k)}>
                                  ×
                                </button>
                              )}
                              {a.rank === "JOKER" && (
                                <button type="button" className="jack-remove" aria-label={`Remove joker ${a.rank}`} onClick={(e) => onRemoveJacked(e, 1, ci, k)}>
                                  ×
                                </button>
                              )}
                            </div>
                          ));
                        })()}
                      </div>
                    );
                  })}
                  {aiCar.cards.length === 0 && <div className="caravan__placeholder" />}
                </div>

                <div className="caravan-col__divider">Caravan {ci + 1}</div>

                  <div
                  role="button"
                  tabIndex={0}
                  className={`caravan-col__stack caravan-col__stack--human ${huSelectable ? "is-selectable" : ""}`}
                  style={{ "--count": huCar.cards.length } as CSSProperties}
                    aria-label={`Your caravan ${ci + 1}`}
                    onClick={(e) => {
                      const wrap = (e.target as HTMLElement).closest(".placed-wrap");
                      const idx = wrap ? Number(wrap.getAttribute("data-index")) : null;
                      handleHumanStackClick(e, ci, idx);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        const wrap = (e.target as HTMLElement).closest(".placed-wrap");
                        const idx = wrap ? Number(wrap.getAttribute("data-index")) : null;
                        handleHumanStackClick(e as unknown as React.MouseEvent, ci, idx);
                      }
                    }}
                  >
                    <div className={`caravan-col__score caravan-col__score--human caravan-col__score--in-stack ${huInRange && huWinner ? "is-valid" : ""}`}>
                      {huTotal}
                      {huCar.direction ? (
                        <span className="caravan-col__dir" aria-hidden="true">
                          {dirArrow(huCar.direction)}
                        </span>
                      ) : null}
                    </div>
                    {huCar.cards.map((pc, k) => {
                      const isTarget = human && targetSet.has(targetKey({ player: 0, caravan: ci as 0 | 1 | 2, cardIndex: k }));
                      const jacked = isJacked(pc);
                      const jokered = isJokered(pc);
                      const key = targetKey({ player: 0, caravan: ci as 0 | 1 | 2, cardIndex: k });
                      const removable = human && jackRemovableSet.has(key);
                      const isImpacted = hoverImpactedSet.has(key);
                      const isTopForValueHover = selectedCard ? !isValueCard(selectedCard) || k === huCar.cards.length - 1 : true;
                      return (
                        <div className={`caravan__row ${jacked ? "is-jacked" : ""} ${jokered ? "is-jokered" : ""} ${isImpacted ? "is-impacted" : ""} ${isTarget ? "is-target" : ""}`} key={pc.card.id} style={{ "--i": k } as CSSProperties}>
                          <div
                            className={`placed-wrap ${isTarget ? "is-target" : ""} ${jacked ? "is-jacked" : ""} ${isImpacted ? "is-impacted" : ""}`}
                            data-placed=""
                            data-player={0}
                            data-caravan={ci}
                            data-index={k}
                            onMouseEnter={() => { if (isTopForValueHover) setHoverTarget({ player: 0, caravan: ci as 0 | 1 | 2, cardIndex: k }); }}
                            onMouseLeave={() => setHoverTarget(null)}
                            style={isTopForValueHover ? undefined : ({ pointerEvents: "none" } as CSSProperties)}
                          >
                            <PlacedCardView placed={pc} />
                          </div>
                        {(() => {
                          const lastKingIndex = pc.attachments.reduce((last, c, i) => (c.rank === "K" ? i : last), -1);
                          const jackIdx = pc.attachments.findIndex((c) => c.rank === "J");
                          const kingBadge = pc.kingCount > 0 ? `×${Math.pow(2, pc.kingCount)}` : "";
                          return pc.attachments.map((a, j) => (
                            <div key={a.id} className="placed-face" style={{ "--c": j + 1 } as CSSProperties}>
                              <CardView card={a} />
                              {j === lastKingIndex && kingBadge && <span className="card__badge card__badge--king">{kingBadge}</span>}
                              {jacked && j === jackIdx && removable && (
                                <button type="button" className="jack-remove" aria-label={`Remove jacked card ${pc.card.rank} of ${pc.card.suit}`} onClick={(e) => onRemoveJacked(e, 0, ci, k)}>
                                  ×
                                </button>
                              )}
                              {a.rank === "JOKER" && (
                                <button type="button" className="jack-remove" aria-label={`Remove joker ${a.rank}`} onClick={(e) => onRemoveJacked(e, 0, ci, k)}>
                                  ×
                                </button>
                              )}
                            </div>
                          ));
                        })()}
                      </div>
                    );
                  })}
                  {huCar.cards.length === 0 && (
                      <div className={`caravan__placeholder ${huSelectable ? "is-selectable" : ""}`} />
                    )}
                  </div>
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
