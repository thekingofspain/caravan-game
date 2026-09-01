import { chromium } from "playwright";
import assert from "node:assert/strict";

let id = 7000;
function makeCard(deckId, rank, suitOrJoker) {
  if (suitOrJoker === "Red" || suitOrJoker === "Black") return { id:`D${deckId}-${rank}${suitOrJoker}`, rank, suit:null, jokerType:suitOrJoker };
  return { id:`D${deckId}-${rank}${suitOrJoker[0].toUpperCase()}`, rank, suit:suitOrJoker };
}
const Human=0, Ai=1;
function caravanOf(rows, direction, suit){ return { rows, direction, suit }; }
function mkPlayer(caravans, hand, deck=[]){ return { deck, hand, caravans }; }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1280, height:900} });
const errors=[];
page.on("console", m=> m.type()==="error" && errors.push(m.text()));
page.on("pageerror", e=> errors.push("PAGEERROR: "+e.message));
await page.goto(process.env.BASE_URL || "http://localhost:5173/", { waitUntil:"networkidle" });
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
console.log("Programming dense Shady 6-row state (5♥ at k=4, next 2♦ at k=5)...");
await page.evaluate(s=> window.__setCaravanState(s), programmedState);
await page.waitForTimeout(600);
let before = await page.evaluate(()=>{
  const s=window.__caravanStore.state;
  return { shadyLen: s.players[0].caravans[2].rows.length, shadyRows: s.players[0].caravans[2].rows.map(r=>r[0].rank+r[0].suit[0]) };
});
console.log("before", before);
assert.equal(before.shadyLen,6,"should have 6 rows");
console.log("AI plays J♣ on your Shady Sands {5♥} k=4 — should create pending X");
await page.evaluate(()=> {
  window.__act({ type:"playFaceCard", player:1, target:{ player:0, caravan:2, cardIndex:4 }, handIndex:0 });
});
await page.waitForTimeout(800);
let after = await page.evaluate(()=>{
  const s=window.__caravanStore.state;
  const t=window.__caravanStore.transition;
  const pending = document.querySelectorAll(".jack-remove").length;
  const isPendingCards = document.querySelectorAll(".card.is-pending, .card.is-pending-remove").length;
  const xEl = document.querySelector(".jack-remove");
  const xRect = xEl ? xEl.getBoundingClientRect() : null;
  const pendingRow = document.querySelector('.play-row--human .caravan--human .card[data-index="4"]');
  const nextRow = document.querySelector('.play-row--human .caravan--human .card[data-index="5"]');
  const pendingRowZ = pendingRow ? getComputedStyle(pendingRow).zIndex : null;
  const nextRowZ = nextRow ? getComputedStyle(nextRow).zIndex : null;
  const pendingHasClass = pendingRow ? pendingRow.classList.contains("is-pending") : false;
  const xZ = xEl ? getComputedStyle(xEl).zIndex : null;
  const parentCard = xEl ? xEl.closest(".card.is-remove-src") : null;
  const parentZ = parentCard ? getComputedStyle(parentCard).zIndex : null;
  let occlusion = null;
  if (xRect) {
    const cx = xRect.left + xRect.width/2;
    const cy = xRect.top + xRect.height/2;
    const topEl = document.elementFromPoint(cx, cy);
    occlusion = { isX: topEl ? (topEl.classList.contains("jack-remove") || !!topEl.closest(".jack-remove") || topEl === xEl) : false, topElClass: topEl ? topEl.className : null };
  }
  return {
    phase: s.phase,
    transition: t,
    pending,
    isPendingCards,
    xRect: xRect ? { left:xRect.left, top:xRect.top, width:xRect.width, height:xRect.height } : null,
    occlusion,
    xZ,
    parentZ,
    pendingRowZ,
    nextRowZ,
    pendingHasClass,
    htmlSnippet: pendingRow ? pendingRow.outerHTML.slice(0,600) : null
  };
});
console.log("after", JSON.stringify(after,null,2));
await page.screenshot({ path: "/tmp/jack-x-visibility.png", fullPage: true });
console.log("screenshot saved to /tmp/jack-x-visibility.png");
const isVisible = after.occlusion?.isX;
const pendingRowZ = parseInt(after.pendingRowZ||"0",10);
const nextRowZ = parseInt(after.nextRowZ||"0",10);
console.log(`jack X rect: ${JSON.stringify(after.xRect)} occlusion.isX=${isVisible} pendingRowZ=${after.pendingRowZ} nextRowZ=${after.nextRowZ} xZ=${after.xZ} parentZ=${after.parentZ} pendingHasClass=${after.pendingHasClass}`);
if (!after.xRect) { console.log("FAIL: no jack-remove X found"); process.exit(1); }
if (!isVisible) {
  console.log("\n=== REPRODUCED BUG ===");
  console.log("jack-remove X is occluded");
} else {
  console.log("\n=== PASS ===");
  console.log("jack-remove X is on top");
}
assert.equal(errors.length,0,`console errors: ${errors.join(" | ")}`);
try {
  assert.ok(after.pending>0, "should have jack-remove X pending");
  assert.ok(isVisible, `jack-remove X should not be occluded (topEl should be X, got ${after.occlusion?.topElClass})`);
  assert.ok(pendingRowZ >= 50, `pending row zIndex (${pendingRowZ}) should be 50 (lifted)`);
  assert.ok(pendingRowZ >= nextRowZ, `pending row zIndex (${pendingRowZ}) should be >= next row zIndex (${nextRowZ})`);
  assert.ok(after.pendingHasClass, "pending row should have is-pending class");
  assert.ok(after.parentZ==="7" || parseInt(after.parentZ||"0")>=7, `parent face card should have is-remove-src z-index 7, got ${after.parentZ}`);
  console.log("\n=== JACK X VISIBILITY REPRO: PASS (bug fixed) ===");
} catch (e) {
  console.log("\n=== JACK X VISIBILITY REPRO: FAIL (bug present) ===");
  console.log(e.message);
  process.exit(1);
}
await browser.close();
