import { Card, isJokerCard, SUIT_SYMBOL } from "../../model/types";

export function CardName({ card }: { card: Card }) {
    const suitClass = isJokerCard(card) ? card.jokerType.toLowerCase() : card.suit;
    const name = isJokerCard(card)
        ? `${card.jokerType} Joker`
        : `${card.rank}${SUIT_SYMBOL[card.suit]}`;

    return <span className={`card-name ${suitClass}`}>{name}</span>;
}
