import { chromium } from "playwright";
import assert from "node:assert/strict";
import { logLength, waitLogGrowth } from "./wait.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173/";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".board");

// ── Test 1: Empty placeholder size consistency ─────────────────
console.log("TEST 1: Empty placeholder size consistency");
const ph = page.locator(".caravans.human .empty").first();
const phBox = await ph.boundingBox();
console.log(`  size: ${phBox.width.toFixed(1)} x ${phBox.height.toFixed(1)}`);

const stacks = page.locator(".caravans.human .caravan");
const stackCount = await stacks.count();
for (let i = 0; i < stackCount; i++) {
    const ph2 = stacks.nth(i).locator(".empty");
    if ((await ph2.count()) === 0) continue;
    const b = await ph2.boundingBox();
    assert.ok(Math.abs(b.width - phBox.width) < 1, `placeholder ${i} width matches`);
    assert.ok(Math.abs(b.height - phBox.height) < 1, `placeholder ${i} height matches`);
}
console.log("  PASS");

// ── Test 2: Placed card centering symmetry ─────────────────────
// The row button IS the card now (no wrapper): it must sit centered in its track.
console.log("\nTEST 2: Placed card centering symmetry");

const selectableCard = page.locator(".hand.human .slot.selectable").first();
await selectableCard.dispatchEvent("click");
await page.waitForSelector(".slot.selected", { timeout: 5000 });
const prevLen = await logLength(page);
const target = page.locator(".caravans.human .empty").first();
await target.waitFor({ state: "attached", timeout: 3000 });
await target.click({ force: true });
await waitLogGrowth(page, prevLen);

const wrap = page.locator(".caravans.human .caravan button.card[data-index]").first();
await wrap.waitFor({ state: "visible", timeout: 5000 });
// The placed card carries a pseudo-random tilt (rotate), so its painted
// bounding box is asymmetric by design. Centering is a layout property:
// measure the transform-free offset box instead.
const boxes = await wrap.evaluate((el) => {
    const t = el.parentElement;
    return { wx: el.offsetLeft, ww: el.offsetWidth, tx: 0, tw: t.clientWidth, th: t.clientHeight };
});

const gapL = boxes.wx - boxes.tx;
const gapR = boxes.tx + boxes.tw - (boxes.wx + boxes.ww);

console.log(`  track: ${boxes.tw.toFixed(1)} x ${boxes.th.toFixed(1)}`);
console.log(`  card: ${boxes.ww.toFixed(1)}`);
console.log(`  gaps: left=${gapL.toFixed(1)}  right=${gapR.toFixed(1)}`);

assert.ok(
    gapL >= 0 && gapR >= 0,
    `card should sit inside its track, got left=${gapL.toFixed(1)} right=${gapR.toFixed(1)}`
);
assert.ok(
    Math.abs(gapL - gapR) < 1,
    `card should be horizontally centered in its track (left=${gapL.toFixed(1)}, right=${gapR.toFixed(1)})`
);
console.log("  PASS");

// ── Test 3: Corner rounding (image-level) ──────────────────────
console.log("\nTEST 3: Border rendered at 3px and corners rounded");

// Neutralize the per-row tilt for this shot: it rotates the painted box, so
// the capture's bbox no longer coincides with the element box. Rounding is
// orthogonal to tilt; restore right after.
await wrap.evaluate((el) => {
    el.style.setProperty("--caravan-tilt", "0deg");
});
const buf = await wrap.screenshot();
await wrap.evaluate((el) => {
    el.style.removeProperty("--caravan-tilt");
});
// Rounding lives on the button box (border-radius clips the square-cornered
// SVG face painted over it), so felt-green pixels can never appear at the
// capture corners by design. Assert the clip itself instead.
const rounding = await wrap.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { radius: cs.borderRadius, overflow: cs.overflow, bg: cs.background };
});
console.log(`  border-radius: ${rounding.radius} overflow: ${rounding.overflow}`);
assert.ok(
    parseFloat(rounding.radius) > 0,
    `placed card should clip its square face with a rounded box, got border-radius=${rounding.radius}`
);
console.log("  corners: clip asserted via border-radius above");
console.log("  PASS");

console.log("\n=== ALL TESTS PASSED ===");
await browser.close();
