import type { ReactNode } from "react";
import { memo, useCallback } from "react";

import { cardClassName, cx } from "../model/cards";
import { caravanName } from "../model/names";
import type { CaravanPointsMeta } from "../model/scoring";
import {
    Caravan as CaravanType,
    CaravanRow,
    Human,
    isJokerCard,
    LaneIndex,
    Nullable,
    PlayerId,
    SelectionState,
    TargetRef
} from "../model/types";
import { targetKey } from "../viewmodel/transition";

interface CaravanProps {
    caravan: CaravanType;
    lane: LaneIndex;
    playerId: PlayerId;
    selection: SelectionState;
    onCardClick: (target: TargetRef) => void;
    onPlaceholderClick: (lane: LaneIndex) => void;
    onAcknowledge: () => void;
    children?: ReactNode;

    // False where the placeholder has no action (AI side): renders a
    // non-focusable marker.

    placeholderInteractive?: boolean;
}

// Fixed pseudo-random tilt per caravan row: lane is the caravan column, row
// index k is the vertical axis. Looks shuffled but stays stable across
// renders (pure Math.random would flicker on every state change).
// Attached operation cards fan out sideways per column slot; their extra
// stagger lives in CSS (nth-of-type), relative to their row's tilt.
// Bound ±4deg absolute on rows (±6.5deg with stagger): edge sweep stays well
// inside the minimum exposed strip (--card-offset-y ≥ 0.16·h), so a tilted
// card never covers the primary (top-left) corner marking of its neighbour.

function tiltIndex(playerId: PlayerId, lane: LaneIndex, rowIndex: number): number {
    const h = lane * 31 + rowIndex * 17 + (playerId === Human ? 0 : 11);

    return ((h % 8) + 8) % 8;
}

function rowCardIndex(e: React.SyntheticEvent): Nullable<number> {
    const wrap = (e.target as HTMLElement).closest("[data-index]");

    if (!wrap) return null;

    return Number(wrap.getAttribute("data-index"));
}

function rowClasses(
    head: CaravanRow[number],
    playerId: PlayerId,
    lane: LaneIndex,
    index: number,
    selection: SelectionState
): string {
    const key = targetKey({ player: playerId, lane, cardIndex: index });

    return cx(
        cardClassName("card", head),
        selection.targetSet.has(key) && "target",
        selection.pendingRemovalSet.has(key) && "pending",
        selection.flashKeys?.has(key) && "lastmove",
        selection.removingSet.has(key) && "pending-remove"
    );
}

interface PortalRemoveProps {
    onAcknowledge: () => void;
    label: string;
    symbol: string;
}

function PortalRemove({ onAcknowledge, label, symbol }: PortalRemoveProps) {
    // X rides inside the row button (a span: button-in-button is invalid
    // HTML, and the old body portal needed pixel measuring). The row's own
    // tilt transform applies, so the X sits on the visible strip with no
    // measuring: human/AI corner differs via the side's --confirm-* vars.
    // The row lifts above neighbours via .track > .card:has(.confirm).

    const focusRef = useCallback((node: Nullable<HTMLSpanElement>) => {
        node?.focus({ preventScroll: true });
    }, []);

    return (
        <span
            ref={focusRef}
            role="button"
            tabIndex={0}
            className="confirm"
            aria-label={label}
            onClick={(e) => {
                e.stopPropagation();
                onAcknowledge();
            }}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onAcknowledge();
                }
            }}
        >
            {symbol}
        </span>
    );
}

function CaravanImpl({
    caravan,
    lane,
    playerId,
    selection,
    onCardClick,
    onPlaceholderClick,
    onAcknowledge,
    children,
    placeholderInteractive = true
}: CaravanProps) {
    const isHuman = playerId === Human;
    const handleCardClick = useCallback(
        (e: React.MouseEvent) => {
            const cardIndex = rowCardIndex(e);

            if (cardIndex !== null) onCardClick({ player: playerId, lane, cardIndex });
        },
        [playerId, lane, onCardClick]
    );

    const handleCardKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const cardIndex = rowCardIndex(e);

                if (cardIndex !== null) onCardClick({ player: playerId, lane, cardIndex });
            }
        },
        [playerId, lane, onCardClick]
    );

    const getCardClasses = useCallback(
        (caravanRow: CaravanRow, index: number) =>
            rowClasses(caravanRow[0], playerId, lane, index, selection),
        [playerId, lane, selection]
    );

    const handlePlaceholderClick = useCallback(() => {
        onPlaceholderClick(lane);
    }, [lane, onPlaceholderClick]);

    return (
        <div
            className={cx(
                "track",
                isHuman && selection.legalCaravans.includes(lane) && "selectable"
            )}
        >
            {children}
            {caravan.rows.map((caravanRow, k) => (
                <CaravanRowButtonMemo
                    key={caravanRow[0].id}
                    caravanRow={caravanRow}
                    k={k}
                    playerId={playerId}
                    lane={lane}
                    selection={selection}
                    getCardClasses={getCardClasses}
                    handleCardClick={handleCardClick}
                    handleCardKeyDown={handleCardKeyDown}
                    onAcknowledge={onAcknowledge}
                />
            ))}
            {caravan.rows.length === 0 ? (
                placeholderInteractive ? (
                    <button
                        type="button"
                        className={cx(
                            "empty",
                            selection.legalCaravans.includes(lane) && "selectable"
                        )}
                        aria-label={`Play a card to ${caravanName(playerId, lane)}`}
                        onClick={handlePlaceholderClick}
                    />
                ) : (
                    <span className="empty" aria-hidden="true" />
                )
            ) : null}
        </div>
    );
}

function CaravanRowButton({
    caravanRow,
    k,
    playerId,
    lane,
    selection,
    getCardClasses,
    handleCardClick,
    handleCardKeyDown,
    onAcknowledge
}: {
    caravanRow: CaravanRow;
    k: number;
    playerId: PlayerId;
    lane: 0 | 1 | 2;
    selection: SelectionState;
    getCardClasses: (r: CaravanRow, i: number) => string;
    handleCardClick: (e: React.MouseEvent) => void;
    handleCardKeyDown: (e: React.KeyboardEvent) => void;
    onAcknowledge: () => void;
}) {
    const head = caravanRow[0];
    const rowKey = targetKey({ player: playerId, lane, cardIndex: k });
    const removable = selection.pendingRemovalSet.has(rowKey);
    const attachments = caravanRow.slice(1);
    let lastKingIndex = -1;
    let jackIdx = -1;
    let kingCount = 0;

    attachments.forEach((c, i) => {
        if (c.rank === "K") {
            kingCount += 1;
            lastKingIndex = i;
        }

        if (c.rank === "J" && jackIdx === -1) jackIdx = i;
    });

    const kingBadge = kingCount > 0 ? `×${String(Math.pow(2, kingCount))}` : "";

    // Joker removals clear other rows, so the played Joker sits on a target
    // row that is NOT in the pending set and would otherwise show no X.
    // Pin the confirm X to the pending move's Joker host only: stale Jokers
    // from earlier moves still ride other rows and must never confirm.

    const isJokerTargetConfirm =
        !removable && selection.pendingJokerKey !== null && rowKey === selection.pendingJokerKey;
    const confirmationSymbol = removable || isJokerTargetConfirm ? "×" : null;

    // Visible X only where the played card rides: a removable Jack row hosts
    // its Jack; a Joker host rides its pending Joker. Plain removed rows
    // (Joker victims with no attachments) get no X — the old body portal
    // rendered null there via a missing anchor.

    const hasConfirmAnchor = attachments.some(
        (a, j) =>
            (a.rank === "J" && j === jackIdx && !!confirmationSymbol) ||
            (isJokerCard(a) && isJokerTargetConfirm)
    );

    return (
        <button
            type="button"
            className={getCardClasses(caravanRow, k)}
            data-index={k}
            data-tilt={tiltIndex(playerId, lane, k)}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
        >
            {attachments.map((a, j) => {
                const isFlashed = selection.flashKeys?.has(`${rowKey}#${a.id}`) ?? false;

                return (
                    <div
                        key={a.id}
                        className={cx(cardClassName("card", a), isFlashed && "lastmove")}
                    >
                        {j === lastKingIndex && kingBadge && (
                            <span className="badge king">{kingBadge}</span>
                        )}
                    </div>
                );
            })}
            {confirmationSymbol && hasConfirmAnchor && (
                <PortalRemove
                    onAcknowledge={onAcknowledge}
                    label={`Acknowledge removal of card ${head.rank} of ${String(head.suit)}`}
                    symbol={confirmationSymbol}
                />
            )}
        </button>
    );
}

const CaravanRowButtonMemo = memo(CaravanRowButton);

export function CaravanPoints({ meta }: { meta: CaravanPointsMeta }) {
    const statusText = meta.isSold ? "sold" : meta.status;

    return (
        <span
            className={cx(
                "score",
                meta.isSellable ? "sellable" : "unsellable",
                meta.isSold && "sold",
                meta.status === "busted" && "busted"
            )}
            data-total={meta.points}
            data-sellable={meta.isSellable ? "1" : "0"}
        >
            <span className="total" aria-hidden="true">
                {meta.points}
            </span>
            <span className="visually-hidden">{`${String(meta.points)} points, ${statusText}`}</span>
        </span>
    );
}

export const Caravan = memo(CaravanImpl);
