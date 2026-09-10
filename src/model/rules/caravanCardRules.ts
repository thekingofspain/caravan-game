import { baseValue, Caravan, ValueCard } from "../types";

export function canPlaceCard(card: ValueCard, caravan: Caravan): boolean {
    if (caravan.rows.length === 0) return true;

    const prevRow = caravan.rows[caravan.rows.length - 1];
    const prev = prevRow[0];

    if (card.rank === prev.rank) return false;

    if (caravan.direction === null) return true;

    const cv = baseValue(card);
    const pv = baseValue(prev);
    const continues = caravan.direction === "asc" ? cv > pv : cv < pv;

    // Either the previous head's suit or a queen-imposed caravan suit counts.

    const matchesSuit = card.suit === prev.suit || card.suit === caravan.suit;

    return continues || matchesSuit;
}

export function isValidCardIndex(caravan: Caravan, cardIndex: number): boolean {
    return cardIndex >= 0 && cardIndex < caravan.rows.length;
}
