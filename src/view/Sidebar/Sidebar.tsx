import { memo, useLayoutEffect, useRef } from "react";
import type { GameState, LogEntry } from "../../model/types";
import type { GameScores } from "../../model/scoring";
import { getCaravanScores } from "../../model/scoring";
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
    const winText =
        winEntry !== null
            ? (() => {
                  const i = winEntry.text.indexOf("!");

                  return i === -1 ? winEntry.text : winEntry.text.slice(0, i + 1);
              })()
            : "";

    useLayoutEffect(() => {
        const el = logRef.current;

        if (!el) return;

        const threshold = 32;
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

        if (!isAtBottom) return;

        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (prefersReduced) {
            el.scrollTop = el.scrollHeight;
        } else {
            el.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "end" });
        }
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
                {displayLog.map((entry, idx) => {
                    const isLast = idx === displayLog.length - 1;
                    const showWinAppend = isLast && winEntry !== null;

                    return (
                        <li className={`line`} key={String(entry.id)}>
                            <div className="text">
                                <DecoratedLog text={entry.text} id={entry.id} />

                                {entry.detail !== undefined && entry.detail.length > 0 ? (
                                    <div className="details">
                                        {entry.detail.map((d, i) => (
                                            <div
                                                key={`${String(entry.id)}-${String(i)}`}
                                                className="detail"
                                            >
                                                <DecoratedLog
                                                    text={d}
                                                    id={`${String(entry.id)}-${String(i)}`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : null}

                                {showWinAppend ? (
                                    <div className="details win-details">
                                        <div className="detail win-line">
                                            <DecoratedLog
                                                text={winText}
                                                id={`${String(winEntry.id)}-win`}
                                            />
                                        </div>

                                        {resolvedScores ? (
                                            <div className="detail">
                                                <GameOverScores scores={resolvedScores} />
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </aside>
    );
}

export const Sidebar = memo(SidebarImpl);
