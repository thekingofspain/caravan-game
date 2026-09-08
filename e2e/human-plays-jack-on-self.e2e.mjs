import { chromium } from "playwright";
import assert from "node:assert/strict";

let id=2000;
function makeCard(suit, rank){ id+=1; return { id:`${suit}-${rank}-${id}`, suit, rank }; }
const Human=0, Ai=1;
function caravanOf(cards){
  // cards: array of {card, kingCount, attachments} → rows: [value, ...attachments]
  let direction=null, suit=null;
  if(cards.length>=2){
    const a=cards[0].card.rank==="A"?1:Number(cards[0].card.rank);
    const b=cards[1].card.rank==="A"?1:Number(cards[1].card.rank);
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

// Program the exact board just before the final human Jack:
// Human Boneyard (0): 9♦, 8♠+K♠(×2), 6♠, 3♠  — the 8♠ at index1 has K♠ attached, kingCount 1
// Human Redding (1): 8♥
// Human Shady Sands (2): 3♣
// AI Dayglow (0): 10♦+K♣(×2), 5♦  — 10♦ has K♣
// AI New Reno (1): 8♥
// AI The Hub (2): 7♣
const boneyardCards = [
  { card: makeCard("diamonds","9"), kingCount:0, attachments:[] },
  { card: makeCard("spades","8"), kingCount:1, attachments:[makeCard("spades","K")] },
  { card: makeCard("spades","6"), kingCount:0, attachments:[] },
  { card: makeCard("spades","3"), kingCount:0, attachments:[] },
];
const humanCaravans = [
  caravanOf(boneyardCards),
  caravanOf([{card: makeCard("hearts","8"), kingCount:0, attachments:[]}]),
  caravanOf([{card: makeCard("clubs","3"), kingCount:0, attachments:[]}]),
];
const aiDayglow = [
  { card: makeCard("diamonds","10"), kingCount:1, attachments:[makeCard("clubs","K")] },
  { card: makeCard("diamonds","5"), kingCount:0, attachments:[] },
];
const aiCaravans = [
  caravanOf(aiDayglow),
  caravanOf([{card: makeCard("hearts","8"), kingCount:0, attachments:[]}]),
  caravanOf([{card: makeCard("clubs","7"), kingCount:0, attachments:[]}]),
];
const humanHand = [makeCard("clubs","J"), makeCard("hearts","2"), makeCard("diamonds","4")];
const aiHand = [makeCard("hearts","7"), makeCard("clubs","4")];

let programmedState = {
  players: [mkPlayer(humanCaravans, humanHand, []), mkPlayer(aiCaravans, aiHand, [])],
  current: Human, phase:"play", winner:null, log:[], started:true,
};

console.log("Programming Boneyard state: Human Boneyard has 9♦,8♠+K♠(×2),6♠,3♠ — human will Jack the 8♠");
await page.evaluate((s)=> window.__setCaravanState(s), programmedState);
await page.waitForTimeout(500);

// Verify before: Boneyard has 4 cards, 8♠ is index1 with King, has 2x badge
let beforeInfo = await page.evaluate(()=>{
  const s = window.__caravanStore.state;
  const boneyard = s.players[0].caravans[0];
  return {
    boneyard: boneyard.rows.map((r,i)=> ({idx:i, rank:r[0].rank, suit:r[0].suit, kc:r.slice(1).filter(c=>c.rank==="K").length, att:r.slice(1).map(a=>a.rank)})),
    html: document.querySelector(".caravans.human .caravan")?.innerHTML.slice(0,800),
    boneyardCards: document.querySelector(".caravans.human .caravan")?.querySelectorAll(".card").length,
    badge: document.querySelector(".badge.king")?.textContent,
    pendingBefore: document.querySelectorAll(".card.pending").length,
  };
});
console.log(" before:", JSON.stringify(beforeInfo, null,2));
assert.equal(beforeInfo.boneyard.length, 4, "Boneyard should have 4 cards before Jack");
assert.equal(beforeInfo.boneyard[1].rank, "8", "index1 should be 8♠");
assert.equal(beforeInfo.boneyard[1].kc, 1, "8♠ should have kingCount 1 (×2)");
assert.equal(beforeInfo.pendingBefore, 0, "no pending before");

// Human plays Jack on the 8♠ (Boneyard index1)
console.log("Human plays Jack on 8♠ (Boneyard index1) — should remove 8♠+K♠ immediately, no ack, turn ends");
await page.evaluate(()=>{
  const s = window.__caravanStore.state;
  const idx = s.players[0].hand.findIndex(c=> c.rank==="J");
  window.__act({ type:"playOperationCard", player:0, target:{player:0, caravan:0, cardIndex:1}, handIndex: idx });
});
await page.waitForTimeout(600);

let after = await page.evaluate(()=>{
  const s = window.__caravanStore.state;
  const t = window.__caravanStore.transition;
  return {
    boneyard: s.players[0].caravans[0].rows.map(r=> ({rank:r[0].rank, kc:r.slice(1).filter(c=>c.rank==="K").length})),
    current: s.current,
    transition: t,
    html: document.querySelector(".caravans.human .caravan")?.innerHTML.slice(0,800),
    pending: document.querySelectorAll(".card.pending, .card.pending-remove").length,
    ackX: document.querySelectorAll(".confirm.portal").length,
    badgeAfter: document.querySelector(".caravans.human .caravan .badge.king")?.textContent || null,
    boneyardCardCount: document.querySelector(".caravans.human .caravan")?.querySelectorAll(".card").length,
    boneyardEmpty: document.querySelector(".caravans.human .caravan .empty") ? 1 : 0,
  };
});
console.log(" after:", JSON.stringify(after, null,2));

// Validate: since human made the move, there is no acknowledgement for the human (no X),
// turn should have ended and cards removed immediately in state
assert.equal(after.ackX, 0, "no ack X shown for human Jack — human has nothing to acknowledge");
assert.equal(after.boneyard.length, 3, "Boneyard should have 3 cards after removing 8♠+K (was 4, now 3: 9♦,6♠,3♠)");
assert.ok(!after.boneyard.some(c=> c.rank==="8"), "8♠ should be gone");
assert.equal(after.current, Ai, "turn should have ended — now AI's turn (1)");
assert.equal(after.transition?.confirmer, Ai, "confirmation belongs to AI, not the human");
assert.equal(after.badgeAfter, null, "2x badge should be gone with the 8♠");

// Verify no half-greyed 2x remains
let badgeCount = await page.locator(".caravans.human .caravan .badge.king").count();
console.log(` badge count after: ${badgeCount} (expect 0)`);
assert.equal(badgeCount, 0, "half greyed 2x should be gone");

// Verify human not blocked, can play again when it's human's turn? But now it's AI's turn, so human should not be selectable, AI will play
let humanSelectable = await page.locator(".slot.selectable").count();
console.log(` human selectable after Jack (now AI turn): ${humanSelectable} (expect 0 while AI turn)`);
assert.equal(after.current, Ai, "still AI turn");

// Let AI play one move then check human unblocked
await page.waitForTimeout(1500); // AI auto 650ms + ack visuals settle
let afterAI = await page.evaluate(()=> ({ current: window.__caravanStore.state.current, humanSel: document.querySelectorAll(".slot.selectable").length, pending: document.querySelectorAll(".card.pending, .card.pending-remove").length, ackX: document.querySelectorAll(".confirm.portal").length }));
console.log(` after AI auto move: current=${afterAI.current} humanSelectable=${afterAI.humanSel} pending=${afterAI.pending} ackX=${afterAI.ackX}`);
assert.equal(afterAI.current, Human, "after AI auto move, back to Human turn");
assert.equal(afterAI.pending, 0, "transient pending grey cleared once AI moved");
assert.equal(afterAI.ackX, 0, "no ack X remains");
assert.ok(afterAI.humanSel > 0, "human unblocked after AI move");

assert.equal(errors.length, 0, `console errors: ${errors.join(" | ")}`);
console.log("\n=== BONEYARD JACK TEST PASSED ===");
console.log("Human Jack on 8♠+K removed immediately, no grey ack, turn ended, 2x gone");
await browser.close();
