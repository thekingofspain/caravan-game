#!/usr/bin/env node
import { chromium } from "playwright";
import assert from "node:assert";
import { boardReady } from "./wait.mjs";

const BASE = process.env.BASE_URL || "http://localhost:5173/";

function makeCard(id, rank, suit, jokerType) {
  if (rank === "Joker") return { id: String(id), rank: "Joker", suit: null, jokerType };
  return { id: String(id), rank, suit };
}
function caravanOf(rows, direction=null, suit=null){ return {rows, direction, suit}; }
function mkPlayer(caravans, hand=[], shoe=[]){ return {shoe,hand,caravans}; }

const browser = await chromium.launch({ args: ["--no-sandbox","--disable-setuid-sandbox"] });
const page = await browser.newPage({ viewport:{width:1280,height:900} });
await page.goto(BASE);
await boardReady(page);

console.log("=== Step 1: Complete a game (phase over) ===");
const completedState = {
  players: [
    mkPlayer([caravanOf([[{id:"h1",rank:"10",suit:"clubs"}]]), caravanOf([[{id:"h2",rank:"10",suit:"spades"}]]), caravanOf([[{id:"h3",rank:"10",suit:"hearts"}]])], [], []),
    mkPlayer([caravanOf([[{id:"a1",rank:"10",suit:"diamonds"}]]), caravanOf([[{id:"a2",rank:"10",suit:"hearts"}]]), caravanOf([[{id:"a3",rank:"10",suit:"spades"}]])], [], [])
  ],
  current: 0, phase:"over", winner:0, log:[{id:1,text:"You win the caravan!",segments:[{type:"actor",player:0,form:"subject"}," win the caravan!"],detail:[]}], started:true
};
await page.evaluate(s=> window.__setCaravanState(s), completedState);
await page.waitForFunction(() => window.__caravanStore?.state?.phase === "over", null, { timeout: 5000 });
let phaseOver = await page.evaluate(()=> window.__caravanStore.state.phase);
console.log("phase after complete:", phaseOver);
assert.equal(phaseOver, "over");

console.log("=== Step 2: Start new game (reset) ===");
await page.evaluate(()=> window.__resetWithSeed(12345));
await page.waitForFunction(() => { const s = window.__caravanStore?.state; return s?.phase === "play" && s?.log?.length === 0; }, null, { timeout: 5000 });
let afterReset = await page.evaluate(()=> {
  const s = window.__caravanStore.state;
  return { phase: s.phase, current: s.current, winner: s.winner, logLen: s.log.length, humanCaravans: s.players[0].caravans.map(c=>c.rows.length), aiCaravans: s.players[1].caravans.map(c=>c.rows.length), humanHand: s.players[0].hand.length, aiHand: s.players[1].hand.length };
});
console.log("after reset:", afterReset);
assert.equal(afterReset.phase, "play");
assert.equal(afterReset.logLen, 0);

console.log("=== Step 3: Setup onboarding state as per activity (Dayglow empty) ===");
// Use exact activity: Human Boneyard 6, Redding 6, Shady 8, AI Dayglow 0, New Reno 10, Hub 18
// Hands as per activity
const humanHand = [
  makeCard(101,"2","hearts"), makeCard(102,"Q","spades"), makeCard(103,"K","spades"), makeCard(104,"K","clubs"),
  makeCard(105,"2","spades"), makeCard(106,"2","diamonds"), makeCard(107,"3","clubs"), makeCard(108,"7","spades")
];
const aiHand = [
  makeCard(201,"3","diamonds"), makeCard(202,"A","clubs"), makeCard(203,"3","hearts"), makeCard(204,"Q","hearts"),
  makeCard(205,"5","spades"), makeCard(206,"Q","clubs"), makeCard(207,"J","diamonds"), makeCard(208,"2","diamonds")
];
const hBoneyard = caravanOf([[makeCard(1,"6","diamonds")]], null,"diamonds"); // 6
const hRedding = caravanOf([[makeCard(2,"6","clubs")]], null,"clubs"); // 6
const hShady = caravanOf([[makeCard(3,"8","hearts")]], null,"hearts"); // 8
const aDayglow = caravanOf([], null,null); // 0 empty
const aNewReno = caravanOf([[makeCard(4,"10","spades")]], null,"spades"); // 10
const aHub = caravanOf([[makeCard(5,"9","hearts"), makeCard(6,"K","hearts")]], null,"hearts"); // 9+? Actually 9+ K? But total 18 per activity: 9 + 9? Let's approximate 10+8=18, use 10 and 8
// For Hub 18, use 10 + 8
const aHub2 = caravanOf([[makeCard(5,"10","hearts")],[makeCard(6,"8","hearts")]], "desc","hearts");

const onboardingState = {
  players: [mkPlayer([hBoneyard,hRedding,hShady], humanHand, []), mkPlayer([aDayglow,aNewReno,aHub2], aiHand, [])],
  current: 1, // AI's turn during onboarding
  phase:"play", winner:null, log:[], started:true
};
await page.evaluate(s=> window.__setCaravanState(s), onboardingState);
await page.waitForFunction(() => window.__caravanStore?.state?.current === 1 && window.__caravanStore?.legal?.length > 0, null, { timeout: 5000 });

let onboardingCheck = await page.evaluate(()=>{
  const s = window.__caravanStore.state;
  const legal = window.__caravanStore.legal;
  // Also directly compute via imported logic if available
  return {
    current: s.current,
    phase: s.phase,
    hasEmpty: s.players[s.current].caravans.some(c=>c.rows.length===0),
    legalCount: legal.length,
    legalTypes: legal.map(m=>m.type + (m.type==="playOperationCard" ? `:${m.handIndex}->${m.target.player}-${m.target.lane}` : m.type==="playValueCard" ? `:${m.handIndex}->${m.lane}` : "")),
    legal: legal
  };
});
console.log("onboarding legal:", JSON.stringify(onboardingCheck,null,2));

console.log("AI legal moves:", onboardingCheck.legalTypes);

// The bug: AI places a face card during onboarding (when hasEmpty true)
// It should ONLY place value cards to empty caravans during onboarding
let hasFaceCardMove = onboardingCheck.legal.some(m=> m.type==="playOperationCard");
let hasValueToEmpty = onboardingCheck.legal.some(m=> m.type==="playValueCard" && m.lane===0); // Dayglow is 0

console.log(`hasFaceCardMove: ${hasFaceCardMove}, hasValueToEmpty: ${hasValueToEmpty}`);

// Also check what determineBestMove would pick
let bestMoveInfo = await page.evaluate(()=>{
  const state = window.__caravanStore.state;
  const move = window.__bestMove(state, state.current);
  return { move, moveType: move.type, isFace: move.type==="playOperationCard" };
});
console.log("AI best move:", JSON.stringify(bestMoveInfo,null,2));

let failures=[];
if(hasFaceCardMove){
  failures.push(`AI legalMoves during onboarding (hasEmpty=true, Dayglow 0) includes face card moves: ${onboardingCheck.legalTypes.filter(t=>t.startsWith("playOperationCard")).join(", ")} — should NOT include face cards during caravan onboarding`);
}
if(bestMoveInfo.isFace){
  failures.push(`AI determineBestMove picks face card ${JSON.stringify(bestMoveInfo.move)} during onboarding with empty caravan — should pick value card to Dayglow`);
}
if(!hasValueToEmpty){
  failures.push(`AI should have value card move to empty Dayglow (caravan 0) during onboarding, but none found`);
}

if(failures.length){
  console.error("FAILURES (bug reproduced):");
  failures.forEach(f=>console.error(" -",f));
  await browser.close();
  process.exit(1);
} else {
  console.log("PASS: AI correctly does not place face card during onboarding");
  await browser.close();
  process.exit(0);
}
