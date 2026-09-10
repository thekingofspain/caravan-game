import type { CaravanPointsMeta, GameScores } from "../../model/scoring";
import { SIDE_ICON } from "./Who";

interface ScoreRowProps {
    player: "AI" | "You";
    scores: CaravanPointsMeta[];
    wins: number;
    icon: string;
}

function ScoreRow({ player, scores, wins, icon }: ScoreRowProps) {
    const rowClass = player === "AI" ? "ai" : "human";

    return (
        <div className={`row ${rowClass}`}>
            <span className="player" aria-label={player}>
                <span aria-hidden="true">{icon}</span>
            </span>

            <span className="caravans">
                {scores.flatMap((s, idx) => {
                    const score = (
                        <span
                            key={`score-${String(idx)}`}
                            className={[
                                "score",
                                s.isSellable ? "sellable" : "unsellable",
                                s.isSold ? "sold" : "",
                                s.isSold ? "bold" : ""
                            ]
                                .filter(Boolean)
                                .join(" ")}
                        >
                            {s.points}
                        </span>
                    );

                    if (idx === 0) return [score];

                    return [
                        <span key={`sep-${String(idx)}`} className="sep" aria-hidden="true">
                            |
                        </span>,
                        score
                    ];
                })}
            </span>

            <span className="wins">
                <span className="x">×</span>
                <span className="count">{wins}</span>
            </span>
        </div>
    );
}

export function GameOverScores({ scores }: { scores: GameScores }) {
    const { humanPoints, aiPoints, humanWins, aiWins } = scores;

    return (
        <div className="scores">
            <ScoreRow player="AI" scores={aiPoints} wins={aiWins} icon={SIDE_ICON.ai} />
            <ScoreRow player="You" scores={humanPoints} wins={humanWins} icon={SIDE_ICON.human} />
        </div>
    );
}
