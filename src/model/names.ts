import { Ai, Human, PlayerId } from "./types";

const NAMES: Record<PlayerId, [string, string, string]> = {
    [Human]: ["Boneyard", "Redding", "Shady Sands"],
    [Ai]: ["Dayglow", "New Reno", "The Hub"]
};

export const ALL_CARAVAN_NAMES = Object.values(NAMES).flat();

export function caravanName(player: PlayerId, caravanColumnIndex: number): string {
    return NAMES[player][caravanColumnIndex];
}
