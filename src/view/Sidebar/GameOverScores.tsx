import type { CaravanScoreMeta, GameScores } from "../../model/scoring";
import { SIDE_ICON } from "./Who";

interface ScoreRowProps {
    player: "AI" | "You";
    scores: CaravanScoreMeta[];
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
                {scores.map((s, idx) => (
                    <span
                        key={idx}
                        className={[
                            "score",
                            s.isSellable ? "sellable" : "unsellable",
                            s.isSold ? "sold" : "",
                            s.isSold ? "bold" : ""
                        ]
                            .filter(Boolean)
                            .join(" ")}
                    >
                        {s.total}
                    </span>
                ))}
            </span>

            <span className="wins">
                <span className="x">×</span>
                <span className="count">{wins}</span>
            </span>
        </div>
    );
}

export function GameOverScores({ scores }: { scores: GameScores }) {
    const { humanScores, aiScores, humanWins, aiWins } = scores;

    return (
        <div className="scores">
            <ScoreRow player="AI" scores={aiScores} wins={aiWins} icon={SIDE_ICON.ai} />
            <ScoreRow player="You" scores={humanScores} wins={humanWins} icon={SIDE_ICON.human} />
        </div>
    );
}
