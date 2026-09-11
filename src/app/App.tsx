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

    // Dep is the whole store snapshot: ui-only updates (ack clears transition
    // without touching act/reset identity) must still refresh the hook.

    useEffect(
        () =>
            publishTestHooks({
                __caravanStore: store,
                __resetWithSeed: (s: number) => {
                    store.reset({ seed: s });
                },
                __act: (a) => {
                    store.act(a);
                }
            }),
        [store]
    );

    return (
        <div className="app">
            <Board store={store} />
        </div>
    );
}
