import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady } from "./wait.mjs";

// Repro: queen-imposed direction must survive a Jack removal that does not
// touch the bottom pair (Shady Sands case).
// Lane: [[8C],[4C],[10C],[AC + QH]] dir asc suit hearts (bottom pair 10->A is
// desc, QH flipped it to asc). Jack the middle 4C row -> bottom pair is still
// 10->A, so direction must stay asc. Buggy normalize recomputes desc.

let id = 9000;
function makeCard(deckId, rank, suit) {
    return {
        id: `D${deckId}-${rank}${suit[0].toUpperCase()}-${++id}`,
        suit,
        rank
    };
}

const Human = 0;

function caravanOf(rows, direction, suit) {
    return { rows, direction, suit };
}
function mkPlayer(caravans, hand, shoe = []) {
    return { shoe, hand, caravans };
}

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await boardReady(page);

const programmedState = {
    players: [
        mkPlayer(
            [
                caravanOf([[makeCard(1, "5", "clubs")]], null, "clubs"),
                caravanOf([[makeCard(1, "4", "diamonds")]], null, "diamonds"),
                caravanOf(
                    [
                        [makeCard(1, "8", "clubs")],
                        [makeCard(1, "4", "clubs")],
                        [makeCard(1, "10", "clubs")],
                        [makeCard(1, "A", "clubs"), makeCard(1, "Q", "hearts")]
                    ],
                    "asc",
                    "hearts"
                )
            ],
            [makeCard(1, "J", "clubs"), makeCard(1, "2", "diamonds")],
            [makeCard(1, "6", "spades")]
        ),
        mkPlayer(
            [
                caravanOf([[makeCard(2, "7", "hearts")]], null, "hearts"),
                caravanOf([[makeCard(2, "9", "spades")]], null, "spades"),
                caravanOf([[makeCard(2, "3", "diamonds")]], null, "diamonds")
            ],
            [makeCard(2, "7", "clubs"), makeCard(2, "8", "diamonds")],
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
    () => window.__caravanStore?.state?.players?.[0]?.hand?.some((c) => c.rank === "J"),
    null,
    { timeout: 10000 }
);

// Real engine transition: human Jacks their own middle 4C row (lane 2, index 1).
await page.evaluate(() => {
    const s = window.__caravanStore.state;
    const ji = s.players[0].hand.findIndex((c) => c.rank === "J");
    window.__act({
        type: "playOperationCard",
        player: 0,
        target: { player: 0, lane: 2, cardIndex: 1 },
        handIndex: ji
    });
});
await page.waitForFunction(
    () => window.__caravanStore.state.players[0].caravans[2].rows.length === 3,
    null,
    { timeout: 10000 }
);
const after = await page.evaluate(() => {
    const c = window.__caravanStore.state.players[0].caravans[2];
    return {
        rows: c.rows.length,
        direction: c.direction,
        suit: c.suit,
        heads: c.rows.map((r) => `${r[0].rank}${r[0].suit}`),
        queenAlive: c.rows[c.rows.length - 1].length
    };
});
console.log("after Jack on middle row:", JSON.stringify(after));

const failures = [];
if (after.rows !== 3) failures.push(`expected 3 rows after removal, got ${after.rows}`);
if (after.direction !== "asc")
    failures.push(
        `queen flip must survive unrelated Jack removal: direction asc, got ${after.direction} (heats ${after.heads.join(",")})`
    );
if (after.suit !== "hearts") failures.push(`suit must stay hearts, got ${after.suit}`);
if (after.queenAlive !== 2) failures.push(`queen must stay attached, last row length ${after.queenAlive}`);

// User-visible surface: the Shady Sands header arrow.
const headerDir = await page.evaluate(() => {
    const el = document.querySelectorAll(".caravans.human .caravan")[2]?.querySelector("header");
    return el?.getAttribute("data-dir");
});
console.log("header data-dir:", headerDir);
if (headerDir !== "asc") failures.push(`header data-dir must read asc, got ${headerDir}`);

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
if (failures.length > 0) {
    console.error("FAILURES:");
    for (const f of failures) console.error(" - " + f);
    await browser.close();
    process.exit(1);
}
console.log("PASS: queen direction survives unrelated Jack removal");
await browser.close();
