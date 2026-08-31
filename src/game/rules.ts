export * from "../model/rules/caravanCardRules";
import { calculateScore, isSellable, canPlaceCard, calculateCaravanRowValue } from "../model/rules/caravanCardRules";
import { baseValue } from "../model/types";
export const caravanTotal = calculateScore;
export const isInRange = isSellable;
export const isJacked = (row: any) => {
  if (Array.isArray(row)) return row.slice(1).some((c: any) => c.rank === "J");
  return row.attachments && row.attachments.some((c: any) => c.rank === "J");
};
export const canPlayValueCard = canPlaceCard;
export function placedValue(p: any): number {
  if (p.attachments) {
    if (p.attachments.some((c: any) => c.rank === "J")) return 0;
    if (p.kingCount !== undefined) {
      return baseValue(p.card) * Math.pow(2, p.kingCount);
    }
    return calculateCaravanRowValue([p.card, ...(p.attachments || [])].filter(Boolean) as any);
  }
  if (p.card) {
    return baseValue(p.card) * Math.pow(2, p.kingCount || 0);
  }
  return calculateCaravanRowValue(p as any);
}
export function activeCards(c: any): any[] {
  if ((c as any).rows) return (c as any).rows;
  return (c as any).cards || [];
}
