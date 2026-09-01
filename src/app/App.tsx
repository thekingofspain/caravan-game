import { useEffect, useState } from "react";
import { GameConfig, useGame } from "../viewmodel/useGame";
import { Board } from "../view/Board";

export default function App() {
  const [seed] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get("seed");
    return seedParam ? Number(seedParam) : Math.floor(Math.random() * 1e9);
  });
  return <Game config={{ seed }} />;
}

function Game({ config }: { config: GameConfig }) {
  const store = useGame(config);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as unknown as {
        __caravanStore: typeof store;
        __resetWithSeed: (s: number) => void;
        __act: (a: unknown) => void;
      };
      w.__caravanStore = store;
      w.__resetWithSeed = (s: number) => { store.reset({ seed: s }); };
      w.__act = (a: unknown) => { store.act(a as never); };
    }
  }, [store]);
  return (
    <div className="app">
      <Board store={store} />
    </div>
  );
}
