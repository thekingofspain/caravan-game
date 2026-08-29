export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type NumberRank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";
export type FaceRank = "J" | "Q" | "K";
export type Rank = NumberRank | FaceRank | "JOKER";

export interface Card {
  id: string;
  suit: Suit | "joker";
  rank: Rank;
}

export interface PlacedCard {
  card: Card;
  kingCount: number;
  attachments: Card[];
}

export interface Caravan {
  cards: PlacedCard[];
  direction: "asc" | "desc" | null;
  suit: Suit | null;
}

export interface PlayerState {
  deck: Card[];
  hand: Card[];
  caravans: Caravan[];
  sales: number;
}
export const Human = 0 as const;
export const Ai = 1 as const;
export type PlayerId = typeof Human | typeof Ai;
export interface LogEntry {
  id: number;
  text: string;
  /** Sub-lines shown as bullets under the entry (e.g. cards removed by a Joker). */
  detail?: string[];
}

export interface GameState {
  players: [PlayerState, PlayerState];
  current: PlayerId;
  phase: "play" | "over";
  winner: PlayerId | null;
  log: LogEntry[];
  started: boolean;
  /** Cards slated for removal by the last move (e.g. a Joker / Jack). They stay
   *  on the board greyed until the affected player acknowledges (removes) them. */
  pending: TargetRef[];
}

export interface TargetRef {
  player: PlayerId;
  caravan: 0 | 1 | 2;
  cardIndex: number;
}

export type Action =
  | { type: "playValue"; player: PlayerId; caravan: 0 | 1 | 2; handIndex: number }
  | { type: "playFace"; player: PlayerId; target: TargetRef; handIndex: number }
  | { type: "discard"; player: PlayerId; handIndex: number }
  | { type: "disband"; player: PlayerId; caravan: 0 | 1 | 2 }
  | { type: "removeJacked"; player: PlayerId; target: TargetRef }
  | { type: "acknowledge"; player: PlayerId };

export function isValueCard(card: Card): boolean {
  return card.rank !== "J" && card.rank !== "Q" && card.rank !== "K" && card.rank !== "JOKER";
}

export function isFaceCard(card: Card): boolean {
  return card.rank === "J" || card.rank === "Q" || card.rank === "K";
}

export function isJoker(card: Card): boolean {
  return card.rank === "JOKER";
}

export function baseValue(card: Card): number {
  if (card.rank === "A") return 1;
  if (card.rank === "JOKER") return 0;
  const n = Number(card.rank);
  return Number.isNaN(n) ? 0 : n;
}

export interface SelectionState {
  selectedHandIndex: number | null;
  selectedCard: Card | null;
  legalCaravans: number[];
  targetSet: Set<string>;
  jackRemovableSet: Set<string>;
  pendingSet: Set<string>;
  pendingRemoveSet: Set<string>;
  canDiscard: boolean;
}
