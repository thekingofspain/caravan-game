import { chromium } from "playwright";
const BASE="http://localhost:4173/";
const b=await chromium.launch();
const page=await b.newPage({viewport:{width:1280,height:900}});
await page.goto(BASE,{waitUntil:"networkidle"});
await page.click(".start .btn");
await page.waitForSelector(".board");
async function humanTurn(){
  const slots=page.locator(".hand-zone--human .hand__slot.is-selectable");
  if(await slots.count()===0) return false;
  let picked=-1; const n=await slots.count();
  for(let i=0;i<n;i++){const cls=await slots.nth(i).locator(".card").getAttribute("class");
    if(!/card--jack|card--queen|card--king|card--joker/.test(cls)){picked=i;break;}}
  await slots.nth(picked===-1?0:picked).click({force:true,position:{x:3,y:3}});
  const ready=page.locator(".side--human .caravan.is-selectable, .placed-wrap.is-target").first();
  try{await ready.waitFor({timeout:1500});}catch{}
  const tgt=page.locator(".placed-wrap.is-target").first();
  if(await tgt.count()>0) await tgt.click({force:true});
  else{const own=page.locator(".side--human .caravan.is-selectable").first();
    if(await own.count()>0) await own.locator(".caravan__stack").click({force:true});
    else{const d=page.locator(".btn",{hasText:"Discard selected"}); if(await d.isEnabled()) await d.click();}}
  return true;
}
for(let m=0;m<20;m++){
  const ph=await page.evaluate(()=>document.querySelector(".controls__hint")?.textContent||"");
  if(/win|lose/i.test(ph)) break;
  try{await page.waitForSelector(".hand-zone--human .hand__slot.is-selectable",{timeout:5000});}catch{break;}
  await humanTurn();
  await page.waitForTimeout(150);
}
// report any placed card that renders as back/blank
const bad=await page.evaluate(()=>{
  const out=[];
  for(const el of document.querySelectorAll(".placed-face, .placed-wrap .card, .placed .card")){
    const bg=getComputedStyle(el).backgroundImage;
    if(bg==="none"||bg.includes("back.svg")) out.push(el.className+" | "+bg);
  }
  return out;
});
console.log("BAD_PLACED", JSON.stringify(bad));
await page.screenshot({path:"/tmp/board.png", fullPage:false});
await b.close();
