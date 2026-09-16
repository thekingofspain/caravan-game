import { useEffect, useRef, useState } from "react";

import { determineBestMove } from "../model/ai";
import { Board } from "../view/Board";
import { GameConfig, useGame } from "../viewmodel/useGame";
import { publishTestHooks, updateTestHooks } from "./testHooks";

export default function App() {
    const [seed] = useState(() => {
        const seedParam = new URLSearchParams(window.location.search).get("seed");
        const parsed = seedParam === null ? NaN : Number(seedParam);

        return Number.isFinite(parsed) ? parsed : Math.floor(Math.random() * 1e9);
    });

    return <Game config={{ seed }} />;
}

function Game({ config }: { config: GameConfig }) {
    const store = useGame(config);
    const storeRef = useRef(store);

    storeRef.current = store;

    // Published once: closures read the latest store through the ref, so the
    // seams are never deleted and re-assigned mid-session. Freshness of the
    // readable snapshot arrives via the merge below.

    useEffect(
        () =>
            publishTestHooks({
                __caravanStore: storeRef.current,
                __resetWithSeed: (s: number) => {
                    storeRef.current.reset({ seed: s });
                },
                __act: (a) => {
                    storeRef.current.act(a);
                },
                __bestMove: (s, acting) => determineBestMove(s, acting, () => 0.5)
            }),
        []
    );

    useEffect(() => {
        updateTestHooks({ __caravanStore: store });
    }, [store]);

    return (
        <div className="app">
            <Board store={store} />
        </div>
    );
}
