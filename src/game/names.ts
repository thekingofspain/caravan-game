import { PlayerId } from "./types";

const NAMES: Record<PlayerId, [string, string, string]> = {
  0: ["Boneyard", "Redding", "Shady Sands"],
  1: ["Dayglow", "New Reno", "The Hub"],
};

export const CARAVAN_NAMES = NAMES;

export function caravanName(player: PlayerId, index: number): string {
  return NAMES[player][index];
}
