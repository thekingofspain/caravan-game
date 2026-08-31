import { memo } from "react";
import { Card } from "../model/types";
import { cardClassName } from "../model/cards";

interface CardViewProps {
  card: Card;
  className?: string;
}

export const CardView = memo(function CardView({ card, className }: CardViewProps) {
  return <div className={cardClassName(className ?? "card", card)} />;
});

export default CardView;
