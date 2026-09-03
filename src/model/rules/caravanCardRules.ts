import { baseValue, Caravan, CaravanRow, Card, type CaravanState } from "../types";

export const MIN_SELLABLE = 21;
export const MAX_SELLABLE = 26;

export function calculateCaravanRowValue(row: CaravanRow): number {
    if (row.length === 0) return 0;

    const kingCount = row.slice(1).filter((c) => c.rank === "K").length;

    return baseValue(row[0]) * Math.pow(2, kingCount);
}

export function calculateScore(caravan: Caravan): number {
    return caravan.rows.reduce((sum, row) => sum + calculateCaravanRowValue(row), 0);
}

export function isSellable(caravan: Caravan): boolean {
    const total = calculateScore(caravan);

    return total >= MIN_SELLABLE && total <= MAX_SELLABLE;
}

export function calculateCaravanState(caravan: Caravan): CaravanState {
    if (caravan.rows.length === 0) return { status: "unsellable", total: 0 };

    if (isSellable(caravan)) return { status: "sellable", total: calculateScore(caravan) };

    const total = calculateScore(caravan);

    if (total > MAX_SELLABLE) return { status: "busted", total };

    return { status: "unsellable", total };
}

export function canPlaceCard(card: Card, caravan: Caravan): boolean {
    if (caravan.rows.length === 0) return true;

    const prevRow = caravan.rows[caravan.rows.length - 1];
    const prev = prevRow[0];

    if (card.rank === prev.rank) return false;

    if (caravan.direction === null) return true;

    const cv = baseValue(card);
    const pv = baseValue(prev);
    const continues = caravan.direction === "asc" ? cv > pv : cv < pv;
    const matchesSuit = card.suit === prev.suit;

    return continues || matchesSuit;
}

export function isValidCardIndex(caravan: Caravan, cardIndex: number): boolean {
    return cardIndex >= 0 && cardIndex < caravan.rows.length;
}

export function hasJackAttached(row: CaravanRow): boolean {
    return row.slice(1).some((c) => c.rank === "J");
}
