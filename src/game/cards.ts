import { Card, Rank, Suit } from "./types";

interface DeckSpecEntry {
  suit: Suit;
  rank: Rank;
  count: number;
}

let idCounter = 0;
function nextId(suit: Suit | "joker", rank: Rank): string {
  idCounter += 1;
  return `${suit}-${rank}-${idCounter}`;
}

export function makeCard(suit: Suit | "joker", rank: Rank): Card {
  return { id: nextId(suit, rank), suit, rank };
}

function expand(spec: DeckSpecEntry[]): Card[] {
  const out: Card[] = [];
  for (const e of spec) {
    for (let i = 0; i < e.count; i++) out.push(makeCard(e.suit, e.rank));
  }
  return out;
}

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];

function fullSuit(rank: Rank, count: number): DeckSpecEntry[] {
  return SUITS.map((s) => ({ suit: s, rank, count }));
}

export interface PresetDeck {
  id: string;
  name: string;
  description: string;
  build: () => Card[];
}

export const PRESET_DECKS: PresetDeck[] = [
  {
    id: "wanderer",
    name: "Wanderer",
    description: "6–10 plus Kings (fast 26s).",
    build: () =>
      expand([
        ...(["6", "7", "8", "9", "10"] as Rank[]).flatMap((r) =>
          SUITS.map((s) => ({ suit: s, rank: r, count: 1 })),
        ),
        ...fullSuit("K", 1),
        { suit: "spades", rank: "JOKER", count: 1 },
      ]),
  },
  {
    id: "gambler",
    name: "Gambler",
    description: "7–10 plus face disruption.",
    build: () =>
      expand([
        ...(["7", "8", "9", "10"] as Rank[]).flatMap((r) =>
          SUITS.map((s) => ({ suit: s, rank: r, count: 1 })),
        ),
        ...(["J", "Q", "K"] as Rank[]).flatMap((r) =>
          SUITS.map((s) => ({ suit: s, rank: r, count: 1 })),
        ),
        { suit: "spades", rank: "JOKER", count: 1 },
      ]),
  },
  {
    id: "default",
    name: "Courier",
    description: "Full deck, one of every card.",
    build: () =>
      expand([
        ...(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as Rank[]).flatMap((r) =>
          SUITS.map((s) => ({ suit: s, rank: r, count: 1 })),
        ),
        { suit: "spades", rank: "JOKER", count: 1 },
        { suit: "hearts", rank: "JOKER", count: 1 },
      ]),
  },
];

export function getPreset(id: string): PresetDeck {
  return PRESET_DECKS.find((d) => d.id === id) ?? PRESET_DECKS[0];
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
  if (card.rank === "JOKER") return "card card--joker card--red";
  return `card card--${card.suit} card--${RANK_CLASS[card.rank]}`;
}
