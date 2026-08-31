import { GameConfig, useGame } from "../viewmodel/useGame";
import { Board } from "../view/Board";

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get("seed");
  const seed = seedParam ? Number(seedParam) : Math.floor(Math.random() * 1e9);
  return <Game config={{ seed }} />;
}

function Game({ config }: { config: GameConfig }) {
  const store = useGame(config);
  // Expose for e2e — program hand/deck and control ack flow (vite stays on 5173)
  if (typeof window !== "undefined") {
    const w = window as unknown as {
      __caravanStore: typeof store;
      __resetWithSeed: (s: number) => void;
      __act: (a: unknown) => void;
    };
    w.__caravanStore = store;
    w.__resetWithSeed = (s: number) => store.reset({ seed: s });
    w.__act = (a: unknown) => store.act(a as never);
  }
  return (
    <div className="app">
      <Board store={store} />
    </div>
  );
}
