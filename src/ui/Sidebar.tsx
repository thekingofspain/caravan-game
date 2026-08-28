import { memo, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { LogEntry } from "../game/types";

const RE_WHO = /(?:row (\d+) of )?(AI's|your) caravan (\d+)|\bYou\b|\bAI\b|AI's|\byour\b/g;
const RE_CARD = /\{([^{}]+)\}/g;
const RE_STYLE = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;

const SIDE_ICON = { human: "👤", ai: "🤖" } as const;

function decorateWho(text: string, keyBase: string): ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = RE_WHO;
  re.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  let k = 0;
  while (m !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyBase}-${k++}`;
    if (m[2] !== undefined) {
      const side = m[2] === "AI's" ? "ai" : "human";
      const ref = `@${m[3]}`;
      nodes.push(
        <span
          key={key}
          className={`log__who log__who--${side}`}
          title={side === "ai" ? "AI" : "You"}
        >
          <span className="log__icon">{SIDE_ICON[side]}</span>
          <span className="log__caravan">
            🐎<span className="log__who-ref">{ref}</span>
          </span>
        </span>,
      );
    } else {
      const side = m[0].startsWith("AI") ? "ai" : "human";
      nodes.push(
        <span
          key={key}
          className={`log__who log__who--${side}`}
          title={side === "ai" ? "AI" : "You"}
        >
          {SIDE_ICON[side]}
        </span>,
      );
    }
    last = re.lastIndex;
    m = re.exec(text);
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function decorateCardTokens(text: string, keyBase: string | number): ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = RE_CARD;
  re.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  let k = 0;
  while (m !== null) {
    if (m.index > last) nodes.push(...decorateLog(text.slice(last, m.index), `${keyBase}-${k++}`));
    const red = /♥|♦|Red/.test(m[1]);
    let cls = "log__card--black";
    if (red && !/♦/.test(m[1])) cls = "log__card--red";
    else if (/♦/.test(m[1])) cls = "log__card--diamonds";
    else if (/♣/.test(m[1])) cls = "log__card--clubs";
    nodes.push(
      <span key={`c${keyBase}-${k++}`} className={`log__card ${cls}`}>
        {m[1]}
      </span>,
    );
    last = re.lastIndex;
    m = re.exec(text);
  }
  if (last < text.length) nodes.push(...decorateLog(text.slice(last), `${keyBase}-${k++}`));
  return nodes;
}

function decorateLog(text: string, keyBase: string | number = 0): ReactNode[] {
  if (text.includes("{")) return decorateCardTokens(text, keyBase);
  const nodes: React.ReactNode[] = [];
  const re = RE_STYLE;
  re.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null = re.exec(text);
  let k = 0;
  while (m !== null) {
    if (m.index > last) nodes.push(...decorateWho(text.slice(last, m.index), `${keyBase}w${k}`));
    if (m[1] !== undefined) nodes.push(<span key={`${keyBase}s${k}`} className="log__sold">{m[1]}</span>);
    else nodes.push(<span key={`${keyBase}s${k}`} className="log__sellable">{m[2]}</span>);
    k += 1;
    last = re.lastIndex;
    m = re.exec(text);
  }
  if (last < text.length) nodes.push(...decorateWho(text.slice(last), `${keyBase}w${k}`));
  return nodes;
}

interface SidebarProps {
  log: LogEntry[];
}

function SidebarImpl({ log }: SidebarProps) {
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <ol className="log" ref={logRef}>
        {log.map((entry) => (
          <li className="log__line" key={entry.id}>
            <span className="log__text">
              {decorateLog(entry.text)}
              {entry.detail && entry.detail.length > 0 && (
                <ul className="log__bullets">
                  {entry.detail.map((d, i) => (
                    <li key={`${entry.id}-${d}`}>{decorateLog(d, `${entry.id}-${i}`)}</li>
                  ))}
                </ul>
              )}
            </span>
          </li>
        ))}
      </ol>
  );
}

export const Sidebar = memo(SidebarImpl);
