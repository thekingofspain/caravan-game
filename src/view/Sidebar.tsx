import { memo, useEffect, useRef, Fragment } from "react";
import type { ReactNode } from "react";
import { GameState, Human, Ai, LogEntry } from "../model/types";
import { CARAVAN_NAMES } from "../model/names";
import { calculateCaravanState } from "../model/rules/caravanCardRules";
import { pairWinner } from "../model/scoring";
const CARAVAN_NAME_ALT = Object.values(CARAVAN_NAMES).flat().join("|");
const RE_WHO = new RegExp(
  `(?:row (\\d+) of )?(AI's|your) caravan (${CARAVAN_NAME_ALT})|\\bYou\\b|\\bAI\\b|AI's|\\byour\\b`,
  "g",
);
const RE_CARD = /\{([^{}]+)\}/g;
const RE_STYLE = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;

const SIDE_ICON = { human: "👤", ai: "🤖" } as const;

function decorateWho(text: string, keyBase: string): ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(RE_WHO)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    const key = `${keyBase}-${k++}`;
      if (m[2] !== undefined) {
        const side = m[2] === "AI's" ? "ai" : "human";
        const ref = m[3];
      nodes.push(
        <span
          key={key}
          className={`who ${side}`}
          title={side === "ai" ? "AI" : "You"}
        >
          <span className="icon">{SIDE_ICON[side]}</span>
          <span className="caravan-ref">
            🐎<span className="who-ref">{ref}</span>
          </span>
        </span>,
      );
    } else {
      const side = m[0].startsWith("AI") ? "ai" : "human";
      nodes.push(
        <span
          key={key}
          className={`who ${side}`}
          title={side === "ai" ? "AI" : "You"}
        >
          {SIDE_ICON[side]}
        </span>,
      );
    }
    last = idx + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function decorateCardTokens(text: string, keyBase: string | number): ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(RE_CARD)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(...decorateLog(text.slice(last, idx), `${keyBase}-${k++}`));
    const red = /♥|♦|Red/.test(m[1]);
    let cls = "card-name black";
    if (red && !/♦/.test(m[1])) cls = "card-name red";
    else if (/♦/.test(m[1])) cls = "card-name diamonds";
    else if (/♣/.test(m[1])) cls = "card-name clubs";
    nodes.push(
      <span key={`c${keyBase}-${k++}`} className={cls}>
        {m[1]}
      </span>,
    );
    last = idx + m[0].length;
  }
  if (last < text.length) nodes.push(...decorateLog(text.slice(last), `${keyBase}-${k++}`));
  return nodes;
}

function decorateLog(text: string, keyBase: string | number = 0): ReactNode[] {
  if (text.includes("{")) return decorateCardTokens(text, keyBase);
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(RE_STYLE)) {
    const idx = m.index ?? 0;
    if (m[1] !== undefined) nodes.push(<span key={`${keyBase}s${k}`} className="sold">{m[1]}</span>);
    else nodes.push(<span key={`${keyBase}s${k}`} className="sellable">{m[2]}</span>);
  }
  if (last < text.length) nodes.push(...decorateWho(text.slice(last), `${keyBase}w${k}`));
  return nodes;
}
interface SidebarProps {
  log: LogEntry[];
  state?: GameState;
}

function isWinEntry(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("wins the caravan") || t.includes("wins.") || t.includes("win the caravan") || t.includes("you win") || t.includes("ai wins");
}

function GameOverScores({ state }: { state: GameState }) {
  const rows = [0, 1, 2] as const;
  const humanScores = rows.map((ci) => {
    const st = calculateCaravanState(state.players[Human].caravans[ci]);
    const isSellable = st.status === "sellable";
    const isWinner = pairWinner(state, ci) === Human;
    const isSold = isSellable && isWinner;
    return { total: st.status === "empty" ? 0 : st.total, isSellable, isSold };
  });
  const aiScores = rows.map((ci) => {
    const st = calculateCaravanState(state.players[Ai].caravans[ci]);
    const isSellable = st.status === "sellable";
    const isWinner = pairWinner(state, ci) === Ai;
    const isSold = isSellable && isWinner;
    return { total: st.status === "empty" ? 0 : st.total, isSellable, isSold };
  });
  const humanWins = rows.filter((ci) => pairWinner(state, ci) === Human).length;
  const aiWins = rows.filter((ci) => pairWinner(state, ci) === Ai).length;
  return (
    <span className="gameover">
      <span className="scores">
        <span className="row human">
          <span className="player">You</span>
          <span className="caravans">
            {humanScores.map((s, idx) => (
              <Fragment key={idx}>
                {idx > 0 && <span className="sep">|</span>}
                <span className={`score ${s.isSellable ? "sellable" : "unsellable"} ${s.isSold ? "sold bold" : ""}`}>{s.total}</span>
              </Fragment>
            ))}
          </span>
          <span className="wins">×{humanWins}</span>
        </span>
        <span className="row ai">
          <span className="player">AI</span>
          <span className="caravans">
            {aiScores.map((s, idx) => (
              <Fragment key={idx}>
                {idx > 0 && <span className="sep">|</span>}
                <span className={`score ${s.isSellable ? "sellable" : "unsellable"} ${s.isSold ? "sold bold" : ""}`}>{s.total}</span>
              </Fragment>
            ))}
          </span>
          <span className="wins">×{aiWins}</span>
        </span>
      </span>
    </span>
  );
}

function SidebarImpl({ log, state }: SidebarProps) {
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <ol className="log" ref={logRef}>
        {log.map((entry) => {
          const isWin = isWinEntry(entry.text) && state && state.phase === "over";
          return (
            <li className={`line ${isWin ? "win" : ""}`} key={entry.id}>
              <span className="text">
                {isWin && state ? (
                  <>
                    <span className="win-title">{decorateLog(entry.text.split("!")[0] + "!", entry.id)}</span>
                    <GameOverScores state={state} />
                  </>
                ) : (
                  decorateLog(entry.text)
                )}
                {entry.detail && entry.detail.length > 0 && !isWin && (
                  <ul className="bullets">
                    {entry.detail.map((d, i) => (
                      <li key={`${entry.id}-${d}`}>{decorateLog(d, `${entry.id}-${i}`)}</li>
                    ))}
                  </ul>
                )}
                {isWin && entry.detail && entry.detail.length > 0 && (
                  <ul className="bullets">
                    {entry.detail.map((d, i) => (
                      <li key={`${entry.id}-${d}`}>{decorateLog(d, `${entry.id}-${i}`)}</li>
                    ))}
                  </ul>
                )}
              </span>
            </li>
          );
        })}
      </ol>
  );
}

export const Sidebar = memo(SidebarImpl);
