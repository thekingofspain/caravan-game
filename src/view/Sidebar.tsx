import { memo, useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { GameState, LogEntry } from "../model/types";
import { CARAVAN_NAMES } from "../model/names";
import type { GameScores } from "../model/scoring";
import { getCaravanScores } from "../model/scoring";
const ALL_CARAVAN_NAMES = Object.values(CARAVAN_NAMES).flat();
const SIDE_ICON = { human: "👤", ai: "🤖" } as const;
function Who({ side, caravan }: { side: "ai" | "human"; caravan?: string | null }) {
  return (
    <span className={`who ${side}`} aria-label={side === "ai" ? "AI" : "You"}>
      {caravan !== null && caravan !== undefined ? (
        <>
          <span className="icon" aria-hidden="true">{SIDE_ICON[side]}</span>
          <span className="caravan-ref" aria-hidden="true">🐎<span className="who-ref">{caravan}</span></span>
        </>
      ) : (
        <span aria-hidden="true">{SIDE_ICON[side]}</span>
      )}
    </span>
  );
}

function CardName({ name }: { name: string }) {
  const hasHeart = name.includes("♥");
  const hasDiamond = name.includes("♦");
  const hasClub = name.includes("♣");
  const hasRed = hasHeart || hasDiamond || name.includes("Red");
  let cls = "card-name black";
  if (hasRed && !hasDiamond) cls = "card-name red";
  else if (hasDiamond) cls = "card-name diamonds";
  else if (hasClub) cls = "card-name clubs";
  return <span className={cls}>{name}</span>;
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
    // find earliest caravan reference (ownership + name + optional "row N of ")
    for (const name of ALL_CARAVAN_NAMES) {
      for (const owner of ["AI's caravan ", "your caravan "] as const) {
        const needle = owner + name;
        const idx = text.indexOf(needle, pos);
        if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
          let start = idx;
          let prefixLen = 0;
          const probeStart = Math.max(0, idx - 20);
          const probe = text.slice(probeStart, idx);
          // check for "row N of " suffix without regex
          const rowPos = probe.lastIndexOf("row ");
          if (rowPos !== -1) {
            const afterRow = probe.slice(rowPos + 4);
            const ofPos = afterRow.indexOf(" of ");
            if (ofPos !== -1) {
              const numStr = afterRow.slice(0, ofPos);
              if (numStr.length > 0 && [...numStr].every((c) => c >= "0" && c <= "9")) {
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
          isCaravan = true;
        }
      }
    }
    // simple token search for "You" as word
    let tokenIdx = -1;
    let tokenSide: "ai" | "human" | null = null;
    let tokenLen = 0;
    const checkWord = (word: string, side: "ai" | "human") => {
      let idx = text.indexOf(word, pos);
      while (idx !== -1) {
        const before = idx > 0 ? text[idx - 1] : " ";
        const after = idx + word.length < text.length ? text[idx + word.length] : " ";
        const beforeIsWord = (before >= "A" && before <= "Z") || (before >= "a" && before <= "z") || (before >= "0" && before <= "9") || before === "_";
        const afterIsWord = (after >= "A" && after <= "Z") || (after >= "a" && after <= "z") || (after >= "0" && after <= "9") || after === "_";
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
    // choose earliest between caravan and token
    let useCaravan = false;
    if (bestIdx !== -1 && (tokenIdx === -1 || bestIdx < tokenIdx)) useCaravan = true;
    else if (tokenIdx !== -1) { bestIdx = tokenIdx; bestLen = tokenLen; bestSide = tokenSide; bestRef = null; isCaravan = false; }
    else break;
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
    if (close === -1) break;
    if (open > last) nodes.push(...decorateLog(text.slice(last, open), `${String(keyBase)}-${String(k++)}`));
    const m1 = text.slice(open + 1, close);
    nodes.push(<CardName key={`c${String(keyBase)}-${String(k++)}`} name={m1} />);
  }
  if (last < text.length) nodes.push(...decorateLog(text.slice(last), `${String(keyBase)}-${String(k)}`));
  return nodes;
}

function decorateLog(text: string, keyBase: string | number = 0): ReactNode[] {
  if (text.includes("{")) return decorateCardTokens(text, keyBase);
  return decorateWho(text, String(keyBase));
}

const DecoratedLog = memo(function DecoratedLog({ text, id }: { text: string; id: string | number }) {
  return <>{decorateLog(text, id)}</>;
});
DecoratedLog.displayName = "DecoratedLog";

interface SidebarProps {
  log: LogEntry[];
  state?: GameState;
  scores?: GameScores;
}

function isWinEntry(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("wins the caravan") || t.includes("wins.") || t.includes("win the caravan") || t.includes("you win") || t.includes("ai wins");
}

function GameOverScores({ scores }: { scores: GameScores }) {
  const { humanScores, aiScores, humanWins, aiWins } = scores;

  return (
    <div className="scores">
      <div className="row ai">
        <span className="player" aria-label="AI"><span aria-hidden="true">🤖</span></span>
        <span className="caravans">
          {aiScores.map((s, idx) => (
            <span key={idx} className={["score", s.isSellable ? "sellable" : "unsellable", s.isSold ? "sold" : "", s.isSold ? "bold" : ""].filter(Boolean).join(" ")}>{s.total}</span>
          ))}
        </span>
        <span className="wins"><span className="x">×</span><span className="count">{aiWins}</span></span>
      </div>
      <div className="row human">
        <span className="player" aria-label="You"><span aria-hidden="true">👤</span></span>
        <span className="caravans">
          {humanScores.map((s, idx) => (
            <span key={idx} className={["score", s.isSellable ? "sellable" : "unsellable", s.isSold ? "sold" : "", s.isSold ? "bold" : ""].filter(Boolean).join(" ")}>{s.total}</span>
          ))}
        </span>
        <span className="wins"><span className="x">×</span><span className="count">{humanWins}</span></span>
      </div>
    </div>
  );
}
function SidebarImpl({ log, state, scores }: SidebarProps) {
  const logRef = useRef<HTMLOListElement>(null);
  const resolvedScores = scores ?? (state ? getCaravanScores(state) : undefined);

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
        {log.map((entry) => {
          const isWin = isWinEntry(entry.text) && state?.phase === "over";
          
          return (
            <li className={`line`} key={String(entry.id)}>
              <div className="text">
                {isWin ? (
                  <>
                    <DecoratedLog text={(() => { const i = entry.text.indexOf("!"); return i === -1 ? entry.text : entry.text.slice(0, i + 1); })()} id={entry.id} />
                    {resolvedScores ? <GameOverScores scores={resolvedScores} /> : null}
                  </>
                ) : (
                  <DecoratedLog text={entry.text} id={entry.id} />
                )}
                {entry.detail !== undefined && entry.detail.length > 0 ? (
                  <div className="details">
                    {entry.detail.map((d, i) => (
                      <div key={`${String(entry.id)}-${String(i)}`} className="detail"><DecoratedLog text={d} id={`${String(entry.id)}-${String(i)}`} /></div>
                    ))}
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
