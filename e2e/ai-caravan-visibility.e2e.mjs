import { chromium } from "playwright";
import assert from "node:assert/strict";
let id=5000;
function makeCard(suit, rank){ id+=1; return { id:`${suit}-${rank}-${id}`, suit, rank }; }
function caravanOf(ranks, suit="spades"){
  return { cards: ranks.map(r=> ({card: makeCard(suit, r), kingCount:0, attachments:[]})), direction: ranks.length>=2 ? (ranks[1] > ranks[0] ? "asc" : "desc") : null, suit: ranks.length? suit: null };
}
function mkPlayer(caravans, hand, deck=[]){ return { deck, hand, caravans, sales:0 }; }
const Human=0, Ai=1;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:1280,height:900} });
const errors=[];
page.on("console", m=> m.type()==="error" && errors.push(m.text()));
page.on("pageerror", e=> errors.push("PAGEERROR: "+e.message));
await page.goto(process.env.BASE_URL || "http://localhost:5173/", { waitUntil:"networkidle" });
await page.waitForSelector(".board");
const startBtn = page.locator(".start .btn, button:has-text('Start')");
if(await startBtn.count()>0) await startBtn.first().click({force:true});
await page.waitForSelector(".play-row.human .track.human", {timeout:5000});
await page.waitForTimeout(600);
// Program deterministic state: AI caravans have cards, placeholder should be gone (user bug was placeholder gone but card not visible)
const humanCaravans = [caravanOf(["9"],"hearts"), caravanOf(["3"],"clubs"), caravanOf(["7"],"spades")];
const aiCaravans = [caravanOf(["10"],"diamonds"), caravanOf(["8"],"hearts"), caravanOf(["7"],"clubs")];
const programmedState = {
  players: [mkPlayer(humanCaravans, [makeCard("hearts","5"), makeCard("clubs","2")], []), mkPlayer(aiCaravans, [makeCard("hearts","5")], [])],
  current: Human, phase:"play", winner:null, log:[], started:true,
};
console.log("Programming deterministic AI caravans with cards (placeholder should be gone, cards visible)...");
await page.evaluate((s)=> window.__setCaravanState(s), programmedState);
await page.waitForTimeout(500);
console.log("Checking AI caravans — placeholder should be gone, cards visible (per user report)...");
const aiCaravansLoc = page.locator(".play-row.ai .track.ai");
assert.equal(await aiCaravansLoc.count(), 3, "3 AI caravans");
for(let ci=0; ci<3; ci++){
  const caravan = aiCaravansLoc.nth(ci);
  const emptyCount = await caravan.locator(".empty").count();
  const cardCount = await caravan.locator(".card").count();
  console.log(` AI ${ci}: empty=${emptyCount} cards=${cardCount}`);
  assert.equal(emptyCount, 0, `AI ${ci} placeholder should be gone after card placed (user bug: placeholder goes away but card not visible)`);
  assert.ok(cardCount>0, `AI ${ci} should have visible card, got ${cardCount}`);
  const cards = caravan.locator(".card");
  for(let i=0;i<await cards.count();i++){
    const el = cards.nth(i);
    const box = await el.boundingBox();
    assert.ok(box && box.width>10 && box.height>10, `AI ${ci}:${i} not visible ${JSON.stringify(box)}`);
    const style = await el.evaluate(e=> ({bg:getComputedStyle(e).backgroundImage, disp:getComputedStyle(e).display, vis:getComputedStyle(e).visibility, op:getComputedStyle(e).opacity, cls:e.className}));
    console.log(`  card ${i}: ${style.cls} bg=${style.bg.slice(0,60)}`);
    assert.notEqual(style.bg, "none", `AI ${ci}:${i} missing backgroundImage (card not rendered)`);
  }
}
console.log("AI visibility OK — cards visible, placeholder gone");
// Also verify after a human move that AI cards don't disappear
await page.evaluate(()=>{
  const s = window.__caravanStore.state;
  const idx = s.players[0].hand.findIndex(c=> c.rank==="5");
  if(idx!==-1) window.__act({ type:"playValueCard", player:0, caravan:0, handIndex: idx });
});
await page.waitForTimeout(600);
let totalAi = await page.locator(".play-row.ai .track.ai .card").count();
console.log(` total AI cards after human move: ${totalAi} (should still be 3)`);
assert.equal(totalAi, 3, "AI cards should remain visible after human move");
assert.equal(errors.length, 0, `console errors ${errors.join(" | ")}`);
console.log("\n=== AI CARAVAN VISIBILITY TEST PASSED ===");
await browser.close();
