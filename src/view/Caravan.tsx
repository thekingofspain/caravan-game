import type { CSSProperties, ReactNode } from "react";
import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cardClassName } from "../model/cards";
import { calculateScore, isSellable } from "../model/rules/caravanCardRules";
import {
    Caravan as CaravanType,
    CaravanIndex,
    CaravanRow,
    Human,
    isJokerCard,
    PlayerId,
    SelectionState,
    TargetRef} from "../model/types";
import { targetKey } from "../viewmodel/transition";

interface CaravanProps {
    caravan: CaravanType;
    caravanIndex: CaravanIndex;
    playerId: PlayerId;
    highestSold: boolean;
    selection: SelectionState;
    onCardClick: (target: TargetRef) => void;
    onPlaceholderClick: (caravanIndex: CaravanIndex) => void;
    onAcknowledge: () => void;
    children?: ReactNode;
}

interface PortalRemoveProps {
    anchorRef: React.RefObject<HTMLDivElement | null>;
    isHuman: boolean;
    onAcknowledge: () => void;
    label: string;
    symbol: string;
}

function PortalRemove({ anchorRef, isHuman, onAcknowledge, label, symbol }: PortalRemoveProps) {
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    // Web pages cannot move the system cursor; keyboard focus on the X plus
    // revealing its card is the closest equivalent.

    const focusRef = useCallback(
        (node: HTMLSpanElement | null) => {
            if (!node) return;

            node.focus({ preventScroll: true });
            anchorRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
        },
        [anchorRef]
    );

    useLayoutEffect(() => {
        const update = () => {
            const el = anchorRef.current;

            if (!el) return;

            const r = el.getBoundingClientRect();
            const size = 22; // 1.375rem
            const left = isHuman ? r.right - 11 : r.left - 11;
            const top = r.top + r.height / 2 - size / 2;

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
        <span
            ref={focusRef}
            role="button"
            className="confirm portal"
            tabIndex={0}
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
        </span>,
        document.body
    );
}

function CaravanImpl({
    caravan,
    caravanIndex,
    playerId,
    selection,
    onCardClick,
    onPlaceholderClick,
    onAcknowledge,
    children
}: CaravanProps) {
    const isHuman = playerId === Human;
    const caravanIdx = caravanIndex;

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

        if (isTarget) classes.push("target");

        if (selection.pendingRemovalSet.has(key)) classes.push("pending");

        if (selection.flashKeys?.has(key)) classes.push("lastmove");

        if (selection.removingSet.has(key)) classes.push("pending-remove");

        return classes.join(" ");
    }
    function getCardStyle(index: number): CSSProperties {
        return { zIndex: index + 1 };
    }

    return (
        <div
            className={`track ${isHuman && selection.legalCaravans.includes(caravanIndex) ? "selectable" : ""}`}
        >
            {children}
            {caravan.rows.map((caravanRow, k) => (
                <CaravanRowButton
                    key={caravanRow[0].id}
                    caravanRow={caravanRow}
                    k={k}
                    playerId={playerId}
                    caravanIdx={caravanIdx}
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
                <button
                    type="button"
                    className={`empty ${selection.legalCaravans.includes(caravanIndex) ? "selectable" : ""}`}
                    onClick={() => {
                        onPlaceholderClick(caravanIndex);
                    }}
                />
            ) : null}
        </div>
    );
}

function CaravanRowButton({
    caravanRow,
    k,
    playerId,
    caravanIdx,
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
    caravanIdx: 0 | 1 | 2;
    selection: SelectionState;
    isHuman: boolean;
    getCardClasses: (r: CaravanRow, i: number) => string;
    getCardStyle: (i: number) => CSSProperties;
    handleCardClick: (e: React.MouseEvent) => void;
    handleCardKeyDown: (e: React.KeyboardEvent) => void;
    onAcknowledge: () => void;
}) {
    const head = caravanRow[0];
    const removable = selection.pendingRemovalSet.has(
        targetKey({ player: playerId, caravan: caravanIdx, cardIndex: k })
    );
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
    // Pin the confirm X to the Joker itself while removals await ack.

    const isJokerTargetConfirm =
        !removable && selection.pendingRemovalSet.size > 0 && attachments.some(isJokerCard);
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
                const isJokerConfirm = isJokerCard(a) && !!confirmationSymbol;
                const showConfirmation = isJackConfirm || isJokerConfirm;

                return (
                    <div
                        key={a.id}
                        ref={showConfirmation ? anchorRef : undefined}
                        className={cardClassName("card", a)}
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
export function CaravanScore({
    caravan,
    isSeller: highestSold
}: {
    caravan: CaravanType;
    isSeller: boolean;
    playerId?: PlayerId;
}) {
    const total = calculateScore(caravan);
    const sellable = isSellable(caravan);
    const isSold = sellable && highestSold;

    return (
        <span
            className={`score ${sellable ? "sellable" : "unsellable"} ${isSold ? "sold bold" : ""} ${highestSold ? "highest" : ""}`}
            data-total={total}
            data-sellable={sellable ? "1" : "0"}
        >
            <span className="total">{total}</span>
        </span>
    );
}
export const Caravan = memo(CaravanImpl);
