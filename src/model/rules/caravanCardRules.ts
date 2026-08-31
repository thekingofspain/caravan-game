import { baseValue, Caravan, Card, type CaravanState } from "../types";

export const MIN_SELLABLE = 21;
export const MAX_SELLABLE = 26;

export function calculateCaravanRowValue(row: any): number {
  if (!row || row.length === 0) return 0;
  if (Array.isArray(row)) {
    const kingCount = row.slice(1).filter((c: any) => c.rank === "K").length;
    return baseValue(row[0]) * Math.pow(2, kingCount);
  }
  // old PlacedCard
  if (row.attachments && row.attachments.some((c: any) => c.rank === "J")) return 0;
  return baseValue(row.card) * Math.pow(2, row.kingCount || 0);
}

export function calculateScore(caravan: Caravan): number {
  const rows = (caravan as any).rows ?? (caravan as any).cards;
  if (!rows) return 0;
  return rows.reduce((sum: number, row: any) => sum + calculateCaravanRowValue(row), 0);
}

export function isSellable(caravan: Caravan): boolean {
  const total = calculateScore(caravan);
  return total >= MIN_SELLABLE && total <= MAX_SELLABLE;
}

export function calculateCaravanState(caravan: Caravan): CaravanState {
  const rows = (caravan as any).rows ?? (caravan as any).cards;
  if (!rows || rows.length === 0) return { status: "empty" };
  if (isSellable(caravan)) return { status: "sellable", total: calculateScore(caravan) };
  const total = calculateScore(caravan);
  if (total > MAX_SELLABLE) return { status: "busted", total };
  return { status: "unsellable", total };
}

export function canPlaceCard(card: Card, caravan: Caravan): boolean {
  const rows = (caravan as any).rows ?? (caravan as any).cards;
  if (!rows || rows.length === 0) return true;
  const prevRow = rows[rows.length - 1];
  const prev = Array.isArray(prevRow) ? prevRow[0] : (prevRow as any).card;
  if (!prev) return true;
  if (card.rank === prev.rank) return false;
  if (caravan.direction === null) return true;
  const cv = baseValue(card);
  const pv = baseValue(prev);
  const continues = caravan.direction === "asc" ? cv > pv : cv < pv;
  const matchesSuit = card.suit === prev.suit;
  return continues || matchesSuit;
}

export function isValidCardIndex(caravan: Caravan, cardIndex: number): boolean {
  const rows = (caravan as any).rows ?? (caravan as any).cards;
  return !!caravan && cardIndex >= 0 && cardIndex < (rows?.length ?? 0);
}

export function hasJackAttached(row: any): boolean {
  if (Array.isArray(row)) return row.slice(1).some((c: any) => c.rank === "J");
  return row.attachments && row.attachments.some((c: any) => c.rank === "J");
}
