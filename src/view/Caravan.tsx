import type { CSSProperties, ReactNode } from "react";
import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cardClassName } from "../model/cards";
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
    TargetRef} from "../model/types";
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

const CARAVAN_TILTS = [-4, 2.5, -1.5, 3.5, -3, 1.5, -2.5, 4] as const;

export function caravanTilt(playerId: PlayerId, lane: LaneIndex, rowIndex: number): number {
    const salt = playerId === Human ? 0 : 11;
    const h = lane * 31 + rowIndex * 17 + salt;

    return CARAVAN_TILTS[((h % CARAVAN_TILTS.length) + CARAVAN_TILTS.length) % CARAVAN_TILTS.length];
}

interface PortalRemoveProps {
    anchorRef: React.RefObject<Nullable<HTMLDivElement>>;
    isHuman: boolean;
    onAcknowledge: () => void;
    label: string;
    symbol: string;
}

function PortalRemove({ anchorRef, isHuman, onAcknowledge, label, symbol }: PortalRemoveProps) {
    const [pos, setPos] = useState<Nullable<{ left: number; top: number }>>(null);

    // Web pages cannot move the system cursor; keyboard focus on the X plus
    // revealing its card is the closest equivalent.

    const focusRef = useCallback(
        (node: Nullable<HTMLButtonElement>) => {
            if (!node) return;

            node.focus({ preventScroll: true });
            anchorRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
        },
        [anchorRef]
    );

    // AI tracks stack in reverse (column-reverse) with ascending z-index, so
    // each row paints OVER the row visually above it: a row's own face only
    // shows at its BOTTOM strip. Human tracks are the mirror image (own face
    // at the TOP strip). Pin the X to the visible strip per side, outer edge.

    useLayoutEffect(() => {
        const update = () => {
            const el = anchorRef.current;

            if (!el) return;

            const r = el.getBoundingClientRect();
            const left = isHuman ? r.right - 11 : r.left - 11;
            const top = isHuman ? r.top - 11 : r.bottom - 11;

            setPos({ left, top });
        };

        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        const ro = new ResizeObserver(update);

        if (anchorRef.current) ro.observe(anchorRef.current);

        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
            ro.disconnect();
        };
    }, [anchorRef, isHuman]);
    if (!pos || typeof document === "undefined") return null;

    return createPortal(
        <button
            ref={focusRef}
            type="button"
            className="confirm portal"
            aria-label={label}
            onClick={(e) => {
                e.stopPropagation();
                onAcknowledge();
            }}
            style={{
                position: "fixed",
                left: pos.left,
                top: pos.top,
                margin: 0,
                transform: "none",
                zIndex: 9999
            }}
        >
            {symbol}
        </button>,
        document.body
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

    function handleCardClick(e: React.MouseEvent) {
        const wrap = (e.target as HTMLElement).closest("[data-index]");

        if (!wrap) return;

        const cardIndex = Number(wrap.getAttribute("data-index"));

        onCardClick({ player: playerId, lane, cardIndex });
    }

    function handleCardKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const wrap = (e.target as HTMLElement).closest("[data-index]");

            if (!wrap) return;

            const cardIndex = Number(wrap.getAttribute("data-index"));

            onCardClick({ player: playerId, lane, cardIndex });
        }
    }

    function getCardClasses(caravanRow: CaravanRow, index: number): string {
        const head = caravanRow[0];
        const key = targetKey({ player: playerId, lane, cardIndex: index });
        const isTarget = selection.targetSet.has(key);
        const classes = [cardClassName("card", head)];

        if (isTarget) classes.push("target");

        if (selection.pendingRemovalSet.has(key)) classes.push("pending");

        if (selection.flashKeys?.has(key)) classes.push("lastmove");

        if (selection.removingSet.has(key)) classes.push("pending-remove");

        return classes.join(" ");
    }

    function getCardStyle(index: number): CSSProperties {
        return { zIndex: index + 1, "--caravan-tilt": `${String(caravanTilt(playerId, lane, index))}deg` } as CSSProperties;
    }

    return (
        <div
            className={`track ${isHuman && selection.legalCaravans.includes(lane) ? "selectable" : ""}`}
        >
            {children}
            {caravan.rows.map((caravanRow, k) => (
                <CaravanRowButton
                    key={caravanRow[0].id}
                    caravanRow={caravanRow}
                    k={k}
                    playerId={playerId}
                    lane={lane}
                    selection={selection}
                    isHuman={isHuman}
                    getCardClasses={getCardClasses}
                    getCardStyle={getCardStyle}
                    handleCardClick={handleCardClick}
                    handleCardKeyDown={handleCardKeyDown}
                    onAcknowledge={onAcknowledge}
                />
            ))}
            {caravan.rows.length === 0 ? (
                placeholderInteractive ? (
                    <button
                        type="button"
                        className={`empty ${selection.legalCaravans.includes(lane) ? "selectable" : ""}`}
                        aria-label={`Play a card to ${caravanName(playerId, lane)}`}
                        onClick={() => {
                            onPlaceholderClick(lane);
                        }}
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
    isHuman,
    getCardClasses,
    getCardStyle,
    handleCardClick,
    handleCardKeyDown,
    onAcknowledge
}: {
    caravanRow: CaravanRow;
    k: number;
    playerId: PlayerId;
    lane: 0 | 1 | 2;
    selection: SelectionState;
    isHuman: boolean;
    getCardClasses: (r: CaravanRow, i: number) => string;
    getCardStyle: (i: number) => CSSProperties;
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
    const anchorRef = useRef<HTMLDivElement>(null);

    return (
        <button
            type="button"
            className={getCardClasses(caravanRow, k)}
            data-index={k}
            style={getCardStyle(k)}
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
        >
            {attachments.map((a, j) => {
                const isJackConfirm = a.rank === "J" && j === jackIdx && !!confirmationSymbol;
                const isJokerConfirm = isJokerCard(a) && isJokerTargetConfirm;
                const showConfirmation = isJackConfirm || isJokerConfirm;
                const isFlashed = selection.flashKeys?.has(`${rowKey}#${a.id}`) ?? false;

                return (
                    <div
                        key={a.id}
                        ref={showConfirmation ? anchorRef : undefined}
                        className={`${cardClassName("card", a)}${isFlashed ? " lastmove" : ""}`}
                        style={{ "--c": j + 1 } as CSSProperties}
                    >
                        {j === lastKingIndex && kingBadge && (
                            <span className="badge king">{kingBadge}</span>
                        )}
                    </div>
                );
            })}
            {confirmationSymbol && (removable || isJokerTargetConfirm) && (
                <PortalRemove
                    anchorRef={anchorRef}
                    isHuman={isHuman}
                    onAcknowledge={onAcknowledge}
                    label={`Acknowledge removal of card ${head.rank} of ${String(head.suit)}`}
                    symbol={confirmationSymbol}
                />
            )}
        </button>
    );
}

export function CaravanPoints({ meta }: { meta: CaravanPointsMeta }) {
    const statusText = meta.isSold ? "sold" : meta.status;

    return (
        <span
            className={`score ${meta.isSellable ? "sellable" : "unsellable"} ${meta.isSold ? "sold" : ""} ${meta.status === "busted" ? "busted" : ""}`}
            data-total={meta.points}
            data-sellable={meta.isSellable ? "1" : "0"}
        >
            <span className="total" aria-hidden="true">{meta.points}</span>
            <span className="visually-hidden">{`${String(meta.points)} points, ${statusText}`}</span>
        </span>
    );
}

export const Caravan = memo(CaravanImpl);
