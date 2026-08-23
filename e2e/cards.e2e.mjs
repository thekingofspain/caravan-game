import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:5173/";

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".board");

// --- 1. Hand cards exist and have non-zero size in the viewport ---
const handCards = page.locator(".hand-zone--human .card");
const handCount = await handCards.count();
assert.ok(handCount > 0, `expected hand cards, found ${handCount}`);

for (let i = 0; i < Math.min(handCount, 4); i++) {
  const box = await handCards.nth(i).boundingBox();
  assert.ok(box && box.width > 10 && box.height > 10, `card #${i} has no visible size: ${JSON.stringify(box)}`);
}

// --- 2. Each card's SVG asset actually paints a visible (light) card body ---
async function lightPercentOf(url) {
  return await page.evaluate(async (u) => {
    const svg = await (await fetch(u)).text();
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let light = 0;
    let total = 0;
    for (let i = 0; i < d.length; i += 4 * 37) {
      total++;
      if (d[i] + d[i + 1] + d[i + 2] > 380) light++;
    }
    return total ? light / total : 0;
  }, url);
}

const invisible = [];
for (let i = 0; i < handCount; i++) {
  const url = await handCards.nth(i).evaluate((el) => {
    const bg = getComputedStyle(el).backgroundImage;
    return bg.slice(bg.indexOf('"') + 1, bg.lastIndexOf('"'));
  });
  const pct = await lightPercentOf(url);
  if (pct < 0.3) invisible.push({ i, url, pct: +pct.toFixed(3) });
}

assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.join(" | ")}`);
assert.equal(invisible.length, 0, `cards that render blank (no visible body): ${JSON.stringify(invisible)}`);

console.log(`PASS: ${handCount} hand cards rendered with visible card bodies, no console errors.`);
await browser.close();
