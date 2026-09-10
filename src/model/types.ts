// #region Utilities
export type Nullable<T> = T | null;
// #endregion

// #region Suits
export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export const SUIT_SYMBOL: Record<Suit, string> = {
    spades: "♠",
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣"
};

// ---- Types ----

export type Suit = (typeof SUITS)[number];

// ---- Functions ----

export function isSuit(value: string): value is Suit {
    return (SUITS as readonly string[]).includes(value);
}
// #endregion

// #region Ranks
export const VALUE_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
export const FACE_RANKS = ["J", "Q", "K"] as const;
export const JOKER_RANK = "Joker" as const;
export const OPERATION_RANKS = [...FACE_RANKS, JOKER_RANK] as const;
export const STANDARD_RANKS = [...VALUE_RANKS, ...OPERATION_RANKS] as const;
export const SUITED_RANKS: SuitedRank[] = [...VALUE_RANKS, ...FACE_RANKS];

// ---- Types ----

export type ValueRank = (typeof VALUE_RANKS)[number];
export type FaceRank = (typeof FACE_RANKS)[number];
export type JokerRank = typeof JOKER_RANK;
export type SuitedRank = ValueRank | FaceRank;
export type OperationRank = (typeof OPERATION_RANKS)[number];
export type Rank = (typeof STANDARD_RANKS)[number];

// ---- Functions ----

export function isValueRank(rank: string): rank is ValueRank {
    return (VALUE_RANKS as readonly string[]).includes(rank);
}

export function isFaceRank(rank: string): rank is FaceRank {
    return (FACE_RANKS as readonly string[]).includes(rank);
}

export function isOperationRank(rank: string): rank is OperationRank {
    return (OPERATION_RANKS as readonly string[]).includes(rank);
}
// #endregion

// #region Cards
export type JokerType = "Red" | "Black";
export interface SuitedCard {
    id: string;
    rank: SuitedRank;
    suit: Suit;
    jokerType?: never;
}
export interface JokerCard {
    id: string;
    rank: JokerRank;
    suit: null;
    jokerType: JokerType;
}
export type Card = SuitedCard | JokerCard;
export interface ValueCard {
    id: string;
    rank: ValueRank;
    suit: Suit;
    jokerType?: never;
}
export interface FaceCard {
    id: string;
    rank: FaceRank;
    suit: Suit;
    jokerType?: never;
}
export type OperationCard = FaceCard | JokerCard;

// ---- Functions ----

export function isJokerCard(card: Card): card is JokerCard {
    return card.rank === JOKER_RANK;
}

export function isValueCard(card: Card): card is ValueCard {
    return isValueRank(card.rank);
}

export function isFaceCard(card: Card): card is FaceCard {
    return isFaceRank(card.rank);
}

export function isOperationCard(card: Card): card is OperationCard {
    return isOperationRank(card.rank);
}

export function baseValue(card: Card): number {
    if (card.rank === "A") return 1;

    if (isJokerCard(card)) return 0;

    const n = Number(card.rank);

    return Number.isNaN(n) ? 0 : n;
}
// #endregion

// #region Caravans
export type Direction = "asc" | "desc";
export type PointsStatus = "sellable" | "busted" | "unsellable";
export type CaravanRow = Card[];

// Invariant: row[0] is a value card (A,2-10), row[1..4] are operation cards (J/Q/K/Joker), length 1..5.

export interface Caravan {
    rows: CaravanRow[];
    direction: Nullable<Direction>;
    suit: Nullable<Suit>;

    // Set on the first value row and never cleared. States programmed without
    // it (tests) read as started when they hold rows.

    started?: boolean;
}
export interface CaravanState {
    status: PointsStatus;
    points: number;
}
// #endregion

// #region Players & game
export const Human = 0 as const;
export const Ai = 1 as const;
export const PLAYERS = [Human, Ai] as const satisfies readonly PlayerId[];
export const LANE_INDICES = [0, 1, 2] as const satisfies readonly LaneIndex[];
export type PlayerId = typeof Human | typeof Ai;
export type LaneIndex = 0 | 1 | 2;

export function otherPlayer(player: PlayerId): PlayerId {
    return player === Human ? Ai : Human;
}

export function playedCard(state: GameState, player: PlayerId, handIndex: number): Card {
    return state.players[player].hand[handIndex];
}

export interface ActorRef {
    type: "actor";
    player: PlayerId;

    // subject renders Who alone ("You"); possessive appends "'s " ("AI's ").

    form: "subject" | "possessive";
}
export interface CaravanRef {
    type: "caravan";
    player: PlayerId;
    lane: LaneIndex;
}
export type LogSegment = string | Card | ActorRef | CaravanRef;
export type GamePhase = "play" | "over";
export interface GameConfig {
    seed?: number;
}
export type SetupOptions = GameConfig & { first?: PlayerId };
export interface PlayerState {
    deck: Card[];
    hand: Card[];
    caravans: Caravan[];

    // Last player-initiated discard (face-up pile shows this one card only).

    discard: Nullable<Card>;
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
    lane: LaneIndex;
    cardIndex: number;
}
interface PlayValueCardMove {
    type: "playValueCard";
    player: PlayerId;
    lane: LaneIndex;
    handIndex: number;
}
interface PlayOperationCardMove {
    type: "playOperationCard";
    player: PlayerId;
    target: TargetRef;
    handIndex: number;
}
interface DiscardCardMove {
    type: "discardCard";
    player: PlayerId;
    handIndex: number;
}
interface DisbandCaravanMove {
    type: "disbandCaravan";
    player: PlayerId;
    lane: LaneIndex;
}
export type Move = PlayValueCardMove | PlayOperationCardMove | DiscardCardMove | DisbandCaravanMove;
export interface LogEntry {
    id: number;
    player?: PlayerId;
    action?: Move["type"];
    card?: Card;
    lane?: LaneIndex;
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
// #endregion

// #region Selection (view state)
export interface SelectionState {
    selectedHandIndex: Nullable<number>;
    selectedCard: Nullable<Card>;
    legalCaravans: number[];
    targetSet: Set<string>;
    pendingRemovalSet: Set<string>;
    pendingJokerKey: Nullable<string>;
    removingSet: Set<string>;
    canDiscard: boolean;

    // AI-last-move highlight (same blink as confirmation, separate class).

    flashKeys?: ReadonlySet<string>;
}
// #endregion
