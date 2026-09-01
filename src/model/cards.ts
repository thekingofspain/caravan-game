import { Card, JokerType, JOKER_TYPES, Nullable, Rank, Suit, SUITS, STANDARD_RANKS, SuitedRank, isJokerCard } from "./types";

function cardId(deckId: number, rank: Rank, suit: Nullable<Suit>, jokerType: Nullable<JokerType>): string {
  const prefix = `D${deckId}-`;
  if (jokerType != null) return `${prefix}${rank}${jokerType}`;
  const suffix = suit![0].toUpperCase();
  return `${prefix}${rank}${suffix}`;
}

// Strict overloads — deck, rank, then var param (suit | jokerType); every card belongs to a deck; joker has no suit
export function makeCard(deckId: number, rank: SuitedRank, suit: Suit): Card;
export function makeCard(deckId: number, rank: "Joker", jokerType: JokerType): Card;
export function makeCard(deckId: number, rank: Rank, x: Suit | JokerType): Card {
  if (rank === "Joker") {
    const jokerType = x as JokerType;
    const id = cardId(deckId, rank, null, jokerType) as Card["id"];
    return { id, suit: null, rank: "Joker", jokerType } as Card;
  } else {
    const suit = x as Suit;
    const id = cardId(deckId, rank, suit, null) as Card["id"];
    return { id, suit, rank: rank as SuitedRank } as Card;
  }
}
export function cardLabel(card: Card): string {
  if (isJokerCard(card)) return `${card.jokerType} Joker`;
  return `${card.rank} of ${card.suit}`;
}

export function buildDeck(deckId: number): Card[] {
  const out: Card[] = [];
  for (const r of STANDARD_RANKS.filter((r): r is SuitedRank => r !== "Joker")) for (const s of SUITS) out.push(makeCard(deckId, r, s));
  out.push(makeCard(deckId, "Joker", JOKER_TYPES[1]));
  out.push(makeCard(deckId, "Joker", JOKER_TYPES[0]));
  return out;
}
const RANK_CLASS: Record<Rank, string> = {
  A: "ace",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
  J: "jack",
  Q: "queen",
  K: "king",
  Joker: "joker",
};
export function cardClassName(base: string, card: Card): string {
  if (isJokerCard(card)) return [base, RANK_CLASS[card.rank], card.jokerType.toLowerCase()].join(" ");
  const classes = [base, RANK_CLASS[card.rank], card.suit!];
  return classes.join(" ");
}
