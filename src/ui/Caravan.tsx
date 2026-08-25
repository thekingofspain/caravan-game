import type { CSSProperties, ReactNode } from "react";
import { cardClassName } from "../game/cards";
import { caravanTotal, isInRange, isJacked, isJokered } from "../game/rules";
import { Card, Caravan as CaravanType, PlayerId, PlayerType, SelectionState, TargetRef, isValueCard } from "../game/types";

interface CaravanProps {
  playerType: PlayerType;
  caravan: CaravanType;
  caravanIndex: number;
  playerId: PlayerId;
  selection: SelectionState;
  hoverTarget: TargetRef | null;
  onCardClick: (target: TargetRef) => void;
  onPlaceholderClick: (caravanIndex: number) => void;
  onHoverTarget: (target: TargetRef | null) => void;
  children?: ReactNode;
}

function targetKey(t: TargetRef): string {
  return `${t.player}-${t.caravan}-${t.cardIndex}`;
}

export function Caravan({
  playerType,
  caravan,
  caravanIndex,
  playerId,
  selection,
  onCardClick,
  onPlaceholderClick,
  onHoverTarget,
  children,
}: CaravanProps) {
  const isHuman = playerType === "human";
  const selectedCard = selection.selectedCard;

  const caravanIdx = caravanIndex as 0 | 1 | 2;
  const total = caravanTotal(caravan);
  const inRange = isInRange(total);

  function dirArrow(dir: "asc" | "desc" | null): string {
    if (dir === "asc") return "▲";
    if (dir === "desc") return "▼";
    return "";
  }

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

  function getCardClasses(pc: { card: Card; kingCount: number; attachments: Card[]; jokered?: boolean }, index: number): string {
    const key = targetKey({ player: playerId, caravan: caravanIdx, cardIndex: index });
    const isTarget = selection.targetSet.has(key);
    const isJackedCard = isJacked(pc);
    const isJokeredCard = isJokered(pc);
    const classes = [cardClassName(pc.card)];
    if (isTarget) classes.push("is-target");
    if (isJackedCard) classes.push("is-jacked");
    if (isJokeredCard) classes.push("is-jokered");
    return classes.join(" ");
  }

  function getCardStyle(index: number, isHoverable: boolean): CSSProperties {
    return {
      pointerEvents: isHoverable ? "auto" : "none",
      zIndex: index + 1,
    } as CSSProperties;
  }

  function isCardHoverable(index: number): boolean {
    if (!selectedCard) return true;
    // face cards can target any card
    if (!isValueCard(selectedCard)) return true;
    // value cards: only the topmost active card is a placement spot
    let lastActive = -1;
    for (let i = caravan.cards.length - 1; i >= 0; i--) {
      const pc = caravan.cards[i];
      if (!isJacked(pc) && !isJokered(pc)) {
        lastActive = i;
        break;
      }
    }
    return index === lastActive;
  }

  return (
    <div
      className={`caravan ${isHuman ? "caravan--human" : "caravan--ai"} ${isHuman && selection.legalCaravans.includes(caravanIndex) ? "is-selectable" : ""}`}
    >
      <div className={`caravan-col__score ${inRange ? "is-valid" : ""}`}>
        {total}
        {caravan.direction ? (
          <span className="caravan-col__dir" aria-hidden="true">
            {dirArrow(caravan.direction)}
          </span>
        ) : null}
      </div>
      {children}
      {caravan.cards.map((pc, k) => {
        const isHoverable = isCardHoverable(k);
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
            style={getCardStyle(k, isHoverable)}
            onMouseEnter={() => {
              if (isHoverable) {
                onHoverTarget({ player: playerId, caravan: caravanIdx, cardIndex: k });
              }
            }}
            onMouseLeave={() => onHoverTarget(null)}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
          >
            {pc.attachments.map((a, j) => (
              <div key={a.id} className={cardClassName(a)} style={{ "--c": j + 1 } as CSSProperties}>
                {j === lastKingIndex && kingBadge && <span className="card__badge card__badge--king">{kingBadge}</span>}
                {jackedCard && j === jackIdx && removable && (
                  <span
                    role="button"
                    className="jack-remove"
                    tabIndex={0}
                    aria-label={`Remove jacked card ${pc.card.rank} of ${pc.card.suit}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCardClick({ player: playerId, caravan: caravanIdx, cardIndex: k });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onCardClick({ player: playerId, caravan: caravanIdx, cardIndex: k });
                      }
                    }}
                  >
                    ×
                  </span>
                )}
                {a.rank === "JOKER" && (
                  <span
                    role="button"
                    className="jack-remove"
                    tabIndex={0}
                    aria-label={`Remove joker ${a.rank}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCardClick({ player: playerId, caravan: caravanIdx, cardIndex: k });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onCardClick({ player: playerId, caravan: caravanIdx, cardIndex: k });
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
      {caravan.cards.length === 0 && (
        <button
          type="button"
          className={`caravan__empty ${selection.legalCaravans.includes(caravanIndex) ? "is-selectable" : ""}`}
          onClick={() => onPlaceholderClick(caravanIndex)}
        />
      )}
    </div>
  );
}
