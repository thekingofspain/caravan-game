import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";

function makeCard(deckId, rank, suitOrJoker) {
  if (suitOrJoker === "Red" || suitOrJoker === "Black") return { id:`D${deckId}-${rank}${suitOrJoker}`, rank, suit:null, jokerType:suitOrJoker };
  return { id:`D${deckId}-${rank}${suitOrJoker[0].toUpperCase()}`, rank, suit:suitOrJoker };
}
const Human=0, Ai=1;
function caravanOf(rows, direction, suit){ return { rows, direction, suit }; }
function mkPlayer(caravans, hand, deck=[]){ return { deck, hand, caravans }; }

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1280, height:900} });
const errors=[];
page.on("console", m=> m.type()==="error" && errors.push(m.text()));
page.on("pageerror", e=> errors.push("PAGEERROR: "+e.message));
await page.goto(BASE, { waitUntil:"networkidle" });
await page.waitForSelector(".board");
const startBtn = page.locator(".start .btn, button:has-text('Start')");
if (await startBtn.count()>0) await startBtn.first().click({force:true});
await page.waitForSelector(".play-row--human .caravan--human", {timeout:5000});
await page.waitForTimeout(600);

const hBoneyard = caravanOf([[makeCard(1,"7","clubs")]], null, "clubs");
const hRedding = caravanOf([[makeCard(1,"10","diamonds")],[makeCard(1,"9","spades")]], "desc","diamonds");
const hShadyRows = [
  [makeCard(1,"3","diamonds")],
  [makeCard(1,"4","spades")],
  [makeCard(1,"9","hearts")],
  [makeCard(1,"4","hearts")],
  [makeCard(1,"5","hearts")],
  [makeCard(1,"2","diamonds")],
];
const hShady = caravanOf(hShadyRows, "desc","diamonds");
const aDayglow = caravanOf([[makeCard(2,"8","spades")],[makeCard(2,"7","spades")]], "desc","spades");
const aNewReno = caravanOf([[makeCard(2,"9","clubs")],[makeCard(2,"7","clubs")]], "desc","clubs");
const aHub = caravanOf([[makeCard(2,"10","clubs")],[makeCard(2,"7","hearts")],[makeCard(2,"5","clubs")],[makeCard(2,"4","spades")]], "desc","clubs");
const humanHand = [makeCard(1,"J","clubs"), makeCard(1,"2","clubs")];
const aiHand = [makeCard(2,"J","clubs"), makeCard(2,"5","hearts")];
const programmedState = {
  players: [mkPlayer([hBoneyard,hRedding,hShady], humanHand, []), mkPlayer([aDayglow,aNewReno,aHub], aiHand, [])],
  current: Ai, phase:"play", winner:null, log:[], started:true
};
console.log("Programming dense Shady 6-row...");
await page.evaluate(s=> window.__setCaravanState(s), programmedState);
await page.waitForTimeout(600);
console.log("AI plays J♣ on Shady Sands {5♥} k=4");
await page.evaluate(()=> window.__act({ type:"playFaceCard", player:1, target:{ player:0, caravan:2, cardIndex:4 }, handIndex:0 }));
await page.waitForTimeout(800);

// --- PLAYWRIGHT SKILL: capture images ---
const fullPath = "/tmp/jack-visual-full.png";
const caravanPath = "/tmp/jack-visual-caravan.png";
const xClosePath = "/tmp/jack-visual-x.png";
await page.screenshot({ path: fullPath, fullPage: true });
console.log(`📸 Full screenshot saved to ${fullPath} (${fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0} bytes)`);
try {
  const shadyLoc = page.locator(".play-row--human .caravan--human").nth(2);
  await shadyLoc.screenshot({ path: caravanPath });
  console.log(`📸 Shady caravan screenshot saved to ${caravanPath} (${fs.statSync(caravanPath).size} bytes)`);
} catch (e) { console.log("caravan screenshot failed", e.message); }
try {
  const xLoc = page.locator(".jack-remove").first();
  if (await xLoc.count() > 0) {
    await xLoc.screenshot({ path: xClosePath });
    console.log(`📸 X close-up saved to ${xClosePath}`);
  } else {
    console.log("no jack-remove found for close-up");
  }
} catch (e) { console.log("x screenshot failed", e.message); }

// --- Visual + structural assertions ---
let info = await page.evaluate(()=>{
  const xEl = document.querySelector(".jack-remove");
  const xRect = xEl ? xEl.getBoundingClientRect() : null;
  const pendingRow = document.querySelector('.play-row--human .caravan--human .card[data-index="4"]');
  const nextRow = document.querySelector('.play-row--human .caravan--human .card[data-index="5"]');
  const pendingHasClass = pendingRow ? pendingRow.classList.contains("is-pending") : false;
  const pendingZ = pendingRow ? getComputedStyle(pendingRow).zIndex : null;
  const nextZ = nextRow ? getComputedStyle(nextRow).zIndex : null;
  const xZ = xEl ? getComputedStyle(xEl).zIndex : null;
  const xRight = xEl ? getComputedStyle(xEl).right : null;
  const xTop = xEl ? getComputedStyle(xEl).top : null;
  const xHasRowClass = xEl ? xEl.classList.contains("jack-remove--row") : false;
  const caravanEl = document.querySelector('.play-row--human .caravan--human:nth-child(3)') || document.querySelectorAll('.play-row--human .caravan--human')[2];
  // Alternative: get Shady caravan width
  const shadyCaravan = document.querySelectorAll('.play-row--human .caravan--human')[2];
  const caravanWidth = shadyCaravan ? getComputedStyle(shadyCaravan).width : null;
  const caravanWVar = shadyCaravan ? getComputedStyle(document.documentElement).getPropertyValue('--caravan-w') : null;
  let isOnTop = false;
  let topElClass = null;
  if (xRect) {
    const cx = xRect.left + xRect.width/2;
    const cy = xRect.top + xRect.height/2;
    const topEl = document.elementFromPoint(cx, cy);
    topElClass = topEl ? topEl.className : null;
    isOnTop = topEl ? (topEl.classList.contains("jack-remove") || !!topEl.closest(".jack-remove")) : false;
  }
  // Check if X is fully inside viewport and not clipped (entire circle visible)
  let fullyVisible = false;
  if (xRect) {
    const caravanRect = shadyCaravan ? shadyCaravan.getBoundingClientRect() : null;
    if (caravanRect) {
      fullyVisible = xRect.left >= caravanRect.left && xRect.right <= caravanRect.right && xRect.top >= caravanRect.top && xRect.bottom <= caravanRect.bottom;
    }
  }
  return {
    pendingHasClass,
    pendingZ,
    nextZ,
    xZ,
    xRight,
    xTop,
    xHasRowClass,
    isOnTop,
    topElClass,
    xRect: xRect ? { left:Math.round(xRect.left), top:Math.round(xRect.top), w:Math.round(xRect.width), h:Math.round(xRect.height)} : null,
    pendingRowClass: pendingRow ? pendingRow.className : null,
    caravanWidth,
    fullyVisible,
  };
});
console.log("info", JSON.stringify(info,null,2));

console.log("\n--- Assertions (should FAIL before fix, PASS after) ---");
let failures = [];
if (!info.pendingHasClass) failures.push(`pending row missing is-pending class (got ${info.pendingRowClass})`);
if (info.pendingZ !== "50") failures.push(`pending row zIndex should be 50, got ${info.pendingZ}`);
if (!info.xHasRowClass) failures.push(`jack-remove should have jack-remove--row class (fully inside, over king)`);
if (info.xZ !== "20") failures.push(`jack-remove zIndex should be 20 (over king), got ${info.xZ}`);
if (!info.isOnTop) failures.push(`jack-remove X not on top (elementFromPoint hits ${info.topElClass}, not X) — X occluded`);
// Check that X is fully inside caravan (entire circle visible, not half clipped)
if (!info.fullyVisible) failures.push(`jack-remove X not fully inside caravan bounds (half clipped) — caravan width ${info.caravanWidth}, X rect ${JSON.stringify(info.xRect)}`);
// Check caravan width is --caravan-w (129) not --card-w (84)
if (info.caravanWidth && parseInt(info.caravanWidth) < 100) failures.push(`caravan width should be --caravan-w (~129px) not --card-w (84px), got ${info.caravanWidth}`);

if (failures.length > 0) {
  console.log("❌ FAILING TEST — bug reproduced:");
  failures.forEach(f=> console.log("  - "+f));
  console.log(`\nScreenshots saved: ${fullPath}, ${caravanPath}, ${xClosePath} — inspect visually: X should be bright red circle fully inside top-right of Jack, over any King, not half clipped`);
  assert.fail(`Visual test failed with ${failures.length} issues:\n${failures.join("\n")}`);
} else {
  console.log("✅ PASS — jack-remove X correctly lifted, fully visible, over king, not half clipped");
  console.log(`Screenshots: ${fullPath}, ${caravanPath}, ${xClosePath}`);
}
assert.equal(errors.length,0,`console errors: ${errors.join(" | ")}`);
await browser.close();
