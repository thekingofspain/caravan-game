import { useEffect, useState } from "react";

import { Board } from "../view/Board";
import { GameConfig, useGame } from "../viewmodel/useGame";
import { publishTestHooks } from "./testHooks";

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
    const { reset, act } = store;

    useEffect(
        () =>
            publishTestHooks({
                __caravanStore: store,
                __resetWithSeed: (s: number) => {
                    reset({ seed: s });
                },
                __act: (a) => {
                    act(a);
                }
            }),
        [reset, act]
    );

    return (
        <div className="app">
            <Board store={store} />
        </div>
    );
}
