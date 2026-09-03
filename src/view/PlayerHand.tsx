import { memo } from "react";
import { cardClassName, cardLabel } from "../model/cards";
import { Human, PlayerId, PlayerState } from "../model/types";

const SLOT_KEYS = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"];

interface PlayerHandProps {
    playerId: PlayerId;
    player: PlayerState;
    selectedHandIndex: number | null;
    selectableIndices: Set<number>;
    onCardClick: (handIndex: number) => void;
}

function PlayerHandImpl({
    playerId,
    player,
    selectedHandIndex,
    selectableIndices,
    onCardClick
}: PlayerHandProps) {
    const isHuman = playerId === Human;
    const label = isHuman ? "You" : "AI";

    return (
        <section
            className={`hand ${isHuman ? "human" : "ai"}`}
            aria-label={`${label} hand, ${String(player.hand.length)} cards`}
        >
            <div
                className="cards"
                style={{ "--fan-count": player.hand.length } as React.CSSProperties}
            >
                {SLOT_KEYS.map((slotKey) => {
                    const i = Number(slotKey.slice(1));
                    const card = player.hand.at(i);
                    const slotStyle = { "--i": i } as React.CSSProperties;

                    if (card === undefined) {
                        return (
                            <div
                                key={slotKey}
                                className="slot"
                                style={slotStyle}
                                aria-hidden="true"
                            />
                        );
                    }

                    if (isHuman) {
                        return (
                            <button
                                type="button"
                                className={`slot ${selectableIndices.has(i) ? "selectable" : ""} ${selectedHandIndex === i ? "selected" : ""}`}
                                key={card.id}
                                style={slotStyle}
                                onClick={() => {
                                    onCardClick(i);
                                }}
                                aria-label={`${cardLabel(card)}${selectedHandIndex === i ? ", selected" : ""}${selectableIndices.has(i) ? ", playable" : ""}`}
                                aria-pressed={selectedHandIndex === i}
                            >
                                <div
                                    className={`${cardClassName("card", card)} ${selectedHandIndex === i ? "selected" : ""}`}
                                    role="img"
                                    aria-label={cardLabel(card)}
                                />
                            </button>
                        );
                    }

                    return (
                        <div key={card.id} className="slot ai" style={slotStyle} aria-hidden="true">
                            <div className="card back deck2" />
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export const PlayerHand = memo(PlayerHandImpl);
