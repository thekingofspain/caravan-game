import { useCallback, useEffect, useMemo, useState } from "react";

import { cardLabel } from "../model/cards";
import { segmentsText } from "../model/gameLog";
import { caravanName } from "../model/names";
import { type GameScores,getCaravanScores } from "../model/scoring";
import type { Caravan as CaravanModel, Nullable, PlayerState, SelectionState } from "../model/types";
import {
    Ai,
    Human,
    isValueCard,
    type Move,
    PlayerId,
    TargetRef} from "../model/types";
import { SUIT_SYMBOL } from "../model/types";
import { getDisplayedState, targetKey } from "../viewmodel/transition";
import { useBoardSelection } from "../viewmodel/useBoardSelection";
import { GameStore, handSelectable, isHumanTurn } from "../viewmodel/useGame";
import { Caravan, CaravanPoints } from "./Caravan";
import { CardView } from "./CardView";
import { PlayerHand } from "./PlayerHand";
import { Sidebar } from "./Sidebar";

const EMPTY_SET: ReadonlySet<number> = new Set();
const EMPTY_STRINGS: ReadonlySet<string> = new Set();
const NOOP = (): void => undefined;

// Must match the docked-activity `@media` query in global.css.

const WIDE_ACTIVITY_QUERY = "(min-width: 70rem)";

// Branding-iron stamp placement per caravan: heights staggered so the three
// across never line up vertically; tilt inverts around -12deg within ±5deg.

const SOLD_STAMP_TOPS = ["38%", "54%", "46%"] as const;
const SOLD_STAMP_ROTS = ["-16deg", "-8deg", "-13deg"] as const;
const DECK_PEEK_ENABLED =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("peekDeck");
const BRACE_RE = /\{([^{}]+)\}/g;

// Direction glyphs live in public/icons (Bootstrap Icons, MIT) and are picked
// by CSS class below: asc → sort-asc.svg, desc → sort-desc.svg.

function CaravanColumn({
    playerId,
    caravans,
    selection,
    scores,
    isGameOver,
    onCardClick,
    onPlaceholderClick,
    onAcknowledge,
    childrenFor
}: {
    playerId: PlayerId;
    caravans: CaravanModel[];
    selection: SelectionState;
    scores: GameScores;
    isGameOver: boolean;
    onCardClick: (t: TargetRef) => void;
    onPlaceholderClick: (laneIndex: number) => void;
    onAcknowledge: () => void;
    childrenFor?: (laneIndex: number) => React.ReactNode;
}) {
    return (
        <>
            {[0, 1, 2].map((laneIndex) => {
                const seller = scores.sellers[laneIndex as 0 | 1 | 2];
                const caravan = caravans[laneIndex];
                const meta = (playerId === Human ? scores.humanPoints[laneIndex] : scores.aiPoints[laneIndex]);
                const sellable = meta.isSellable;
                const isEmpty = caravan.rows.length === 0;
                const sold = isGameOver && meta.isSold;

                return (
                    <div
                        className={`caravan ${sellable ? "sellable" : ""} ${isEmpty ? "is-empty" : ""} ${sold ? "is-sold" : ""}`}
                        key={laneIndex}
                    >
                        {sold ? (
                            <div
                                className="sold-stamp"
                                style={
                                    {
                                        "--sold-top": SOLD_STAMP_TOPS[laneIndex as 0 | 1 | 2],
                                        "--sold-rot": SOLD_STAMP_ROTS[laneIndex as 0 | 1 | 2]
                                    } as React.CSSProperties
                                }
                                aria-hidden="true"
                            >
                                Sold
                            </div>
                        ) : null}
                        <header data-dir={caravan.direction ?? undefined}>
                            <CaravanPoints
                                meta={meta}
                            />
                            <span className="title">{caravanName(playerId, laneIndex)}</span>
                                <span className="sort-icon" aria-hidden="true" />
                                {caravan.suit !== null ? (
                                    <span className={`suit card-name ${caravan.suit}`}>
                                        {SUIT_SYMBOL[caravan.suit]}
                                    </span>
                                ) : null}
                        </header>
                        <Caravan
                            caravan={caravan}
                            lane={laneIndex as 0 | 1 | 2}
                            playerId={playerId}
                            highestSold={seller === playerId}
                            selection={selection}
                            onCardClick={onCardClick}
                            onPlaceholderClick={onPlaceholderClick}
                            onAcknowledge={onAcknowledge}
                        >
                            {childrenFor?.(laneIndex)}
                        </Caravan>
                    </div>
                );
            })}
        </>
    );
}

// Face-up slot beside each deck showing only the last player-initiated
// discard (big red X); Jack/Joker removals and disbanded caravans never land here.

function DiscardSlot({ player, label }: { player: PlayerState; label: string }) {
    const last = player.discard ?? null;

    if (last === null) {
        return (
            <div className="discard-slot" aria-label={`${label} discard pile, empty`}>
                <div className="empty" aria-hidden="true" />
            </div>
        );
    }

    return (
        <div
            className="discard-slot filled"
            role="img"
            aria-label={`${label} discarded ${cardLabel(last)}`}
        >
            <CardView card={last} />
        </div>
    );
}

export function Board({ store }: { store: GameStore }) {
    const { state, legal, act, transition, acknowledgeRemovals } = store;
    const [sel, setSel] = useState<Nullable<number>>(null);
    const [pendingRemove, setPendingRemove] = useState<Set<string>>(new Set());
    const [pendingDisband, setPendingDisband] = useState<Nullable<number>>(null);

    // Wide viewport (matches the docked-activity media query): panel stays open.

    const [activityOpen, setActivityOpen] = useState(() =>
        typeof window === "undefined" ? false : window.matchMedia(WIDE_ACTIVITY_QUERY).matches
    );
    const [viewDeck, setViewDeck] = useState<Nullable<PlayerId>>(null);
    const [toast, setToast] = useState<Nullable<string>>(null);
    const [showGameOver, setShowGameOver] = useState(true);
    const [flashOffKey, setFlashOffKey] = useState<Nullable<string>>(null);
    const human = isHumanTurn(state);

    // A Jack/Joker removal the human must acknowledge before acting again.

    const awaitingHumanAck = transition?.pendingAck?.confirmer === Human;
    const humanCanAct = human && !awaitingHumanAck;
    const scores = useMemo(() => getCaravanScores(state), [state]);

    const onCopyActivity = async () => {
        const lines: string[] = [];
        const params =
            typeof window !== "undefined"
                ? new URLSearchParams(window.location.search).get("seed")
                : null;

        lines.push(
            `Seed: ${params ?? "(random)"} | Phase: ${state.phase} | Current: ${state.current === Human ? "Human" : "AI"} | Winner: ${String(state.winner ?? "none")}`
        );
        for (const pid of [Human, Ai] as const) {
            const p = state.players[pid];
            const label = pid === Human ? "Human" : "AI";

            lines.push(
                `${label} — hand:${String(p.hand.length)} deck:${String(p.deck.length)} | hand: ${p.hand.map(cardLabel).join(", ")}`
            );
            const metas = pid === Human ? scores.humanPoints : scores.aiPoints;

            p.caravans.forEach((c, laneIndex) => {
                const meta = metas[laneIndex];

                lines.push(
                    `  ${caravanName(pid, laneIndex)}: ${String(meta.points)} (${meta.status}) — rows:${String(c.rows.length)} dir:${c.direction ?? "-"} suit:${c.suit ?? "-"}`
                );
            });
        }

        lines.push("");
        lines.push("Activity Log:");
        if (state.log.length === 0) lines.push("(empty)");
        else
            {state.log.forEach((e) => {
                BRACE_RE.lastIndex = 0;
                lines.push(`- ${e.text.replace(BRACE_RE, "$1")}`);
                if (e.detail)
                    {e.detail.forEach((d) => {
                        BRACE_RE.lastIndex = 0;
                        const row = Array.isArray(d) ? segmentsText(d) : d;

                        lines.push(`  - ${row.replace(BRACE_RE, "$1")}`);
                    });}
            });}

        const text = lines.join("\n");

        try {
            await navigator.clipboard.writeText(text);
            setToast("Copied activity + debug to clipboard");
        } catch {
            setToast("Copy failed");
        }
    };

    // auto-clear toast after 3s

    useEffect(() => {
        if (!toast) return;

        const t = setTimeout(() => {
            setToast(null);
        }, 3000);

        return () => {
            clearTimeout(t);
        };
    }, [toast]);

    // Escape cancels a staged disband; the safe action stays the easy default.

    useEffect(() => {
        if (pendingDisband === null) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setPendingDisband(null);
        };

        window.addEventListener("keydown", onKey);

        return () => {
            window.removeEventListener("keydown", onKey);
        };
    }, [pendingDisband]);

    const isGameOver = state.phase === "over";
    const humanWon = state.winner === Human;
    const aiWon = isGameOver && state.winner === Ai;

    // Re-show the banner for each new finished game.

    useEffect(() => {
        if (isGameOver) setShowGameOver(true);
    }, [isGameOver, state.winner]);

    // Re-open the panel whenever the viewport becomes wide enough to dock it.

    useEffect(() => {
        const mq = window.matchMedia(WIDE_ACTIVITY_QUERY);
        const onChange = (e: MediaQueryListEvent) => {
            if (e.matches) setActivityOpen(true);
        };

        mq.addEventListener("change", onChange);

        return () => {
            mq.removeEventListener("change", onChange);
        };
    }, []);

    // Reset all UI state on new game (state with empty log + empty caravans).
    // Activity stays as-is: it is persistent chrome on wide viewports.

    useEffect(() => {
        const isNewGame =
            state.log.length === 0 &&
            state.players.every((p) => p.caravans.every((c) => c.rows.length === 0));

        if (isNewGame) {
            const id = setTimeout(() => {
                setSel(null);
                setPendingRemove(new Set());
                setPendingDisband(null);
                setToast(null);
                setViewDeck(null);
                setFlashOffKey(null);
            }, 0);

            return () => {
                clearTimeout(id);
            };
        }
    }, [state]);

    // Displayed state is previous + staged played card while a removal awaits human ack.

    const displayedState = useMemo(() => {
        if (transition?.pendingAck?.confirmer !== Human) return state;

        return getDisplayedState(store.previous, state, transition);
    }, [state, transition, store.previous]);
    const { legalCaravans, targetSet, canDiscard, pendingKeys, pendingJokerKey } = useBoardSelection(
        sel,
        legal,
        transition
    );

    const humanPlayer = displayedState.players[Human];
    const aiPlayer = displayedState.players[Ai];
    const canDisbandAny =
        humanCanAct &&
        sel === null &&
        humanPlayer.caravans.every((c) => c.started ?? c.rows.length > 0);

    // Blink the AI's last board move in yellow while the human turn starts.
    // Value plays flash their fresh row; operation plays flash the played
    // face card itself, not the value card underneath. Jack/Joker removals
    // keep the grey pending blink on the removed cards; only the played
    // Jack/Joker itself flashes yellow. Cleared on select. When the AI wins,
    // the winning card keeps flashing after game over.

    const aiFlashKey = useMemo(() => {
        const m = store.lastMove;

        if (m?.player !== Ai) return null;

        if (m.type === "playValueCard") {
            if (!humanCanAct && !aiWon) return null;

            const rows = displayedState.players[Ai].caravans[m.lane].rows;

            if (rows.length === 0) return null;

            return targetKey({ player: Ai, lane: m.lane, cardIndex: rows.length - 1 });
        }

        if (m.type === "playOperationCard") {
            // Face-card flash must survive the ack gate: Jack/Joker stage the
            // played card while the human must still acknowledge, and the
            // played Jack is gone after ack, so gating on humanCanAct would
            // never show it. Removed rows keep the grey pending blink.

            if (!human && !aiWon) return null;

            const played = store.previous?.players[Ai].hand.at(m.handIndex);

            if (played === undefined) return null;

            return `${targetKey(m.target)}#${played.id}`;
        }

        return null;
    }, [human, humanCanAct, aiWon, store.lastMove, store.previous, displayedState]);
    const flashKeys = useMemo(
        () =>
            aiFlashKey !== null && (aiWon || aiFlashKey !== flashOffKey)
                ? new Set([aiFlashKey])
                : EMPTY_STRINGS,
        [aiFlashKey, aiWon, flashOffKey]
    );

    const selectableIndices = useMemo(() => {
        const set = new Set<number>();

        if (humanCanAct) {
            for (let i = 0; i < humanPlayer.hand.length; i++) {
                if (handSelectable(state, legal, i)) set.add(i);
            }
        }

        return set;
    }, [humanCanAct, humanPlayer.hand, state, legal]);

    const tryAct = useCallback(
        (move: Move) => {
            try {
                act(move);

                return true;
            } catch (e) {
                setToast(e instanceof Error ? e.message : String(e));

                return false;
            }
        },
        [act]
    );

    const onHandClick = useCallback(
        (i: number) => {
            if (!selectableIndices.has(i)) return;

            // First selection stops the AI-last-move flash; deselecting never restores it.

            if (sel === null) setFlashOffKey(aiFlashKey);

            setSel((s) => (s === i ? null : i));
        },
        [selectableIndices, sel, aiFlashKey]
    );

    // Double-click a hand card: value cards jump straight to the first empty
    // human caravan (left to right). The two clicks toggle select on then off,
    // so no delayed-click disambiguation is needed.

    const onHandDoubleClick = useCallback(
        (i: number) => {
            if (!humanCanAct) return;

            const card = humanPlayer.hand[i];

            if (!isValueCard(card)) return;

            const laneIndex = humanPlayer.caravans.findIndex((c) => c.rows.length === 0);

            if (laneIndex === -1) return;

            const move = legal.find(
                (a) =>
                    a.type === "playValueCard" &&
                    a.player === Human &&
                    a.handIndex === i &&
                    a.lane === laneIndex
            );

            if (move) {
                tryAct(move);
                setSel(null);
            }
        },
        [humanCanAct, humanPlayer, legal, tryAct]
    );

    const onAcknowledge = useCallback(() => {
        if (!transition?.pendingAck) return;

        setPendingRemove(new Set(transition.pendingAck.removed.map(targetKey)));
        window.setTimeout(() => {
            setPendingRemove(new Set());
            acknowledgeRemovals();
            setSel(null);
        }, 320);
    }, [transition, acknowledgeRemovals]);

    const onCardClick = useCallback(
        (target: TargetRef) => {
            if (sel === null || awaitingHumanAck) return;

            const card = humanPlayer.hand[sel];

            if (target.player === Ai) {
                if (targetSet.has(targetKey(target))) {
                    tryAct({ type: "playOperationCard", player: Human, target, handIndex: sel });
                    setSel(null);
                }

                return;
            }

            if (isValueCard(card)) {
                const caravanLen = humanPlayer.caravans[target.lane].rows.length;
                const isTop = target.cardIndex === caravanLen - 1;

                if (legalCaravans.includes(target.lane) && isTop) {
                    tryAct({
                        type: "playValueCard",
                        player: Human,
                        lane: target.lane,
                        handIndex: sel
                    });
                    setSel(null);
                }

                return;
            }

            if (targetSet.has(targetKey(target))) {
                tryAct({ type: "playOperationCard", player: Human, target, handIndex: sel });
                setSel(null);
            }
        },
        [sel, awaitingHumanAck, humanPlayer, targetSet, legalCaravans, tryAct]
    );

    const onPlaceholderClick = useCallback(
        (laneIndex: number) => {
            if (sel === null) return;

            const card = humanPlayer.hand[sel];

            if (isValueCard(card) && legalCaravans.includes(laneIndex)) {
                tryAct({ type: "playValueCard", player: Human, lane: laneIndex as 0 | 1 | 2, handIndex: sel });
                setSel(null);
            }
        },
        [sel, humanPlayer, legalCaravans, tryAct]
    );

    const onDiscard = useCallback(() => {
        if (sel === null) return;

        const d = legal.find((a) => a.type === "discardCard" && a.handIndex === sel);

        if (d) {
            tryAct(d);
            setSel(null);
        }
    }, [sel, legal, tryAct]);

    const onNewGame = useCallback(() => {
        setSel(null);
        setPendingRemove(new Set());
        setPendingDisband(null);
        setToast(null);
        setViewDeck(null);
        setFlashOffKey(null);
        store.reset({ seed: Math.floor(Math.random() * 1e9) });
    }, [store]);

    const onDeckClick = useCallback(() => {
        if (sel !== null && canDiscard) onDiscard();
        else if (DECK_PEEK_ENABLED) setViewDeck(Human);
    }, [sel, canDiscard, onDiscard]);
    const onViewAiDeck = useCallback(() => {
        setViewDeck(Ai);
    }, []);

    // Modern confirmation: stage the disband and let the in-app alertdialog
    // confirm it. No window.confirm — blocking native dialogs are unstyleable,
    // untrappable in tests, and dropped from cross-origin iframes.

    const onDisbandCaravan = useCallback(
        (laneIndex: number) => {
            if (!canDisbandAny || humanPlayer.caravans[laneIndex].rows.length === 0)
                {return;}

            setPendingDisband(laneIndex);
        },
        [canDisbandAny, humanPlayer]
    );

    const onConfirmDisband = useCallback(() => {
        if (pendingDisband === null) return;

        tryAct({ type: "disbandCaravan", player: Human, lane: pendingDisband as 0 | 1 | 2 });
        setPendingDisband(null);
        setSel(null);
    }, [pendingDisband, tryAct]);

    const onCancelDisband = useCallback(() => {
        setPendingDisband(null);
    }, []);

    const aiSelection = useMemo(
        () => ({
            selectedHandIndex: null,
            selectedCard: null,
            legalCaravans: [] as number[],
            targetSet,
            pendingRemovalSet: pendingKeys,
            pendingJokerKey,
            removingSet: pendingRemove,
            canDiscard: false,
            flashKeys
        }),
        [targetSet, pendingKeys, pendingJokerKey, pendingRemove, flashKeys]
    );
    const humanSelection = useMemo(
        () => ({
            selectedHandIndex: sel,
            selectedCard: sel !== null ? (humanPlayer.hand[sel] ?? null) : null,
            legalCaravans,
            targetSet,
            pendingRemovalSet: pendingKeys,
            pendingJokerKey,
            removingSet: pendingRemove,
            canDiscard,
            flashKeys
        }),
        [
            sel,
            humanPlayer.hand,
            legalCaravans,
            targetSet,
            pendingKeys,
            pendingJokerKey,
            pendingRemove,
            canDiscard,
            flashKeys
        ]
    );

    return (
        <div className={`board ${isGameOver ? (humanWon ? "gameover-human" : "gameover-ai") : ""}`}>
            {toast !== null ? (
                <div role="alert" className="toast">
                    {toast}
                </div>
            ) : null}
            {isGameOver && showGameOver ? (
                <div
                    role="alertdialog"
                    aria-label={humanWon ? "You won the game" : "AI won the game"}
                    aria-describedby="gameover-detail"
                    className={`gameover-banner ${humanWon ? "human" : "ai"}`}
                >
                    <span className="gameover-banner-title">
                        {humanWon ? "You win!" : "AI wins"}
                    </span>
                    <span id="gameover-detail" className="gameover-banner-detail">
                        Caravans {scores.humanWins} – {scores.aiWins}
                    </span>
                    <button
                        type="button"
                        className="close"
                        onClick={() => {
                            setShowGameOver(false);
                        }}
                        aria-label="Dismiss game over announcement"
                    >
                        ×
                    </button>
                </div>
            ) : null}
            <div className="field">
                <div className="columns">
                    <div className="column caravans">
                        <div className="caravans ai">
                            <CaravanColumn
                                playerId={Ai}
                                caravans={aiPlayer.caravans}
                                selection={aiSelection}
                                scores={scores}
                                isGameOver={isGameOver}
                                onCardClick={onCardClick}
                                onPlaceholderClick={NOOP}
                                onAcknowledge={onAcknowledge}
                            />
                        </div>
                        <div className="caravans human">
                            <CaravanColumn
                                playerId={Human}
                                caravans={humanPlayer.caravans}
                                selection={humanSelection}
                                scores={scores}
                                isGameOver={isGameOver}
                                onCardClick={onCardClick}
                                onPlaceholderClick={onPlaceholderClick}
                                onAcknowledge={onAcknowledge}
                                childrenFor={(laneIndex) =>
                                    canDisbandAny && humanPlayer.caravans[laneIndex].rows.length > 0 ? (
                                        <button
                                            type="button"
                                            className="disband"
                                            onClick={() => {
                                                onDisbandCaravan(laneIndex);
                                            }}
                                            aria-label={`Disband your ${caravanName(Human, laneIndex)}`}
                                        >
                                            Disband
                                        </button>
                                    ) : null
                                }
                            />
                        </div>
                    </div>

                    <div className="column hands">
                        <div className="hand-half">
                            <div className="deck-pair">
                                <button
                                    type="button"
                                    className={`deck ai ${aiPlayer.deck.length === 0 ? "empty" : ""}`}
                                    onClick={DECK_PEEK_ENABLED ? onViewAiDeck : undefined}
                                    aria-label={
                                        DECK_PEEK_ENABLED
                                            ? `AI deck, ${String(aiPlayer.deck.length)} cards remaining. View the deck.`
                                            : `AI deck, ${String(aiPlayer.deck.length)} cards remaining.`
                                    }
                                    aria-disabled={DECK_PEEK_ENABLED ? undefined : true}
                                >
                                    {aiPlayer.deck.length === 0 ? (
                                        <div className="empty" aria-hidden="true" />
                                    ) : (
                                        <div className="card back deck2" />
                                    )}
                                    <span className="count">{aiPlayer.deck.length}</span>
                                </button>
                                <DiscardSlot player={aiPlayer} label="AI" />
                            </div>
                            <PlayerHand
                                playerId={Ai}
                                player={aiPlayer}
                                selectedHandIndex={null}
                                selectableIndices={EMPTY_SET}
                                onCardClick={NOOP}
                                onCardDoubleClick={NOOP}
                            />
                        </div>

                        <div className="controls">
                            <button type="button" className="btn" onClick={onNewGame}>
                                New game
                            </button>
                            <button
                                type="button"
                                className="btn"
                                onClick={() => {
                                    setActivityOpen((v) => !v);
                                }}
                                aria-expanded={activityOpen}
                            >
                                Activity
                            </button>
                        </div>

                        <div className="hand-half human">
                            <PlayerHand
                                playerId={Human}
                                player={humanPlayer}
                                selectedHandIndex={sel}
                                selectableIndices={selectableIndices}
                                onCardClick={onHandClick}
                                onCardDoubleClick={onHandDoubleClick}
                            />
                            <div className="deck-pair">
                                <button
                                    type="button"
                                    className={`deck ${humanPlayer.deck.length === 0 ? "empty" : ""}`}
                                    onClick={onDeckClick}
                                    aria-label={
                                        DECK_PEEK_ENABLED
                                            ? `Your deck, ${String(humanPlayer.deck.length)} cards remaining. Click to discard the selected card and draw a new one, or view the deck.`
                                            : `Your deck, ${String(humanPlayer.deck.length)} cards remaining. Click to discard the selected card and draw a new one.`
                                    }
                                >
                                    {humanPlayer.deck.length === 0 ? (
                                        <div className="empty" aria-hidden="true" />
                                    ) : (
                                        <div className="card back deck1" />
                                    )}
                                    <span className="count">{humanPlayer.deck.length}</span>
                                </button>
                                <DiscardSlot player={humanPlayer} label="Your" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {activityOpen ? (
                <div className="activity" role="dialog" aria-label="Activity log">
                    <header>
                        <span>Activity</span>
                        <div className="activity-actions">
                            <button
                                type="button"
                                className="btn copy"
                                onClick={() => {
                                    void onCopyActivity();
                                }}
                                aria-label="Copy activity log and debug info"
                            >
                                Copy
                            </button>
                        </div>
                    </header>
                    <button
                        type="button"
                        className="close"
                        onClick={() => {
                            setActivityOpen(false);
                        }}
                        aria-label="Close activity log"
                    >
                        ×
                    </button>
                    <Sidebar log={state.log} state={state} scores={scores} />
                </div>
            ) : null}

            {DECK_PEEK_ENABLED && viewDeck !== null ? (
                <div
                    className="overlay"
                    role="dialog"
                    aria-label={`${viewDeck === Human ? "Your" : "AI"} remaining deck`}
                >
                    <header>
                        <span>
                            {viewDeck === Human ? "Your" : "AI"} deck —{" "}
                            {String(state.players[viewDeck].deck.length)} cards
                        </span>
                        <button
                            type="button"
                            className="close"
                            onClick={() => {
                                setViewDeck(null);
                            }}
                            aria-label="Close deck view"
                        >
                            Close
                        </button>
                    </header>
                    <div className="cards">
                        {state.players[viewDeck].deck.map((c) => (
                            <CardView key={c.id} card={c} />
                        ))}
                    </div>
                </div>
            ) : null}
            {pendingDisband !== null ? (
                <div
                    className="disband-backdrop"
                    onClick={() => {
                        onCancelDisband();
                    }}
                >
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="disband-confirm-title"
                        aria-describedby="disband-confirm-detail"
                        aria-label={`Disband your ${caravanName(Human, pendingDisband)}`}
                        className="disband-confirm"
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                    >
                        <h2 id="disband-confirm-title">
                            Disband your {caravanName(Human, pendingDisband)}?
                        </h2>
                        <p id="disband-confirm-detail">
                            This removes all{" "}
                            {String(humanPlayer.caravans[pendingDisband].rows.flat().length)} cards
                            (points {String(scores.humanPoints[pendingDisband].points)}) and cannot be
                            undone.
                        </p>
                        <div className="actions">
                            <button
                                type="button"
                                className="btn"
                                onClick={onCancelDisband}
                                autoFocus
                            >
                                Keep caravan
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={onConfirmDisband}
                                aria-label={`Disband your ${caravanName(Human, pendingDisband)}`}
                            >
                                Disband
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
