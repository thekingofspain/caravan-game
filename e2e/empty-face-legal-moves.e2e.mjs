import { chromium } from "playwright";
import assert from "node:assert/strict";

let id=5000;
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
await page.waitForSelector(".play-row--human .caravan--human", {timeout:5000});
await page.waitForTimeout(600);

// Human has empty Boneyard, hand only face cards — should still have legal face moves
const hBon = caravanOf([]);
const hRed = caravanOf([[makeCard(1,"10","clubs")]]);
const hSha = caravanOf([[makeCard(1,"9","hearts")]]);
const aDay = caravanOf([[makeCard(1,"7","clubs")]]);
const aNew = caravanOf([[makeCard(1,"8","diamonds")]]);
const aHub = caravanOf([[makeCard(1,"9","hearts")]]);

const humanHand = [makeCard(1,"K","clubs"), makeCard(1,"J","diamonds"), makeCard(1,"Q","hearts")];
const aiHand = [makeCard(1,"10","spades")];

let state = {
  players: [mkPlayer([hBon,hRed,hSha], humanHand, [makeCard(1,"2","clubs")]), mkPlayer([aDay,aNew,caravanOf([])], aiHand, [makeCard(1,"3","diamonds")])],
  current: 0, phase:"play", winner:null, log:[], started:true
};

console.log("Programming state: Human has empty Boneyard, hand only face cards");
await page.evaluate((s)=> window.__setCaravanState(s), state);
await page.waitForTimeout(600);

let legal = await page.evaluate(()=> window.__caravanStore.legal);
console.log("legalMoves", legal);
assert.ok(legal.length>0, "legalMoves should not be empty with empty+face");
assert.ok(legal.some(m=>m.type==="playFaceCard"), "should have face");
assert.ok(!legal.some(m=>m.type==="discardCard"), "discard correctly not allowed with empty");

let st = await page.evaluate(()=> ({ phase: window.__caravanStore.state.phase, winner: window.__caravanStore.state.winner }));
assert.equal(st.phase, "play");
assert.equal(st.winner, null);

await page.evaluate(()=>{
  const s=window.__caravanStore.state;
  const idx=s.players[0].hand.findIndex(c=>c.rank==="K");
  window.__act({ type:"playFaceCard", player:0, target:{player:1, caravan:0, cardIndex:0}, handIndex: idx });
});
await page.waitForTimeout(600);
let after = await page.evaluate(()=> ({ phase: window.__caravanStore.state.phase, current: window.__caravanStore.state.current }));
console.log("after face", after);
assert.equal(after.phase, "play");
assert.equal(after.current, 1, "should be AI turn after face play");

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== EMPTY FACE LEGAL MOVES TEST PASSED ===");
await browser.close();
