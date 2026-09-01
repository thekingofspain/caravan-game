import { memo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cardClassName } from "../model/cards";
import { calculateCaravanState, hasJackAttached } from "../model/rules/caravanCardRules";
import { CaravanRow, Caravan as CaravanType, Human, PlayerId, SelectionState, TargetRef, isJokerCard } from "../model/types";
import { sortAttachments, targetKey } from "../viewmodel/transition";

interface CaravanProps {
  caravan: CaravanType;
  caravanIndex: number;
  playerId: PlayerId;
  highestSold: boolean;
  selection: SelectionState;
  onCardClick: (target: TargetRef) => void;
  onPlaceholderClick: (caravanIndex: number) => void;
  onAcknowledge: () => void;
  children?: ReactNode;
}

function CaravanImpl({
  caravan,
  caravanIndex,
  playerId,
  selection,
  onCardClick,
  onPlaceholderClick,
  onAcknowledge,
  children,
}: CaravanProps) {
  const isHuman = playerId === Human;
  const caravanIdx = caravanIndex as 0 | 1 | 2;
  function handleCardClick(e: React.MouseEvent) {
    const wrap = (e.target as HTMLElement).closest("[data-index]");
    if (!wrap) return;
    const cardIndex = Number(wrap.getAttribute("data-index"));
    onCardClick({ player: playerId, caravan: caravanIdx, cardIndex });
  }
  function handleCardKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const wrap = (e.target as HTMLElement).closest("[data-index]");
      if (!wrap) return;
      const cardIndex = Number(wrap.getAttribute("data-index"));
      onCardClick({ player: playerId, caravan: caravanIdx, cardIndex });
    }
  }
  function getCardClasses(caravanRow: CaravanRow, index: number): string {
    const head = caravanRow[0];
    const key = targetKey({ player: playerId, caravan: caravanIdx, cardIndex: index });
    const isTarget = selection.targetSet.has(key);
    const classes = [cardClassName("card", head)];
    if (isTarget) classes.push("is-target");
    if (selection.pendingRemovalSet.has(key)) classes.push("is-pending");
    if (selection.removingSet?.has(key)) classes.push("is-pending-remove");
    return classes.join(" ");
  }
  function getCardStyle(index: number): CSSProperties {
    return { zIndex: index + 1 } as CSSProperties;
  }
  return (
    <div className={`caravan ${isHuman ? "caravan--human" : "caravan--ai"} ${isHuman && selection.legalCaravans.includes(caravanIndex) ? "is-selectable" : ""}`}>
      {children}
      {caravan.rows.map((caravanRow, k) => {
        const head = caravanRow[0];
        const jackedCard = hasJackAttached(caravanRow);
        const removable = selection.pendingRemovalSet.has(targetKey({ player: playerId, caravan: caravanIdx, cardIndex: k }));
        const attachments = caravanRow.slice(1);
        const sorted = sortAttachments(attachments);
        let lastKingIndex = -1;
        let jackIdx = -1;
        let kingCount = 0;
        sorted.forEach((c, i) => {
          if (c.rank === "K") { kingCount += 1; lastKingIndex = i; }
          if (c.rank === "J" && jackIdx === -1) jackIdx = i;
        });
        const kingBadge = kingCount > 0 ? `×${Math.pow(2, kingCount)}` : "";
        return (
          <button key={head.id} type="button" className={getCardClasses(caravanRow, k)} data-index={k} style={getCardStyle(k)} onClick={handleCardClick} onKeyDown={handleCardKeyDown}>
            {sorted.map((a, j) => {
              const isShowX = (a.rank === "J" || isJokerCard(a)) && removable;
              return (
                <div key={a.id} className={`${cardClassName("card", a)}${isShowX ? " showXButton is-remove-src" : ""}`} style={{ "--c": j + 1 } as CSSProperties}>
                  {j === lastKingIndex && kingBadge && <span className="card__badge card__badge--king">{kingBadge}</span>}
                  {jackedCard && j === jackIdx && removable && (
                    <span role="button" className="jack-remove" tabIndex={0} aria-label={`Acknowledge and remove card ${head.rank} of ${head.suit}`} onClick={(e) => { e.stopPropagation(); onAcknowledge(); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onAcknowledge(); } }}>
                      ×
                    </span>
                  )}
                  {isJokerCard(a) && removable && (
                    <span role="button" className="jack-remove" tabIndex={0} aria-label={`Acknowledge and remove joker ${a.rank}`} onClick={(e) => { e.stopPropagation(); onAcknowledge(); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onAcknowledge(); } }}>
                      ×
                    </span>
                  )}
                </div>
              );
            })}
          </button>
        );
      })}
      {caravan.rows.length === 0 ? (
        <button type="button" className={`caravan__empty ${selection.legalCaravans.includes(caravanIndex) ? "is-selectable" : ""}`} onClick={() => onPlaceholderClick(caravanIndex)} />
      ) : null}
    </div>
  );
}
export function CaravanScore({ caravan, highestSold }: { caravan: CaravanType; highestSold: boolean }) {
  const state = calculateCaravanState(caravan);
  const sold = state.status === "sellable";
  const total = state.status === "empty" ? 0 : state.total;
  return (
    <span className={`caravan-col__score ${sold ? "is-sold" : ""} ${highestSold ? "is-highest" : ""}`}>
      <span className="caravan-col__total">{total}</span>
    </span>
  );
}
export const Caravan = memo(CaravanImpl);
