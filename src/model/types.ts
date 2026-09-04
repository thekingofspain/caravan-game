export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Suit = (typeof SUITS)[number];

export const JOKER_TYPES = ["Red", "Black"] as const;
export type JokerType = (typeof JOKER_TYPES)[number];

export const STANDARD_RANKS = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "Joker"
] as const;
export type Rank = (typeof STANDARD_RANKS)[number];
export type SuitedRank = Exclude<Rank, "Joker">;

export type Nullable<T> = T | null;
export type Direction = "asc" | "desc";
export type GamePhase = "play" | "over";
export type ScoredStatus = "sellable" | "busted" | "unsellable";

export const SUIT_SYMBOL: Record<Suit, string> = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣"
};

export interface StandardCard {
    id: string;
    rank: SuitedRank;
    suit: Suit;
    jokerType?: never;
}
export interface JokerCard {
    id: string;
    rank: "Joker";
    suit: null;
    jokerType: JokerType;
}
export type Card = StandardCard | JokerCard;

export function isJokerCard(card: Card): card is JokerCard {
    return card.rank === "Joker";
}

export type CaravanRow = Card[];

// Invariant: row[0] is a value card (A,2-10), row[1..4] are face cards (J/Q/K/Joker), length 1..5.

export interface Caravan {
    rows: CaravanRow[];
    direction: Nullable<Direction>;
    suit: Nullable<Suit>;
}

export interface CaravanState {
    status: ScoredStatus;
    total: number;
}
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
export type LogSegment = string | Card;

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
export interface LogEntry {
    id: number;
    player?: PlayerId;
    action?: Move["type"];
    card?: Card;
    caravan?: CaravanIndex;
    target?: TargetRef;
    text: string;
    segments: LogSegment[];
    detail?: LogSegment[][];
}
export class IllegalMoveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "IllegalMoveError";
    }
}
export function isValueCard(card: Card): boolean {
    return card.rank !== "J" && card.rank !== "Q" && card.rank !== "K" && card.rank !== "Joker";
}

export function isFaceCard(card: Card): boolean {
    return card.rank === "J" || card.rank === "Q" || card.rank === "K";
}

export function baseValue(card: Card): number {
    if (card.rank === "A") return 1;

    if (isJokerCard(card)) return 0;

    const n = Number(card.rank);

    return Number.isNaN(n) ? 0 : n;
}

export interface SelectionState {
    selectedHandIndex: Nullable<number>;
    selectedCard: Nullable<Card>;
    legalCaravans: number[];
    targetSet: Set<string>;
    pendingRemovalSet: Set<string>;
    removingSet: Set<string>;
    canDiscard: boolean;
}
