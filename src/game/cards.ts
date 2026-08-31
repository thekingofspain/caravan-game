export * from "../model/cards";
import { makeCard as makeCardNew } from "../model/cards";
import type { Card } from "../model/types";
export function makeCard(suit: any, rank: any, deckId?: any): Card {
  if (typeof suit === "number" && typeof rank === "string") {
    return (makeCardNew as any)(suit, rank, deckId);
  }
  const rankNorm = rank === "JOKER" ? "Joker" : rank;
  if (rankNorm === "Joker" || rank === "JOKER") {
    const jokerType = suit === "hearts" ? "Red" : "Black";
    return (makeCardNew as any)(1, "Joker", jokerType);
  }
  return (makeCardNew as any)(1, rankNorm, suit);
}
export function jokerColor(card: any): string {
  if (card.jokerType) return card.jokerType === "Red" ? "red" : "black";
  return card.suit === "hearts" ? "red" : "black";
}
