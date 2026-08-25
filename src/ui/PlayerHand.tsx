import { cardClassName, cardLabel } from "../game/cards";
import { PlayerType, PlayerState } from "../game/types";

interface PlayerHandProps {
  playerType: PlayerType;
  player: PlayerState;
  selectedHandIndex: number | null;
  selectableIndices: Set<number>;
  onCardClick: (handIndex: number) => void;
}

export function PlayerHand({
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
      <span className="hand-zone__label" aria-hidden="true">
        {label} — {player.deck.length} cards
      </span>
      <div className="hand-zone__cards">
        {isHuman ? (
          player.hand.map((card, i) => (
            <button
              type="button"
              className={`hand__slot ${selectableIndices.has(i) ? "is-selectable" : ""} ${selectedHandIndex === i ? "is-selected" : ""}`}
              key={card.id}
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
          ))
        ) : (
          player.hand.map((card) => (
            <div key={card.id} className="hand__slot hand__slot--ai" aria-hidden="true">
              <div className="card card--back" />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
