import { memo } from "react";
import { cardClassName, cardLabel } from "../game/cards";
import { PlayerType, PlayerState } from "../game/types";

const SLOT_KEYS = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"];

interface PlayerHandProps {
  playerType: PlayerType;
  player: PlayerState;
  selectedHandIndex: number | null;
  selectableIndices: Set<number>;
  onCardClick: (handIndex: number) => void;
}

function PlayerHandImpl({
  playerType,
  player,
  selectedHandIndex,
  selectableIndices,
  onCardClick,
}: PlayerHandProps) {
  const isHuman = playerType === "human";
  const label = isHuman ? "You" : "AI";

  return (
    <section className={`hand-zone ${isHuman ? "hand-zone--human" : "hand-zone--ai"}`} aria-label={`${label} hand, ${player.hand.length} cards`}>
      <div className="hand-zone__cards" style={{ "--fan-count": player.hand.length } as React.CSSProperties}>
        {SLOT_KEYS.map((slotKey) => {
          const i = Number(slotKey.slice(1));
          const card = player.hand[i];
          const slotStyle = { "--i": i } as React.CSSProperties;
          if (!card) {
            return <div key={slotKey} className="hand__slot" style={slotStyle} aria-hidden="true" />;
          }
          if (isHuman) {
            return (
              <button
                type="button"
                className={`hand__slot ${selectableIndices.has(i) ? "is-selectable" : ""} ${selectedHandIndex === i ? "is-selected" : ""}`}
                key={card.id}
                style={slotStyle}
                onClick={() => onCardClick(i)}
                aria-label={`${cardLabel(card)}${selectedHandIndex === i ? ", selected" : ""}${selectableIndices.has(i) ? ", playable" : ""}`}
                aria-pressed={selectedHandIndex === i}
              >
                <div
                  className={`${cardClassName(card)} ${selectedHandIndex === i ? "is-selected" : ""}`}
                  role="img"
                  aria-label={cardLabel(card)}
                />
              </button>
            );
          }
          return (
            <div key={card.id} className="hand__slot hand__slot--ai" style={slotStyle} aria-hidden="true">
              <div className={`card card--back card--deck${isHuman ? 1 : 2}`} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

export const PlayerHand = memo(PlayerHandImpl);
