import { Card, SUIT_SYMBOL } from "../../model/types";

export function CardName({ card }: { card: Card }) {
    const cardColorAndSuitClass = card.jokerType != null ? card.jokerType.toLowerCase() : card.suit;
    const name = card.jokerType != null ? "Joker" : `${card.rank}${SUIT_SYMBOL[card.suit]}`;

    return <span className={`card-name ${cardColorAndSuitClass}`}>{name}</span>;
}
