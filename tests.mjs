import { readFileSync } from "node:fs";
import { SeededRandom } from "./rng.js";
import { ACTIVE_SECONDS, COMPETITION_SECONDS, GAME_CONFIGS, TRANSITION_SECONDS, buildCompetition, buildGameOrder } from "./tasks.js";
import { scoreClassification, scoreStandard, sumScores } from "./scoring.js";
import { StageGuard } from "./lifecycle.js";
import { LeaderboardManager, normalizeName } from "./storage.js";
import { MINIGAME_CLASSES, BaseMinigame, code128Svg, code128Values, gridDragAnchor, offsetGridCoordinate, packingBoxAsset, packingInventoryLayout, planPalletMove } from "./minigames.js";
import { attachPointerDrag } from "./interactions.js";

let checks=0;
const assert=(condition,message)=>{checks++;if(!condition)throw new Error(message);};

assert(GAME_CONFIGS.length===9,"competition has eight minigames and one final");
assert(GAME_CONFIGS.slice(0,8).every(game=>game.max===100)&&GAME_CONFIGS.at(-1).max===200,"score caps total 1,000");
assert(ACTIVE_SECONDS===165,"active gameplay totals 165 seconds");
assert(3+(GAME_CONFIGS.length-1)*TRANSITION_SECONDS===15,"countdown and between-game transitions total 15 seconds");
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
assert(snapshotA.final.solution.length===2&&snapshotA.final.action==="HOLD","final has two randomized discrepancies and requires hold");

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
  assert(new Set(data.final.solution).size===2,"final discrepancies are unique");
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
now+=14900;assert(Math.round(guard.remaining(token)*10)/10===.1,"stage timer tracks remaining time");
assert(guard.complete(token)&&!guard.complete(token),"stage can complete only once");
const nextToken=guard.begin(20);assert(!guard.complete(token)&&guard.remaining(nextToken)===20,"stale callbacks cannot complete the next stage");
guard.cancel();assert(guard.remaining(nextToken)===0,"cleanup invalidates active timer token");

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
assert(game.includes('assets/menu/logo-light.png')&&game.includes("CHRISTMAS</span><strong>LOGISTICS CHALLENGE"),"CEVA logo and brand remain");
assert(game.includes("CHRISTMAS</span><strong>LOGISTICS CHALLENGE")&&css.includes("menu-screen"),"Christmas presentation remains");
assert(game.includes("COMPETITION REMAINING")&&game.includes("/ 1000"),"HUD shows global progress and accumulated score");
assert(game.includes("finish:()=>this.completeGame(token)")&&!game.includes("lockGame(token)"),"accepted answers advance immediately without waiting for the timer");
assert(game.includes('createRunSeed')&&game.includes('buildGameOrder'),"each run receives fresh task data and a shuffled pre-final order");
assert(!game.includes("LOCAL DEVICE LEADERBOARD")&&!game.includes("not a centralized company leaderboard"),"leaderboard omits the legacy local header and storage footer");
assert(game.includes('class="leaderboard-scroll"')&&game.includes('assets/leaderboard/medal-${index+1}.png'),"leaderboard stays dynamic with a scrolling semantic table and ranked medal assets");
assert(!game.includes("HIGHEST SCORE ON THIS DEVICE")&&game.includes("COMPETITION RECORD"),"competition record banner omits the removed device subtitle");
assert(!css.includes('.podium-1 td:first-child:before')&&!css.includes('.podium-2 td:first-child:before')&&!css.includes('.podium-3 td:first-child:before'),"leaderboard podium cells render only their supplied medal image");
assert(css.includes("height:auto;max-width:none;max-height:calc(100dvh - 32px)")&&css.includes("max-height:min(312px,calc(100dvh - 360px))"),"leaderboard height follows its content while the table alone has a viewport-safe scroll limit");
assert(!css.includes('background:url("assets/leaderboard/panel-empty.png") center/100% 100%')&&css.includes('assets/leaderboard/christmas-corner.png'),"leaderboard decorations retain their aspect ratio instead of stretching the full panel artwork");
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
assert(css.includes(".qc-issue")&&css.includes(".qc-label-copy")&&css.includes("11cqw"),"quality defects use small artwork markers and responsive HTML labels");
assert(interactions.includes('element.cloneNode(true)')&&interactions.includes("container.append(ghost)")&&css.includes(".drag-ghost"),"all physical drags use a visible body-level cursor proxy");
assert(minigames.includes('className="placed-box placed-pop"')&&!/BOX PACKED"\);this\.draw\(\)/.test(minigames),"packing placement creates only its persistent placed-box overlay without rerendering the minigame");
assert(minigames.includes('className="shape-slot"')&&minigames.includes("source?.classList.add(\"packed-away\")")&&!minigames.includes('querySelector(".shape-rack").innerHTML'),"packing inventory slots remain stable when a box is placed");
assert(minigames.includes('className="packing-drag-ghost"')&&interactions.includes("createGhost")&&css.includes(".packing-drag-ghost"),"packing uses a dedicated transparent artwork ghost instead of cloning an inventory slot");
assert(minigames.includes("if(target&&this.dragCoordinate)this.place(box.id,this.dragCoordinate)"),"packing preview and drop commit share one cached grid coordinate");
assert(css.includes("grid-auto-flow:row")&&!css.includes("grid-auto-flow:dense")&&css.includes(".shape-box.packed-away{visibility:hidden")&&!minigames.includes("source?.remove(),180"),"packed inventory boxes retain permanent grid space without dense reflow");
assert((minigames.match(/data-action="/g)||[]).length===1&&minigames.includes("CONFIRM · HOLD SHIPMENT"),"final dispatch has one confirmation action");
assert(css.includes("var(--pack-cell-w)")&&css.includes("var(--pack-cell-h)")&&minigames.includes("ResizeObserver"),"packing rack and pallet share responsive measured cell dimensions");
assert(css.includes("@keyframes panelReveal")&&css.includes("@keyframes selectedPulse"),"minigames include restrained entrance and selection animations");
assert(!minigames.includes('"MATCH"')&&!minigames.includes('"WRONG"'),"WMS rows do not reveal correctness");
assert(minigames.includes("setTimeout")||minigames.includes("this.timeout"),"memory reveal uses a managed timeout");
assert(minigames.includes("this.cleanups")&&minigames.includes("cleanup()"),"minigames clean listeners and timers");
assert(!/carrier\s*\([^)]*\)\s*\{/g.test(readFileSync("tasks.js","utf8")),"legacy duplicate carrier methods are removed");


// Organizer utilities remain deterministic, local, and spreadsheet-safe.
const { CompetitionSettings, leaderboardCsv } = await import("./storage.js");
const settingsStore=new Map();
const settings=new CompetitionSettings({getItem:key=>settingsStore.get(key)??null,setItem:(key,value)=>settingsStore.set(key,value)});
assert(settings.getSeed()==="CEVA-CHRISTMAS-2026","competition settings provide one fixed default seed");
assert(settings.setSeed(" event 2026! ")&&settings.getSeed()==="EVENT2026","organizer seed is sanitized and persisted locally");
const csv=leaderboardCsv([{id:"run-1",name:'Ana "Ace", Smith',score:999,accuracy:98,timestamp:"2026-12-01T10:00:00Z"},{id:"run-2",name:'Ana "Ace", Smith',score:850,accuracy:91,timestamp:"2026-12-02T10:00:00Z"}]);
assert(csv.includes('"Ana ""Ace"", Smith"')&&csv.includes('"999"')&&csv.includes('"run-1"')&&csv.includes('"run-2"')&&csv.split("\r\n").length===3,"CSV export safely includes every individual run and its identifier");
assert(interactions.includes("setPointerCapture")&&interactions.includes("pointercancel")&&interactions.includes("requestAnimationFrame"),"shared drag controller captures pointers, cancels safely, and paints on animation frames");
assert(minigames.match(/attachPointerDrag/g).length>=3,"packing and truck loading use the shared pointer drag controller");
assert(effects.includes("prefers-reduced-motion")&&css.includes("prefers-reduced-motion"),"arcade effects respect reduced-motion preferences in JS and CSS");
assert(game.includes("Delete every local competition result?")&&game.includes("confirm("),"competition reset requires explicit confirmation");
assert(!/class TruckLoading[\s\S]*?draw\(\)/.test(minigames),"truck loading never rebuilds its scene after initial render");
assert(minigames.includes("if(sourceIndex>=0)this.setSlot(sourceIndex,occupant)")&&minigames.includes("pallet-yard-cards"),"occupied truck positions swap predictably or return their pallet to the yard");
assert(minigames.includes("cards=new Map")&&minigames.includes("slot.append(card)"),"truck loading moves persistent pallet nodes instead of recreating them");
assert(minigames.includes("detective-records")&&minigames.includes('aria-pressed="false"')&&css.includes("grid-template-rows:repeat(4,1fr)"),"WMS detective uses a full terminal grid with accessible selection state");
assert(!minigames.includes("this.data.solution.includes(row.dataset.row)"),"WMS detective does not reveal row correctness before submission");
assert(effects.includes("arcade-effect-layer")&&minigames.includes("CORRECT SKU")&&minigames.includes("WRONG BARCODE"),"immediate games use persistent unmistakable success and failure feedback");
assert(!/\.shape-box[^\n]*!important/.test(css)&&!/\.load-pallet[^\n]*!important/.test(css),"core packing and loading styles no longer rely on important overrides");

assert(!interactions.includes('ghost.classList.add("drag-ghost","dragging")')&&interactions.includes("Cursor-following is deliberately synchronous"),"drag ghosts are not blocked by the legacy dragging transform override and track pointers synchronously");
assert(interactions.includes("targetRects=targetList().map")&&!interactions.includes("matches.sort"),"drag target geometry is cached once instead of measured and sorted on every pointer move");
assert(minigames.includes('if(key===this.previewKey)return')&&minigames.includes("this.previewCells.forEach"),"packing previews skip unchanged targets and clear only affected cells");
assert(!/this\.flash\([^\n]*(PALLET LOADED|PALLETS SWAPPED)/.test(minigames)&&minigames.includes("slot-feedback"),"truck loading uses localized routine feedback rather than the global answer overlay");
assert(css.includes("barcode-parcel:not(.choice-correct):not(.choice-wrong):hover")&&css.includes("stock-card:not(.choice-correct):not(.choice-wrong):hover"),"barcode and speed-picking cards retain visible hover states separate from result states");
assert(!css.includes(".brand-logo{background:#fff")&&css.includes(".menu-logo{"),"the transparent CEVA logo is no longer forced into a white plaque");
assert(minigames.includes("offsetGridCoordinate(target.dataset.cell,this.dragAnchor)")&&minigames.includes("x>=0&&y>=0"),"packing ghost, footprint preview, and placement share the pointer grab anchor with safe grid bounds");
assert(css.includes(".drag-source{opacity:0}"),"the moving source is hidden while its fully visible drag ghost is active");
// Conveyor artwork remains presentation; exercise its DOM contract and lifecycle.
const conveyorRoot={innerHTML:"",querySelector:()=>null};
const visualConveyor=new Conveyor().init({root:conveyorRoot,data:snapshotA.conveyor,config:GAME_CONFIGS[1],remaining:()=>10,flash:()=>{},update:()=>{}});
visualConveyor.render();
assert((conveyorRoot.innerHTML.match(/data-chute=/g)||[]).length===6,"Conveyor renders all six logical carrier hit targets");
for(const carrier of ["DHL","UPS","TNT","TOF","KLG","BRINGCARGO"]){
  assert(conveyorRoot.innerHTML.includes(`data-chute="${carrier}"`)&&conveyorRoot.innerHTML.includes(`zones/zone-${carrier.toLowerCase()}.png`),`${carrier} retains its matching chute and artwork`);
}
for(const asset of [...conveyorRoot.innerHTML.matchAll(/src="([^"]+)"/g)].map(match=>match[1]))assert(readFileSync(asset).length>0,`Conveyor asset exists: ${asset}`);
assert(conveyorRoot.innerHTML.includes("belt/belt-base.png")&&conveyorRoot.innerHTML.includes("belt/belt-front-trim.png")&&conveyorRoot.innerHTML.includes("states/drop-valid-check.png")&&conveyorRoot.innerHTML.includes("states/drop-invalid.png"),"belt layers and success/error overlays use supplied assets");
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
assert(parcelHost.markup.includes("boxes/parcel-front.png")&&parcelHost.markup.includes("labels/shipping-label-front.png")&&parcelHost.markup.includes("<b>DHL</b>")&&parcelHost.markup.includes("GIFT-1")&&parcelHost.markup.includes("TEDDY BEAR"),"spawn layers supplied carton and label assets under dynamic HTML data");
const firstParcel=liveConveyor.box;
firstParcel.dispatchEvent(pointer("pointerdown",30,30));
assert(liveConveyor.dragging&&liveContainer.child.style.transform==="none","spawned parcel uses attachPointerDrag and clears belt translation on its ghost");
firstParcel.dispatchEvent(pointer("pointercancel",30,30));
assert(!liveConveyor.dragging&&liveContainer.child.removed&&liveConveyor.index===0,"cancel restores the original moving parcel without consuming it");
firstParcel.dispatchEvent(pointer("pointerdown",30,30));firstParcel.dispatchEvent(pointer("pointermove",225,130));firstParcel.dispatchEvent(pointer("pointerup",225,130));
assert(liveConveyor.correct===1&&liveConveyor.mistakes===0&&liveConveyor.index===1&&parcelHost.markup.includes("parcel-angle-left.png"),"correct pointer drop scores once and spawns the next visual variant");
const secondParcel=liveConveyor.box;
secondParcel.dispatchEvent(pointer("pointerdown",30,30));secondParcel.dispatchEvent(pointer("pointermove",225,130));secondParcel.dispatchEvent(pointer("pointerup",225,130));
assert(liveConveyor.correct===1&&liveConveyor.mistakes===1&&liveConveyor.index===2&&parcelHost.markup.includes("parcel-angle-right.png"),"wrong pointer drop penalizes once and advances to the right-angle carton");
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
assert(qualityResult.correct===8&&qualityResult.mistakes===0&&qualityResult.attempts===8&&qualityResult.score===95,"perfect Quality selection preserves accuracy, attempts and speed score");
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
  assert(markup.includes(expected),`${parcel.issue} keeps its original issue artwork mapping`);
  if(parcel.issue==="dented")assert(markup.includes("damage_crush.png"),"dented carton carries a real crush texture");
  if(parcel.issue==="missing")assert(markup.includes("qc-empty-field")&&!markup.includes(parcel.sku),"missing SKU shows a visibly empty field without revealing the generated value");
  if(parcel.issue==="wrong-label")assert(markup.includes('qc-carrier">OTHER</span>'),"wrong-label displays OTHER while retaining the task's actual carrier");
  if(parcel.issue==="wrong-sku")assert(markup.includes("SKU-ERROR"),"wrong SKU keeps its visible error text");
 }
}
assert(!css.includes("mix-blend-mode:multiply")&&css.includes("width:52%;height:84%")&&css.includes("clamp(30px,3vw,45px)"),"damage and issue markers have substantially stronger visible coverage");
console.log(`Competition validation passed: ${checks.toLocaleString()} checks.`);
