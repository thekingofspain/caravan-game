import { chromium } from "playwright";
import assert from "node:assert/strict";
let idCounter=1000;
function makeCard(suit, rank){
  idCounter+=1;
  if(rank==="Joker") return { id: `${suit}-${rank}-${idCounter}`, suit:null, rank, jokerType: suit };
  return { id: `${suit}-${rank}-${idCounter}`, suit, rank };
}
const Human=0, Ai=1;
function caravanOf(ranks, suit="spades"){
  return { rows: ranks.map(r=> [makeCard(suit, r)]), direction: ranks.length>=2 ? (ranks[1] > ranks[0] ? "asc" : "desc") : null, suit: ranks.length? suit: null };
}
function mkPlayer(caravans, hand, deck=[]){
  return { deck, hand, caravans, sales:0 };
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors=[];
page.on("console", m=> m.type()==="error" && errors.push(m.text()));
page.on("pageerror", e=> errors.push("PAGEERROR: "+e.message));
const BASE = process.env.BASE_URL || "http://localhost:5173/";
await page.goto(BASE, { waitUntil:"networkidle" });
await page.waitForSelector(".board");
const startBtn = page.locator(".start .btn, button:has-text('Start')");
if(await startBtn.count()>0) await startBtn.first().click({force:true});
await page.waitForSelector(".caravans.human .caravan", {timeout:5000});
await page.waitForTimeout(600);
const humanHand = [makeCard("hearts","5"), makeCard("clubs","2")];
const aiHandJoker = [makeCard("Red","Joker"), makeCard("hearts","7")];
const humanCaravans = [caravanOf(["9"],"hearts"), caravanOf(["3"],"clubs"), caravanOf(["7"],"spades")];
const aiCaravans = [caravanOf(["9"],"diamonds"), caravanOf(["3"],"hearts"), caravanOf([])];
let programmedState = {
  players: [mkPlayer(humanCaravans, humanHand, []), mkPlayer(aiCaravans, aiHandJoker, [])],
  current: Ai, phase:"play", winner:null, log:[], started:true,
};
console.log("Programming state: human 9h,3c,7s / ai 9d,3h / ai hand JOKER");
await page.evaluate((state) => {
  const w = window;
  w.__setCaravanState(state);
}, programmedState);
await page.waitForTimeout(400);
let aiCardsBefore = await page.locator(".caravans.ai .caravan .card").count();
console.log(` AI cards before Joker: ${aiCardsBefore} (expect 2: 9d,3h)`);
assert.equal(aiCardsBefore, 2);
console.log("AI plays Joker (hearts JOKER) on Human 9h — should remove 9h and 9d, user must ack via X (original git UX)");
let humanCardsBefore = await page.locator(".caravans.human .caravan .card").count();
let aiCardsBefore2 = await page.locator(".caravans.ai .caravan .card").count();
console.log(` before: human cards=${humanCardsBefore} ai cards=${aiCardsBefore2}`);
await page.evaluate(() => {
  const w = window;
  const s = w.__caravanStore.state;
  const idx = s.players[1].hand.findIndex(c=> c.rank==="Joker");
  const move = { type:"playFaceCard", player:1, target:{player:0, caravan:0, cardIndex:0}, handIndex: idx };
  w.__act(move);
});
await page.waitForTimeout(500);
let pending = await page.locator(".card.pending, .card.pending-remove").count();
let xCount = await page.locator(".confirm.portal").count();
let transition = await page.evaluate(()=> window.__caravanStore.transition);
console.log(` after AI Joker: pendingCards=${pending} x=${xCount} transition=${JSON.stringify(transition)}`);
assert.ok(pending>0, "user should see greyed pending cards before they are removed");
assert.ok(xCount>0, "confirm X should be visible (original git UX: X on Joker attachment)");
assert.equal(transition.needsConfirmation, true, "needsConfirmation true");
assert.equal(transition.confirmer, Human, "Human must ack AI Joker");
assert.equal(transition.impacted.length, 2, "Joker should impact 2 cards (9h + 9d)");
let selectableWhilePending = await page.locator(".slot.selectable").count();
console.log(` human selectable while pending: ${selectableWhilePending} (expect 0)`);
assert.equal(selectableWhilePending, 0, "human blocked until ack");
let humanCardsGrey = await page.locator(".caravans.human .caravan .card.pending").count();
let aiCardsGrey = await page.locator(".caravans.ai .caravan .card.pending").count();
console.log(`  greyed: human=${humanCardsGrey} ai=${aiCardsGrey} (both 9s greyed)`);
assert.equal(humanCardsGrey, 1);
assert.equal(aiCardsGrey, 1);
console.log("User acknowledges (click X on pending Joker)...");
await page.locator(".confirm.portal").first().click({ force:true });
await page.waitForTimeout(700);
let pendingAfter = await page.locator(".card.pending").count();
let humanAfter = await page.locator(".caravans.human .caravan").first().locator(".card").count();
let aiAfter = await page.locator(".caravans.ai .caravan").first().locator(".card").count();
let totalAfter = await page.locator(".caravans.human .caravan .card, .caravans.ai .caravan .card").count();
console.log(` after ack: pending=${pendingAfter} human0 cards=${humanAfter} ai0 cards=${aiAfter} total=${totalAfter}`);
assert.equal(pendingAfter, 0, "pending cleared after ack");
assert.equal(humanAfter, 0, "human 9h should be removed off board after ack (was 1, now 0)");
assert.equal(aiAfter, 0, "ai 9d should be removed off board after ack");
assert.ok(await page.locator(".slot.selectable").count()>0, "human unblocked after ack");
console.log("\n--- Now test Jack ack (same harness, original X) ---");
const humanCaravans2 = [caravanOf(["9"],"hearts"), caravanOf(["3"],"clubs"), caravanOf(["7"],"spades")];
const aiHandJack = [makeCard("hearts","J"), makeCard("spades","5")];
let jackState = {
  players: [mkPlayer(humanCaravans2, [makeCard("hearts","5")], []), mkPlayer([caravanOf(["9"],"diamonds"), caravanOf([]), caravanOf([])], aiHandJack, [])],
  current: Ai, phase:"play", winner:null, log:[], started:true,
};
await page.evaluate((s)=> window.__setCaravanState(s), jackState);
await page.waitForTimeout(400);
console.log("Programmed Jack state: AI Jack on Human 3c");
await page.evaluate(()=>{
  const s = window.__caravanStore.state;
  const idx = s.players[1].hand.findIndex(c=> c.rank==="J");
  window.__act({ type:"playFaceCard", player:1, target:{player:0, caravan:1, cardIndex:0}, handIndex: idx });
});
await page.waitForTimeout(500);
let pendingJack = await page.locator(".card.pending").count();
let transJack = await page.evaluate(()=> window.__caravanStore.transition);
console.log(` after AI Jack: pending=${pendingJack} transition=${JSON.stringify(transJack)} x=${await page.locator(".confirm.portal").count()}`);
assert.ok(pendingJack>0, "Jack should show pending");
assert.equal(transJack.needsConfirmation, true);
assert.equal(transJack.impacted.length, 1);
assert.equal(await page.locator(".slot.selectable").count(), 0, "human blocked for Jack ack");
await page.locator(".confirm.portal").first().click({ force:true });
await page.waitForTimeout(600);
assert.equal(await page.locator(".card.pending").count(), 0, "Jack pending cleared");
assert.equal(await page.locator(".caravans.human .caravan").nth(1).locator(".card").count(), 0, "3c removed after Jack ack");
console.log(" Jack ack verified — human saw X and acknowledged before removal (original git UX)");
assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== AI JACK/JOKER ACK TEST PASSED (original UX: X on card) ===");
await browser.close();
