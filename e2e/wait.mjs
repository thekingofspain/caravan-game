// Conditional waits for e2e specs, backed by the app's test hooks.
// Use these instead of waitForTimeout: they resolve as soon as the condition
// holds and fail loudly on timeout instead of drifting with machine speed.
//
// Test-hook surface (see src/app/App.tsx, src/viewmodel/useGame.ts):
//   window.__caravanStore -> { state, legal, transition, previous, lastMove, ... }
//   window.__setCaravanState(state), window.__act(move), window.__resetWithSeed(n), window.__bestMove(state, acting)
const DEFAULT_TIMEOUT = 10000;

export async function boardReady(page, timeout = DEFAULT_TIMEOUT) {
  await page.waitForSelector(".board", { timeout });
  await page.waitForFunction(() => window.__caravanStore?.state?.players?.length === 2, null, {
    timeout
  });
}

export async function logLength(page) {
  return page.evaluate(() => window.__caravanStore.state.log.length);
}

export async function waitLogGrowth(page, prevLen, timeout = DEFAULT_TIMEOUT) {
  await page.waitForFunction((n) => window.__caravanStore.state.log.length > n, prevLen, {
    timeout
  });
}

export async function waitTurn(page, player, timeout = 15000) {
  await page.waitForFunction(
    (p) => window.__caravanStore.state.phase !== "play" || window.__caravanStore.state.current === p,
    player,
    { timeout }
  );
}

export async function waitGameOver(page, timeout = 15000) {
  await page.waitForFunction(() => window.__caravanStore.state.phase === "over", null, { timeout });
}

export async function waitNoPendingAck(page, timeout = DEFAULT_TIMEOUT) {
  await page.waitForFunction(() => !window.__caravanStore.transition?.pendingAck, null, {
    timeout
  });
}
