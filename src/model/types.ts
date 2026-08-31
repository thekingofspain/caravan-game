export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Suit = typeof SUITS[number];

export const JOKER_TYPES = ["Red", "Black"] as const;
export type JokerType = typeof JOKER_TYPES[number];

export const STANDARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "Joker"] as const;
export type Rank = typeof STANDARD_RANKS[number] | "PLACEHOLDER";
export type SuitedRank = Exclude<Rank, "Joker" | "PLACEHOLDER">;

export type Nullable<T> = T | null;
export type Direction = "asc" | "desc";
export type GamePhase = "play" | "over";
export type ScoredStatus = "sellable" | "busted" | "unsellable";
export type EmptyStatus = "empty";

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

export type StandardCard = { id: string; rank: SuitedRank; suit: Suit; jokerType?: never; isPlaceholder?: never };
export type JokerCard = { id: string; rank: "Joker"; suit: null; jokerType: JokerType; isPlaceholder?: never };
export type PlaceholderCard = { id: string; rank: "PLACEHOLDER"; suit: null; jokerType?: never; isPlaceholder: true };
export type Card = StandardCard | JokerCard | PlaceholderCard;

export function isJokerCard(card: Card): card is JokerCard {
  return card.rank === "Joker" || (card as any).rank === "JOKER";
}
export function isStandardCard(card: Card): card is StandardCard {
  return card.rank !== "Joker" && (card as any).rank !== "JOKER" && card.rank !== "PLACEHOLDER";
}
export function isPlaceholderCard(card: Card): card is PlaceholderCard {
  return (card as PlaceholderCard).isPlaceholder === true;
}

export type CaravanRow = Card[];
// Invariant: row[0] is a value card (A,2-10), row[1..4] are face cards (J/Q/K/Joker), length 1..5.

export interface Caravan {
  rows: CaravanRow[];
  direction: Nullable<Direction>;
  suit: Nullable<Suit>;
}

type ScoredCaravanState = { status: ScoredStatus; total: number };
type EmptyCaravanState = { status: EmptyStatus };
export type CaravanState = ScoredCaravanState | EmptyCaravanState;
export interface GameConfig {
  seed?: number;
}
export type SetupOptions = GameConfig & { first?: PlayerId };
export interface PlayerState {
  deck: Card[];
  hand: Card[];
  caravans: Caravan[];
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
  detail?: string[];
}
export interface GameState {
  players: [PlayerState, PlayerState];
  current: PlayerId;
  phase: GamePhase;
  winner: Nullable<PlayerId>;
  log: LogEntry[];
  started: boolean;
}
export interface TargetRef {
  player: PlayerId;
  caravan: CaravanIndex;
  cardIndex: number;
}
interface PlayValueCardMove {
  type: "playValueCard";
  player: PlayerId;
  caravan: CaravanIndex;
  handIndex: number;
}
interface PlayFaceCardMove {
  type: "playFaceCard";
  player: PlayerId;
  target: TargetRef;
  handIndex: number;
}
interface DiscardCardMove {
  type: "discardCard";
  player: PlayerId;
  handIndex: number;
}
interface DismissCaravanMove {
  type: "dismissCaravan";
  player: PlayerId;
  caravan: CaravanIndex;
}
export type Move = PlayValueCardMove | PlayFaceCardMove | DiscardCardMove | DismissCaravanMove;
export type Action = Move;
export class IllegalMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IllegalMoveError";
  }
}
export class IllegalActionError extends IllegalMoveError {
  constructor(message: string) {
    super(message);
    this.name = "IllegalActionError";
  }
}
export function isValueCard(card: Card): boolean {
  if (isPlaceholderCard(card)) return false;
  return card.rank !== "J" && card.rank !== "Q" && card.rank !== "K" && card.rank !== "Joker" && (card as any).rank !== "JOKER";
}

export function isFaceCard(card: Card): boolean {
  if (isPlaceholderCard(card)) return false;
  return card.rank === "J" || card.rank === "Q" || card.rank === "K";
}

export const isJoker = isJokerCard;

export function baseValue(card: Card): number {
  if (isPlaceholderCard(card)) return 0;
  if (card.rank === "A") return 1;
  if (isJokerCard(card) || (card as any).rank === "JOKER") return 0;
  const n = Number(card.rank);
  return Number.isNaN(n) ? 0 : n;
}

export interface SelectionState {
  selectedHandIndex: Nullable<number>;
  selectedCard: Nullable<Card>;
  legalCaravans: number[];
  targetSet: Set<string>;
  pendingRemovalSet: Set<string>;
  greyedSet: Set<string>;
  removingSet: Set<string>;
  canDiscard: boolean;
}
