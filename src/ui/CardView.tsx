import type { CSSProperties } from "react";
import { Card, PlacedCard } from "../game/types";
import { cardClassName } from "../game/cards";

export function CardView({ card, className = "", style }: { card: Card; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`${cardClassName(card)} ${className}`.trim()}
      style={style}
      role="img"
      aria-label={`${card.rank}${card.suit === "joker" ? "" : " of " + card.suit}`}
    />
  );
}

export function PlacedCardView({ placed, className = "" }: { placed: PlacedCard; className?: string }) {
  const kingBadge = placed.kingCount > 0 ? `×${Math.pow(2, placed.kingCount)}` : "";
  return (
    <div className={`placed ${className}`.trim()}>
      <CardView card={placed.card} />
      {kingBadge && <span className="card__badge card__badge--king">{kingBadge}</span>}
    </div>
  );
}
