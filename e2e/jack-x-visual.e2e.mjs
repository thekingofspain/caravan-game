import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs";

let id = 8000;
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

// Dense Shady from activity log: 6 rows, J♣ on 5♥ at k=4, next 2♦ at k=5
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
// Skill says: write to /tmp, use headless:false by default, screenshot via page.screenshot or locator.screenshot
// We capture full page and close-up of the X and the caravan
const fullPath = "/tmp/jack-visual-full.png";
const caravanPath = "/tmp/jack-visual-caravan.png";
const xClosePath = "/tmp/jack-visual-x.png";
await page.screenshot({ path: fullPath, fullPage: true });
console.log(`📸 Full screenshot saved to ${fullPath} (${fs.existsSync(fullPath) ? fs.statSync(fullPath).size : 0} bytes)`);
try {
  const caravanLoc = page.locator(".play-row--human .caravan--human").first();
  await caravanLoc.screenshot({ path: caravanPath });
  console.log(`📸 Caravan screenshot saved to ${caravanPath}`);
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
  const parentCard = xEl ? xEl.closest(".card.is-remove-src") : null;
  const parentZ = parentCard ? getComputedStyle(parentCard).zIndex : null;
  const parentHasClass = !!parentCard;
  const xZ = xEl ? getComputedStyle(xEl).zIndex : null;
  const xBg = xEl ? getComputedStyle(xEl).backgroundColor : null;
  // Check if X is visually on top via elementFromPoint (skill recommends checking occlusion)
  let isOnTop = false;
  let topElClass = null;
  if (xRect) {
    const cx = xRect.left + xRect.width/2;
    const cy = xRect.top + xRect.height/2;
    const topEl = document.elementFromPoint(cx, cy);
    topElClass = topEl ? topEl.className : null;
    isOnTop = topEl ? (topEl.classList.contains("jack-remove") || !!topEl.closest(".jack-remove")) : false;
  }
  return {
    pendingHasClass,
    pendingZ,
    nextZ,
    parentHasClass,
    parentZ,
    xZ,
    xBg,
    isOnTop,
    topElClass,
    xRect: xRect ? { left:Math.round(xRect.left), top:Math.round(xRect.top), w:Math.round(xRect.width), h:Math.round(xRect.height)} : null,
    pendingRowClass: pendingRow ? pendingRow.className : null,
    nextRowClass: nextRow ? nextRow.className : null,
  };
});
console.log("info", JSON.stringify(info,null,2));

// --- FAILING ASSERTIONS (these should fail before fix) ---
console.log("\n--- Assertions (should FAIL before fix, PASS after) ---");
let failures = [];
if (!info.pendingHasClass) failures.push(`pending row missing is-pending class (got ${info.pendingRowClass})`);
if (info.pendingZ !== "50") failures.push(`pending row zIndex should be 50, got ${info.pendingZ}`);
if (!info.parentHasClass) failures.push(`face card missing is-remove-src class (parent is-remove-src not found, parentZ=${info.parentZ})`);
if (info.parentZ !== "7") failures.push(`parent face card zIndex should be 7, got ${info.parentZ}`);
if (info.xZ !== "10") failures.push(`jack-remove zIndex should be 10, got ${info.xZ}`);
if (!info.isOnTop) failures.push(`jack-remove X not on top (elementFromPoint hits ${info.topElClass}, not X) — X occluded by next card or overlay`);
if (info.pendingZ !== "50" || info.nextZ !== "50") {
  // Both pending rows should be lifted to 50
  if (parseInt(info.pendingZ||"0") < 50 || parseInt(info.nextZ||"0") < 50) failures.push(`pending rows should both be lifted to 50, got pending ${info.pendingZ} next ${info.nextZ}`);
}

if (failures.length > 0) {
  console.log("❌ FAILING TEST — bug reproduced:");
  failures.forEach(f=> console.log("  - "+f));
  console.log(`\nScreenshots saved: ${fullPath}, ${caravanPath}, ${xClosePath} — inspect visually: X should be bright red circle above cards, not greyed or hidden`);
  // Also check that screenshots exist and are non-empty
  assert.ok(fs.existsSync(fullPath) && fs.statSync(fullPath).size > 1000, "full screenshot should exist");
  // Fail the test
  assert.fail(`Visual test failed with ${failures.length} issues:\n${failures.join("\n")}`);
} else {
  console.log("✅ PASS — jack-remove X correctly lifted above other cards and overlay");
  console.log(`Screenshots: ${fullPath}, ${caravanPath}, ${xClosePath}`);
}
assert.equal(errors.length,0,`console errors: ${errors.join(" | ")}`);
await browser.close();
