import { Copy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cardLabel } from "../model/cards";
import { inOpeningRound } from "../model/engine";
import { segmentsText } from "../model/gameLog";
import { caravanName } from "../model/names";
import { type GameScores, getCaravanScores } from "../model/scoring";
import type {
    Caravan as CaravanModel,
    Card as CardModel,
    Nullable,
    PlayerState,
    SelectionState
} from "../model/types";
import { Ai, AiLevel, Human, isValueCard, type Move, PlayerId, TargetRef } from "../model/types";
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

const GAMEOVER_COPY = {
    human: { label: "You won the game", title: "You win!" },
    ai: { label: "AI won the game", title: "AI wins" }
} as const;

// Below the breakpoint the sidebar is a hamburger drawer; at and above it
// the rail docks. Measured live: rail (~330-400px) + hands (~185-250px) +
// three lanes crush the caravans column until ~1460px wide at 950px height
// (taller viewports grow the cards further, needing more). 1500px keeps
// half-width laptop windows (~720-1280px) on the drawer and docks only
// once the rail fits without crushing lanes.

const WIDE_SIDEBAR_QUERY = "(min-width: 1500px)";

// Branding-iron stamp placement per caravan: heights staggered so the three
// across never line up vertically; tilt inverts around -12deg within ±5deg.

const SOLD_STAMP_TOPS = ["38%", "54%", "46%"] as const;
const SOLD_STAMP_ROTS = ["-16deg", "-8deg", "-13deg"] as const;
const SHOE_PEEK_ENABLED =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("peekShoe");
const BRACE_RE = /\{([^{}]+)\}/g;

// Direction glyphs live in public/icons (Bootstrap Icons, MIT) and are picked
// by CSS class below: human asc → sort-human-asc.svg, human desc →
// sort-human-desc.svg, ai asc → sort-ai-asc.svg, ai desc → sort-ai-desc.svg.
// Human arrows point down, AI arrows always point up; digits toggle 1-9 / 9-1.

// Title type scale per location, calibrated so every name renders the same
// pixel width: factors are C/k with C = 6.15 and k the measured per-em text
// width of each name (4.91/4.28/6.80/4.29/4.91/4.29 — stable across
// viewports since per-em advances scale linearly). Retune from fresh
// measurements if the names or the typeface change.

const NAME_SCALES: Record<string, number> = {
    Boneyard: 1.253,
    Redding: 1.436,
    "Shady Sands": 0.904,
    Dayglow: 1.435,
    "New Reno": 1.252,
    "The Hub": 1.435
};

function CaravanColumn({
    playerId,
    caravans,
    selection,
    scores,
    isGameOver,
    onCardClick,
    onPlaceholderClick,
    onAcknowledge,
    childrenFor,
    placeholderInteractive = true
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
    placeholderInteractive?: boolean;
}) {
    return (
        <>
            {[0, 1, 2].map((laneIndex) => {
                const caravan = caravans[laneIndex];
                const meta =
                    playerId === Human ? scores.humanPoints[laneIndex] : scores.aiPoints[laneIndex];
                const sellable = meta.isSellable;
                const sold = isGameOver && meta.isSold;

                // Equal rendered widths via the calibrated table above.

                const name = caravanName(playerId, laneIndex);
                const nameScale = NAME_SCALES[name] ?? 1;

                return (
                    <div
                        className={`caravan ${sellable ? "sellable" : ""} ${sold ? "is-sold" : ""}`}
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
                            <CaravanPoints meta={meta} />
                            <span
                                className="title"
                                style={
                                    { "--name-scale": nameScale.toFixed(3) } as React.CSSProperties
                                }
                            >
                                {name}
                            </span>
                            <span className="sigil">
                                {/* Suit pip is a baked SVG icon (public/cards/H|D|C|S)
                                    painted via CSS below; the empty box reserves
                                    the slot before the first card lands, exactly
                                    like the direction placeholder beside it. */}
                                <span
                                    className={["suit", caravan.suit].filter(Boolean).join(" ")}
                                    aria-hidden="true"
                                />
                                <span className="sort-icon" aria-hidden="true" />
                            </span>
                        </header>
                        <Caravan
                            caravan={caravan}
                            lane={laneIndex as 0 | 1 | 2}
                            playerId={playerId}
                            selection={selection}
                            onCardClick={onCardClick}
                            onPlaceholderClick={onPlaceholderClick}
                            onAcknowledge={onAcknowledge}
                            placeholderInteractive={placeholderInteractive}
                        >
                            {childrenFor?.(laneIndex)}
                        </Caravan>
                    </div>
                );
            })}
        </>
    );
}

// Face-up slot beside each shoe showing only the last player-initiated
// discard; Jack/Joker removals and disbanded caravans never land here.
// The human slot becomes a red-X discard button while a selected card has a
// legal discard: clicking the X performs the discard move.

function DiscardSlot({
    player,
    label,
    discardCard,
    onDiscard
}: {
    player: PlayerState;
    label: string;
    discardCard: Nullable<CardModel>;
    onDiscard: () => void;
}) {
    const last = player.discard ?? null;

    if (discardCard !== null) {
        return (
            <button
                type="button"
                className={`discard-slot${last ? " filled" : ""} discardable`}
                onClick={onDiscard}
                aria-label={`Discard ${cardLabel(discardCard)} to your discard pile`}
                title={`Discard ${cardLabel(discardCard)} to your discard pile`}
            >
                {last ? <CardView card={last} /> : <div className="empty" aria-hidden="true" />}
            </button>
        );
    }

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
    const [menuOpen, setMenuOpen] = useState(false);
    const [isWide, setIsWide] = useState(() =>
        typeof window === "undefined" ? false : window.matchMedia(WIDE_SIDEBAR_QUERY).matches
    );
    const [viewShoe, setViewShoe] = useState<Nullable<PlayerId>>(null);
    const [toast, setToast] = useState<Nullable<string>>(null);
    const [flashOffKey, setFlashOffKey] = useState<Nullable<string>>(null);
    const human = isHumanTurn(state);

    // A Jack/Joker removal the human must acknowledge before acting again.

    const awaitingHumanAck = transition?.pendingAck?.confirmer === Human;
    const humanCanAct = human && !awaitingHumanAck;
    const scores = useMemo(() => getCaravanScores(state), [state]);
    const aiLevelControl = (
        <label className="ai-level">
            Difficulty level
            <select
                className="btn"
                aria-label="AI difficulty"
                value={store.aiLevel}
                onChange={(e) => {
                    store.setAiLevel(e.target.value as AiLevel);
                }}
            >
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
                <option value="expert">Expert</option>
                <option value="master">Master</option>
            </select>
        </label>
    );

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
                `${label} — hand:${String(p.hand.length)} shoe:${String(p.shoe.length)} | hand: ${p.hand.map(cardLabel).join(", ")}`
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
        else {
            state.log.forEach((e) => {
                BRACE_RE.lastIndex = 0;
                lines.push(`- ${e.text.replace(BRACE_RE, "$1")}`);
                if (e.detail) {
                    e.detail.forEach((d) => {
                        BRACE_RE.lastIndex = 0;
                        const row = Array.isArray(d) ? segmentsText(d) : d;

                        lines.push(`  - ${row.replace(BRACE_RE, "$1")}`);
                    });
                }
            });
        }

        const text = lines.join("\n");

        try {
            await navigator.clipboard.writeText(text);
            setToast("Copied");
        } catch {
            setToast("Copy failed");
        }
    };

    // Shared sidebar contents: docked rail on wide screens, drawer on narrow.
    // New game also closes the drawer (no-op when docked).

    const menuItems = (
        <>
            <div className="menu-controls">
                <button
                    type="button"
                    className="btn"
                    onClick={() => {
                        onNewGame();
                        setMenuOpen(false);
                    }}
                >
                    New game
                </button>
                {aiLevelControl}
            </div>
            <section className="activity" role="dialog" aria-label="Activity log">
                <header>
                    <span>Activity</span>
                    <div className="activity-actions">
                        <button
                            type="button"
                            className="copy"
                            onClick={() => {
                                void onCopyActivity();
                            }}
                            aria-label="Copy activity log and debug info"
                            title="Copy activity log and debug info"
                        >
                            <Copy size={18} aria-hidden="true" />
                        </button>
                    </div>
                </header>
                <Sidebar log={state.log} state={state} scores={scores} />
            </section>
        </>
    );

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

    // Escape cancels a staged disband or closes the menu; the safe action stays the easy default.

    useEffect(() => {
        if (pendingDisband === null && !menuOpen) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setPendingDisband(null);
                setMenuOpen(false);
            }
        };

        window.addEventListener("keydown", onKey);

        return () => {
            window.removeEventListener("keydown", onKey);
        };
    }, [pendingDisband, menuOpen]);

    // Docking the sidebar makes the drawer redundant: close it.

    useEffect(() => {
        const mq = window.matchMedia(WIDE_SIDEBAR_QUERY);
        const onChange = (e: MediaQueryListEvent) => {
            setIsWide(e.matches);
            if (e.matches) setMenuOpen(false);
        };

        mq.addEventListener("change", onChange);

        return () => {
            mq.removeEventListener("change", onChange);
        };
    }, []);

    // Null while playing: flash gates must not read "not human" as "ai won".

    const winnerSide = state.winner === Human ? "human" : state.winner === Ai ? "ai" : null;

    // Winner banner centers on the board via CSS (left: 50%).

    // Hands flank the board center via flexbox (see global.css): the AI half
    // packs its shoe + hand to its bottom edge and the human half packs its
    // hand + shoe to its top edge, so both hands sit against the center gap
    // beside the caravan placeholders. No measuring: equal halves share the
    // column height, so the packed edges meet at the center.

    // Reset all UI selections on new game (state with empty log + empty caravans).

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
                setViewShoe(null);
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
    const { legalCaravans, targetSet, canDiscard, pendingKeys, pendingJokerKey } =
        useBoardSelection(sel, legal, transition);

    const humanPlayer = displayedState.players[Human];
    const aiPlayer = displayedState.players[Ai];

    // The selected human card offered as a red X on the human discard pile.
    // Gated on the human turn (not just a legal discard) so the X never
    // lingers on AI turns, game over, or while the human must ack a removal.

    const discardCard: Nullable<CardModel> =
        sel !== null && humanCanAct && canDiscard ? (humanPlayer.hand[sel] ?? null) : null;
    const canDisbandAny = humanCanAct && sel === null && !inOpeningRound(humanPlayer);

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
            if (!humanCanAct && winnerSide !== "ai") return null;

            const rows = displayedState.players[Ai].caravans[m.lane].rows;

            if (rows.length === 0) return null;

            return targetKey({ player: Ai, lane: m.lane, cardIndex: rows.length - 1 });
        }

        if (m.type === "playOperationCard") {
            // Face-card flash must survive the ack gate: Jack/Joker stage the
            // played card while the human must still acknowledge, and the
            // played Jack is gone after ack, so gating on humanCanAct would
            // never show it. Removed rows keep the grey pending blink.

            if (!human && winnerSide !== "ai") return null;

            const played = store.previous?.players[Ai].hand.at(m.handIndex);

            if (played === undefined) return null;

            return `${targetKey(m.target)}#${played.id}`;
        }

        return null;
    }, [human, humanCanAct, winnerSide, store.lastMove, store.previous, displayedState]);
    const flashKeys = useMemo(
        () =>
            aiFlashKey !== null && (winnerSide === "ai" || aiFlashKey !== flashOffKey)
                ? new Set([aiFlashKey])
                : EMPTY_STRINGS,
        [aiFlashKey, winnerSide, flashOffKey]
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

    // Double-click a hand card: opening-only shortcut that drops a value card
    // into the first empty human caravan (left to right). Disabled once all
    // three caravans are started — an emptied placeholder mid-game needs an
    // explicit select + placeholder click. The two clicks toggle select on
    // then off, so no delayed-click disambiguation is needed.

    const onHandDoubleClick = useCallback(
        (i: number) => {
            if (!humanCanAct) return;

            // `started` is never cleared, so this stays false for the rest of
            // the game even with an emptied caravan.

            if (!inOpeningRound(humanPlayer)) return;

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
                tryAct({
                    type: "playValueCard",
                    player: Human,
                    lane: laneIndex as 0 | 1 | 2,
                    handIndex: sel
                });
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
        setViewShoe(null);
        setFlashOffKey(null);
        store.reset({ seed: Math.floor(Math.random() * 1e9) });
    }, [store]);

    const onShoeClick = useCallback(() => {
        if (SHOE_PEEK_ENABLED) setViewShoe(Human);
    }, []);
    const onViewAiShoe = useCallback(() => {
        setViewShoe(Ai);
    }, []);

    // Modern confirmation: stage the disband and let the in-app alertdialog
    // confirm it. No window.confirm — blocking native dialogs are unstyleable,
    // untrappable in tests, and dropped from cross-origin iframes.

    const onDisbandCaravan = useCallback(
        (laneIndex: number) => {
            if (!canDisbandAny || humanPlayer.caravans[laneIndex].rows.length === 0) {
                return;
            }

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
        <div className={`board ${winnerSide !== null ? `gameover-${winnerSide}` : ""}`}>
            {toast !== null ? (
                <div role="alert" className="toast">
                    {toast}
                </div>
            ) : null}
            {winnerSide !== null ? (
                <div
                    role="alertdialog"
                    aria-label={GAMEOVER_COPY[winnerSide].label}
                    aria-describedby="gameover-detail"
                    className={`gameover-banner ${winnerSide}`}
                >
                    <span className="gameover-banner-title">{GAMEOVER_COPY[winnerSide].title}</span>
                    <span id="gameover-detail" className="gameover-banner-detail">
                        Caravans {scores.humanWins} – {scores.aiWins}
                    </span>
                    <button type="button" className="btn btn-small" onClick={onNewGame}>
                        New game
                    </button>
                </div>
            ) : null}
            <div className="board-body">
                {isWide ? (
                    <aside className="side-rail" aria-label="Game menu">
                        <span className="brand">Caravan</span>
                        {menuItems}
                    </aside>
                ) : (
                    <button
                        type="button"
                        className="menu-button menu-fab"
                        onClick={() => {
                            setMenuOpen((v) => !v);
                        }}
                        aria-expanded={menuOpen}
                        aria-controls="game-menu"
                        aria-label="Menu"
                        title="Menu"
                    >
                        <span aria-hidden="true" className="menu-icon">
                            <span />
                            <span />
                            <span />
                        </span>
                    </button>
                )}
                <div className="field">
                    <div className="columns">
                        <div className="column caravans">
                            <div className="caravans ai">
                                <CaravanColumn
                                    playerId={Ai}
                                    caravans={aiPlayer.caravans}
                                    selection={aiSelection}
                                    scores={scores}
                                    isGameOver={winnerSide !== null}
                                    onCardClick={onCardClick}
                                    onPlaceholderClick={NOOP}
                                    onAcknowledge={onAcknowledge}
                                    placeholderInteractive={false}
                                />
                            </div>
                            <div className="caravans human">
                                <CaravanColumn
                                    playerId={Human}
                                    caravans={humanPlayer.caravans}
                                    selection={humanSelection}
                                    scores={scores}
                                    isGameOver={winnerSide !== null}
                                    onCardClick={onCardClick}
                                    onPlaceholderClick={onPlaceholderClick}
                                    onAcknowledge={onAcknowledge}
                                    childrenFor={(laneIndex) =>
                                        canDisbandAny &&
                                        humanPlayer.caravans[laneIndex].rows.length > 0 ? (
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
                                <div className="shoe-pair">
                                    <button
                                        type="button"
                                        className={`shoe ai ${aiPlayer.shoe.length === 0 ? "empty" : ""}`}
                                        onClick={SHOE_PEEK_ENABLED ? onViewAiShoe : undefined}
                                        aria-label={
                                            SHOE_PEEK_ENABLED
                                                ? `AI shoe, ${String(aiPlayer.shoe.length)} cards remaining. View the shoe.`
                                                : `AI shoe, ${String(aiPlayer.shoe.length)} cards remaining.`
                                        }
                                        aria-disabled={SHOE_PEEK_ENABLED ? undefined : true}
                                    >
                                        {aiPlayer.shoe.length === 0 ? (
                                            <div className="empty" aria-hidden="true" />
                                        ) : (
                                            <div className="card back deck2" />
                                        )}
                                        <span className="count">{aiPlayer.shoe.length}</span>
                                    </button>
                                    <DiscardSlot
                                        player={aiPlayer}
                                        label="AI"
                                        discardCard={null}
                                        onDiscard={NOOP}
                                    />
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

                            <div className="hand-half human">
                                <PlayerHand
                                    playerId={Human}
                                    player={humanPlayer}
                                    selectedHandIndex={sel}
                                    selectableIndices={selectableIndices}
                                    onCardClick={onHandClick}
                                    onCardDoubleClick={onHandDoubleClick}
                                />
                                <div className="shoe-pair">
                                    <button
                                        type="button"
                                        className={`shoe ${humanPlayer.shoe.length === 0 ? "empty" : ""}`}
                                        onClick={onShoeClick}
                                        aria-label={
                                            SHOE_PEEK_ENABLED
                                                ? `Your shoe, ${String(humanPlayer.shoe.length)} cards remaining. View the shoe.`
                                                : `Your shoe, ${String(humanPlayer.shoe.length)} cards remaining.`
                                        }
                                        aria-disabled={SHOE_PEEK_ENABLED ? undefined : true}
                                    >
                                        {humanPlayer.shoe.length === 0 ? (
                                            <div className="empty" aria-hidden="true" />
                                        ) : (
                                            <div className="card back deck1" />
                                        )}
                                        <span className="count">{humanPlayer.shoe.length}</span>
                                    </button>
                                    <DiscardSlot
                                        player={humanPlayer}
                                        label="Your"
                                        discardCard={discardCard}
                                        onDiscard={onDiscard}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {!isWide && menuOpen ? (
                <div
                    className="menu-backdrop"
                    onClick={() => {
                        setMenuOpen(false);
                    }}
                >
                    <nav
                        id="game-menu"
                        aria-label="Game menu"
                        className="menu-panel"
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                    >
                        <div className="menu-head">
                            <span className="brand">Caravan</span>
                            <button
                                type="button"
                                className="menu-close"
                                onClick={() => {
                                    setMenuOpen(false);
                                }}
                                aria-label="Close menu"
                            >
                                ×
                            </button>
                        </div>
                        {menuItems}
                    </nav>
                </div>
            ) : null}

            {SHOE_PEEK_ENABLED && viewShoe !== null ? (
                <div
                    className="overlay"
                    role="dialog"
                    aria-label={`${viewShoe === Human ? "Your" : "AI"} remaining shoe`}
                >
                    <header>
                        <span>
                            {viewShoe === Human ? "Your" : "AI"} shoe —{" "}
                            {String(state.players[viewShoe].shoe.length)} cards
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                setViewShoe(null);
                            }}
                            aria-label="Close shoe view"
                        >
                            Close
                        </button>
                    </header>
                    <div className="cards">
                        {state.players[viewShoe].shoe.map((c) => (
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
                        aria-label={`Disband your ${caravanName(Human, pendingDisband)}?`}
                        className="disband-confirm"
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                    >
                        <h2>Disband your {caravanName(Human, pendingDisband)}?</h2>
                        <div className="actions">
                            <button
                                type="button"
                                className="btn"
                                onClick={onCancelDisband}
                                autoFocus
                            >
                                Keep caravan
                            </button>
                            <button type="button" className="btn" onClick={onConfirmDisband}>
                                Disband
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
