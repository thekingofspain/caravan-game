import { useState } from "react";
import { GameConfig } from "../state/useGame";
import { RulesModal } from "./RulesModal";

export function StartScreen({ onStart }: { onStart: (cfg: GameConfig) => void }) {
  const [showRules, setShowRules] = useState(false);
  return (
    <div className="app">
      <h1 className="app__title">Caravan</h1>
      <div className="start">
        <p className="start__intro">
          Two caravans of three piles each. Land a pile between <b>21</b> and <b>26</b> and outbid your
          opponent on two of three to win.
        </p>
        <p className="start__intro">
          Each player gets 30 random cards from their own deck.
        </p>
        <div className="controls">
          <button
            type="button"
            className="btn"
            onClick={() => onStart({ seed: Math.floor(Math.random() * 1e9) })}
          >
            Start game
          </button>
          <button type="button" className="btn" onClick={() => setShowRules(true)}>
            Rules
          </button>
        </div>
      </div>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
