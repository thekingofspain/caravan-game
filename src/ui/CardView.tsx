import { memo } from "react";
import type { CSSProperties } from "react";
import { Card, PlacedCard } from "../game/types";
import { cardClassName, cardLabel } from "../game/cards";

function CardViewImpl({ card, className = "", style }: { card: Card; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`${cardClassName(card)} ${className}`.trim()}
      style={style}
      role="img"
      aria-label={cardLabel(card)}
    />
  );
}

export const CardView = memo(CardViewImpl);

function PlacedCardViewImpl({ placed, className = "" }: { placed: PlacedCard; className?: string }) {
  return (
    <div className={`placed ${className}`.trim()}>
      <CardView card={placed.card} />
    </div>
  );
}

export const PlacedCardView = memo(PlacedCardViewImpl);
