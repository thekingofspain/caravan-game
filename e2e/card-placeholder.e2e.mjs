import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:5174/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".board");

// ── Test 1: Empty placeholder size consistency ─────────────────
console.log("TEST 1: Empty placeholder size consistency");
const ph = page.locator(".play-row.human .empty").first();
const phBox = await ph.boundingBox();
console.log(`  size: ${phBox.width.toFixed(1)} x ${phBox.height.toFixed(1)}`);

const stacks = page.locator(".play-row.human .caravan");
const stackCount = await stacks.count();
for (let i = 0; i < stackCount; i++) {
  const ph2 = stacks.nth(i).locator(".empty");
  if ((await ph2.count()) === 0) continue;
  const b = await ph2.boundingBox();
  assert.ok(Math.abs(b.width - phBox.width) < 1, `placeholder ${i} width matches`);
  assert.ok(Math.abs(b.height - phBox.height) < 1, `placeholder ${i} height matches`);
}
console.log("  PASS");

// ── Test 2: Placed card gap symmetry ───────────────────────────
console.log("\nTEST 2: Placed card green padding symmetry");

const selectableCard = page.locator(".hand.human .slot.selectable").first();
await selectableCard.click({ force: true, position: { x: 3, y: 3 } });
const target = page.locator(".play-row.human .empty").first();
await target.waitFor({ state: "attached", timeout: 3000 });
await target.click({ force: true });
await page.waitForTimeout(500);

const wrap = page.locator(".play-row.human .caravan .card").first();
await wrap.waitFor({ state: "visible", timeout: 5000 });
const card = wrap.locator(".card").first();
await wrap.waitFor({ state: "visible", timeout: 3000 });
const wb = await wrap.boundingBox();
const cb = await card.boundingBox();

const gapL = cb.x - wb.x;
const gapT = cb.y - wb.y;
const gapR = (wb.x + wb.width) - (cb.x + cb.width);
const gapB = (wb.y + wb.height) - (cb.y + cb.height);

console.log(`  wrap: ${wb.width.toFixed(1)} x ${wb.height.toFixed(1)}`);
console.log(`  card: ${cb.width.toFixed(1)} x ${cb.height.toFixed(1)}`);
console.log(`  gaps: left=${gapL.toFixed(1)}  top=${gapT.toFixed(1)}  right=${gapR.toFixed(1)}  bottom=${gapB.toFixed(1)}`);

const gaps = [gapL, gapT, gapR, gapB];
const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
assert.ok(avg >= 2 && avg <= 4, `avg gap should be ~3px (border width), got ${avg.toFixed(1)}`);
for (let i = 0; i < 4; i++) {
  assert.ok(
    Math.abs(gaps[i] - avg) < 0.5,
    `gap[${i}] (${gaps[i].toFixed(1)}) deviates from avg (${avg.toFixed(1)})`
  );
}
console.log("  PASS");

// ── Test 3: Corner rounding (image-level) ──────────────────────
console.log("\nTEST 3: Border rendered at 3px and corners rounded");

const buf = await wrap.screenshot();
const cornerCheck = JSON.parse(
  await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    URL.revokeObjectURL(url);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const w = c.width,
      h = c.height;

    function px(x, y) {
      const i = (y * w + x) * 4;
      return [d[i], d[i + 1], d[i + 2]];
    }

    function isGreen(c) {
      return c[1] > 60 && c[1] > c[0] * 2 && c[1] > c[2];
    }

    // Count non-green pixels at 1px inset from each edge (inside the 3px border)
    let borderPixels = 0;
    let totalPixels = 0;
    const band = 1;
    for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.8); y++) {
      totalPixels++;
      if (!isGreen(px(band, y))) borderPixels++;
    }
    for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.8); y++) {
      totalPixels++;
      if (!isGreen(px(w - 1 - band, y))) borderPixels++;
    }
    for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x++) {
      totalPixels++;
      if (!isGreen(px(x, band))) borderPixels++;
    }
    for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x++) {
      totalPixels++;
      if (!isGreen(px(x, h - 1 - band))) borderPixels++;
    }

    const borderRatio = totalPixels > 0 ? borderPixels / totalPixels : 0;

    // Corners should show background (green felt), not card-white
    const corners = [
      { label: "tl", x: 0, y: 0 },
      { label: "tr", x: w - 1, y: 0 },
      { label: "bl", x: 0, y: h - 1 },
      { label: "br", x: w - 1, y: h - 1 },
    ];
    const cornerResults = corners.map(({ label, x, y }) => {
      const c = px(x, y);
      return { label, isBackground: isGreen(c) };
    });

    return JSON.stringify({
      w,
      h,
      borderPixels,
      totalPixels,
      borderRatio: +borderRatio.toFixed(3),
      corners: cornerResults,
    });
  }, buf.toString("base64"))
);

console.log(`  image: ${cornerCheck.w}x${cornerCheck.h}`);
console.log(
  `  border pixels at 1px inset: ${cornerCheck.borderPixels}/${cornerCheck.totalPixels} (${(cornerCheck.borderRatio * 100).toFixed(0)}%)`
);

assert.ok(
  cornerCheck.borderRatio > 0.3,
  `border should be visible at 1px inset, got ${(cornerCheck.borderRatio * 100).toFixed(0)}%`
);

for (const c of cornerCheck.corners) {
  assert.ok(c.isBackground, `${c.label} corner should show background (rounded)`);
}
console.log("  corners: all 4 show background (rounded)");
console.log("  PASS");

console.log("\n=== ALL TESTS PASSED ===");
await browser.close();
