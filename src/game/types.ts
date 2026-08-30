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
export const PLAYERS = [Human, Ai] as const satisfies readonly PlayerId[];
export const CARAVAN_COUNT = 3 as const;
export type CaravanIndex = 0 | 1 | 2;
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
}

export interface TargetRef {
  player: PlayerId;
  caravan: CaravanIndex;
  cardIndex: number;
}

export type Action =
  | { type: "playValueCard"; player: PlayerId; caravan: CaravanIndex; handIndex: number }
  | { type: "playFaceCard"; player: PlayerId; target: TargetRef; handIndex: number }
  | { type: "discardCard"; player: PlayerId; handIndex: number }
  | { type: "dismissCaravan"; player: PlayerId; caravan: CaravanIndex };
export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalActionError";
  }
}

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
  pendingRemovalSet: Set<string>;
  greyedSet: Set<string>;
  removingSet: Set<string>;
  canDiscard: boolean;
}
