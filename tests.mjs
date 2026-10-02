import { readFileSync } from "node:fs";
import { SeededRandom } from "./rng.js";
import { ACTIVE_SECONDS, COMPETITION_SECONDS, GAME_CONFIGS, TRANSITION_SECONDS, buildCompetition } from "./tasks.js";
import { scoreClassification, scoreStandard, sumScores } from "./scoring.js";
import { StageGuard } from "./lifecycle.js";
import { LeaderboardManager, normalizeName } from "./storage.js";
import { MINIGAME_CLASSES, BaseMinigame } from "./minigames.js";

let checks=0;
const assert=(condition,message)=>{checks++;if(!condition)throw new Error(message);};

assert(GAME_CONFIGS.length===9,"competition has eight minigames and one final");
assert(GAME_CONFIGS.slice(0,8).every(game=>game.max===100)&&GAME_CONFIGS.at(-1).max===200,"score caps total 1,000");
assert(ACTIVE_SECONDS===165,"active gameplay totals 165 seconds");
assert(3+(GAME_CONFIGS.length-1)*TRANSITION_SECONDS===15,"countdown and between-game transitions total 15 seconds");
assert(COMPETITION_SECONDS===180,"competition duration is three minutes");
assert(GAME_CONFIGS.map(game=>game.time).join(",")==="15,20,15,25,15,20,15,15,25","all stage timers match specification");
assert(Object.keys(MINIGAME_CLASSES).join(",")===GAME_CONFIGS.map(game=>game.id).join(","),"every configured stage has a playable class");
for(const Game of Object.values(MINIGAME_CLASSES))assert(Game.prototype instanceof BaseMinigame,"every game implements shared lifecycle");

const snapshotA=buildCompetition("OFFICE-FINAL",new SeededRandom("OFFICE-FINAL"));
const snapshotB=buildCompetition("OFFICE-FINAL",new SeededRandom("OFFICE-FINAL"));
const snapshotC=buildCompetition("ANOTHER-SEED",new SeededRandom("ANOTHER-SEED"));
assert(JSON.stringify(snapshotA)===JSON.stringify(snapshotB),"same competition seed is reproducible");
assert(JSON.stringify(snapshotA)!==JSON.stringify(snapshotC),"different seed changes task data");
assert(snapshotA.picking.rounds.length===10&&snapshotA.barcode.rounds.length===10,"rapid games have capped challenge sets");
assert(snapshotA.conveyor.parcels.length===12,"conveyor has a finite parcel set");
assert(new Set(snapshotA.conveyor.parcels.map(parcel=>parcel.carrier)).size>1,"conveyor uses multiple carriers");
assert(snapshotA.packing.boxes.every(box=>box.w>0&&box.h>0),"packing pieces have real dimensions");
assert(snapshotA.detective.solution.length===3,"WMS detective has equivalent discrepancy count");
assert(snapshotA.loading.solution.length===7,"truck loading has seven ordered pallets");
assert(snapshotA.memory.shipment.length===5&&snapshotA.memory.options.length===8,"memory challenge has five targets and three decoys");
assert(snapshotA.quality.solution.length===4,"quality control has four visual issues");
assert(snapshotA.final.solution.length===3&&snapshotA.final.action==="HOLD","final has three discrepancies and requires hold");
for(let run=0;run<1000;run++){
  const data=buildCompetition(`SEED-${run}`,new SeededRandom(`SEED-${run}`));
  assert(data.detective.solution.every(id=>{const row=data.detective.rows.find(item=>item.id===id);return row.expected!==row.actual;}),"WMS solutions are genuine hidden mismatches");
  assert(new Set(data.final.solution).size===3,"final discrepancies are unique");
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
assert(board.getLeaderboard().length===3,"normalized players are deduplicated");
assert(board.getLeaderboard()[0].name==="Marta","leaderboard uses score, accuracy, mistakes, then timestamp");
assert(board.getPlayerHistory("daniel").length===2,"local history remains available");
board.clearLeaderboard();assert(board.getLeaderboard().length===0,"leaderboard adapter clears local data");

const html=readFileSync("index.html","utf8"),css=readFileSync("styles.css","utf8"),game=readFileSync("game.js","utf8"),minigames=readFileSync("minigames.js","utf8");
assert(html.includes('src="logo.png"')&&html.includes("CEVA LOGISTICS"),"CEVA logo and brand remain");
assert(html.includes("holiday-corner gifts")&&css.includes("@keyframes snowfall"),"Christmas decorations remain");
assert(game.includes("COMPETITION REMAINING")&&game.includes("/ 1000"),"HUD shows global progress and accumulated score");
assert(game.includes("lockGame(token)")&&game.includes("pendingResult||this.active.complete"),"early answers lock once while the allocated stage timer continues");
assert(game.includes("LOCAL DEVICE LEADERBOARD")&&game.includes("not a centralized company leaderboard"),"leaderboard is honestly identified as local");
assert(minigames.includes("animationend")&&css.includes("@keyframes parcelTravel"),"conveyor has animated parcels and miss handling");
assert(minigames.includes("pallet-grid")&&minigames.includes("every(value=>!value)"),"packing grid prevents collisions");
assert(minigames.includes("invalid-target")&&css.includes(".pallet-cell.invalid-target"),"packing drag previews valid and invalid positions");
assert(!minigames.includes('"MATCH"')&&!minigames.includes('"WRONG"'),"WMS rows do not reveal correctness");
assert(minigames.includes("setTimeout")||minigames.includes("this.timeout"),"memory reveal uses a managed timeout");
assert(minigames.includes("this.cleanups")&&minigames.includes("cleanup()"),"minigames clean listeners and timers");
assert(!/carrier\s*\([^)]*\)\s*\{/g.test(readFileSync("tasks.js","utf8")),"legacy duplicate carrier methods are removed");

console.log(`Competition validation passed: ${checks.toLocaleString()} checks.`);
