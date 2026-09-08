import { chromium } from "playwright";
import assert from "node:assert/strict";

let id=6000;
function makeCard(deckId, rank, suitOrJoker){
  id++;
  if(rank==="Joker") return { id:`D${deckId}-${rank}${suitOrJoker}-${id}`, suit:null, rank:"Joker", jokerType:suitOrJoker };
  return { id:`D${deckId}-${rank}${suitOrJoker}-${id}`, suit:suitOrJoker, rank };
}
function caravanOf(rows){
  let d=null,s=null;
  if(rows.length>=2){ const a=rows[0][0].rank==="A"?1:Number(rows[0][0].rank); const b=rows[1][0].rank==="A"?1:Number(rows[1][0].rank); d=b>a?"asc":"desc"; }
  if(rows.length>=1) s=rows[0][0].suit;
  return { rows, direction:d, suit:s };
}
function mkPlayer(caravans, hand, deck=[]){ return { deck, hand, caravans }; }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1280,height:900} });
const errors=[];
page.on("console", m=> m.type()==="error" && errors.push(m.text()));
page.on("pageerror", e=> errors.push("PAGEERROR: "+e.message));

await page.goto(process.env.BASE_URL || "http://localhost:5173/", { waitUntil:"networkidle" });
await page.waitForSelector(".board");
const btn = page.locator(".start .btn, button:has-text('Start')");
if(await btn.count()>0) await btn.first().click({force:true});
await page.waitForSelector(".caravans.human .caravan", {timeout:5000});
await page.waitForTimeout(600);

// State BEFORE final 9♣ (after AI A♣ to The Hub, step 32)
// Human Boneyard: 10♣+K♦ (20) unsellable
// Human Redding: 9♠+K♥ /5♠ (23 sellable)
// Human Shady: 2♦/4♦/8♥ (14 unsellable) -> after 9♣ => 23 sellable
// AI Dayglow: 7♣/10♣ (17 unsellable)
// AI New Reno: 8♦+K♥+K♠ /7♥ /3♥ (42 busted)
// AI Hub: 9♥/6♣/4♥/3♦/2♣/A♣ (25 sellable)
// Pair before: Boneyard 20 vs 17 (null), Redding 23 vs 42 (Human), Shady 14 vs 25 (AI) => 1-1, not over
// After 9♣: Shady 23 vs 25 (AI wins) => still 1-1, not over

const hBon = caravanOf([[makeCard(1,"10","clubs"), makeCard(1,"K","diamonds")]]);
const hRed = caravanOf([[makeCard(1,"9","spades"), makeCard(1,"K","hearts")], [makeCard(1,"5","spades")]]);
const hShaBefore = caravanOf([[makeCard(1,"2","diamonds")], [makeCard(1,"4","diamonds")], [makeCard(1,"8","hearts")]]);
const aDay = caravanOf([[makeCard(1,"7","clubs")], [makeCard(1,"10","clubs")]]);
const aNew = caravanOf([[makeCard(1,"8","diamonds"), makeCard(1,"K","hearts"), makeCard(1,"K","spades")], [makeCard(1,"7","hearts")], [makeCard(1,"3","hearts")]]);
const aHub = caravanOf([[makeCard(1,"9","hearts")],[makeCard(1,"6","clubs")],[makeCard(1,"4","hearts")],[makeCard(1,"3","diamonds")],[makeCard(1,"2","clubs")],[makeCard(1,"A","clubs")]]);

let beforeState = {
  players: [mkPlayer([hBon,hRed,hShaBefore], [makeCard(1,"9","clubs"), makeCard(1,"2","clubs")], [makeCard(1,"10","spades")]), mkPlayer([aDay,aNew,aHub], [makeCard(1,"4","spades")], [makeCard(1,"5","diamonds")])],
  current: 0, phase:"play", winner:null, log:[], started:true
};

console.log("Programming state before final 9♣ (Human Shady 14 -> 23)...");
await page.evaluate((s)=> window.__setCaravanState(s), beforeState);
await page.waitForTimeout(600);

let before = await page.evaluate(()=>{
  const s=window.__caravanStore.state;
  return { phase:s.phase, winner:s.winner, current:s.current, hShaLen:s.players[0].caravans[2].rows.length };
});
assert.equal(before.phase, "play");
assert.equal(before.hShaLen, 3);

console.log("Human plays 9♣ to Shady (should be 23, still 1-1 tie, NOT game over)");
await page.evaluate(()=>{
  const s=window.__caravanStore.state;
  const idx=s.players[0].hand.findIndex(c=>c.rank==="9" && c.suit==="clubs");
  window.__act({ type:"playValueCard", player:0, caravan:2, handIndex: idx });
});
await page.waitForTimeout(800);

let after = await page.evaluate(()=>{
  const s=window.__caravanStore.state;
  return {
    phase:s.phase,
    winner:s.winner,
    current:s.current,
    hShaLen:s.players[0].caravans[2].rows.length,
    hShaRows:s.players[0].caravans[2].rows.map(r=>r.map(c=>c.rank+c.suit[0]).join("+")),
    logLast:s.log[s.log.length-1]?.text,
    // check sold styling (current DOM: sellable caravans get .caravan.sellable border/glow, no SOLD word)
    soldCols: document.querySelectorAll(".caravan.sellable").length,
    hasSoldText: document.querySelectorAll(".sold-word").length,
  };
});
console.log("after", after);
assert.equal(after.phase, "play", "BUG REPRO: game should NOT be over after 9♣ — premature ending fixed");
assert.equal(after.winner, null, "winner should still be null (1-1)");
assert.equal(after.hShaLen, 4, "Shady should have 4 rows after 9♣");
assert.equal(after.hasSoldText, 0, "SOLD word should be removed from board");
assert.ok(after.soldCols >= 3, "sellable caravans should have sellable border (at least 3 sellable: Redding 23, Shady 23, Hub 25)");

// Let AI play one more move to ensure not stuck
await page.waitForTimeout(1200); // AI auto
let afterAI = await page.evaluate(()=> ({ phase: window.__caravanStore.state.phase, current: window.__caravanStore.state.current }));
console.log("after AI auto", afterAI);
assert.equal(afterAI.phase, "play", "after AI auto, still play (no premature win)");

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== LONG GAME PREMATURE 9♣ TEST PASSED ===");
console.log("9♣ now correctly does NOT end prematurely; sold shown via border, not word");
await browser.close();
