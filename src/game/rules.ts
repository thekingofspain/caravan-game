import { baseValue, Caravan, Card, GameState, PlacedCard, TargetRef } from "./types";

export function isJacked(p: PlacedCard): boolean {
  return p.attachments.some((c) => c.rank === "J");
}

export function isJokered(p: PlacedCard): boolean {
  return !!p.jokered;
}

export function placedValue(p: PlacedCard): number {
  if (isJacked(p) || isJokered(p)) return 0;
  return baseValue(p.card) * Math.pow(2, p.kingCount);
}

export function caravanTotal(c: Caravan): number {
  return c.cards.reduce((sum, p) => sum + placedValue(p), 0);
}

export function activeCards(c: Caravan): PlacedCard[] {
  return c.cards.filter((p) => !isJacked(p) && !isJokered(p));
}

export function isInRange(total: number): boolean {
  return total >= 21 && total <= 26;
}

export function canPlayValue(card: Card, caravan: Caravan): boolean {
  const actives = activeCards(caravan);
  if (actives.length === 0) return true;
  // over condition: a caravan that is already bust cannot receive more value cards
  // and a value card that would push the total over 26 is illegal
  const total = caravanTotal(caravan);
  if (total > 26) return false;
  if (total + baseValue(card) > 26) return false;
  const prev = actives[actives.length - 1];
  if (card.rank === prev.card.rank) return false;
  if (caravan.direction === null) return true;
  const cv = baseValue(card);
  const pv = baseValue(prev.card);
  const continues = caravan.direction === "asc" ? cv > pv : cv < pv;
  const matchesSuit = card.suit === prev.card.suit;
  return continues || matchesSuit;
}

export function isValidTarget(state: GameState, target: TargetRef): boolean {
  const car = state.players[target.player].caravans[target.caravan];
  return !!car && target.cardIndex >= 0 && target.cardIndex < car.cards.length;
}
