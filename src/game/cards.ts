import { Card, Rank, Suit } from "./types";

let idCounter = 0;
function nextId(suit: Suit | "joker", rank: Rank): string {
  idCounter += 1;
  return `${suit}-${rank}-${idCounter}`;
}

export function makeCard(suit: Suit | "joker", rank: Rank): Card {
  return { id: nextId(suit, rank), suit, rank };
}

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

// Jokers are distinguished by suit proxy: spades = black joker, hearts = red joker.
export type JokerColor = "black" | "red";

export function jokerColor(card: Card): JokerColor {
  return card.suit === "hearts" ? "red" : "black";
}

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

export function cardLabel(card: Card): string {
  if (card.rank === "JOKER") return `${jokerColor(card) === "red" ? "Red" : "Black"} Joker`;
  return `${card.rank} of ${card.suit}`;
}

export function buildDeck(): Card[] {
  const out: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) out.push(makeCard(s, r));
  out.push(makeCard("spades", "JOKER"));
  out.push(makeCard("hearts", "JOKER"));
  return out;
}

const RANK_CLASS: Record<Rank, string> = {
  A: "ace",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  J: "jack",
  Q: "queen",
  K: "king",
  JOKER: "joker",
};

export function cardClassName(card: Card): string {
  if (card.rank === "JOKER") return `card card--joker card--${jokerColor(card)}`;
  return `card card--${card.suit} card--${RANK_CLASS[card.rank]}`;
}
