import { Ai, Human, PlayerId } from "./types";

const NAMES: Record<PlayerId, [string, string, string]> = {
  [Human]: ["Boneyard", "Redding", "Shady Sands"],
  [Ai]: ["Dayglow", "New Reno", "The Hub"],
};

export const CARAVAN_NAMES = NAMES;

export function caravanName(player: PlayerId, index: number): string {
  return NAMES[player][index];
}
