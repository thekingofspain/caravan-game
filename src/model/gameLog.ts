import { calculateCaravanState, calculateCaravanRowValue, hasJackAttached } from "./rules/caravanCardRules";
import { pairWinner } from "./scoring";
import { caravanName } from "./names";
import { Ai, Card, GameState, Human, LogEntry, Move, Nullable, PlayerId, SUIT_SYMBOL, TargetRef, isJokerCard, isPlaceholderCard } from "./types";

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
  const parts: string[] = [];
  for (let i = 0; i < 3; i++) {
    const h = state.players[Human].caravans[i as 0 | 1 | 2];
    const a = state.players[Ai].caravans[i as 0 | 1 | 2];
    const hs = calculateCaravanState(h);
    const as = calculateCaravanState(a);
    const winner = pairWinner(state, i as 0 | 1 | 2);
    const fmt = (st: ReturnType<typeof calculateCaravanState>, isWinner: boolean): string => {
      if (st.status === "empty") return "0";
      const t = String(st.total);
      if (st.status === "sellable") return isWinner ? `**${t}**` : `*${t}*`;
      return t;
    };
    const hStr = fmt(hs, winner === Human);
    const aStr = fmt(as, winner === Ai);
    parts.push(`${caravanName(Human, i)} ${hStr} vs ${aStr}`);
  }
  return parts.join(" | ");
}

export function removalDetail(state: GameState, refs: TargetRef[]): string[] {
  const byCar = new Map<string, Card[]>();
  for (const r of refs) {
    const car = state.players[r.player].caravans[r.caravan];
    const row = car.rows[r.cardIndex];
    if (!row) continue;
    const key = `${r.player}-${r.caravan}`;
    if (!byCar.has(key)) byCar.set(key, []);
    // All cards in the row are removed; if last attachment is Joker, its removal is already counted via refs, but detail lists the value card
    const isLastJoker = row[row.length - 1]?.rank === "Joker";
    const cardsToPush: Card[] = isLastJoker ? row.slice(0, -1) : row;
    if (r.cardIndex === row.length - 1) {
      // For Joker self-removal edge, don't double count
      // Actually jokerRemovals includes the joker target itself, row includes joker; slice avoids listing joker twice
    }
    byCar.get(key)!.push(...cardsToPush);
  }
  const detail: string[] = [];
  for (const [key, cards] of byCar) {
    const [pStr, ciStr] = key.split("-");
    const p = Number(pStr) as PlayerId;
    const ci = Number(ciStr);
    detail.push(`${formatOwnerLabel(p)} caravan ${caravanName(p, ci)}: ${cards.map(formatCardLog).join(", ")}`);
  }
  return detail;
}

export function describe(action: Move, state: GameState): Nullable<string> {
  const who = action.player === Human ? "You" : "AI";
  if (action.type === "playValueCard") {
    const card = state.players[action.player].hand[action.handIndex];
    return `${who} played ${formatCardLog(card!)} to ${caravanName(action.player, action.caravan)}`;
  }
  if (action.type === "playFaceCard") {
    const card = state.players[action.player].hand[action.handIndex];
    const carTgt = state.players[action.target.player].caravans[action.target.caravan];
    const tgt = carTgt.rows[action.target.cardIndex];
    const tgtCard = tgt ? tgt[0] : undefined;
    const tgtLog = tgtCard ? formatCardLog(tgtCard) : `card ${action.target.cardIndex}`;
    return `${who} played ${formatCardLog(card!)} on ${formatOwnerLabel(action.target.player)} ${caravanName(action.target.player, action.target.caravan)} ${tgtLog}`;
  }
  if (action.type === "discardCard") {
    const card = state.players[action.player].hand[action.handIndex];
    return `${who} discarded ${formatCardLog(card!)}`;
  }
  if (action.type === "dismissCaravan") {
    return `${who} dismissed ${caravanName(action.player, action.caravan)}`;
  }
  return null;
}
