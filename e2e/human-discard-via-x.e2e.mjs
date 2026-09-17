#!/usr/bin/env node
// Human discard via the red X on the discard pile (X replaces shoe-click discard).
// Seeded post-opening human turn: selecting a hand card must surface a red X
// affordance on the human discard pile; clicking that X performs the discard
// (card lands face-up in the pile, hand redraws, turn passes). Clicking the
// shoe with a card selected must NOT discard.
import { chromium } from "playwright";
import { boardReady, waitLogGrowth } from "./wait.mjs";
import assert from "node:assert/strict";

let id = 9000;
function makeCard(deckId, rank, suitOrJoker) {
    id++;
    if (rank === "Joker")
        return {
            id: `D${deckId}-${rank}${suitOrJoker}-${id}`,
            suit: null,
            rank: "Joker",
            jokerType: suitOrJoker
        };
    return { id: `D${deckId}-${rank}${suitOrJoker}-${id}`, suit: suitOrJoker, rank };
}
function caravanOf(rows, started = true) {
    let d = null,
        s = null;
    if (rows.length >= 2) {
        const a = rows[0][0].rank === "A" ? 1 : Number(rows[0][0].rank);
        const b = rows[1][0].rank === "A" ? 1 : Number(rows[1][0].rank);
        d = b > a ? "asc" : "desc";
    }
    if (rows.length >= 1) s = rows[0][0].suit;
    return { rows, direction: d, suit: s, started };
}
function mkPlayer(caravans, hand, shoe = []) {
    return { shoe, hand, discard: null, caravans };
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(process.env.BASE_URL || "http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForSelector(".board");
const btn = page.locator(".start .btn, button:has-text('Start')");
if ((await btn.count()) > 0) await btn.first().click({ force: true });
await page.waitForSelector(".caravans.human .caravan", { timeout: 5000 });
await boardReady(page);

function seedState() {
    return {
        players: [
            mkPlayer(
                [
                    caravanOf([[makeCard(1, "10", "clubs")]]),
                    caravanOf([[makeCard(1, "9", "hearts")]]),
                    caravanOf([[makeCard(1, "7", "spades")]])
                ],
                [
                    makeCard(1, "K", "clubs"),
                    makeCard(1, "5", "hearts"),
                    makeCard(1, "4", "diamonds")
                ],
                [makeCard(1, "2", "clubs"), makeCard(1, "3", "diamonds")]
            ),
            mkPlayer(
                [
                    caravanOf([[makeCard(2, "10", "spades")]]),
                    caravanOf([[makeCard(2, "8", "diamonds")]]),
                    caravanOf([[makeCard(2, "6", "clubs")]])
                ],
                [makeCard(2, "5", "clubs"), makeCard(2, "3", "hearts")],
                [makeCard(2, "2", "spades")]
            )
        ],
        current: 0,
        phase: "play",
        winner: null,
        log: [],
        started: true
    };
}

async function selectFirstCard() {
    const slots = page.locator(".hand.human .slot.selectable");
    await page.waitForSelector(".hand.human .slot.selectable", { timeout: 8000 });
    const n = await slots.count();
    assert.ok(n > 0, "expected selectable human hand cards on a post-opening turn");
    let selected = false;
    for (let i = 0; i < n; i++) {
        await slots.nth(i).dispatchEvent("click");
        await page.waitForSelector(".hand.human .slot.selected", { timeout: 1000 }).catch(() => {});
        if ((await page.locator(".hand.human .slot.selected").count()) > 0) {
            selected = true;
            break;
        }
    }
    assert.ok(selected, "clicking a selectable hand card must select it");
}

// --- X flow: select a card, red X appears on the human discard pile, click it. ---
await page.evaluate((s) => window.__setCaravanState(s), seedState());
await page.waitForFunction(() => Array.isArray(window.__caravanStore?.legal), null, {
    timeout: 10000
});

let legal = await page.evaluate(() => window.__caravanStore.legal.map((m) => m.type));
assert.ok(legal.includes("discardCard"), "seeded post-opening turn must offer discard moves");

await selectFirstCard();

const discardX = page.locator(".hand-half.human .discard-slot.discardable");
assert.equal(
    await discardX.count(),
    1,
    "selecting a card with discard available must show a red X discard affordance on the human discard pile"
);
await discardX.first().waitFor({ state: "visible", timeout: 5000 });
const xLabel = (await discardX.first().getAttribute("aria-label")) ?? "";
const xTitle = (await discardX.first().getAttribute("title")) ?? "";
assert.match(
    xLabel,
    /Discard .* to your discard pile/,
    "discard X must name the selected card and the discard pile in its accessible label"
);
assert.equal(xTitle, xLabel, "discard X hover tooltip must match the accessible label");

const before = await page.evaluate(() => ({
    log: window.__caravanStore.state.log.length,
    hand: window.__caravanStore.state.players[0].hand.map((c) => c.id),
    selected: window.__caravanStore.state.players[0].hand.length
}));
const prevLog = before.log;
await discardX.first().click({ force: true });
await waitLogGrowth(page, prevLog, 8000);

const after = await page.evaluate(() => ({
    log: window.__caravanStore.state.log.length,
    lastText: window.__caravanStore.state.log.at(-1)?.text ?? "",
    handIds: window.__caravanStore.state.players[0].hand.map((c) => c.id),
    handLen: window.__caravanStore.state.players[0].hand.length,
    pileFilled: document.querySelectorAll(".hand-half.human .discard-slot.filled").length,
    pileLabel:
        document
            .querySelector(".hand-half.human .discard-slot.filled")
            ?.getAttribute("aria-label") ?? null,
    current: window.__caravanStore.state.current,
    selected: document.querySelectorAll(".hand.human .slot.selected").length
}));
console.log("after X click:", JSON.stringify(after, null, 2));
assert.ok(after.log > prevLog, "clicking the red X must perform a move (log grows)");
assert.match(after.lastText, /discard/i, "the performed move must be a discard");
assert.equal(after.pileFilled, 1, "discarded card must land face-up in the human discard pile");
assert.ok((after.pileLabel ?? "").length > 0, "discard pile must name the discarded card");
assert.equal(
    after.handLen,
    before.hand.length,
    "hand redraws after the discard (length unchanged with a stocked shoe)"
);
assert.ok(
    before.hand.some((cardId) => !after.handIds.includes(cardId)),
    "the selected card must leave the hand"
);
assert.equal(after.selected, 0, "selection clears after the discard");

// --- Shoe flow: with a card selected, clicking the shoe must NOT discard. ---
await page.evaluate((s) => window.__setCaravanState(s), seedState());
await page.waitForFunction(() => window.__caravanStore?.state?.current === 0, null, {
    timeout: 10000
});
await selectFirstCard();
const shoeBefore = await page.evaluate(() => ({
    log: window.__caravanStore.state.log.length,
    hand: window.__caravanStore.state.players[0].hand.map((c) => c.id),
    current: window.__caravanStore.state.current
}));
await page.locator(".hand-half.human .shoe").click({ force: true });
const shoeGrew = await waitLogGrowth(page, shoeBefore.log, 800)
    .then(() => true)
    .catch(() => false);
assert.equal(
    shoeGrew,
    false,
    "clicking the shoe with a selected card must NOT discard (X replaces shoe-click discard)"
);
const shoeAfter = await page.evaluate(() => ({
    log: window.__caravanStore.state.log.length,
    hand: window.__caravanStore.state.players[0].hand.map((c) => c.id),
    current: window.__caravanStore.state.current
}));
assert.deepEqual(shoeAfter.hand, shoeBefore.hand, "shoe click must leave the hand untouched");
assert.equal(shoeAfter.current, 0, "shoe click must not pass the turn");

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
await browser.close();
console.log("\n=== HUMAN DISCARD VIA X TEST PASSED ===");
console.log("Red X on the human discard pile performs the discard; shoe click does not");
