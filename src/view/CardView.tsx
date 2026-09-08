import { memo } from "react";

import { cardClassName } from "../model/cards";
import { Card } from "../model/types";

interface CardViewProps {
    card: Card;
    className?: string;
}

export const CardView = memo(function CardView({ card, className }: CardViewProps) {
    return <div className={cardClassName(className ?? "card", card)} />;
});
