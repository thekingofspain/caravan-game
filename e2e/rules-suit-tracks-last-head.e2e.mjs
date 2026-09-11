import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady, logLength, waitLogGrowth, waitTurn } from "./wait.mjs";
import { logInfo } from "./log.mjs";

// Caravan suit/direction tracking: A♦ played on 9♠,10♦ via suit match breaks
// the asc run, so direction re-establishes to desc and the stored suit follows
// the last row head (diamonds). Regression cover for the old stale-suit defect
// (suit used to freeze at whatever it was past the second row).

let id = 9000;
function makeCard(deckId, rank, suitOrJoker) {
    // deckId first, rank, then suit|jokerType — matches src/model/cards.ts
    if (rank === "Joker") {
        return {
            id: `D${deckId}-${rank}${suitOrJoker}-${++id}`,
            suit: null,
            rank: "Joker",
            jokerType: suitOrJoker
        };
    }
    return { id: `D${deckId}-${rank}${suitOrJoker[0].toUpperCase()}-${++id}`, suit: suitOrJoker, rank };
}

const Human = 0,
    Ai = 1;

function caravanOf(rows, direction, suit) {
    return { rows, direction, suit };
}
function mkPlayer(caravans, hand, deck = []) {
    return { deck, hand, caravans };
}
const emptyCaravan = () => caravanOf([], null, null);

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await boardReady(page);

// Boneyard starts [[9♠]] — exactly what the engine itself produces for one row.
const programmedState = {
    players: [
        mkPlayer(
            [caravanOf([[makeCard(1, "9", "spades")]], null, "spades"), emptyCaravan(), emptyCaravan()],
            [makeCard(1, "10", "diamonds"), makeCard(1, "A", "diamonds"), makeCard(1, "4", "clubs")],
            []
        ),
        mkPlayer(
            [emptyCaravan(), emptyCaravan(), emptyCaravan()],
            [makeCard(2, "7", "hearts"), makeCard(2, "8", "hearts")],
            [makeCard(2, "6", "clubs")]
        )
    ],
    current: Human,
    phase: "play",
    winner: null,
    log: [],
    started: true
};
await page.evaluate((s) => window.__setCaravanState(s), programmedState);
await page.waitForFunction(
    () => window.__caravanStore?.state?.players?.[0]?.caravans?.[0]?.rows?.length === 1,
    null,
    { timeout: 10000 }
);

// Move 1 (real engine transition): 10♦ onto 9♠.
const logBeforeMove1 = await logLength(page);
await page.evaluate(() => {
    const s = window.__caravanStore.state;
    const idx = s.players[0].hand.findIndex((c) => c.rank === "10" && c.suit === "diamonds");
    window.__act({ type: "playValueCard", player: 0, lane: 0, handIndex: idx });
});
await waitLogGrowth(page, logBeforeMove1);

// Take the turn back before the AI auto-move timer (650ms) fires. This only flips
// `current`; every caravan mutation stays on the real engine path.
await page.evaluate(() => {
    window.__setCaravanState({ ...window.__caravanStore.state, current: 0 });
});
await waitTurn(page, 0);

// Move 2 (real engine transition): A♦ onto 10♦ (legal via suit match, like the log).
const logBeforeMove2 = await logLength(page);
await page.evaluate(() => {
    const s = window.__caravanStore.state;
    const idx = s.players[0].hand.findIndex((c) => c.rank === "A" && c.suit === "diamonds");
    window.__act({ type: "playValueCard", player: 0, lane: 0, handIndex: idx });
});
await waitLogGrowth(page, logBeforeMove2);

const after = await page.evaluate(() => {
    const c = window.__caravanStore.state.players[0].caravans[0];
    return {
        rows: c.rows.map((r) => r.map((x) => `${x.rank}${(x.suit || "?")[0]}`).join("+")),
        total: c.rows.reduce(
            (sum, r) => sum + (r[0].rank === "A" ? 1 : Number(r[0].rank) || 10),
            0
        ),
        direction: c.direction,
        suit: c.suit,
        lastHeadSuit: c.rows[c.rows.length - 1][0].suit
    };
});
logInfo("caravan after 9♠,10♦,A♦:", after);

const failures = [];
if (after.rows.length !== 3) failures.push(`expected 3 rows, got ${after.rows.length}`);
if (after.direction !== "desc")
    failures.push(`suit-break should re-establish direction to desc, got ${after.direction}`);
if (after.suit !== after.lastHeadSuit)
    failures.push(
        `STALE SUIT: stored suit is "${after.suit}" but last row head is "${after.lastHeadSuit}" (expected "${after.lastHeadSuit}")`
    );

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
if (failures.length > 0) {
    console.error("FAILURES:");
    failures.forEach((f) => console.error(" -", f));
    await browser.close();
    process.exit(1);
}
console.log("PASS: suit tracks the last row head, suit-breaks re-establish direction");
await browser.close();
