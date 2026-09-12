import type { GameState, Move } from "../model/types";
import type { GameStore, ReducerMove } from "../viewmodel/useGame";

export function testHooksEnabled(): boolean {
    return (
        typeof window !== "undefined" &&
        (import.meta.env.DEV || new URLSearchParams(window.location.search).has("e2e"))
    );
}

// Contract for the e2e remote control. Every `window.__*` test seam lives
// here and here only: producers assign these fields (then delete them on
// unmount), scripts consume them via `page.evaluate`. All fields are
// optional because the seams are ABSENT unless `testHooksEnabled()` —
// never branch on them in game code, and never add a hook without a
// corresponding need in `e2e/*.e2e.mjs`.

export interface TestWindowHooks {
    __caravanStore?: GameStore;
    __resetWithSeed?: (s: number) => void;
    __act?: (a: Move) => void;
    __setCaravanState?: (s: GameState) => void;
    __caravanDispatch?: (a: ReducerMove) => void;
}

// Assigns hook fields and returns a cleanup that removes exactly those
// fields. Both producers use this so the assign/delete pair can't drift.
// No-op (with empty cleanup) when seams are disabled or off-browser.

export function publishTestHooks(fields: TestWindowHooks): () => void {
    if (!testHooksEnabled() || typeof window === "undefined") return () => undefined;

    const w = window as unknown as TestWindowHooks;

    Object.assign(w, fields);

    // Explicit per-key deletes (no dynamic delete): keep this list in sync
    // with TestWindowHooks when adding a hook.

    return () => {
        if (fields.__caravanStore !== undefined) delete w.__caravanStore;

        if (fields.__resetWithSeed !== undefined) delete w.__resetWithSeed;

        if (fields.__act !== undefined) delete w.__act;

        if (fields.__setCaravanState !== undefined) delete w.__setCaravanState;

        if (fields.__caravanDispatch !== undefined) delete w.__caravanDispatch;
    };
}

// Merge-only freshness update (no cleanup): the mount-time publishTestHooks
// cleanup still removes the fields on unmount. Use for per-render values so
// polling e2e scripts never observe a delete/re-assign gap.

export function updateTestHooks(fields: TestWindowHooks): void {
    if (!testHooksEnabled() || typeof window === "undefined") return;

    Object.assign(window as unknown as TestWindowHooks, fields);
}
