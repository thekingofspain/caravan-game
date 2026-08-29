import { memo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cardClassName } from "../game/cards";
import { caravanTotal, isInRange, isJacked } from "../game/rules";
import { Card, Caravan as CaravanType, Human, PlayerId, SelectionState, TargetRef } from "../game/types";

interface CaravanProps {
  caravan: CaravanType;
  caravanIndex: number;
  playerId: PlayerId;
  highestSold: boolean;
  selection: SelectionState;
  onCardClick: (target: TargetRef) => void;
  onPlaceholderClick: (caravanIndex: number) => void;
  onAcknowledge: () => void;
  children?: ReactNode;
}

function targetKey(t: TargetRef): string {
  return `${t.player}-${t.caravan}-${t.cardIndex}`;
}

function CaravanImpl({
  caravan,
  caravanIndex,
  playerId,
  selection,
  onCardClick,
  onPlaceholderClick,
  onAcknowledge,
  children,
}: CaravanProps) {
  const isHuman = playerId === Human;

  const caravanHasJacked = caravan.cards.some(isJacked);

  const caravanIdx = caravanIndex as 0 | 1 | 2;

  function handleCardClick(e: React.MouseEvent) {
    const wrap = (e.target as HTMLElement).closest("[data-index]");
    if (!wrap) return;
    const cardIndex = Number(wrap.getAttribute("data-index"));
    onCardClick({ player: playerId, caravan: caravanIdx, cardIndex });
  }

  function handleCardKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const wrap = (e.target as HTMLElement).closest("[data-index]");
      if (!wrap) return;
      const cardIndex = Number(wrap.getAttribute("data-index"));
      onCardClick({ player: playerId, caravan: caravanIdx, cardIndex });
    }
  }

  function getCardClasses(pc: { card: Card; kingCount: number; attachments: Card[] }, index: number): string {
    const key = targetKey({ player: playerId, caravan: caravanIdx, cardIndex: index });
    const isTarget = selection.targetSet.has(key);
    const isJackedCard = isJacked(pc);
    const classes = [cardClassName(pc.card)];
    if (isTarget) classes.push("is-target");
    if (isJackedCard) classes.push("is-jacked");
    if (selection.pendingSet?.has(key)) classes.push("is-pending");
    if (selection.pendingRemoveSet?.has(key)) classes.push("is-pending-remove");
    return classes.join(" ");
  }

  function getCardStyle(index: number): CSSProperties {
    return {
      zIndex: index + 1,
    } as CSSProperties;
  }

  return (
    <div
      className={`caravan ${isHuman ? "caravan--human" : "caravan--ai"} ${caravanHasJacked ? "has-jacked" : ""} ${isHuman && selection.legalCaravans.includes(caravanIndex) ? "is-selectable" : ""}`}
    >
      {children}
      {caravan.cards.map((pc, k) => {
        const jackedCard = isJacked(pc);
        const removable = selection.jackRemovableSet.has(targetKey({ player: playerId, caravan: caravanIdx, cardIndex: k }));
        const lastKingIndex = pc.attachments.reduce((last, c, i) => (c.rank === "K" ? i : last), -1);
        const jackIdx = pc.attachments.findIndex((c) => c.rank === "J");
        const kingBadge = pc.kingCount > 0 ? `×${Math.pow(2, pc.kingCount)}` : "";
        return (
          <button
            key={pc.card.id}
            type="button"
            className={getCardClasses(pc, k)}
            data-index={k}
            style={getCardStyle(k)}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
          >
            {pc.attachments.map((a, j) => (
              <div
                key={a.id}
                className={`${cardClassName(a)}${a.rank === "J" || a.rank === "JOKER" ? " is-remove-src" : ""}`}
                style={{ "--c": j + 1 } as CSSProperties}
              >
                {j === lastKingIndex && kingBadge && <span className="card__badge card__badge--king">{kingBadge}</span>}
                {jackedCard && j === jackIdx && removable && (
                  <span
                    role="button"
                    className="jack-remove"
                    tabIndex={0}
                    aria-label={`Acknowledge and remove card ${pc.card.rank} of ${pc.card.suit}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcknowledge();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onAcknowledge();
                      }
                    }}
                  >
                    ×
                  </span>
                )}
                {a.rank === "JOKER" && removable && (
                  <span
                    role="button"
                    className="jack-remove"
                    tabIndex={0}
                    aria-label={`Acknowledge and remove joker ${a.rank}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcknowledge();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onAcknowledge();
                      }
                    }}
                  >
                    ×
                  </span>
                )}
              </div>
            ))}
          </button>
        );
      })}
      {caravan.cards.length === 0 ? (
        <button
          type="button"
          className={`caravan__empty ${selection.legalCaravans.includes(caravanIndex) ? "is-selectable" : ""}`}
          onClick={() => onPlaceholderClick(caravanIndex)}
        />
      ) : null}
    </div>
  );
}

export function CaravanScore({
  caravan,
  highestSold,
}: {
  caravan: CaravanType;
  highestSold: boolean;
}) {
  const total = caravanTotal(caravan);
  const inRange = isInRange(total);
  return (
    <div className="caravan-col__score" aria-hidden="true">
      <span className="caravan-col__total">
        {inRange ? <span className={`caravan-col__dollar ${highestSold ? "is-highest" : ""}`}>$</span> : null}
        {total}
      </span>
    </div>
  );
}

export const Caravan = memo(CaravanImpl);
