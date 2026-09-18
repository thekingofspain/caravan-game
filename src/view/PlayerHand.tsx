import { memo } from "react";

import { cardClassName, cardLabel, cx } from "../model/cards";
import { Human, Nullable, PlayerId, PlayerState } from "../model/types";

interface PlayerHandProps {
    playerId: PlayerId;
    player: PlayerState;
    selectedHandIndex: Nullable<number>;
    selectableIndices: ReadonlySet<number>;
    onCardClick: (handIndex: number) => void;
    onCardDoubleClick: (handIndex: number) => void;
}

function PlayerHandImpl({
    playerId,
    player,
    selectedHandIndex,
    selectableIndices,
    onCardClick,
    onCardDoubleClick
}: PlayerHandProps) {
    const isHuman = playerId === Human;
    const label = isHuman ? "You" : "AI";

    return (
        <section
            className={`hand ${isHuman ? "human" : "ai"}`}
            aria-label={`${label} hand, ${String(player.hand.length)} cards`}
        >
            <div className="cards" data-fan-count={player.hand.length}>
                {Array.from({ length: 8 }, (_, i) => {
                    const card = player.hand.at(i);
                    const slotKey = `s${String(i)}`;

                    if (card === undefined) {
                        return <div key={slotKey} className="slot" data-i={i} aria-hidden="true" />;
                    }

                    if (isHuman) {
                        return (
                            <button
                                type="button"
                                className={cx(
                                    "slot",
                                    selectableIndices.has(i) && "selectable",
                                    selectedHandIndex === i && "selected"
                                )}
                                key={slotKey}
                                data-i={i}
                                onClick={() => {
                                    onCardClick(i);
                                }}
                                onDoubleClick={() => {
                                    onCardDoubleClick(i);
                                }}
                                aria-label={`${cardLabel(card)}${selectedHandIndex === i ? ", selected" : ""}${selectableIndices.has(i) ? ", playable" : ""}`}
                                aria-pressed={selectedHandIndex === i}
                            >
                                <div
                                    className={cx(
                                        cardClassName("card", card),
                                        selectedHandIndex === i && "selected"
                                    )}
                                    aria-hidden="true"
                                />
                            </button>
                        );
                    }

                    return (
                        <div key={slotKey} className="slot ai" data-i={i} aria-hidden="true">
                            <div className="card back deck2" />
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export const PlayerHand = memo(PlayerHandImpl);
