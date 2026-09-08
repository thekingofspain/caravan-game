import { calculateCaravanState, calculateScore, isSellable } from "./rules/caravanCardRules";
import { Ai, GameState, Human, PlayerId, type ScoredStatus } from "./types";

export function caravanSeller(state: GameState, caravanColumnIndex: 0 | 1 | 2): PlayerId | null {
    const h = state.players[Human].caravans[caravanColumnIndex];
    const a = state.players[Ai].caravans[caravanColumnIndex];
    const hSell = isSellable(h);
    const aSell = isSellable(a);

    if (hSell && aSell) {
        const hTotal = calculateScore(h);
        const aTotal = calculateScore(a);

        return hTotal > aTotal ? Human : aTotal > hTotal ? Ai : null;
    }

    if (hSell) return Human;

    if (aSell) return Ai;

    return null;
}

export interface CaravanScoreMeta {
    total: number;
    status: ScoredStatus;
    isSellable: boolean;
    isSold: boolean;
}
export interface GameScores {
    humanScores: CaravanScoreMeta[];
    aiScores: CaravanScoreMeta[];
    humanWins: number;
    aiWins: number;
    sellers: (PlayerId | null)[];
}
export function getCaravanScores(state: GameState): GameScores {
    const rows = [0, 1, 2] as const;
    const humanScores: CaravanScoreMeta[] = [];
    const aiScores: CaravanScoreMeta[] = [];
    const sellers: (PlayerId | null)[] = [];

    for (const caravanColumnIndex of rows) {
        const hCar = state.players[Human].caravans[caravanColumnIndex];
        const aCar = state.players[Ai].caravans[caravanColumnIndex];
        const seller = caravanSeller(state, caravanColumnIndex);

        sellers[caravanColumnIndex] = seller;
        humanScores[caravanColumnIndex] = {
            total: calculateScore(hCar),
            status: calculateCaravanState(hCar).status,
            isSellable: isSellable(hCar),
            isSold: isSellable(hCar) && seller === Human
        };
        aiScores[caravanColumnIndex] = {
            total: calculateScore(aCar),
            status: calculateCaravanState(aCar).status,
            isSellable: isSellable(aCar),
            isSold: isSellable(aCar) && seller === Ai
        };
    }
    const humanWins = sellers.filter((s) => s === Human).length;
    const aiWins = sellers.filter((s) => s === Ai).length;

    return { humanScores, aiScores, humanWins, aiWins, sellers };
}

export function gameWinner(state: GameState): PlayerId | null {
    const w = [caravanSeller(state, 0), caravanSeller(state, 1), caravanSeller(state, 2)];

    if (w.some((x) => x === null)) return null;

    const wins0 = w.filter((x) => x === Human).length;

    return wins0 >= 2 ? Human : Ai;
}
