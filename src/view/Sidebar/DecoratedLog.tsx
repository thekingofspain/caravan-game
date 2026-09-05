/* eslint-disable @typescript-eslint/no-unnecessary-condition -- low-level string index checks are intentional */
import { memo } from "react";
import type { ReactNode } from "react";
import { ALL_CARAVAN_NAMES } from "../../model/names";
import type { Card, JokerType, Suit, SuitedRank } from "../../model/types";
import { SUIT_SYMBOL } from "../../model/types";
import { Who } from "./Who";
import { CardName } from "./CardName";

const SYMBOL_TO_SUIT: Record<string, Suit> = Object.fromEntries(
    Object.entries(SUIT_SYMBOL).map(([suit, symbol]) => [symbol, suit as Suit])
);

function parseCardToken(token: string, id: string): Card {
    if (token.includes("Joker")) {
        const jokerType: JokerType = token.includes("Red") ? "Red" : "Black";

        return { id, rank: "Joker", suit: null, jokerType };
    }

    const symbol = token.charAt(token.length - 1);
    const suit = SYMBOL_TO_SUIT[symbol] ?? "spades";
    const rank = token.slice(0, -1) as SuitedRank;

    return { id, rank, suit };
}

function decorateWho(text: string, keyBase: string): ReactNode[] {
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let k = 0;
    let pos = 0;

    while (pos < text.length) {
        let bestIdx = -1;
        let bestLen = 0;
        let bestSide: "ai" | "human" | null = null;
        let bestRef: string | null = null;
        let isCaravan = false;

        for (const name of ALL_CARAVAN_NAMES) {
            for (const owner of ["AI's caravan ", "your caravan "] as const) {
                const needle = owner + name;
                const idx = text.indexOf(needle, pos);

                if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
                    let start = idx;
                    let prefixLen = 0;
                    const probeStart = Math.max(0, idx - 20);
                    const probe = text.slice(probeStart, idx);
                    const rowPos = probe.lastIndexOf("row ");

                    if (rowPos !== -1) {
                        const afterRow = probe.slice(rowPos + 4);
                        const ofPos = afterRow.indexOf(" of ");

                        if (ofPos !== -1) {
                            const numStr = afterRow.slice(0, ofPos);

                            if (numStr.length > 0 && /^\d+$/.test(numStr)) {
                                const candidate = probe.slice(rowPos);

                                if (candidate.endsWith(" of ")) {
                                    start = probeStart + rowPos;
                                    prefixLen = candidate.length;
                                }
                            }
                        }
                    }

                    bestIdx = start;
                    bestLen = prefixLen + needle.length;
                    bestSide = owner.startsWith("AI") ? "ai" : "human";
                    bestRef = name;
                    isCaravan = true;
                }
            }
        }

        let tokenIdx = -1;
        let tokenSide: "ai" | "human" | null = null;
        let tokenLen = 0;

        const checkWord = (word: string, side: "ai" | "human") => {
            let idx = text.indexOf(word, pos);

            while (idx !== -1) {
                const before = idx > 0 ? text[idx - 1] : " ";
                const after = idx + word.length < text.length ? text[idx + word.length] : " ";
                const beforeIsWord =
                    (before >= "A" && before <= "Z") ||
                    (before >= "a" && before <= "z") ||
                    (before >= "0" && before <= "9") ||
                    before === "_";
                const afterIsWord =
                    (after >= "A" && after <= "Z") ||
                    (after >= "a" && after <= "z") ||
                    (after >= "0" && after <= "9") ||
                    after === "_";
                const isBoundary = !beforeIsWord && !afterIsWord;

                if (isBoundary && (bestIdx === -1 || idx < bestIdx || idx >= bestIdx + bestLen)) {
                    if (tokenIdx === -1 || idx < tokenIdx) {
                        tokenIdx = idx;
                        tokenSide = side;
                        tokenLen = word.length;
                    }

                    break;
                }

                idx = text.indexOf(word, idx + 1);
            }
        };

        checkWord("You", "human");
        checkWord("AI", "ai");

        if (bestIdx !== -1 && (tokenIdx === -1 || bestIdx < tokenIdx)) {
            // keep caravan match
        } else if (tokenIdx !== -1) {
            bestIdx = tokenIdx;
            bestLen = tokenLen;
            bestSide = tokenSide;
            bestRef = null;
            isCaravan = false;
        } else break;

        if (bestIdx === -1 || bestSide === null) break;

        if (bestIdx > last) nodes.push(text.slice(last, bestIdx));

        const key = `${keyBase}-${String(k++)}`;

        if (isCaravan) {
            nodes.push(<Who key={key} side={bestSide} caravan={bestRef} />);
        } else {
            nodes.push(<Who key={key} side={bestSide} />);
        }

        last = bestIdx + bestLen;
        pos = last;
    }

    if (last < text.length) nodes.push(text.slice(last));

    return nodes;
}

function decorateCardTokens(text: string, keyBase: string | number): ReactNode[] {
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let k = 0;

    while (true) {
        const open = text.indexOf("{", last);

        if (open === -1) break;

        const close = text.indexOf("}", open + 1);

        // Unclosed "{": not a card token. Render the tail literally via
        // decorateWho (recursion-free) instead of dropping it or recursing forever.

        if (close === -1) {
            nodes.push(...decorateWho(text.slice(last), String(keyBase)));
            last = text.length;
            break;
        }

        if (open > last)
            nodes.push(...decorateLog(text.slice(last, open), `${String(keyBase)}-${String(k++)}`));

        const m1 = text.slice(open + 1, close);
        const cardId = `c${String(keyBase)}-${String(k++)}`;
        const card = parseCardToken(m1, cardId);

        nodes.push(<CardName key={cardId} card={card} />);

        last = close + 1;
    }

    if (last < text.length)
        nodes.push(...decorateLog(text.slice(last), `${String(keyBase)}-${String(k)}`));

    return nodes;
}

export function decorateLog(text: string, keyBase: string | number = 0): ReactNode[] {
    if (text.includes("{")) return decorateCardTokens(text, keyBase);

    return decorateWho(text, String(keyBase));
}

function renderSegments(segments: (string | Card)[], keyBase: string | number): ReactNode[] {
    const nodes: ReactNode[] = [];

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];

        if (typeof seg === "string") {
            nodes.push(...decorateLog(seg, `${String(keyBase)}-${String(i)}`));
        } else {
            const key = `${String(keyBase)}-card-${String(i)}`;

            // Use a stable key per segment index; CardName will handle display

            nodes.push(<CardName key={key} card={seg} />);
        }
    }

    return nodes;
}

export const DecoratedLog = memo(function DecoratedLog({
    text,
    segments,
    id
}: {
    text?: string;
    segments?: (string | Card)[];
    id: string | number;
}) {
    if (segments !== undefined) {
        return <>{renderSegments(segments, id)}</>;
    }

    if (text !== undefined) {
        return <>{decorateLog(text, id)}</>;
    }

    return null;
});

DecoratedLog.displayName = "DecoratedLog";
