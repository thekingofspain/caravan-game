import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady, logLength, waitLogGrowth, waitTurn } from "./wait.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await boardReady(page);

async function waitHumanTurn() {
  await waitTurn(page, 0);
  await page.waitForSelector(".hand.human .slot.selectable", { timeout: 4000 });
}

async function doHumanAction() {
  const before = await logLength(page);
  // dispatchEvent for selection: the fanned hand overlaps, so coordinate clicks can land on a neighbor.
  const slots = page.locator(".hand.human .slot.selectable");
  const n = await slots.count();
  let selected = false;
  for (let i = 0; i < n; i++) {
    await slots.nth(i).dispatchEvent("click");
    try {
      await page.waitForSelector(".hand.human .slot.selected", { timeout: 2000 });
    } catch {}
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
  // Every branch above commits a move (logged in the store); wait for the log
  // entry and for the AI reply to return the turn rather than a fixed sleep.
  await waitLogGrowth(page, before);
  await waitTurn(page, 0);
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

// 1) Card height ~ max(vh/7, vw/9) (--card-h token; computed style avoids fan-rotation inflating the bounding box).
const vh = 900;
const vw = 1280;
const expectedH = Math.max(vh / 7, vw / 9);
const cardH = await page.locator(".hand.human .card").first().evaluate((el) => parseFloat(getComputedStyle(el).height));
assert.ok(Math.abs(cardH - expectedH) < expectedH * 0.2, `card height ${cardH} not ~max(vh/7, vw/9)=${expectedH}`);
console.log("card height OK:", Math.round(cardH));

// 2) Playing on own caravan must work.
await waitHumanTurn();
const humanBefore = await page.locator(".caravans.human .caravan .card").count();
const slot = page.locator(".hand.human .slot.selectable").first();
await slot.dispatchEvent("click");
await page.waitForSelector(".hand.human .slot.selected", { timeout: 8000 });
const ownTrack = page.locator(".caravans.human .caravan .track.selectable").first();
const ownCount = await ownTrack.count();
const targetCount = await page.locator(".card.target").count();
if (targetCount > 0) {
  await page.locator(".card.target").first().click({ force: true });
} else if (ownCount > 0) {
  const ph = ownTrack.locator(".empty");
  if (await ph.count() > 0) await ph.first().click({ force: true });
  else await ownTrack.locator(".card").last().click({ force: true });
}
// The play renders a new card on the human side; wait for that DOM change
// rather than a fixed sleep.
await page.waitForFunction(
  (n) => document.querySelectorAll(".caravans.human .caravan .card").length > n,
  humanBefore,
  { timeout: 10000 }
);
const totalHumanWraps = await page.locator(".caravans.human .caravan .card").count();
assert.ok(totalHumanWraps > humanBefore, "playing on own caravan should add a card");
console.log("own caravan play OK");

// 3) Vertical-only stacking: every placed row shares the same horizontal position (no staggered offsets).
const rowBtns = page.locator(".caravans.human .caravan button.card[data-index]");
assert.ok((await rowBtns.count()) > 0, "expected at least one placed card");
const xs = [];
for (let i = 0; i < await rowBtns.count(); i++) {
  xs.push(await rowBtns.nth(i).evaluate((el) => el.getBoundingClientRect().x));
}
for (const x of xs) {
  assert.ok(Math.abs(x - xs[0]) < 1.5, `placed cards must share one x (vertical-only stacking), got ${JSON.stringify(xs)}`);
}
console.log("vertical-only stacking OK (x:", xs[0].toFixed(1), ")");

// 4) Short auto-played game: ensure no card ever renders as a back/blank.
let backs = [];
for (let move = 0; move < 14; move++) {
  try { await waitHumanTurn(); } catch { break; }
  await doHumanAction();
  const b = await backCards();
  if (b.length) { backs = b; break; }
}
assert.equal(backs.length, 0, `a card rendered as a back/blank during play: ${JSON.stringify(backs)}`);

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log("PASS: card sizing, own play, vertical-only stacking, no back/blank cards.");
await browser.close();
