import { hasJackAttached } from "./rules/caravanCardRules";
import { caravanName } from "./names";
import { Card, GameState, Human, LogEntry, Move, Nullable, PlayerId, SUIT_SYMBOL, TargetRef, baseValue, isJokerCard, isPlaceholderCard } from "./types";

let logId = 0;

export function resetLogIds(): void {
  logId = 0;
}

export function log(text: string): LogEntry {
  logId += 1;
  return { id: logId, text };
}

export function formatCardLog(card: Card): string {
  if (isPlaceholderCard(card)) return `{Placeholder}`;
  if (isJokerCard(card)) return `{${card.jokerType} Joker}`;
  return `{${card.rank}${SUIT_SYMBOL[card.suit as NonNullable<typeof card.suit>]}}`;
}

export function formatOwnerLabel(p: PlayerId): string {
  return p === Human ? "your" : "AI's";
}

export function formatFinalScore(state: GameState): string {
  const scores = state.players.map((pl) => {
    const totals = pl.caravans.map((c: any) => {
      const t = ((c as any).rows ?? (c as any).cards ?? []).reduce((s: number, row: any) => {
        // row is either Card[] or PlacedCard
        const isRowArray = Array.isArray(row);
        const rowForCheck = isRowArray ? row : [row.card, ...(row.attachments || [])];
        if (hasJackAttached(rowForCheck as any)) return s;
        const kingCount = isRowArray ? row.slice(1).filter((cc: any) => cc.rank === "K").length : (row.kingCount || 0);
        const base = isRowArray ? baseValue(row[0]) : baseValue(row.card);
        return s + base * Math.pow(2, kingCount);
      }, 0);
      return t;
    });
    return totals.join("/");
  });
  return `(${scores[0]} vs ${scores[1]})`;
}

export function removalDetail(state: GameState, refs: TargetRef[]): string[] {
  const byCar = new Map<string, Card[]>();
  for (const r of refs) {
    const car: any = state.players[r.player].caravans[r.caravan];
    const rows = car.rows ?? car.cards;
    const row: any = rows[r.cardIndex];
    if (!row) continue;
    const isRowArray = Array.isArray(row);
    if (isRowArray && row.length === 0) continue;
    if (!isRowArray && !row.card) continue;
    const key = `${r.player}-${r.caravan}`;
    if (!byCar.has(key)) byCar.set(key, []);
    const lastCard: any = isRowArray ? row[row.length - 1] : row.attachments?.[row.attachments.length - 1];
    const isLastJoker = lastCard && isJokerCard(lastCard as Card);
    const cardsToPush: Card[] = isRowArray ? (isLastJoker ? row.slice(0, -1) : row) : [row.card, ...(row.attachments || [])].filter(Boolean) as Card[];
    if (isLastJoker && isRowArray) {
      // already handled
    } else if (isLastJoker && !isRowArray) {
      // for old, remove last joker from attachments
      cardsToPush.pop();
    }
    byCar.get(key)!.push(...cardsToPush);
  }
  const detail: string[] = [];
  for (const [key, cards] of byCar) {
    const [p, ci] = key.split("-").map(Number) as [PlayerId, number];
    detail.push(`${formatOwnerLabel(p)} caravan ${caravanName(p, ci)}: ${cards.map(formatCardLog).join(", ")}`);
  }
  return detail;
}

export function describe(action: Move, state: GameState): Nullable<string> {
  const who = action.player === Human ? "You" : "AI";
  if (action.type === "playValueCard") {
    const card = state.players[action.player].hand[action.handIndex];
    if (!card) return null;
    return `${who} played ${formatCardLog(card)} to ${caravanName(action.player, action.caravan)}`;
  }
  if (action.type === "playFaceCard") {
    const card = state.players[action.player].hand[action.handIndex];
    const carTgt: any = state.players[action.target.player].caravans[action.target.caravan];
    const rowsTgt = carTgt.rows ?? carTgt.cards;
    const tgt = rowsTgt[action.target.cardIndex];
    if (!card || !tgt) return null;
    const tgtCard = Array.isArray(tgt) ? tgt[0] : (tgt as any).card;
    if (!tgtCard || (Array.isArray(tgt) && tgt.length===0)) return null;
    const targetLabel = `${formatOwnerLabel(action.target.player)} ${caravanName(action.target.player, action.target.caravan)} ${formatCardLog(tgtCard)}`;
    return `${who} played ${formatCardLog(card)} on ${targetLabel}`;
  }
  if (action.type === "discardCard") {
    const card = state.players[action.player].hand[action.handIndex];
    if (!card) return null;
    return `${who} discarded ${formatCardLog(card)}`;
  }
  if (action.type === "dismissCaravan") {
    return `${who} dismissed ${caravanName(action.player, action.caravan)}`;
  }
  return null;
}
