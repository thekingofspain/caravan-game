import { cardNameText, cx } from "../../model/cards";
import { Card } from "../../model/types";

export function CardName({ card }: { card: Card }) {
    const cardColorAndSuitClass = card.jokerType != null ? card.jokerType.toLowerCase() : card.suit;
    const name = cardNameText(card);

    return <span className={cx("card-name", cardColorAndSuitClass)}>{name}</span>;
}
