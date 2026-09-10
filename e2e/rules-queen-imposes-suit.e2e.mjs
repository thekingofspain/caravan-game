import { chromium } from "playwright";
import assert from "node:assert/strict";

// Queen behavior vs the decided rules:
//   (a) A queen rides on the latest (last-row) card only — earlier rows reject.
//   (b) The queen flips direction and imposes its own suit
//       (Q♥ onto 9♠ → direction desc, suit hearts).
//   (c) The imposed suit counts for the next play: 10♥ breaks desc from 9♠
//       but matches hearts, so it is legal; landing re-establishes asc and
//       resets the stored suit to hearts.

let id = 7000;
function makeCard(deckId, rank, suitOrJoker) {
    if (rank === "Joker") {
        return {
            id: `D${deckId}-${rank}${suitOrJoker}-${++id}`,
            suit: null,
            rank: "Joker",
            jokerType: suitOrJoker
        };
    }
    return {
        id: `D${deckId}-${rank}${suitOrJoker[0].toUpperCase()}-${++id}`,
        suit: suitOrJoker,
        rank
    };
}

const Human = 0;

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
await page.waitForSelector(".board");
await page.waitForTimeout(300);

// Boneyard [[3♠],[9♠]] dir asc — exactly what the engine itself produces.
const programmedState = {
    players: [
        mkPlayer(
            [
                caravanOf(
                    [[makeCard(1, "3", "spades")], [makeCard(1, "9", "spades")]],
                    "asc",
                    "spades"
                ),
                caravanOf([[makeCard(1, "5", "clubs")]], null, "clubs"),
                caravanOf([[makeCard(1, "4", "diamonds")]], null, "diamonds")
            ],
            [makeCard(1, "Q", "hearts"), makeCard(1, "10", "hearts"), makeCard(1, "5", "clubs")],
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
await page.waitForTimeout(400);

const failures = [];

// (a) Queen targets: latest row only — row 0 of a 2-row caravan rejects.
const targets = await page.evaluate(() => {
    const s = window.__caravanStore.state;
    const qi = s.players[0].hand.findIndex((c) => c.rank === "Q");
    return window.__caravanStore.legal
        .filter((m) => m.type === "playOperationCard" && m.handIndex === qi)
        .map((m) => `${m.target.lane}:${m.target.cardIndex}`);
});
console.log("queen targets:", targets.join(", "));
if (targets.includes("0:0"))
    failures.push(`queen must not target row 0, got [${targets.join(", ")}]`);
if (!targets.includes("0:1"))
    failures.push(`queen must target the last row, got [${targets.join(", ")}]`);

// (b) Real engine transition: Q♥ onto the 9♠ row.
await page.evaluate(() => {
    const s = window.__caravanStore.state;
    const qi = s.players[0].hand.findIndex((c) => c.rank === "Q" && c.suit === "hearts");
    window.__act({
        type: "playOperationCard",
        player: 0,
        target: { player: 0, lane: 0, cardIndex: 1 },
        handIndex: qi
    });
});
await page.waitForTimeout(300);
const afterQueen = await page.evaluate(() => {
    const c = window.__caravanStore.state.players[0].caravans[0];
    return {
        direction: c.direction,
        suit: c.suit,
        attached: c.rows[1].length,
        headSuit: c.rows[c.rows.length - 1][0].suit
    };
});
console.log("after Q♥ on 9♠:", JSON.stringify(afterQueen));
if (afterQueen.direction !== "desc")
    failures.push(`queen should flip direction to desc, got ${afterQueen.direction}`);
if (afterQueen.attached !== 2)
    failures.push(`queen should attach to the row, row length ${afterQueen.attached}`);
if (afterQueen.suit !== "hearts")
    failures.push(`suit becomes the QUEEN's suit (hearts), got ${afterQueen.suit}`);

// Take the turn back before the AI auto-move timer (650ms) fires.
await page.evaluate(() => {
    window.__setCaravanState({ ...window.__caravanStore.state, current: 0 });
});
await page.waitForTimeout(200);

// (c) 10♥ breaks desc from 9♠ but matches the imposed hearts: must be legal.
const tenLegal = await page.evaluate(() => {
    const s = window.__caravanStore.state;
    const idx = s.players[0].hand.findIndex((c) => c.rank === "10" && c.suit === "hearts");
    return window.__caravanStore.legal.some(
        (m) => m.type === "playValueCard" && m.handIndex === idx && m.lane === 0
    );
});
console.log("10♥ legal via imposed suit:", tenLegal);
if (!tenLegal) failures.push("10♥ should be legal via the queen-imposed hearts suit");

// Real engine transition: play it.
await page.evaluate(() => {
    const s = window.__caravanStore.state;
    const idx = s.players[0].hand.findIndex((c) => c.rank === "10" && c.suit === "hearts");
    window.__act({ type: "playValueCard", player: 0, lane: 0, handIndex: idx });
});
await page.waitForTimeout(400);
const afterValue = await page.evaluate(() => {
    const c = window.__caravanStore.state.players[0].caravans[0];
    return {
        rows: c.rows.length,
        direction: c.direction,
        suit: c.suit,
        lastHeadSuit: c.rows[c.rows.length - 1][0].suit
    };
});
console.log("after 10♥:", JSON.stringify(afterValue));
if (afterValue.rows !== 3) failures.push(`expected 3 rows, got ${afterValue.rows}`);
if (afterValue.direction !== "asc")
    failures.push(`10 over 9 should re-establish asc, got ${afterValue.direction}`);
if (afterValue.suit !== "hearts" || afterValue.lastHeadSuit !== "hearts")
    failures.push(`stored suit should reset to hearts, got ${afterValue.suit}`);

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
if (failures.length > 0) {
    console.error("FAILURES:");
    failures.forEach((f) => console.error(" -", f));
    await browser.close();
    process.exit(1);
}
console.log("PASS: queen takes the last row, imposes its suit, value plays reset it");
await browser.close();
