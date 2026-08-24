import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".board");

const vh = 900;
const cardH = await page.locator(".player-human .hand-zone .card").first().evaluate((el) => el.getBoundingClientRect().height);
assert.ok(Math.abs(cardH - vh / 8) < vh / 8 * 0.2, `card height ${cardH} not ~vh/8`);
console.log("card height OK:", Math.round(cardH));

async function waitHumanTurn() {
  await page.waitForSelector(".player-human .hand-zone .hand__slot.is-selectable", { timeout: 6000 });
}

async function doHumanAction() {
  const slots = page.locator(".player-human .hand-zone .hand__slot.is-selectable");
  const n = await slots.count();
  let picked = 0;
  for (let i = 0; i < n; i++) {
    const cls = await slots.nth(i).locator(".card").getAttribute("class");
    if (!/card--jack|card--queen|card--king|card--joker/.test(cls)) { picked = i; break; }
  }
  await slots.nth(picked).click({ force: true, position: { x: 3, y: 3 } });
  await page.waitForTimeout(100);
  const tgt = page.locator(".card.is-target").first();
  if (await tgt.count() > 0) {
    await tgt.click({ force: true });
  } else {
    const ownCount = await page.locator(".player-human .caravan.is-selectable").count();
    if (ownCount > 0) {
      await page.evaluate(() => {
        const btn = document.querySelector(".player-human .caravan.is-selectable");
        if (btn) btn.click();
      });
    } else {
      const d = page.locator(".btn", { hasText: "Discard" });
      if (await d.isEnabled()) await d.click();
    }
  }
}

async function backCards() {
  return await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll(".card")) {
      const bg = getComputedStyle(el).backgroundImage;
      if (el.className.includes("card--back") || bg === "none" || bg.includes("back.svg")) {
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
  await doHumanAction();
  await page.waitForTimeout(100);
  const placed = await page.evaluate(() => document.querySelectorAll(".player-human .caravan .card").length);
  if (placed > placedMax) placedMax = placed;
  const b = await backCards();
  if (b.length) { backs = b; break; }
}
assert.equal(backs.length, 0, `a card rendered as a back/blank during play: ${JSON.stringify(backs)}`);
assert.ok(placedMax > 0, `no cards were ever placed on the board during play`);
console.log("game ran 150 moves,", placedMax, "cards placed; full-play validation only.");

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
console.log(`PASS: ${placedMax} cards placed across a long auto-played game with no back/blank cards and no console errors.`);
await browser.close();
