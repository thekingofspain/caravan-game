import { Card } from "../../model/types";
import { cardNameText } from "../../model/cards";

export function CardName({ card }: { card: Card }) {
    const cardColorAndSuitClass = card.jokerType != null ? card.jokerType.toLowerCase() : card.suit;
    const name = cardNameText(card);

    return <span className={`card-name ${cardColorAndSuitClass}`}>{name}</span>;
}
