import { readFileSync } from "node:fs";
import { SeededRandom } from "./rng.js";
import { ACTIVE_SECONDS, COMPETITION_SECONDS, GAME_CONFIGS, TRANSITION_SECONDS, buildCompetition, buildGameOrder } from "./tasks.js";
import { scoreClassification, scoreStandard, sumScores } from "./scoring.js";
import { StageGuard } from "./lifecycle.js";
import { LeaderboardManager, normalizeName } from "./storage.js";
import { MINIGAME_CLASSES, MEMORY_GIFT_ASSETS, FINAL_ISSUE_ASSETS, BaseMinigame, code128Svg, code128Values, gridDragAnchor, offsetGridCoordinate, packingDropCoordinate, packingBoxAsset, packingInventoryLayout, planPalletMove } from "./minigames.js";
import { attachPointerDrag } from "./interactions.js";

let checks=0;
const assert=(condition,message)=>{checks++;if(!condition)throw new Error(message);};

assert(GAME_CONFIGS.length===9,"competition has eight minigames and one final");
assert(GAME_CONFIGS.slice(0,8).every(game=>game.max===100)&&GAME_CONFIGS.at(-1).max===200,"score caps total 1,000");
assert(ACTIVE_SECONDS===165,"active gameplay totals 165 seconds");
assert(TRANSITION_SECONDS===1.5,"completed-stage summaries retain the short original transition");
assert(COMPETITION_SECONDS===180,"competition duration is three minutes");
assert(GAME_CONFIGS.map(game=>game.time).join(",")==="15,20,15,25,15,20,15,15,25","all stage timers match specification");
const orderA=buildGameOrder(new SeededRandom("ORDER-A")),orderB=buildGameOrder(new SeededRandom("ORDER-B"));
assert(orderA.at(-1).id==="final"&&orderB.at(-1).id==="final","Final Dispatch always remains last");
assert(new Set(orderA.map(game=>game.id)).size===GAME_CONFIGS.length,"each minigame appears at most once per run");
assert(orderA.slice(0,-1).map(game=>game.id).join(",")!==orderB.slice(0,-1).map(game=>game.id).join(","),"pre-final minigame order changes between runs");
assert(Object.keys(MINIGAME_CLASSES).join(",")===GAME_CONFIGS.map(game=>game.id).join(","),"every configured stage has a playable class");
for(const Game of Object.values(MINIGAME_CLASSES))assert(Game.prototype instanceof BaseMinigame,"every game implements shared lifecycle");

const snapshotA=buildCompetition("OFFICE-FINAL",new SeededRandom("OFFICE-FINAL"));
const snapshotB=buildCompetition("OFFICE-FINAL",new SeededRandom("OFFICE-FINAL"));
const snapshotC=buildCompetition("ANOTHER-SEED",new SeededRandom("ANOTHER-SEED"));
assert(JSON.stringify(snapshotA)===JSON.stringify(snapshotB),"same competition seed is reproducible");
assert(JSON.stringify(snapshotA)!==JSON.stringify(snapshotC),"different seed changes task data");
assert(snapshotA.picking.rounds[0].target!==snapshotC.picking.rounds[0].target,"new runs use different SKUs");
assert(JSON.stringify(snapshotA.detective.solution)!==JSON.stringify(snapshotC.detective.solution),"WMS error positions vary between runs");
assert(JSON.stringify(snapshotA.quality.parcels.map(item=>[item.id,item.issue]))!==JSON.stringify(snapshotC.quality.parcels.map(item=>[item.id,item.issue])),"quality issues move to different boxes");
assert(JSON.stringify(snapshotA.conveyor.parcels)!==JSON.stringify(snapshotC.conveyor.parcels),"conveyor parcel order changes between runs");
assert(snapshotA.picking.rounds.length===10&&snapshotA.barcode.rounds.length===10,"rapid games have capped challenge sets");
assert(snapshotA.barcode.rounds.map(round=>round.options.length).join(",")==="6,6,6,7,7,7,8,8,8,9","Barcode Hunt preserves every generated option through late rounds");
const encoded=code128Values("SKU-12345");
assert(encoded[0]===104&&encoded.at(-1)===106&&encoded.at(-2)===(104+[..."SKU-12345"].reduce((sum,char,index)=>sum+(char.charCodeAt(0)-32)*(index+1),0))%103,"Code 128-B output has the correct start, checksum, and stop symbols");
assert((code128Svg("SKU-12345").match(/<rect /g)||[]).length>20&&code128Svg("SKU-12345").includes(">SKU-12345</text>"),"barcode SVG contains encoded bars and its matching human-readable SKU");
const barcodeExamples=["SKU-28918","SKU-28919","SKU-26918","SKU-28718"].map(code128Svg);
assert(new Set(barcodeExamples).size===4&&barcodeExamples.every((svg,index)=>svg.includes(`>${["SKU-28918","SKU-28919","SKU-26918","SKU-28718"][index]}</text>`)),"similar SKUs produce distinct Code 128 data with exactly matching captions");
assert(snapshotA.conveyor.parcels.length===12,"conveyor has a finite parcel set");
assert(new Set(snapshotA.conveyor.parcels.map(parcel=>parcel.carrier)).size>1,"conveyor uses multiple carriers");
assert(snapshotA.packing.boxes.every(box=>box.w>0&&box.h>0),"packing pieces have real dimensions");
assert(snapshotA.packing.boxes.reduce((sum,box)=>sum+box.w*box.h,0)>=30,"packing layout uses a more challenging occupied area");
assert(snapshotA.detective.solution.length===3,"WMS detective has equivalent discrepancy count");
assert(snapshotA.loading.solution.length===7,"truck loading has seven ordered pallets");
assert(snapshotA.memory.shipment.length===5&&snapshotA.memory.options.length===8,"memory challenge has five targets and three decoys");
assert(snapshotA.quality.solution.length===4,"quality control has four visual issues");
assert([0,2].includes(snapshotA.final.solution.length)&&snapshotA.final.action===(snapshotA.final.solution.length?"HOLD":"RELEASE"),"final generates either a clear shipment or two discrepancies with the matching action");

const finalCombos=new Set(Array.from({length:100},(_,index)=>{const game=buildCompetition(`FINAL-${index}`,new SeededRandom(`FINAL-${index}`));return [...game.final.solution].sort().join("+");}));
assert(finalCombos.size>=5,"final discrepancy combinations vary substantially between runs");
assert([...finalCombos].some(combo=>!combo.includes("WRONG CARRIER"))&&[...finalCombos].some(combo=>!combo.includes("MISSING SERIALS")),"carrier and serial issues are not forced into every final");
const Conveyor=MINIGAME_CLASSES.conveyor,conveyor=new Conveyor();
conveyor.init({root:{},data:{parcels:[{carrier:"DHL"}]},config:{time:20},remaining:()=>10,flash:()=>{},update:()=>{},finish:()=>{}});
conveyor.active={carrier:"DHL"};conveyor.box={classList:{add:()=>{}}};conveyor.timeout=handler=>handler();conveyor.advance=()=>{};
const zoneClass={add:()=>{},remove:()=>{}};
conveyor.sort({dataset:{chute:"DHL"},classList:zoneClass});assert(conveyor.correct===1&&conveyor.mistakes===0,"correct conveyor drop scores once");
conveyor.settling=false;conveyor.active={carrier:"UPS"};conveyor.sort({dataset:{chute:"TNT"},classList:zoneClass});assert(conveyor.mistakes===1,"wrong conveyor drop applies a penalty");
const immediateConveyor=new Conveyor(),feedbackClasses=new Set(),feedbackZone={dataset:{chute:"DHL"},classList:{add:name=>feedbackClasses.add(name),remove:(...names)=>names.forEach(name=>feedbackClasses.delete(name))}};
immediateConveyor.init({root:{},data:{parcels:[{carrier:"DHL"},{carrier:"UPS"}]},config:{time:20},remaining:()=>10,flash:()=>{},update:()=>{},finish:()=>{}});immediateConveyor.active={carrier:"DHL"};immediateConveyor.box={remove(){this.removed=true;}};let advanced=0,feedbackTimeout=null;immediateConveyor.advance=()=>{advanced++;};immediateConveyor.timeout=handler=>(feedbackTimeout=handler);
immediateConveyor.sort(feedbackZone);assert(immediateConveyor.box===null&&advanced===1,"a sorted conveyor parcel disappears and advances immediately");assert(feedbackClasses.has("accepted"),"carrier feedback remains visible while the next parcel advances");feedbackTimeout();assert(!feedbackClasses.has("accepted"),"carrier feedback clears independently without advancing a second time");
const Loading=MINIGAME_CLASSES.loading,loading=new Loading();loading.init({root:{},data:snapshotA.loading,config:{time:20},remaining:()=>10,flash:()=>{},update:()=>{}});loading.slots=[...snapshotA.loading.solution];assert(loading.score()>85,"correct truck loading order receives accuracy and speed points");
const swapped=planPalletMove(["A","B",null],"A",1),returned=planPalletMove(["A",null,null],"B",0);
assert(swapped.slots.join(",")==="B,A,"&&swapped.displacedTo===0,"moving onto an occupied truck slot swaps both pallets without loss");
assert(returned.slots.join(",")==="B,,"&&returned.displacedTo==="yard","a yard pallet displaces an occupied pallet back to the waiting area");
assert(offsetGridCoordinate("4:3",{x:1,y:2})==="3:1","packing drop coordinates preserve the cell grabbed inside a multi-cell box");
assert(JSON.stringify(gridDragAnchor({left:10,top:20},{w:3,h:2},50.5,40.25,119,79))===JSON.stringify({x:2,y:1}),"packing drag anchors handle fractional grid steps and non-leading grab positions");
assert(offsetGridCoordinate("7:4",gridDragAnchor({left:10,top:20},{w:3,h:2},50.5,40.25,119,79))==="5:3","packing edge drops use the same anchored coordinate as their preview");
const snapGrid={left:100,top:200,cellW:58,cellH:48,stepX:60,stepY:50};
for(const box of [{w:1,h:1},{w:1,h:2},{w:2,h:2},{w:3,h:2},{w:3,h:1},{w:1,h:3},{w:2,h:1}])for(const ratio of [.03,.5,.97]){
  const grab={x:(58+(box.w-1)*60)*ratio,y:(48+(box.h-1)*50)*ratio};
  assert(packingDropCoordinate(220+grab.x,300+grab.y,grab,snapGrid,box,8,5)?.coordinate==="2:2","pixel grab stays exact for every size and grab ratio");
}
assert(packingDropCoordinate(91,201,{x:0,y:1},snapGrid,{w:1,h:1},8,5)?.coordinate==="0:0","nine-pixel edge miss magnetizes to the local grid origin");
assert(packingDropCoordinate(89,201,{x:0,y:1},snapGrid,{w:1,h:1},8,5)===null,"outside tolerance never magnetizes");
assert(packingDropCoordinate(130,201,{x:0,y:1},snapGrid,{w:1,h:1},8,5)===null,"equidistant grid origins do not auto-fit");
assert(packingDropCoordinate(510,201,{x:0,y:1},snapGrid,{w:3,h:2},8,5)?.coordinate==="7:0","nonfitting footprint is passed to the unchanged collision rule, not moved to a free slot");
const packingDimensions=[[3,2],[2,2],[3,1],[1,3],[2,1],[1,2],[1,1]];
assert(packingDimensions.every(([w,h])=>packingBoxAsset({w,h}).includes(`box-${w}x${h}`)),"every predefined packing dimension resolves to proportion-compatible artwork");
assert(new Set(snapshotA.packing.boxes.map(box=>box.id)).size===10&&snapshotA.packing.boxes.every((box,index)=>box.id===`BOX-${index+1}`),"all ten shuffled boxes retain sequential generated identifiers");
const inventoryLayout=packingInventoryLayout(snapshotA.packing.boxes),inventoryCells=new Set();
for(const box of snapshotA.packing.boxes){const {x,y}=inventoryLayout[box.id];assert(x>=0&&y>=0&&x+box.w<=8&&y+box.h<=5,`${box.id} fits the inventory unit grid`);for(let dy=0;dy<box.h;dy++)for(let dx=0;dx<box.w;dx++){const key=`${x+dx}:${y+dy}`;assert(!inventoryCells.has(key),`${box.id} does not overlap another inventory box`);inventoryCells.add(key);}}

// Pointer tracking is tested without a browser: visual movement must happen in
// the pointermove handler, while the more expensive hit test waits for a frame.
class FakeElement extends EventTarget{
  constructor(rect={left:10,top:20,width:80,height:40}){super();this.rect=rect;this.style={};this.dataset={};this.classes=new Set();this.classList={add:(...names)=>names.forEach(name=>this.classes.add(name)),remove:(...names)=>names.forEach(name=>this.classes.delete(name))};}
  getBoundingClientRect(){return {...this.rect,right:this.rect.left+this.rect.width,bottom:this.rect.top+this.rect.height};}
  cloneNode(){return new FakeElement(this.rect);}
  removeAttribute(){} setPointerCapture(){} releasePointerCapture(){} remove(){this.removed=true;}
}
const source=new FakeElement(),target=new FakeElement({left:200,top:100,width:100,height:80}),container={append:node=>{container.child=node;}},frames=[];
const dragClasses=new Set();global.document={documentElement:{classList:{add:name=>dragClasses.add(name),remove:name=>dragClasses.delete(name)}}};
global.requestAnimationFrame=callback=>(frames.push(callback),frames.length);global.cancelAnimationFrame=()=>{};
const pointer=(type,x,y)=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:7,button:0,clientX:x,clientY:y});return event;};
let dropped=null;const detachDrag=attachPointerDrag({element:source,targets:[target],container,onDrop:event=>{dropped=event.target;}});
source.dispatchEvent(pointer("pointerdown",30,30));source.dispatchEvent(pointer("pointermove",225,130));
assert(dragClasses.has("is-pointer-dragging"),"shared pointer drags expose a document-level custom cursor state");
assert(container.child.style.transform==="translate3d(195px,100px,0)","drag ghost follows the pointer synchronously while preserving its grab offset");
frames.shift()?.(performance.now());assert(target.classes.has("drag-over"),"cached target detection highlights the carrier under the pointer");
source.dispatchEvent(pointer("pointerup",225,130));assert(dropped===target&&container.child.removed,"drop resolves the cached target and removes its ghost");assert(!dragClasses.has("is-pointer-dragging"),"completed pointer drags clear the custom cursor state");source.dispatchEvent(pointer("pointerdown",30,30));source.dispatchEvent(pointer("pointercancel",30,30));assert(!dragClasses.has("is-pointer-dragging"),"cancelled pointer drags clear the custom cursor state");detachDrag();delete global.document;
for(let run=0;run<1000;run++){
  const data=buildCompetition(`SEED-${run}`,new SeededRandom(`SEED-${run}`));
  assert(data.detective.solution.every(id=>{const row=data.detective.rows.find(item=>item.id===id);return row.expected!==row.actual;}),"WMS solutions are genuine hidden mismatches");
  assert([0,2].includes(new Set(data.final.solution).size),"final discrepancies are unique");
  assert(new Set(data.loading.pallets.map(item=>item.id)).size===7,"pallet identifiers are unique");
}

assert(scoreStandard({correct:10,total:10,completed:true,timeRemaining:15,timeLimit:15})===100,"perfect fast standard result scores 100");
assert(scoreStandard({correct:20,total:10,completed:true,timeRemaining:99,timeLimit:15})===100,"standard score cannot exceed cap");
assert(scoreStandard({correct:0,total:10,mistakes:10})===0,"poor standard result cannot go below zero");
assert(scoreClassification({selected:[],solution:["A","B"],universe:["A","B","C"]})===0,"doing nothing earns no classification points");
assert(scoreClassification({selected:["A","B"],solution:["A","B"],universe:["A","B","C"],timeRemaining:10,timeLimit:10,max:200})===200,"perfect final classification respects custom cap");
assert(sumScores(Object.fromEntries(GAME_CONFIGS.map(game=>[game.id,game.max])))===1000,"perfect full game is exactly 1,000");
assert(sumScores({bad:5000})===1000,"full-game score is hard capped at 1,000");

let now=1000;const guard=new StageGuard(()=>now),token=guard.begin(15);
assert(guard.remaining(token)===15,"stage timer starts at configured duration");
assert(guard.allows(token),"active stage accepts input before deadline");
now=guard.deadline-1;assert(guard.allows(token),"one ms before deadline accepted");
now=guard.deadline;assert(!guard.allows(token),"exact deadline rejected before completion");
now++;assert(!guard.allows(token),"late input rejected before timer callback");
now=1000;
now+=14900;assert(Math.round(guard.remaining(token)*10)/10===.1,"stage timer tracks remaining time");
assert(guard.complete(token)&&!guard.complete(token),"stage can complete only once");
const nextToken=guard.begin(20);assert(!guard.complete(token)&&guard.remaining(nextToken)===20,"stale callbacks cannot complete the next stage");
assert(!guard.allows(token)&&guard.allows(nextToken),"input tokens isolate successive stages");
guard.cancel();assert(!guard.allows(nextToken),"cancelled stage rejects input");assert(guard.remaining(nextToken)===0,"cleanup invalidates active timer token");

const memory=new Map();
global.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
const board=new LeaderboardManager();
const makeRun=(name,score,accuracy,mistakes,timestamp)=>({name,normalizedName:normalizeName(name),score,accuracy,mistakes,timestamp,minigameScores:{}});
board.saveRun(makeRun("Daniel",900,95,3,"2026-12-01T10:00:00Z"));
board.saveRun(makeRun("DANIEL",920,90,4,"2026-12-01T11:00:00Z"));
board.saveRun(makeRun("Alex",920,95,4,"2026-12-01T12:00:00Z"));
board.saveRun(makeRun("Marta",920,95,2,"2026-12-01T13:00:00Z"));
assert(board.getLeaderboard().length===4,"every completed run receives a separate leaderboard row");
assert(board.getLeaderboard()[0].name==="Marta","leaderboard uses score, accuracy, mistakes, then timestamp");
assert(board.getPlayerHistory("daniel").length===2,"local history remains available");
assert(new Set(board.getLeaderboard().map(run=>run.id)).size===4,"saved leaderboard runs receive stable unique identifiers");
memory.set("christmas-logistics-leaderboard-v1",JSON.stringify({version:2,players:[{name:"Legacy",normalizedName:"legacy",runs:[makeRun("Legacy",700,80,2,"2025-12-01T10:00:00Z"),makeRun("Legacy",650,75,3,"2025-12-02T10:00:00Z")]}]}));
assert(board.getLeaderboard().length===2&&new Set(board.getLeaderboard().map(run=>run.id)).size===2,"legacy grouped player histories migrate into distinct stable run rows");
board.clearLeaderboard();assert(board.getLeaderboard().length===0,"leaderboard adapter clears local data");

const html=readFileSync("index.html","utf8"),css=readFileSync("styles.css","utf8"),game=readFileSync("game.js","utf8"),minigames=readFileSync("minigames.js","utf8"),interactions=readFileSync("interactions.js","utf8"),effects=readFileSync("effects.js","utf8");
assert(game.includes('assets/menu/logo-light.webp')&&game.includes("CHRISTMAS</span><strong>LOGISTICS CHALLENGE"),"CEVA logo and brand remain");
assert(game.includes("CHRISTMAS</span><strong>LOGISTICS CHALLENGE")&&css.includes("menu-screen"),"Christmas presentation remains");
assert(game.includes("ACTIVE TIME REMAINING")&&game.includes("/ 1000"),"HUD shows global progress and accumulated score");
assert(game.includes("finish:()=>this.completeGame(token)")&&!game.includes("lockGame(token)"),"accepted answers advance immediately without waiting for the timer");
assert(game.includes('createRunSeed')&&game.includes('buildGameOrder'),"each run receives fresh task data and a shuffled pre-final order");
assert(!game.includes("LOCAL DEVICE LEADERBOARD")&&!game.includes("not a centralized company leaderboard"),"leaderboard omits the legacy local header and storage footer");
assert(game.includes('class="leaderboard-scroll"')&&game.includes('assets/leaderboard/medal-${index+1}.webp'),"leaderboard stays dynamic with a scrolling semantic table and ranked medal assets");
assert(!game.includes("HIGHEST SCORE ON THIS DEVICE")&&game.includes("COMPETITION RECORD"),"competition record banner omits the removed device subtitle");
assert(!css.includes('.podium-1 td:first-child:before')&&!css.includes('.podium-2 td:first-child:before')&&!css.includes('.podium-3 td:first-child:before'),"leaderboard podium cells render only their supplied medal image");
assert(css.includes("height:fit-content;max-width:none;max-height:calc(100dvh - 32px)")&&!css.includes("max-height:min(312px")&&css.includes(".leaderboard-scroll{flex:0 1 auto"),"leaderboard height follows its content while the table alone has a viewport-safe scroll limit");
assert(!css.includes('background:url("assets/leaderboard/panel-empty.webp") center/100% 100%')&&css.includes('assets/leaderboard/christmas-corner.webp'),"leaderboard decorations retain their aspect ratio instead of stretching the full panel artwork");
assert(css.includes('input:hover,textarea:hover')&&css.includes('assets/cursor/clicker-click.png'),"editable fields use the Christmas clicker hover and pressed cursor states");
assert(css.includes("html.is-pointer-dragging *")&&css.includes('cursor:url("assets/cursor/clicker-click.png") 18 5,pointer!important'),"all pointer-captured drags retain the Christmas pressed-hand cursor");
assert(minigames.includes("attachPointerDrag({element:this.box"),"conveyor boxes use the shared pointer drag interaction");
assert(minigames.includes("requestAnimationFrame(tick)")&&minigames.includes("!this.dragging&&!this.settling"),"conveyor movement pauses safely while dragging");
assert(interactions.includes("getBoundingClientRect")&&minigames.includes("data-chute"),"conveyor drops resolve against forgiving carrier-zone bounds");
assert(css.includes(".carrier-zone.drag-over")&&css.includes(".drag-ghost.moving-box"),"dragged boxes and active carrier zones have clear states");
assert(game.includes("<div class=\"countdown\">${value}</div>")&&game.includes("GO!</div>"),"countdown renders only 3-2-1 and GO");
assert(!game.includes("COMPETITION STARTS IN"),"countdown has no overlapping helper text");
assert(minigames.includes("LAST DELIVERY · LOAD FIRST")&&minigames.includes("FIRST DELIVERY · LOAD LAST"),"truck delivery order is explicitly explained");
assert(minigames.includes("truck-slots")&&minigames.includes("rear-door"),"truck loading uses a visual cargo bay and rear entrance");
assert(GAME_CONFIGS.every(config=>config.action&&config.instruction&&config.hint),"every minigame has action, objective, and correctness guidance");
assert(minigames.includes("pallet-grid")&&minigames.includes("every(value=>!value)"),"packing grid prevents collisions");
assert(minigames.includes("invalid-target")&&css.includes(".pallet-cell.invalid-target"),"packing drag previews valid and invalid positions");
assert(minigames.includes("for(let dy=0;dy<box.h;dy++)for(let dx=0;dx<box.w;dx++)")&&minigames.includes("preview-edge"),"packing preview covers the complete box footprint");
assert(css.includes(".quality-box.qc-card")&&css.includes("clip-path:none")&&css.includes(".quality-box.qc-card.selected"),"damaged quality boxes retain a full click target and visible selection");
assert(!minigames.includes("qc-sticker")&&!minigames.includes("qc-issue")&&css.includes(".qc-label-copy")&&css.includes("11cqw"),"quality defects use physical damage and responsive labels without decorative markers");
assert(interactions.includes('element.cloneNode(true)')&&interactions.includes("container.append(ghost)")&&css.includes(".drag-ghost"),"all physical drags use a visible body-level cursor proxy");
assert(minigames.includes('className="placed-box placed-pop"')&&!/BOX PACKED"\);this\.draw\(\)/.test(minigames),"packing placement creates only its persistent placed-box overlay without rerendering the minigame");
assert(minigames.includes('className="shape-slot"')&&minigames.includes("source?.classList.add(\"packed-away\")")&&!minigames.includes('querySelector(".shape-rack").innerHTML'),"packing inventory slots remain stable when a box is placed");
assert(minigames.includes('className="packing-drag-ghost"')&&interactions.includes("createGhost")&&css.includes(".packing-drag-ghost"),"packing uses a dedicated transparent artwork ghost instead of cloning an inventory slot");
assert(minigames.includes("this.dropCoordinate(box,x,y)")&&minigames.includes("if(coordinate)this.place(box.id,coordinate)"),"packing preview and release use the same pixel-based resolver");
assert(css.includes("grid-auto-flow:row")&&!css.includes("grid-auto-flow:dense")&&css.includes(".shape-box.packed-away{visibility:hidden")&&!minigames.includes("source?.remove(),180"),"packed inventory boxes retain permanent grid space without dense reflow");
assert((minigames.match(/data-action="/g)||[]).length===2&&minigames.includes("HOLD SHIPMENT"),"final dispatch has RELEASE and HOLD confirmation actions");
assert(css.includes("var(--pack-cell-w)")&&css.includes("var(--pack-cell-h)")&&minigames.includes("ResizeObserver"),"packing rack and pallet share responsive measured cell dimensions");
assert(css.includes("@keyframes hudContent")&&css.includes("@keyframes selectedPulse"),"minigames include restrained entrance and selection animations");
assert(!minigames.includes('"MATCH"')&&!minigames.includes('"WRONG"'),"WMS rows do not reveal correctness");
assert(minigames.includes("setTimeout")||minigames.includes("this.timeout"),"memory reveal uses a managed timeout");
assert(minigames.includes("this.cleanups")&&minigames.includes("cleanup()"),"minigames clean listeners and timers");
assert(!/carrier\s*\([^)]*\)\s*\{/g.test(readFileSync("tasks.js","utf8")),"legacy duplicate carrier methods are removed");


// Organizer utilities remain deterministic, local, and spreadsheet-safe.
const { CompetitionSettings, leaderboardCsv } = await import("./storage.js");
const settingsStore=new Map();
const settings=new CompetitionSettings({getItem:key=>settingsStore.get(key)??null,setItem:(key,value)=>settingsStore.set(key,value)});
assert(settings.getSeed()==="CEVA-CHRISTMAS-2026","legacy organizer setting remains readable as the event identifier");
assert(settings.setSeed(" event 2026! ")&&settings.getSeed()==="EVENT2026","organizer event identifier is sanitized and persisted locally");
const csv=leaderboardCsv([{id:"run-1",name:'Ana "Ace", Smith',score:999,accuracy:98,timestamp:"2026-12-01T10:00:00Z"},{id:"run-2",name:'Ana "Ace", Smith',score:850,accuracy:91,timestamp:"2026-12-02T10:00:00Z"}]);
assert(csv.includes('"Ana ""Ace"", Smith"')&&csv.includes('"999"')&&csv.includes('"run-1"')&&csv.includes('"run-2"')&&csv.split("\r\n").length===3,"CSV export safely includes every individual run and its identifier");
assert(interactions.includes("setPointerCapture")&&interactions.includes("pointercancel")&&interactions.includes("requestAnimationFrame"),"shared drag controller captures pointers, cancels safely, and paints on animation frames");
assert(minigames.match(/attachPointerDrag/g).length>=3,"packing and truck loading use the shared pointer drag controller");
assert(effects.includes("prefers-reduced-motion")&&css.includes("prefers-reduced-motion"),"arcade effects respect reduced-motion preferences in JS and CSS");
assert(game.includes("permanently delete ALL results")&&game.includes('value!=="RESET"'),"competition reset requires explicit confirmation");
assert(!/class TruckLoading[\s\S]*?draw\(\)/.test(minigames),"truck loading never rebuilds its scene after initial render");
assert(minigames.includes("this.setSlot(sourceIndex,occupant)")&&minigames.includes("pallet-yard-cards"),"occupied truck positions swap predictably or return their pallet to the yard");
assert(minigames.includes("cards=new Map")&&minigames.includes("slot.append(card)"),"truck loading moves persistent pallet nodes instead of recreating them");
assert(minigames.includes("detective-records")&&minigames.includes('aria-pressed="false"')&&css.includes("grid-template-rows:repeat(4,1fr)"),"WMS detective uses a full terminal grid with accessible selection state");
assert(!minigames.includes("this.data.solution.includes(row.dataset.row)"),"WMS detective does not reveal row correctness before submission");
assert(effects.includes("arcade-effect-layer")&&minigames.includes("CORRECT SKU")&&minigames.includes("WRONG BARCODE"),"immediate games use persistent unmistakable success and failure feedback");
assert(!/\.shape-box\{[^}]*!important/.test(css)&&!/\.load-pallet\{[^}]*!important/.test(css),"core packing and loading styles no longer rely on important overrides");

assert(!interactions.includes('ghost.classList.add("drag-ghost","dragging")')&&interactions.includes("Cursor-following is deliberately synchronous"),"drag ghosts are not blocked by the legacy dragging transform override and track pointers synchronously");
assert(interactions.includes("targetRects=targetList().map")&&!interactions.includes("matches.sort"),"drag target geometry is cached once instead of measured and sorted on every pointer move");
assert(minigames.includes('if(key===this.previewKey)return')&&minigames.includes("this.previewCells.forEach"),"packing previews skip unchanged targets and clear only affected cells");
assert(!/this\.flash\([^\n]*(PALLET LOADED|PALLETS SWAPPED)/.test(minigames)&&minigames.includes("slot-feedback"),"truck loading uses localized routine feedback rather than the global answer overlay");
assert(css.includes("barcode-parcel:not(.choice-correct):not(.choice-wrong):hover")&&css.includes("stock-card:not(.choice-correct):not(.choice-wrong):hover"),"barcode and speed-picking cards retain visible hover states separate from result states");
assert(!css.includes(".brand-logo{background:#fff")&&css.includes(".menu-logo{"),"the transparent CEVA logo is no longer forced into a white plaque");
assert(minigames.includes("this.dragGrab={x:xRatio*geometry.width,y:yRatio*geometry.height}")&&minigames.includes("x>=0&&y>=0"),"packing preserves the continuous pixel grab point and existing collision bounds");
assert(css.includes(".drag-source{opacity:0}"),"the moving source is hidden while its fully visible drag ghost is active");
// Conveyor artwork remains presentation; exercise its DOM contract and lifecycle.
const conveyorRoot={innerHTML:"",querySelector:()=>null};
const visualConveyor=new Conveyor().init({root:conveyorRoot,data:snapshotA.conveyor,config:GAME_CONFIGS[1],remaining:()=>10,flash:()=>{},update:()=>{}});
visualConveyor.render();
assert((conveyorRoot.innerHTML.match(/data-chute=/g)||[]).length===6,"Conveyor renders all six logical carrier hit targets");
for(const carrier of ["DHL","UPS","TNT","TOF","KLG","BRINGCARGO"]){
  assert(conveyorRoot.innerHTML.includes(`data-chute="${carrier}"`)&&conveyorRoot.innerHTML.includes(`zones/zone-${carrier.toLowerCase()}.webp`),`${carrier} retains its matching chute and artwork`);
}
for(const asset of [...conveyorRoot.innerHTML.matchAll(/src="([^"]+)"/g)].map(match=>match[1]))assert(readFileSync(asset).length>0,`Conveyor asset exists: ${asset}`);
assert(conveyorRoot.innerHTML.includes("belt/belt-base.webp")&&conveyorRoot.innerHTML.includes("belt/belt-front-trim.webp")&&conveyorRoot.innerHTML.includes("states/drop-valid-check.webp")&&conveyorRoot.innerHTML.includes("states/drop-invalid.webp"),"belt layers and success/error overlays use supplied assets");
let advancedParcel=0,detachedParcel=0,finishedConveyor=0;
visualConveyor.spawn=()=>{advancedParcel++;};visualConveyor.ctx.finish=()=>{finishedConveyor++;};visualConveyor.boxDragCleanup=()=>{detachedParcel++;};visualConveyor.active=snapshotA.conveyor.parcels[0];visualConveyor.miss();
assert(visualConveyor.mistakes===1&&visualConveyor.index===1&&advancedParcel===1&&detachedParcel===1,"missed parcel adds one mistake, detaches drag, and advances exactly once");
visualConveyor.index=snapshotA.conveyor.parcels.length-1;visualConveyor.active=snapshotA.conveyor.parcels.at(-1);visualConveyor.advance();
assert(finishedConveyor===1&&advancedParcel===1&&visualConveyor.active===null,"last parcel finishes the minigame without spawning another parcel");
visualConveyor.box={style:{}};visualConveyor.x=125;visualConveyor.position();
assert(visualConveyor.box.style.transform==="translate3d(125px,0,0)","belt motion updates the parcel transform without rebuilding DOM");
visualConveyor.cleanup();assert(visualConveyor.locked&&visualConveyor.cleanups.length===0,"Conveyor cleanup drains registered artwork and interaction cleanup functions");
// Use the real shared controller on spawned parcels, including cleanup mid-drag.
const parcelHost={style:{},markup:"",get firstElementChild(){return this.node;},set innerHTML(value){this.markup=value;this.node=new FakeElement();}};
const carrierTargets=["DHL","UPS","TNT","TOF","KLG","BRINGCARGO"].map((carrier,index)=>{const node=new FakeElement({left:200+index*120,top:100,width:100,height:80});node.dataset.chute=carrier;return node;});
const motion=new FakeElement({left:190,top:170,width:820,height:30});
motion.remove=()=>{motion.removed=true;};
const liveBelt=new FakeElement({left:100,top:100,width:1000,height:200});
const liveRoot={innerHTML:"",querySelector:selector=>selector==="#moving-parcel"?parcelHost:selector===".conveyor-motion"?motion:liveBelt,querySelectorAll:()=>carrierTargets};
const liveContainer={append:node=>{liveContainer.child=node;}};
global.document={body:liveContainer,documentElement:{classList:{add:name=>dragClasses.add(name),remove:name=>dragClasses.delete(name)}}};
const liveConveyor=new Conveyor().init({root:liveRoot,data:{parcels:[{id:"GIFT-1",carrier:"DHL",gift:"TEDDY BEAR"},{id:"GIFT-2",carrier:"UPS",gift:"TRAIN SET"},{id:"GIFT-3",carrier:"BRINGCARGO",gift:"SNOW GLOBE"}]},config:GAME_CONFIGS[1],remaining:()=>10,flash:()=>{},update:()=>{},finish:()=>{}});
liveConveyor.render();liveConveyor.start();
assert(parcelHost.markup.includes("boxes/parcel-front.webp")&&parcelHost.markup.includes("labels/shipping-label-front.webp")&&parcelHost.markup.includes("<b>DHL</b>")&&parcelHost.markup.includes("GIFT-1")&&parcelHost.markup.includes("TEDDY BEAR"),"spawn layers supplied carton and label assets under dynamic HTML data");
const firstParcel=liveConveyor.box;
firstParcel.dispatchEvent(pointer("pointerdown",30,30));
assert(liveConveyor.dragging&&liveContainer.child.style.transform==="none","spawned parcel uses attachPointerDrag and clears belt translation on its ghost");
firstParcel.dispatchEvent(pointer("pointercancel",30,30));
assert(!liveConveyor.dragging&&liveContainer.child.removed&&liveConveyor.index===0,"cancel restores the original moving parcel without consuming it");
firstParcel.dispatchEvent(pointer("pointerdown",30,30));firstParcel.dispatchEvent(pointer("pointermove",225,130));firstParcel.dispatchEvent(pointer("pointerup",225,130));
assert(liveConveyor.correct===1&&liveConveyor.mistakes===0&&liveConveyor.index===1&&parcelHost.markup.includes("parcel-angle-left.webp"),"correct pointer drop scores once and spawns the next visual variant");
const secondParcel=liveConveyor.box;
secondParcel.dispatchEvent(pointer("pointerdown",30,30));secondParcel.dispatchEvent(pointer("pointermove",225,130));secondParcel.dispatchEvent(pointer("pointerup",225,130));
assert(liveConveyor.correct===1&&liveConveyor.mistakes===1&&liveConveyor.index===2&&parcelHost.markup.includes("parcel-angle-right.webp"),"wrong pointer drop penalizes once and advances to the right-angle carton");
const lastParcel=liveConveyor.box;lastParcel.dispatchEvent(pointer("pointerdown",30,30));
const conveyorFrame=liveConveyor.raf;let cancelledFrame=null;
const savedCancel=global.cancelAnimationFrame;global.cancelAnimationFrame=id=>{cancelledFrame=id;};
liveConveyor.cleanup();global.cancelAnimationFrame=savedCancel;
assert(cancelledFrame===conveyorFrame&&motion.removed&&liveContainer.child.removed&&!dragClasses.has("is-pointer-dragging"),"cleanup cancels conveyor RAF, removes belt animation and active ghost, and clears pointer state");
liveContainer.child=null;lastParcel.dispatchEvent(pointer("pointerdown",30,30));
assert(liveContainer.child===null,"cleanup removes pointer listeners from the active parcel");
delete global.document;
// Quality Control: layered assets and neutral selection preserve classification.
const qualityData=snapshotA.quality,qualityButtons=qualityData.parcels.map(parcel=>{
  const button=new FakeElement();button.dataset.quality=parcel.id;button.attributes={};
  button.setAttribute=(name,value)=>{button.attributes[name]=value;};
  button.classList.toggle=name=>{button.classes.has(name)?button.classes.delete(name):button.classes.add(name);};
  return button;
}),qualityLock=new FakeElement();let qualityFinishes=0;
const qualityRoot={innerHTML:"",querySelector:()=>qualityLock,querySelectorAll:()=>qualityButtons};
const qualityGame=new MINIGAME_CLASSES.quality().init({root:qualityRoot,data:qualityData,config:GAME_CONFIGS.find(game=>game.id==="quality"),remaining:()=>10,finish:()=>{qualityFinishes++;}});
qualityGame.render();
assert((qualityRoot.innerHTML.match(/data-quality=/g)||[]).length===8,"Quality renders all eight parcel buttons together");
assert((qualityRoot.innerHTML.match(/aria-pressed="false"/g)||[]).length===8,"every Quality parcel starts with accessible unselected state");
for(const asset of [...qualityRoot.innerHTML.matchAll(/src="([^"]+)"/g)].map(match=>match[1]))assert(readFileSync(asset).length>0,`Quality asset exists: ${asset}`);
for(const parcel of qualityData.parcels){
  const carrier=parcel.issue==="wrong-label"?"OTHER":parcel.carrier,sku=parcel.issue==="missing"?"SKU ———":parcel.issue==="wrong-sku"?"SKU-ERROR":parcel.sku;
  assert(qualityRoot.innerHTML.includes(`aria-label="${parcel.id}, ${carrier}, ${sku}"`),`${parcel.id} displays its generated identity and existing issue presentation`);
}
qualityButtons[0].dispatchEvent(new Event("click"));
assert(qualityGame.selected.has(qualityData.parcels[0].id)&&qualityButtons[0].classes.has("selected")&&qualityButtons[0].attributes["aria-pressed"]==="true","Quality click toggles the original selection set and accessible selected state");
qualityButtons[0].dispatchEvent(new Event("click"));
assert(qualityGame.selected.size===0&&!qualityButtons[0].classes.has("selected")&&qualityButtons[0].attributes["aria-pressed"]==="false","a second click deselects without confirming the parcel");
for(let mask=0;mask<256;mask++){
  qualityGame.selected=new Set(qualityData.parcels.filter((_,index)=>mask&(1<<index)).map(parcel=>parcel.id));
  const expected=scoreClassification({selected:[...qualityGame.selected],solution:qualityData.solution,universe:qualityData.parcels.map(parcel=>parcel.id),timeRemaining:10,timeLimit:15});
  assert(qualityGame.score()===expected,`Quality selection ${mask} preserves classification scoring`);
}
qualityGame.selected=new Set(qualityData.solution);qualityLock.dispatchEvent(new Event("click"));qualityLock.dispatchEvent(new Event("click"));
assert(qualityFinishes===1,"double-clicking LOCK confirms Quality exactly once before stage cleanup");
const qualityResult=qualityGame.complete();
assert(qualityResult.correct===8&&qualityResult.mistakes===0&&qualityResult.attempts===8&&qualityResult.score===100,"perfect Quality selection preserves accuracy, attempts and speed score");
qualityLock.dispatchEvent(new Event("click"));assert(qualityFinishes===1,"LOCK QUALITY CHECK calls the original stage finish callback");
qualityGame.cleanup();qualityLock.dispatchEvent(new Event("click"));assert(qualityFinishes===1&&qualityGame.cleanups.length===0,"Quality cleanup detaches lock and parcel listeners");
assert(!qualityRoot.innerHTML.includes("box_success")&&!qualityRoot.innerHTML.includes("box_error"),"Quality does not reveal selection correctness before lock");
// Track bounds and tempo are measured once, independent of viewport width.
assert(!minigames.includes("this.x=-145")&&!minigames.includes("this.x>belt.clientWidth"),"Conveyor no longer uses container-edge spawn or miss bounds");
const geometryHost={style:{},get firstElementChild(){return this.node;},set innerHTML(value){this.markup=value;this.node=new FakeElement({left:0,top:0,width:200,height:100});}};
let geometryReads=0;
const measuredBelt=new FakeElement({left:50,top:80,width:1000,height:250}),measuredTrack=new FakeElement({left:150,top:180,width:800,height:25});
for(const node of [measuredBelt,measuredTrack]){const rect=node.getBoundingClientRect.bind(node);node.getBoundingClientRect=()=>{geometryReads++;return rect();};}
const measuredRoot={querySelector:selector=>selector==="#moving-parcel"?geometryHost:selector===".conveyor-motion"?measuredTrack:measuredBelt,querySelectorAll:()=>[]};
global.document={body:liveContainer,documentElement:{classList:{add:()=>{},remove:()=>{}}}};
const timedConveyor=new Conveyor().init({root:measuredRoot,data:snapshotA.conveyor,config:GAME_CONFIGS[1],remaining:()=>10,flash:()=>{},update:()=>{},finish:()=>{}});
timedConveyor.index=0;timedConveyor.start();
assert(timedConveyor.trackStart===100&&timedConveyor.trackEnd===900&&timedConveyor.startX===-100&&timedConveyor.x===-100,"spawn is measured trackStart minus actual parcel width in belt coordinates");
assert(timedConveyor.endX===900&&timedConveyor.travelDuration===3.8&&Math.abs(timedConveyor.speed-1000/3.8)<1e-9,"first parcel crosses the measured distance in 3.8 seconds");
assert(geometryHost.style.clipPath==="inset(0 100px 0 100px)"&&timedConveyor.box.style.top==="25px","entry/exit clip and vertical seating follow the real track rectangle");
const readsAfterSpawn=geometryReads,firstTick=frames[timedConveyor.raf-1];
timedConveyor.dragging=true;const beforeDragX=timedConveyor.x;firstTick(timedConveyor.lastFrame+1000);
assert(timedConveyor.x===beforeDragX&&geometryReads===readsAfterSpawn,"RAF pauses the dragged parcel and performs no geometry reads");
timedConveyor.dragging=false;let detectedMisses=0;timedConveyor.miss=()=>{detectedMisses++;};
timedConveyor.x=timedConveyor.endX-1;frames[timedConveyor.raf-1](timedConveyor.lastFrame+100);
assert(detectedMisses===1&&geometryReads===readsAfterSpawn,"miss is detected after the right track end, without measuring the full container per frame");
timedConveyor.boxDragCleanup?.();timedConveyor.index=11;timedConveyor.spawn();
assert(timedConveyor.travelDuration===2.6&&timedConveyor.speed>1000/3.8,"last of twelve parcels is faster and never falls below 2.6 seconds travel time");
timedConveyor.x=timedConveyor.startX+(timedConveyor.endX-timedConveyor.startX)*.5;
measuredBelt.rect.width=1600;measuredTrack.rect={left:210,top:180,width:1280,height:25};timedConveyor.measureTrack(true);
assert(timedConveyor.trackStart===160&&timedConveyor.trackEnd===1440&&timedConveyor.x===700&&Math.abs(timedConveyor.speed-1480/2.6)<1e-9,"resize preserves normalized journey progress and recalculates speed for the new surface width");
timedConveyor.cleanup();delete global.document;
// Validate issue composition per parcel; healthy artwork is never marked defective.
const qualityMarkup=[...qualityRoot.innerHTML.matchAll(/<button class="quality-box[\s\S]*?<\/button>/g)].map(match=>match[0]);
assert(qualityMarkup.length===8,"Quality still composes exactly eight whole parcel buttons");
for(const [index,parcel] of qualityData.parcels.entries()){
 const markup=qualityMarkup[index];
 if(!parcel.issue)assert(!markup.includes("qc-damage")&&!markup.includes("qc-issue"),`${parcel.id} healthy carton has no damage or issue indicator`);
 else{
  const expected={dented:"issue_damage",missing:"issue_missing_data","wrong-label":"issue_wrong_carrier","wrong-sku":"issue_wrong_sku"}[parcel.issue];
  if(parcel.issue==="dented")assert(markup.includes("damage_crush.webp"),"dented carton carries a real crush texture");
  if(parcel.issue==="missing")assert(markup.includes("qc-empty-field")&&!markup.includes(parcel.sku),"missing SKU shows a visibly empty field without revealing the generated value");
  if(parcel.issue==="wrong-label")assert(markup.includes('qc-carrier">OTHER</span>'),"wrong-label displays OTHER while retaining the task's actual carrier");
  if(parcel.issue==="wrong-sku")assert(markup.includes("SKU-ERROR"),"wrong SKU keeps its visible error text");
 }
}
assert(!css.includes("mix-blend-mode:multiply")&&css.includes("width:52%;height:84%"),"physical damage remains visible without issue icons");
// WMS Detective: real buttons, dynamic barcodes and neutral selection.
const detectiveData=snapshotA.detective,detectiveCount={textContent:""},detectiveConfirm=new FakeElement();let detectiveFinishes=0,detectiveUpdates=0;
const detectiveButtons=detectiveData.rows.map(data=>{
 const row=new FakeElement();row.dataset.row=data.id;row.attributes={};row.flag={textContent:"MARK"};
 row.setAttribute=(name,value)=>{row.attributes[name]=value;};
 row.classList.toggle=(name,enabled)=>{enabled?row.classes.add(name):row.classes.delete(name);};
 row.querySelector=()=>row.flag;
 return row;
});
const detectiveRoot={innerHTML:"",querySelector:selector=>selector==="#lock-detective"?detectiveConfirm:detectiveCount,querySelectorAll:()=>detectiveButtons};
const detectiveGame=new MINIGAME_CLASSES.detective().init({root:detectiveRoot,data:detectiveData,config:GAME_CONFIGS.find(game=>game.id==="detective"),remaining:()=>10,finish:()=>{detectiveFinishes++;},update:()=>{detectiveUpdates++;}});
detectiveGame.render();
assert((detectiveRoot.innerHTML.match(/data-row=/g)||[]).length===8&&(detectiveRoot.innerHTML.match(/aria-pressed="false"/g)||[]).length===8,"WMS renders eight neutral, accessible record buttons");
for(const asset of [...detectiveRoot.innerHTML.matchAll(/src="([^"]+)"/g)].map(match=>match[1]))assert(readFileSync(asset).length>0,`WMS artwork exists: ${asset}`);
assert((detectiveRoot.innerHTML.match(/class="carton-barcode"/g)||[]).length===16,"both SKUs in every WMS record use the existing Code128 SVG generator");
for(const row of detectiveData.rows){
 assert(detectiveRoot.innerHTML.includes(`data-row="${row.id}"`)&&detectiveRoot.innerHTML.includes(`Rack ${row.location}, WMS ${row.expected}, physical scan ${row.actual}`),`${row.id} keeps its generated location and both exact SKU values`);
 assert(detectiveRoot.innerHTML.includes(code128Svg(row.expected).replace('viewBox=', 'preserveAspectRatio="none" viewBox='))&&detectiveRoot.innerHTML.includes(code128Svg(row.actual).replace('viewBox=', 'preserveAspectRatio="none" viewBox=')),`${row.id} barcodes encode the corresponding expected and actual values`);
}
detectiveButtons[0].dispatchEvent(new Event("click"));
assert(detectiveGame.selected.has(detectiveData.rows[0].id)&&detectiveButtons[0].classes.has("selected")&&detectiveButtons[0].attributes["aria-pressed"]==="true"&&detectiveButtons[0].flag.textContent==="FLAGGED"&&detectiveCount.textContent==="1 SELECTED","WMS click flags the selected record, ARIA state and selected counter together");
detectiveButtons[0].dispatchEvent(new Event("click"));
assert(detectiveGame.selected.size===0&&!detectiveButtons[0].classes.has("selected")&&detectiveButtons[0].attributes["aria-pressed"]==="false"&&detectiveButtons[0].flag.textContent==="MARK"&&detectiveCount.textContent==="0 SELECTED"&&detectiveUpdates===2,"second WMS click restores the unflagged record without revealing accuracy");
for(let mask=0;mask<256;mask++){
 detectiveGame.selected=new Set(detectiveData.rows.filter((_,index)=>mask&(1<<index)).map(row=>row.id));
 const expected=scoreClassification({selected:[...detectiveGame.selected],solution:detectiveData.solution,universe:detectiveData.rows.map(row=>row.id),timeRemaining:10,timeLimit:15});
 assert(detectiveGame.score()===expected,`WMS combination ${mask} preserves classification scoring`);
 assert(detectiveGame.liveScore===0,`WMS combination ${mask} cannot leak correctness through live HUD points`);
}
const detectiveRender=MINIGAME_CLASSES.detective.prototype.render.toString();
assert(!detectiveRender.includes("solution")&&!/MATCH|MISMATCH|row_result|status_match|status_mismatch/.test(detectiveRoot.innerHTML),"WMS rendering never reads the solution or emits answer-dependent labels and artwork");
detectiveGame.selected=new Set(detectiveData.solution);detectiveConfirm.dispatchEvent(new Event("click"));detectiveConfirm.dispatchEvent(new Event("click"));
assert(detectiveFinishes===1&&detectiveGame.liveScore===100,"WMS confirm calls finish exactly once and exposes the existing score only after submission");
const detectiveResult=detectiveGame.complete();
assert(detectiveResult.correct===8&&detectiveResult.mistakes===0&&detectiveResult.attempts===8&&detectiveResult.score===100,"WMS perfect submission preserves accuracy, attempts, speed points and score");
const selectedBeforeCleanup=[...detectiveGame.selected].join();detectiveGame.cleanup();detectiveButtons[0].dispatchEvent(new Event("click"));detectiveConfirm.dispatchEvent(new Event("click"));
assert([...detectiveGame.selected].join()===selectedBeforeCleanup&&detectiveFinishes===1&&detectiveGame.cleanups.length===0,"WMS cleanup detaches record and confirm handlers");
assert(game.includes("this.active.liveScore??this.active.score()"),"only minigames explicitly overriding liveScore change their score presentation");
// Memory: permanent artwork mapping and distinct data owners for both phases.
const giftNames=["TEDDY BEAR","TRAIN SET","SNOW GLOBE","PUZZLE","ROBOT","RED SLED","DRUM","DOLL","SKATES","BLOCKS"];
assert(Object.isFrozen(MEMORY_GIFT_ASSETS)&&giftNames.every(gift=>MEMORY_GIFT_ASSETS[gift])&&new Set(Object.values(MEMORY_GIFT_ASSETS)).size===10,"all ten gifts have a permanent unique artwork identity without extra RNG");
for(const file of Object.values(MEMORY_GIFT_ASSETS))assert(readFileSync(`assets/memory_challenge/gifts/${file}`).length>0,`Memory gift artwork exists: ${file}`);
const memoryData=snapshotA.memory,memoryConfirm=new FakeElement(),memoryCount={textContent:""};let memoryFinishes=0;
const memoryButtons=memoryData.options.map(gift=>{
 const button=new FakeElement();button.dataset.gift=gift;button.attributes={};button.setAttribute=(name,value)=>{button.attributes[name]=value;};
 button.classList.toggle=name=>{button.classes.has(name)?button.classes.delete(name):button.classes.add(name);};return button;
});
const memoryRoot={innerHTML:"",querySelector:selector=>selector==="#lock-memory"?memoryConfirm:memoryCount,querySelectorAll:()=>memoryButtons};
const memoryGame=new MINIGAME_CLASSES.memory().init({root:memoryRoot,data:memoryData,config:GAME_CONFIGS.find(c=>c.id==="memory"),remaining:()=>10,finish:()=>{memoryFinishes++;}});
memoryGame.render();const memorizeMarkup=memoryRoot.innerHTML;
assert((memorizeMarkup.match(/data-remember-gift=/g)||[]).length===5&&!memorizeMarkup.includes("data-gift="),"Memory memorize phase shows only five shipment gifts and no selectable options");
for(const gift of memoryData.options.filter(gift=>!memoryData.shipment.includes(gift)))assert(!memorizeMarkup.includes(gift)&&!memorizeMarkup.includes(MEMORY_GIFT_ASSETS[gift]),`${gift} decoy is absent from the memorization screen`);
let memoryDelay=null,memoryReveal=null;memoryGame.timeout=(callback,delay)=>{memoryDelay=delay;memoryReveal=callback;};memoryGame.start();
assert(memoryDelay===4000&&memoryGame.revealed===false,"Memory keeps the existing four-second managed reveal timeout");memoryReveal();
assert((memoryRoot.innerHTML.match(/data-gift=/g)||[]).length===8&&!memoryRoot.innerHTML.includes("data-remember-gift")&&!memoryRoot.innerHTML.includes("memory-platform")&&!memoryRoot.innerHTML.includes("memory-memorize"),"Memory select phase completely replaces the shipment display with eight options");
assert(!MINIGAME_CLASSES.memory.prototype.hide.toString().includes("this.data.shipment"),"Memory selection rendering does not access the answer list");
for(const asset of [...memoryRoot.innerHTML.matchAll(/src="([^"]+)"/g)].map(m=>m[1]))assert(readFileSync(asset).length>0,`Memory phase-two asset exists: ${asset}`);
memoryButtons[0].dispatchEvent(new Event("click"));assert(memoryGame.selected.has(memoryData.options[0])&&memoryButtons[0].attributes["aria-pressed"]==="true"&&memoryCount.textContent==="1 SELECTED","Memory click selects an option and updates ARIA and count");
memoryButtons[0].dispatchEvent(new Event("click"));assert(memoryGame.selected.size===0&&memoryButtons[0].attributes["aria-pressed"]==="false"&&memoryCount.textContent==="0 SELECTED","Memory second click deselects normally");
for(const button of memoryButtons)button.dispatchEvent(new Event("click"));assert(memoryGame.selected.size===8&&memoryCount.textContent==="8 SELECTED","Memory still permits selecting more than five gifts");
for(let mask=0;mask<256;mask++){
 memoryGame.selected=new Set(memoryData.options.filter((_,i)=>mask&(1<<i)));
 assert(memoryGame.score()===scoreClassification({selected:[...memoryGame.selected],solution:memoryData.shipment,universe:memoryData.options,timeRemaining:10,timeLimit:15})&&memoryGame.liveScore===0,`Memory selection ${mask} preserves grading without live correctness feedback`);
}
memoryGame.selected=new Set(memoryData.shipment);memoryConfirm.dispatchEvent(new Event("click"));memoryConfirm.dispatchEvent(new Event("click"));assert(memoryFinishes===1,"Memory lock ends the stage exactly once");
const memoryResult=memoryGame.complete();assert(memoryResult.score===100&&memoryResult.correct===8&&memoryResult.mistakes===0&&memoryResult.attempts===8,"Memory perfect score and accuracy remain identical");
memoryGame.cleanup();memoryGame.locked=false;const memoryBefore=[...memoryGame.selected].join();memoryButtons[0].dispatchEvent(new Event("click"));memoryConfirm.dispatchEvent(new Event("click"));assert(memoryBefore===[...memoryGame.selected].join()&&memoryFinishes===1,"Memory cleanup actually detaches selection and confirm listeners");
// Final: all values come from the generated shipment and every selection grades identically.
const finalData=Array.from({length:100},(_,i)=>buildCompetition(`UNIT-FINAL-${i}`,new SeededRandom(`UNIT-FINAL-${i}`)).final).find(d=>d.action==="HOLD"),finalHold=new FakeElement(),finalRelease=new FakeElement();finalHold.dataset.action="HOLD";finalRelease.dataset.action="RELEASE";let finalFinishes=0,finalTimer=null,finalDelay=null;const finalClasses=new Set();
const finalButtons=finalData.options.map(issue=>{const b=new FakeElement();b.dataset.issue=issue;b.attributes={};b.setAttribute=(name,value)=>{b.attributes[name]=value;};b.classList.toggle=name=>{b.classes.has(name)?b.classes.delete(name):b.classes.add(name);};return b;});
const finalRoot={innerHTML:"",closest:()=>({classList:{add:name=>finalClasses.add(name),remove:name=>finalClasses.delete(name)}}),querySelector:()=>finalHold,querySelectorAll:selector=>selector==="[data-action]"?[finalHold,finalRelease]:finalButtons};
const finalGame=new MINIGAME_CLASSES.final().init({root:finalRoot,data:finalData,config:GAME_CONFIGS.at(-1),remaining:()=>25,finish:()=>{finalFinishes++;}});finalGame.render();
assert(finalClasses.has("final-stage")&&finalRoot.innerHTML.includes("PACKED SHIPMENT")&&finalRoot.innerHTML.includes('aria-label="ORDER"'),"Final keeps the final-stage shell and both comparison panels");
for(const value of [finalData.order.id,finalData.order.sku,finalData.actual.sku,finalData.order.quantity,finalData.actual.quantity,finalData.order.carrier,finalData.actual.carrier,`${finalData.order.serials} / ${finalData.order.serials}`,`${finalData.actual.serials} / ${finalData.order.serials}`])assert(finalRoot.innerHTML.includes(String(value)),`Final displays generated value ${value}`);
assert(!/destination|weight|dimensions|Berlin|Express|Standard|thumbnail_train/i.test(finalRoot.innerHTML),"Final adds no destination, product, shipping-service or package facts absent from tasks.js");
assert((finalRoot.innerHTML.match(/data-issue=/g)||[]).length===4&&(finalRoot.innerHTML.match(/data-action=/g)||[]).length===2,"Final has four issues and both shipment actions");
for(const asset of [...finalRoot.innerHTML.matchAll(/src="([^"]+)"/g)].map(m=>m[1]))assert(readFileSync(asset).length>0,`Final artwork exists: ${asset}`);
assert(!MINIGAME_CLASSES.final.prototype.render.toString().includes("solution")&&!MINIGAME_CLASSES.final.prototype.render.toString().includes("!==actual"),"Final rendering never consults the solution or auto-highlights differences");
finalButtons[0].dispatchEvent(new Event("click"));assert(finalGame.selected.has(finalData.options[0])&&finalButtons[0].attributes["aria-pressed"]==="true","Final issue click updates selection and ARIA");finalButtons[0].dispatchEvent(new Event("click"));assert(finalGame.selected.size===0&&finalButtons[0].attributes["aria-pressed"]==="false","Final second click deselects the issue");
for(let mask=0;mask<16;mask++)for(const action of [null,"HOLD"]){
 finalGame.locked=false;finalGame.selected=new Set(finalData.options.filter((_,i)=>mask&(1<<i)));finalGame.action=action;
 const expected=scoreClassification({selected:[...finalGame.selected],solution:finalData.solution,universe:finalData.options,timeRemaining:25,timeLimit:25,max:150})+(action==="HOLD"?50:0);
 assert(finalGame.score()===expected&&finalGame.liveScore===0,`Final selection ${mask}, ${action}, preserves the 150 + 50 scoring rule without live answers`);
}
finalGame.selected=new Set(finalData.solution);finalGame.action=null;finalGame.timeout=(callback,delay)=>{finalTimer=callback;finalDelay=delay;};finalHold.dispatchEvent(new Event("click"));finalHold.dispatchEvent(new Event("click"));assert(finalGame.action==="HOLD"&&finalHold.disabled,"HOLD completes immediately and rejects duplicate submissions");assert(finalFinishes===1,"Final finish runs exactly once");const finalResult=finalGame.complete();assert(finalResult.score===200&&finalResult.correct===5&&finalResult.mistakes===0&&finalResult.attempts===5,"perfect Final still scores a maximum of 200 with unchanged attempt counts");
finalGame.cleanup();assert(!finalClasses.has("final-stage")&&finalGame.cleanups.length===0,"Final cleanup removes its shell class and listeners");
assert(Object.keys(FINAL_ISSUE_ASSETS).sort().join()===finalData.options.slice().sort().join(),"all four Final issue names map deterministically to the corresponding supplied artwork");
// Truck Loading: gameplay data and order semantics do not depend on artwork.
const truckGame=new MINIGAME_CLASSES.loading().init({root:{},data:snapshotA.loading,config:GAME_CONFIGS.find(c=>c.id==="loading"),remaining:()=>20});
assert(snapshotA.loading.solution.map(id=>snapshotA.loading.pallets.find(p=>p.id===id).stop).join() === "7,6,5,4,3,2,1","Truck solution remains descending stop order from deepest bay to rear door");
for(const pallet of snapshotA.loading.pallets){const label=truckGame.deliveryLabel(pallet);assert(label.includes(`STOP ${pallet.stop}`),`${pallet.city} retains its generated stop`);if(pallet.stop===7)assert(label.includes("LAST DELIVERY · LOAD FIRST"),"last delivery remains deepest/load first");else if(pallet.stop===1)assert(label.includes("FIRST DELIVERY · LOAD LAST"),"first delivery remains load last");else assert(label.includes(`DELIVERY ${pallet.stop}`),"middle pallet keeps its own delivery number");}
for(const slots of [Array(7).fill(null),snapshotA.loading.solution,[...snapshotA.loading.solution].reverse(),[...snapshotA.loading.solution.slice(0,4),null,null,null]]){
 truckGame.slots=slots;const correct=slots.filter((id,i)=>id===snapshotA.loading.solution[i]).length;
 assert(truckGame.score()===scoreStandard({correct,total:7,mistakes:0,completed:correct===7,timeRemaining:20,timeLimit:20})&&truckGame.liveScore===0,"Truck scoring is unchanged and placements cannot expose correctness through live points");
}
// A small DOM fixture runs Truck's real render, click, drag and swap methods.
const truckNode=(rect)=>{
 const node=new FakeElement(rect);node.children=[];node.attributes={};node.parentNode=null;
 node.setAttribute=(name,value)=>{node.attributes[name]=value;};
 node.classList.toggle=(name,enabled)=>{const next=enabled??!node.classes.has(name);next?node.classes.add(name):node.classes.delete(name);return next;};
 Object.defineProperty(node,"className",{get:()=>[...node.classes].join(" "),set:value=>{node.classes=new Set(value.split(/\s+/));}});
 node.append=child=>{if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(n=>n!==child);node.children.push(child);child.parentNode=node;};
 node.closest=selector=>{let current=node;while(current){if(current.classes?.has(selector.slice(1)))return current;current=current.parentNode;}return null;};
 node.remove=()=>{if(node.parentNode)node.parentNode.children=node.parentNode.children.filter(n=>n!==node);node.removed=true;};
 node.cloneNode=()=>{const copy=truckNode(node.rect);copy.className=node.className;copy.innerHTML=node.innerHTML;return copy;};
 return node;
};
const truckYard=truckNode(),truckLock=truckNode(),truckBody=truckNode();let truckSlots=[],truckFinishes=0;
const truckRoot={classList:{add:()=>{},remove:()=>{}},get innerHTML(){return this.markup;},set innerHTML(value){this.markup=value;truckSlots=[...value.matchAll(/data-slot="(\d+)"/g)].map(match=>{const slot=truckNode({left:100+Number(match[1])*100,top:100,width:90,height:150});slot.className="truck-slot";slot.dataset.slot=match[1];slot.placeholder={hidden:false};slot.querySelector=()=>slot.placeholder;return slot;});truckLock.disabled=/id="lock-loading" disabled/.test(value);},querySelector:selector=>selector===".pallet-yard-cards"?truckYard:selector==="#lock-loading"?truckLock:truckSlots.find(n=>n.dataset.slot===selector.match(/data-slot="(\d+)"/)?.[1]),querySelectorAll:selector=>selector==="[data-slot]"?truckSlots:truckSlots.filter(n=>n.classes.has("source-slot"))};
global.document={createElement:()=>truckNode(),body:truckBody,documentElement:{classList:{add:()=>{},remove:()=>{}}}};
const renderedTruck=new MINIGAME_CLASSES.loading().init({root:truckRoot,data:snapshotA.loading,config:GAME_CONFIGS.find(c=>c.id==="loading"),remaining:()=>20,finish:()=>{truckFinishes++;},update:()=>{}});
renderedTruck.render();assert(truckSlots.length===7&&renderedTruck.cards.size===7&&truckYard.children.length===7,"Truck renders exactly seven logical slots and seven persistent physical pallet buttons");
for(const asset of [...truckRoot.innerHTML.matchAll(/src="([^"]+)"/g),...[...renderedTruck.cards.values()].flatMap(card=>[...card.innerHTML.matchAll(/src="([^"]+)"/g)])].map(match=>match[1]))assert(readFileSync(asset).length>0,`Truck artwork exists: ${asset}`);
assert(truckLock.disabled===true,"Truck lock starts disabled");truckLock.dispatchEvent(new Event("click"));assert(truckFinishes===0,"incomplete Truck cannot be submitted");
const firstTruckId=snapshotA.loading.pallets[0].id,secondTruckId=snapshotA.loading.pallets[1].id,firstTruckCard=renderedTruck.cards.get(firstTruckId);
firstTruckCard.dispatchEvent(new Event("click"));assert(renderedTruck.selected===firstTruckId&&firstTruckCard.attributes["aria-pressed"]==="true","Truck click selects the pallet without affecting its stop data");truckSlots[0].dispatchEvent(new Event("click"));assert(renderedTruck.slots[0]===firstTruckId&&truckSlots[0].children.includes(firstTruckCard)&&truckLock.disabled,"clicking an empty slot moves the same pallet node and keeps partial loading disabled");
renderedTruck.place(secondTruckId,1);renderedTruck.place(firstTruckId,1);assert(renderedTruck.slots[0]===secondTruckId&&renderedTruck.slots[1]===firstTruckId,"moving an occupied-slot pallet swaps both original persistent cards");
const yardTruckId=snapshotA.loading.pallets[2].id;renderedTruck.place(yardTruckId,1);assert(renderedTruck.slots[1]===yardTruckId&&truckYard.children.includes(firstTruckCard),"a yard pallet returns the displaced occupied pallet to the waiting queue");
const draggingCard=renderedTruck.cards.get(yardTruckId);draggingCard.dispatchEvent(pointer("pointerdown",30,30));assert(truckSlots[1].classes.has("source-slot")&&truckBody.children.length===1,"Truck drag creates a physical ghost and marks its source slot");draggingCard.dispatchEvent(pointer("pointercancel",30,30));assert(renderedTruck.slots[1]===yardTruckId&&!truckSlots[1].classes.has("source-slot")&&truckBody.children.length===0,"Truck drag cancellation retains placement and clears the source marker and ghost");
draggingCard.dispatchEvent(pointer("pointerdown",30,30));draggingCard.dispatchEvent(pointer("pointermove",345,150));draggingCard.dispatchEvent(pointer("pointerup",345,150));assert(renderedTruck.slots[2]===yardTruckId&&renderedTruck.slots[1]===null,"the original pointer controller drops a pallet into an empty slot");
for(const [index,id] of snapshotA.loading.solution.entries())renderedTruck.place(id,index);
assert(!truckLock.disabled&&renderedTruck.slots.join()===snapshotA.loading.solution.join()&&renderedTruck.score()===100,"all seven occupied slots enable lock and a perfect reverse delivery order still scores 100");truckLock.dispatchEvent(new Event("click"));truckLock.dispatchEvent(new Event("click"));assert(truckFinishes===1,"Truck lock confirms a complete load exactly once");renderedTruck.cleanup();renderedTruck.locked=false;const beforeTruckSelection=renderedTruck.selected;firstTruckCard.dispatchEvent(new Event("click"));assert(renderedTruck.selected===beforeTruckSelection&&renderedTruck.cleanups.length===0,"Truck cleanup detaches card/slot click handlers, pointer controllers and feedback timers");delete global.document;
console.log(`Competition validation passed: ${checks.toLocaleString()} checks.`);

await import("./competition-tests.mjs");

await import("./final-tests.mjs");
