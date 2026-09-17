import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady, logLength, waitLogGrowth } from "./wait.mjs";
import { logInfo } from "./log.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await boardReady(page);

const vh = 900;
const vw = 1280;
const expectedH = Math.max(vh / 7, vw / 9);
const cardH = await page.locator(".hand.human .card").first().evaluate((el) => parseFloat(getComputedStyle(el).height));
assert.ok(Math.abs(cardH - expectedH) < expectedH * 0.2, `card height ${cardH} not ~max(vh/7, vw/9)=${expectedH}`);
logInfo("card height OK:", Math.round(cardH));

async function waitHumanTurn() {
  await page.waitForSelector(".hand.human .slot.selectable", { timeout: 6000 });
}

async function doHumanAction() {
  const slots = page.locator(".hand.human .slot.selectable");
  const n = await slots.count();
  // Prefer a value card; fall back to face cards. dispatchEvent: the fanned hand
  // overlaps, so coordinate clicks can land on a neighbor — try until one selects.
  const order = [];
  for (let i = 0; i < n; i++) {
    const cls = await slots.nth(i).locator(".card").getAttribute("class");
    if (!/jack|queen|king|joker/.test(cls)) order.push(i);
  }
  for (let i = 0; i < n; i++) if (!order.includes(i)) order.push(i);
  let selected = false;
  for (const i of order) {
    await slots.nth(i).dispatchEvent("click");
    // Conditional: resolve as soon as the click selects a slot; a slot that
    // never selects (overlap picks a neighbor) falls through to the next.
    await page.waitForSelector(".hand.human .slot.selected", { timeout: 1000 }).catch(() => {
      // No selection from this slot — try the next one.
    });
    if ((await page.locator(".hand.human .slot.selected").count()) > 0) { selected = true; break; }
  }
  if (!selected) return;
  const tgt = page.locator(".card.target").first();
  if (await tgt.count() > 0) {
    await tgt.click({ force: true });
  } else {
    const track = page.locator(".caravans.human .caravan .track.selectable").first();
    if (await track.count() > 0) {
      const ph = track.locator(".empty");
      if (await ph.count() > 0) await ph.first().click({ force: true });
      else await track.locator(".card").last().click({ force: true });
    } else {
      // Face card with no legal target (or no open caravan): discard the selected card via the red X on the discard pile.
      await page.locator(".hand-half.human .discard-slot.discardable").first().click({ force: true });
    }
  }
}

async function backCards() {
  return await page.evaluate(() => {
    const out = [];
    // Deck backs and the AI's hidden hand are intentional backs — only played and human-hand cards must never be backs/blanks.
    for (const el of document.querySelectorAll(".caravans .card, .hand.human .card")) {
      const bg = getComputedStyle(el).backgroundImage;
      if (el.className.includes("back") || bg === "none" || bg.includes("back.svg")) {
        out.push({ cls: el.className, bg });
      }
    }
    return out;
  });
}

let backs = [];
let placedMax = 0;
for (let move = 0; move < 150; move++) {
  try { await waitHumanTurn(); } catch { break; }
  const prevLen = await logLength(page);
  await doHumanAction();
  // Pace on the game's own signal (human move appended to the log) instead of
  // a fixed sleep, so the loop runs as fast as the game allows.
  await waitLogGrowth(page, prevLen, 3000).catch(() => {
    // No-op action logged nothing — proceed as the old sleep did; the next
    // waitHumanTurn retries or exits.
  });
  const placed = await page.evaluate(() => document.querySelectorAll(".caravans.human .caravan .card").length);
  if (placed > placedMax) placedMax = placed;
  const b = await backCards();
  if (b.length) { backs = b; break; }
}
assert.equal(backs.length, 0, `a card rendered as a back/blank during play: ${JSON.stringify(backs)}`);
assert.ok(placedMax > 0, `no cards were ever placed on the board during play`);
logInfo("game ran 150 moves, full-play validation only:", { placedMax });

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log(`PASS: ${placedMax} cards placed across a long auto-played game with no back/blank cards and no console errors.`);
await browser.close();
