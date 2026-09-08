import { memo, useLayoutEffect, useRef } from "react";
import type { GameState, LogEntry } from "../../model/types";
import type { GameScores } from "../../model/scoring";
import { getCaravanScores } from "../../model/scoring";
import { truncateSegments } from "../../model/gameLog";
import { DecoratedLog } from "./DecoratedLog";
import { GameOverScores } from "./GameOverScores";

interface SidebarProps {
    log: LogEntry[];
    state?: GameState;
    scores?: GameScores;
}

function SidebarImpl({ log, state, scores }: SidebarProps) {
    const logRef = useRef<HTMLOListElement>(null);
    const resolvedScores = scores ?? (state ? getCaravanScores(state) : undefined);
    const isGameOver = state?.phase === "over";
    const winEntry = isGameOver && log.length > 0 ? log[log.length - 1] : null;
    const displayLog = isGameOver && winEntry !== null ? log.slice(0, -1) : log;

    // Win entries can trail detail after "!"; truncate there, keeping refs intact.

    const winSegments = winEntry !== null ? truncateSegments(winEntry.segments, "!") : [];

    // Pin to the newest entry when the panel opens; afterwards only follow
    // new entries while the user is already near the bottom, so manual
    // scroll-up stays put. The rAF second pass defeats content-visibility
    // height estimates that settle after first paint.

    const firstRun = useRef(true);

    useLayoutEffect(() => {
        const el = logRef.current;

        if (!el) return;

        const pin = () => {
            const node = logRef.current;

            if (node) node.scrollTop = node.scrollHeight;
        };

        if (firstRun.current) {
            firstRun.current = false;
            pin();
            const raf = requestAnimationFrame(pin);

            return () => {
                cancelAnimationFrame(raf);
            };
        }

        const threshold = 48;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

        if (nearBottom) pin();
    }, [log.length]);

    return (
        <aside className="sidebar-log" aria-label="Game log">
            <ol
                className="log"
                ref={logRef}
                role="log"
                aria-live="polite"
                aria-atomic="false"
                aria-relevant="additions text"
                aria-label="Game activity"
            >
                {displayLog.map((entry) => {
                    return (
                        <li className={`line`} key={String(entry.id)}>
                            <div className="text">
                                <DecoratedLog
                                    segments={entry.segments}
                                    text={entry.text}
                                    id={entry.id}
                                />

                                {entry.detail !== undefined && entry.detail.length > 0 ? (
                                    <div className="details">
                                        {entry.detail.map((segArray, i) => (
                                            <div
                                                key={`${String(entry.id)}-${String(i)}`}
                                                className="detail"
                                            >
                                                <DecoratedLog
                                                    segments={segArray}
                                                    id={`${String(entry.id)}-${String(i)}`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </li>
                    );
                })}
                {winEntry !== null ? (
                    <li className={`line`} key={String(winEntry.id)}>
                        <div className="text">
                            <DecoratedLog
                                segments={winSegments}
                                id={`${String(winEntry.id)}-win`}
                            />

                            {resolvedScores ? (
                                <div className="details win-details">
                                    <div className="detail">
                                        <GameOverScores scores={resolvedScores} />
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </li>
                ) : null}
            </ol>
        </aside>
    );
}

export const Sidebar = memo(SidebarImpl);
