import { chromium } from "playwright";
import assert from "node:assert/strict";
import { boardReady, logLength, waitLogGrowth } from "./wait.mjs";

let id=9000;
function makeCard(deckId, rank, suitOrJoker){
  id+=1;
  if(rank==="Joker") return { id:`D${deckId}-${rank}${suitOrJoker}-${id}`, suit:null, rank:"Joker", jokerType:suitOrJoker };
  return { id:`D${deckId}-${rank}${suitOrJoker}-${id}`, suit:suitOrJoker, rank };
}
const Human=0, Ai=1;
function caravanOf(rows){
  let direction=null, suit=null;
  if(rows.length>=2){
    const a=rows[0][0].rank==="A"?1:Number(rows[0][0].rank);
    const b=rows[1][0].rank==="A"?1:Number(rows[1][0].rank);
    direction = b>a ? "asc" : "desc";
  }
  if(rows.length>=1) suit=rows[0][0].suit;
  return { rows, direction, suit };
}
function mkPlayer(caravans, hand, shoe=[]){ return { shoe, hand, caravans, sales:0 }; }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1280,height:900} });
const errors=[];
page.on("console", m=> m.type()==="error" && errors.push(m.text()));
page.on("pageerror", e=> errors.push("PAGEERROR: "+e.message));

await page.goto(process.env.BASE_URL || "http://localhost:5173/", { waitUntil:"networkidle" });
await page.waitForSelector(".board");
const startBtn = page.locator(".start .btn, button:has-text('Start')");
if(await startBtn.count()>0) await startBtn.first().click({force:true});
await page.waitForSelector(".caravans.human .caravan", {timeout:5000});
await boardReady(page);

// State BEFORE final Human 6♥ on Shady (after AI A♥ on New Reno, step 30)
// Human Boneyard: 10♣+K♣ | A♣  => 21
// Human Redding: 7♠ |6♠ |5♠ |4♣+K♣ => 26
// Human Shady: 3♣ |4♠ |9♥ |4♥ => 20
// AI Dayglow: 10♦ |9♦ |5♥ =>24
// AI New Reno: 10♠ |9♠ |6♠ |A♥ =>26
// AI Hub: 4♣ =>4
const hBoneyard = caravanOf([[makeCard(1,"10","clubs"), makeCard(1,"K","clubs")], [makeCard(1,"A","clubs")]]);
const hRedding = caravanOf([[makeCard(1,"7","spades")], [makeCard(1,"6","spades")], [makeCard(1,"5","spades")], [makeCard(1,"4","clubs"), makeCard(1,"K","clubs")]]);
const hShadyBefore = caravanOf([[makeCard(1,"3","clubs")], [makeCard(1,"4","spades")], [makeCard(1,"9","hearts")], [makeCard(1,"4","hearts")]]);
const aDayglow = caravanOf([[makeCard(1,"10","diamonds")], [makeCard(1,"9","diamonds")], [makeCard(1,"5","hearts")]]);
const aNewReno = caravanOf([[makeCard(1,"10","spades")], [makeCard(1,"9","spades")], [makeCard(1,"6","spades")], [makeCard(1,"A","hearts")]]);
const aHub = caravanOf([[makeCard(1,"4","clubs")]]);

const humanCaravansBefore = [hBoneyard, hRedding, hShadyBefore];
const aiCaravans = [aDayglow, aNewReno, aHub];
const humanHand = [makeCard(1,"6","hearts"), makeCard(1,"2","clubs")];
const aiHand = [makeCard(1,"7","diamonds"), makeCard(1,"8","clubs")];

let beforeState = {
  players: [mkPlayer(humanCaravansBefore, humanHand, []), mkPlayer(aiCaravans, aiHand, [])],
  current: Human, phase:"play", winner:null, log:[], started:true,
};

console.log("Programming state before final Human 6♥ on Shady (20 -> 26)...");
await page.evaluate((s)=> window.__setCaravanState(s), beforeState);
await page.waitForFunction(
  () => window.__caravanStore.state.players[0].caravans[2].rows.length === 4,
  null,
  { timeout: 10000 }
);

let before = await page.evaluate(()=>{
  const s = window.__caravanStore.state;
  const st = (p,i)=> {
    const car = s.players[p].caravans[i];
    // compute via engine scoring is not available here, just return rows
    return { rows: car.rows.map(r=> r.map(c=> c.rank+(c.suit?c.suit[0]:"J")).join("+")).join(" | "), len: car.rows.length };
  };
  return {
    hShady: st(0,2),
    hBoneyard: st(0,0),
    hRedding: st(0,1),
    aDayglow: st(1,0),
    aNewReno: st(1,1),
    aHub: st(1,2),
    current: s.current,
    phase: s.phase,
  };
});
console.log(" before:", JSON.stringify(before,null,2));
assert.equal(before.current, Human);
assert.equal(before.hShady.len, 4, "Shady should have 4 rows before 6♥");

console.log("Human plays 6♥ on Shady Sands (caravan 2) — should make Shady 26 but NOT win game (Boneyard 21 vs Dayglow 24)");
// Use __act to play 6♥
const logBefore = await logLength(page);
await page.evaluate(()=>{
  const s = window.__caravanStore.state;
  const idx = s.players[0].hand.findIndex(c=> c.rank==="6" && c.suit==="hearts");
  window.__act({ type:"playValueCard", player:0, lane: 2, handIndex: idx });
});
await waitLogGrowth(page, logBefore);

let after = await page.evaluate(()=>{
  const s = window.__caravanStore.state;
  return {
    phase: s.phase,
    winner: s.winner,
    current: s.current,
    logLast: s.log[s.log.length-1],
    hShadyRows: s.players[0].caravans[2].rows.map(r=> r.map(c=> c.rank+(c.suit?c.suit[0]:"J")).join("+")),
    hShadyLen: s.players[0].caravans[2].rows.length,
    allRows: s.players.map((p,pi)=> ({ player:pi, caravans: p.caravans.map((c,ci)=> ({ idx:ci, rows:c.rows.map(r=> r.map(cc=> cc.rank+(cc.suit?cc.suit[0]:"")+ (cc.jokerType?cc.jokerType:"")).join("+")) })) })),
  };
});
console.log(" after:", JSON.stringify(after,null,2));

// Game should NOT be over: Human has 21,26,26 but AI Dayglow 24 beats Boneyard 21 => tie
assert.equal(after.phase, "play", "game should remain in play after 6♥ (not over) — 1-1 tie");
assert.equal(after.winner, null, "winner should be null (no 2 caravan wins)");
assert.equal(after.hShadyLen, 5, "Shady should have 5 rows after 6♥");
assert.ok(after.hShadyRows.join(",").includes("6h"), "Shady should contain 6♥");

if(after.logLast){
  assert.ok(!after.logLast.text.toLowerCase().includes("you win the game"), "should not be game win");
}

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== LONG GAME 6♥ NO-WIN TEST PASSED ===");
console.log("Human 6♥ makes Shady 26 but Boneyard 21 < Dayglow 24, Redding tie, so game correctly stays in play");
await browser.close();
