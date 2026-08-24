import type { CSSProperties } from "react";
import { cardClassName } from "../game/cards";
import { isJacked, isJokered } from "../game/rules";
import { Card, Caravan as CaravanType, PlayerId, PlayerType, SelectionState, TargetRef } from "../game/types";

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
}: CaravanProps) {
  const isHuman = playerType === "human";
  const selectedCard = selection.selectedHandIndex !== null;

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

  function getCardClasses(pc: { card: Card; kingCount: number; attachments: Card[]; jokered?: boolean }, index: number): string {
    const key = targetKey({ player: playerId, caravan: caravanIdx, cardIndex: index });
    const isTarget = isHuman && selection.targetSet.has(key);
    const isJackedCard = isJacked(pc);
    const isJokeredCard = isJokered(pc);
    const classes = [cardClassName(pc.card)];
    if (isTarget) classes.push("is-target");
    if (isJackedCard) classes.push("is-jacked");
    if (isJokeredCard) classes.push("is-jokered");
    return classes.join(" ");
  }

  function getCardStyle(isHoverable: boolean): CSSProperties {
    return {
      pointerEvents: isHoverable ? "auto" : "none",
    } as CSSProperties;
  }

  function isCardHoverable(index: number): boolean {
    if (!selectedCard) return true;
    const firstCardIndex = caravan.cards.findIndex((pc) => !isJacked(pc) && !isJokered(pc));
    if (firstCardIndex === -1) return false;
    return index === firstCardIndex;
  }

  return (
    <div className={`caravan ${isHuman ? "caravan--human" : "caravan--ai"}`}>
      {caravan.cards.map((pc, k) => {
        const isHoverable = isCardHoverable(k);
        return (
          <button
            key={pc.card.id}
            type="button"
            className={getCardClasses(pc, k)}
            data-index={k}
            style={getCardStyle(isHoverable)}
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
              <div
                key={a.id}
                className={cardClassName(a)}
                style={{ "--c": j + 1 } as CSSProperties}
              />
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
