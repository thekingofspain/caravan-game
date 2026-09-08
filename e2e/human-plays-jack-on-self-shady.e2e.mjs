import { chromium } from "playwright";
import assert from "node:assert/strict";
let id=3000;
function makeCard(suit, rank){ id+=1; return { id:`${suit}-${rank}-${id}`, suit, rank }; }
const Human=0, Ai=1;
function caravanOf(cards){
  // cards: array of {card, kingCount, attachments} → rows: [value, ...attachments]
  let direction=null, suit=null;
  if(cards.length>=2){
    const a = cards[0].card.rank==="A"?1:Number(cards[0].card.rank);
    const b = cards[1].card.rank==="A"?1:Number(cards[1].card.rank);
    direction = b>a ? "asc" : "desc";
  }
  if(cards.length>=1) suit=cards[0].card.suit;
  return { rows: cards.map(c=> [c.card, ...c.attachments]), direction, suit };
}
function mkPlayer(caravans, hand, deck=[]){ return { deck, hand, caravans, sales:0 }; }

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
await page.waitForTimeout(600);

// Program the exact board before turn 15 (human Jack on 2♥)
// Based on log: Human 2♣ Boneyard, AI 10♥ Dayglow, Human 3♣ Redding, AI 7♦ The Hub, Human 5♣ Shady, AI 6♥ New Reno, Human 6♦ Shady, AI K♦ on 10♥ Dayglow, Human 7♥ Shady, AI 6♠ Dayglow, Human 2♥ Shady, AI 9♥ The Hub, Human 7♦ Shady, AI 9♣ New Reno — next is Human J♦ on 2♥ Shady
const humanBoneyard = caravanOf([
  {card: makeCard("clubs","2"), kingCount:0, attachments:[]},
]);
const humanRedding = caravanOf([
  {card: makeCard("clubs","3"), kingCount:0, attachments:[]},
]);
const humanShady = caravanOf([
  {card: makeCard("clubs","5"), kingCount:0, attachments:[]},
  {card: makeCard("diamonds","6"), kingCount:0, attachments:[]},
  {card: makeCard("hearts","7"), kingCount:0, attachments:[]},
  {card: makeCard("hearts","2"), kingCount:0, attachments:[]},
  {card: makeCard("diamonds","7"), kingCount:0, attachments:[]},
]);
// AI Dayglow: 10♥ + K♦ (×2) , 6♠ , 5♦  — King on 10
const aiDayglow = caravanOf([
  {card: makeCard("hearts","10"), kingCount:1, attachments:[makeCard("diamonds","K")]},
  {card: makeCard("spades","6"), kingCount:0, attachments:[]},
  {card: makeCard("diamonds","5"), kingCount:0, attachments:[]},
]);
const aiNewReno = caravanOf([
  {card: makeCard("hearts","6"), kingCount:0, attachments:[]},
  {card: makeCard("clubs","9"), kingCount:0, attachments:[]},
]);
const aiHub = caravanOf([
  {card: makeCard("diamonds","7"), kingCount:0, attachments:[]},
  {card: makeCard("hearts","9"), kingCount:0, attachments:[]},
]);

const humanCaravans = [humanBoneyard, humanRedding, humanShady];
const aiCaravans = [aiDayglow, aiNewReno, aiHub];

const humanHand = [makeCard("diamonds","J"), makeCard("spades","4"), makeCard("hearts","4")];
const aiHand = [makeCard("spades","4"), makeCard("hearts","5")];

let programmedState = {
  players: [mkPlayer(humanCaravans, humanHand, []), mkPlayer(aiCaravans, aiHand, [])],
  current: Human, phase:"play", winner:null, log:[], started:true,
};

console.log("Programming Shady state before Human J♦ on 2♥ (turn 15)...");
console.log(" Human Shady:", programmedState.players[Human].caravans[2].rows.map(r=> r[0].rank+r[0].suit[0]).join(","));
console.log(" Human hand:", programmedState.players[Human].hand.map(c=> c.rank+c.suit[0]).join(","));
console.log(" AI Dayglow:", programmedState.players[Ai].caravans[0].rows.map(r=> `${r[0].rank}${r[0].suit[0]}${r.slice(1).some(c=>c.rank==="K")?`×${Math.pow(2,r.slice(1).filter(c=>c.rank==="K").length)}`:""}`).join(","));

await page.evaluate((s)=> window.__setCaravanState(s), programmedState);
await page.waitForTimeout(500);

let before = await page.evaluate(()=>{
  const s = window.__caravanStore.state;
  const shady = s.players[0].caravans[2];
  return {
    shady: shady.rows.map((r,i)=> ({idx:i, rank:r[0].rank, suit:r[0].suit, kc:r.slice(1).filter(c=>c.rank==="K").length})),
    shadyCount: shady.rows.length,
    current: s.current,
    pending: document.querySelectorAll(".card.pending").length,
    html: document.querySelectorAll(".caravans.human .caravan")[2]?.innerHTML.slice(0,600),
  };
});
console.log(" before:", JSON.stringify(before, null,2));
assert.equal(before.shadyCount, 5, "Shady should have 5 cards before Jack (5♣,6♦,7♥,2♥,7♦)");
assert.equal(before.shady[3].rank, "2", "index3 should be 2♥");
assert.equal(before.current, Human, "should be Human turn before Jack");

console.log("Human plays J♦ on 2♥ on Shady Sands (index3) — marked 2♥ for removal");
await page.evaluate(()=>{
  const s = window.__caravanStore.state;
  const idx = s.players[0].hand.findIndex(c=> c.rank==="J" && c.suit==="diamonds");
  window.__act({ type:"playOperationCard", player:0, target:{player:0, caravan:2, cardIndex:3}, handIndex: idx });
});
await page.waitForTimeout(600);

let after = await page.evaluate(()=>{
  const s = window.__caravanStore.state;
  const t = window.__caravanStore.transition;
  const shady = s.players[0].caravans[2];
  return {
    shady: shady.rows.map(r=> r[0].rank+r[0].suit[0]),
    shadyCount: shady.rows.length,
    current: s.current,
    transition: t,
    pending: document.querySelectorAll(".card.pending, .card.pending-remove").length,
    ackX: document.querySelectorAll(".confirm.portal").length,
    ackBtn: document.querySelectorAll(".ack-btn, .confirm.portal").length,
    selectable: document.querySelectorAll(".slot.selectable").length,
  };
});
console.log(" after:", JSON.stringify(after, null,2));

// Validate: since human made the move, there is no acknowledgement for the human (no X),
// turn should have ended and cards removed immediately in state
assert.equal(after.ackX, 0, "no ack X shown for human Jack — human has nothing to acknowledge");
assert.equal(after.shadyCount, 4, "Shady should have 4 cards after removing 2♥ (was 5, now 4)");
assert.ok(!after.shady.includes("2h"), "2♥ should be gone");
assert.equal(after.shady.join(","), "5c,6d,7h,7d", "Shady should be 5♣,6♦,7♥,7♦ after Jack");
assert.equal(after.current, Ai, "game should jump to AI turn as soon as J is placed by human (current 1)");
assert.equal(after.transition?.confirmer, Ai, "confirmation belongs to AI, not the human");
assert.equal(after.shady.length, 4);

// Human should not be blocked, but it's AI turn so human selectable is 0, AI will play
let humanSelAfter = await page.locator(".slot.selectable").count();
console.log(` human selectable after Jack (now AI turn): ${humanSelAfter} (expect 0)`);
assert.equal(after.current, Ai, "still AI turn");

// Let AI play one move to ensure human unblocked after
await page.waitForTimeout(1500); // AI auto 650ms + visuals settle
let afterAI = await page.evaluate(()=> ({ current: window.__caravanStore.state.current, humanSel: document.querySelectorAll(".slot.selectable").length, pending: document.querySelectorAll(".card.pending, .card.pending-remove").length, ackX: document.querySelectorAll(".confirm.portal").length }));
console.log(` after AI auto move: current=${afterAI.current} humanSelectable=${afterAI.humanSel} pending=${afterAI.pending} ackX=${afterAI.ackX}`);
assert.equal(afterAI.current, Human, "after AI auto move, back to Human turn");
assert.equal(afterAI.pending, 0, "transient pending grey cleared once AI moved");
assert.ok(afterAI.humanSel > 0, "human unblocked after AI move");

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== SHADY JACK TEST PASSED ===");
console.log("Human J♦ on 2♥ removed immediately, no ack, turn jumped to AI as spec");
await browser.close();
