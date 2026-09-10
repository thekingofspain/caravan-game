import {
    Ai,
    baseValue,
    Caravan,
    CaravanRow,
    type CaravanState,
    GameState,
    Human,
    Nullable,
    PlayerId,
    type PointsStatus
} from "./types";

// #region Caravan points
export const MIN_SELLABLE = 21;
export const MAX_SELLABLE = 26;

// ---- Functions ----

export function calculateRowPoints(row: CaravanRow): number {
    if (row.length === 0) return 0;

    const kingCount = row.slice(1).filter((c) => c.rank === "K").length;

    return baseValue(row[0]) * Math.pow(2, kingCount);
}

export function calculatePoints(caravan: Caravan): number {
    return caravan.rows.reduce((sum, row) => sum + calculateRowPoints(row), 0);
}

export function isSellablePoints(points: number): boolean {
    return points >= MIN_SELLABLE && points <= MAX_SELLABLE;
}

export function isSellable(caravan: Caravan): boolean {
    return isSellablePoints(calculatePoints(caravan));
}

export function calculateCaravanState(caravan: Caravan): CaravanState {
    if (caravan.rows.length === 0) return { status: "unsellable", points: 0 };

    if (isSellable(caravan)) return { status: "sellable", points: calculatePoints(caravan) };

    const points = calculatePoints(caravan);

    if (points > MAX_SELLABLE) return { status: "busted", points };

    return { status: "unsellable", points };
}
// #endregion

// #region Lane seller
// ---- Types ----

export interface LaneScoreboard {
    aiPoints: number;
    humanPoints: number;
    seller: Nullable<PlayerId>;
}

export interface PlayerCaravanOutcome {
    isSellable: boolean;
    points: number;
}

// ---- Functions ----

export function calcLaneScoreboard(human: Caravan, ai: Caravan): LaneScoreboard {
    const humanOutcome = playerCaravanOutcome(human);
    const aiOutcome = playerCaravanOutcome(ai);
    let seller: Nullable<PlayerId>;

    if (isPlayerTheSeller(humanOutcome, aiOutcome)) seller = Human;
    else if (isPlayerTheSeller(aiOutcome, humanOutcome)) seller = Ai;
    else {
        seller = null;
    }

    return { aiPoints: aiOutcome.points, humanPoints: humanOutcome.points, seller };
}

function isPlayerTheSeller(player: PlayerCaravanOutcome, opp: PlayerCaravanOutcome): boolean {
    return player.isSellable && (!opp.isSellable || player.points > opp.points);
}

function playerCaravanOutcome(caravan: Caravan): PlayerCaravanOutcome {
    const { points, status } = calculateCaravanState(caravan);

    return { isSellable: status === "sellable", points };
}

export function caravanSeller(state: GameState, laneIndex: 0 | 1 | 2): Nullable<PlayerId> {
    return calcLaneScoreboard(
        state.players[Human].caravans[laneIndex],
        state.players[Ai].caravans[laneIndex]
    ).seller;
}
// #endregion

// #region Game scores
// ---- Types ----

export interface CaravanPointsMeta {
    points: number;
    status: PointsStatus;
    isSellable: boolean;
    isSold: boolean;
}
export interface GameScores {
    humanPoints: CaravanPointsMeta[];
    aiPoints: CaravanPointsMeta[];
    humanWins: number;
    aiWins: number;
    sellers: Nullable<PlayerId>[];
}

// ---- Functions ----

export function getCaravanScores(state: GameState): GameScores {
    const rows = [0, 1, 2] as const;
    const humanPoints: CaravanPointsMeta[] = [];
    const aiPoints: CaravanPointsMeta[] = [];
    const sellers: Nullable<PlayerId>[] = [];
    let humanWins = 0;
    let aiWins = 0;

    for (const laneIndex of rows) {
        const seller = caravanSeller(state, laneIndex);

        sellers[laneIndex] = seller;

        if (seller === Human) humanWins += 1;
        else if (seller === Ai) aiWins += 1;

        humanPoints[laneIndex] = caravanMeta(
            state.players[Human].caravans[laneIndex],
            seller,
            Human
        );
        aiPoints[laneIndex] = caravanMeta(state.players[Ai].caravans[laneIndex], seller, Ai);
    }

    return { humanPoints, aiPoints, humanWins, aiWins, sellers };
}

function caravanMeta(
    caravan: Caravan,
    seller: Nullable<PlayerId>,
    owner: PlayerId
): CaravanPointsMeta {
    const { points, status } = calculateCaravanState(caravan);
    const sellable = status === "sellable";

    return {
        points,
        status,
        isSellable: sellable,
        isSold: sellable && seller === owner
    };
}

export function gameWinner(state: GameState): Nullable<PlayerId> {
    const w = [caravanSeller(state, 0), caravanSeller(state, 1), caravanSeller(state, 2)];

    if (w.some((x) => x === null)) return null;

    const wins0 = w.filter((x) => x === Human).length;

    return wins0 >= 2 ? Human : Ai;
}
// #endregion
