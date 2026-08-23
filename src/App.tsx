import { GameConfig, useGame } from "./state/useGame";
import { Board } from "./ui/Board";

export default function App() {
  return <Game config={{ seed: Math.floor(Math.random() * 1e9) }} />;
}

function Game({ config }: { config: GameConfig }) {
  const store = useGame(config);
  return (
    <div className="app">
      <h1 className="app__title">Caravan</h1>
      <Board store={store} />
    </div>
  );
}
