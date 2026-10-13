import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {SeededRandom,createRunId,createRunSeed} from './rng.js';
import {buildCompetition,buildGameOrder,GAME_CONFIGS,PACKING_SETS} from './tasks.js';
import {packingInventoryLayout,packingBoxAsset,MINIGAME_CLASSES} from './minigames.js';
import {scoreStandard,sumScores} from './scoring.js';
import {LeaderboardManager,LocalLeaderboardStore,CompetitionSettings,leaderboardCsv} from './storage.js';
import {AssetLoader} from './asset-loader.js';
import {COMPETITION_ASSETS,GAME_ASSETS,GAMEPLAY_BACKGROUNDS} from './asset-manifest.js';
let checks=0;const check=(condition,message)=>{checks++;assert(condition,message);};
const ids=Array.from({length:1000},createRunId),seeds=Array.from({length:1000},createRunSeed);
check(new Set(ids).size===1000&&new Set(seeds).size===1000,'secure run identifiers and seeds are unique');
const lastPositions=new Set(),variants=new Set(),zones=new Set(),actions={HOLD:0,RELEASE:0};
for(let i=0;i<500;i++){
 const seed=`BALANCED-${i}`,rng=new SeededRandom(seed),data=buildCompetition(seed,rng),again=buildCompetition(seed,new SeededRandom(seed)),order=buildGameOrder(rng.fork('game-order'));
 check(JSON.stringify(data)===JSON.stringify(again),'explicit seeds reproduce tasks');check(order.length===9&&new Set(order.map(c=>c.id)).size===9&&order.at(-1).id==='final','exactly nine games with Final last');
 lastPositions.add(data.picking.rounds.at(-1).options.indexOf(data.picking.rounds.at(-1).target));
 for(const name of ['picking','barcode']){
  let previous=-1;const counts=Array(9).fill(0);
  for(const round of data[name].rounds){const position=round.options.indexOf(round.target);check(position>=0&&position!==previous,'no consecutive matching positions');check(round.options.length===round.variants.length&&new Set(round.options).size===round.options.length,'complete unique options and artwork');counts[position]++;previous=position;}
  check(Math.max(...counts)<=2,'each correct slot appears at most twice over ten rounds');
 }
 check(data.conveyor.carriers.length===6&&new Set(data.conveyor.carriers).size===6,'all six carrier zones');zones.add(data.conveyor.carriers.join());
 check(data.conveyor.carriers.every(c=>data.conveyor.parcels.filter(p=>p.carrier===c).length===2),'equal sorting workload for all carriers');
 check(data.packing.boxes.length===10&&data.packing.boxes.reduce((s,b)=>s+b.w*b.h,0)===30,'packing variants all have ten boxes covering thirty cells');variants.add(data.packing.set);
 const solution=packingInventoryLayout(data.packing.boxes,8,5,new SeededRandom(data.packing.layoutSeed)),cells=new Set();
 for(const box of data.packing.boxes){check(existsSync(packingBoxAsset(box,box.variant)),'every box has valid artwork');const {x,y}=solution[box.id];check(x>=0&&y>=0&&x+box.w<=8&&y+box.h<=5,'packing solution stays in grid');for(let dy=0;dy<box.h;dy++)for(let dx=0;dx<box.w;dx++){const key=`${x+dx}:${y+dy}`;check(!cells.has(key),'generated packing solutions never overlap');cells.add(key);}}
 check(data.detective.solution.length===3&&data.detective.rows.filter(r=>r.expected!==r.actual).length===3,'detective has exactly three real discrepancies');
 check(data.loading.solution.join()===data.loading.pallets.slice().sort((a,b)=>b.stop-a.stop).map(p=>p.id).join(),'truck physical direction is unchanged');
 check(data.memory.shipment.length===5&&data.memory.options.length===8,'memory keeps five gifts and three decoys');
 check(data.quality.solution.length===4&&data.quality.parcels.filter(p=>p.issue).length===4,'quality artwork preserves four defects');
 const task=data.final;actions[task.action]++;const differences=[task.order.quantity!==task.actual.quantity?'WRONG QUANTITY':null,task.order.carrier!==task.actual.carrier?'WRONG CARRIER':null,task.order.sku!==task.actual.sku?'WRONG SKU':null,task.order.serials!==task.actual.serials?'MISSING SERIALS':null].filter(Boolean);
 check(differences.sort().join()===task.solution.slice().sort().join()&&task.action===(differences.length?'HOLD':'RELEASE'),'final action and issue solution follow actual data');
 const game=new MINIGAME_CLASSES.final().init({root:{},data:task,config:GAME_CONFIGS.at(-1),remaining:()=>20});game.selected=new Set(task.solution);game.action=task.action;check(game.score()===200,'both final outcomes achieve 200');if(task.action==='RELEASE'){game.action=null;check(game.score()===0,'a valid shipment earns no points without an explicit decision');}
 for(let mask=0;mask<16;mask++){game.selected=new Set(task.options.filter((_,j)=>mask&(1<<j)));for(const action of ['HOLD','RELEASE',null]){game.action=action;check(game.score()>=0&&game.score()<=200,'final scores stay bounded');check(game.score()<200||(action===task.action&&[...game.selected].sort().join()===task.solution.slice().sort().join()),'only the correct classification and decision receive full points');}}
}
check(lastPositions.size===9,'the growing grid does not force a predictable last-round position');
check(variants.size===PACKING_SETS.length&&zones.size>100,'multiple packing sets and carrier arrangements are used');check(actions.HOLD>190&&actions.RELEASE>190,'RELEASE and HOLD are both represented fairly across seeds');
check(sumScores(Object.fromEntries(GAME_CONFIGS.map(c=>[c.id,c.max])))===1000,'maximum total is unchanged');check(scoreStandard({correct:10,total:10,completed:true,timeRemaining:8,timeLimit:15})===100,'perfect fast gameplay can attain its maximum');
check(Object.keys(GAME_ASSETS).length===9&&Object.keys(GAMEPLAY_BACKGROUNDS).length===9,'manifest covers all nine backgrounds and games');
for(const path of COMPETITION_ASSETS)check(existsSync(path)&&readFileSync(path).length>0,`runtime asset exists: ${path}`);
check(COMPETITION_ASSETS.every(p=>!/(mockup|approved-|reference-full|\/reference\/|\/examples\/)/.test(p)),'no mockups are downloaded');
const report=JSON.parse(readFileSync('assets/optimization-report.json'));check(report.after<report.before*.2,'runtime image bytes reduced by over 80 percent');
const storeData={version:3,runs:[]},store={read:()=>structuredClone(storeData),write:data=>{Object.assign(storeData,structuredClone(data));return true;},clear:()=>{storeData.runs=[];return true;}};
const board=new LeaderboardManager(store);
for(const id of ids.slice(0,100))board.saveRun({id,name:'Same Name',normalizedName:'same name',score:500,accuracy:80,mistakes:2,runSeed:'seed-'+id,eventId:'EVENT'});
check(board.getLeaderboard().length===100&&new Set(board.getLeaderboard().map(r=>r.id)).size===100,'identical player names remain separate');check(board.getLeaderboard().every(r=>r.timestamp&&r.runSeed),'timestamps and seeds retained');
const csv=leaderboardCsv(board.getLeaderboard());check(csv.includes('Run seed,Event ID')&&csv.includes('seed-'),'CSV contains reproducible run seeds and event IDs');
const failed=new LeaderboardManager({read:()=>({version:3,runs:[]}),write:()=>false,clear:()=>false});failed.saveRun({name:'Unsaved',score:10});check(!failed.lastSaveSucceeded&&failed.getLeaderboard().length===1,'failed saves retain the result in memory for export');check(failed.clearLeaderboard()===false&&failed.getLeaderboard().length===1,'failed resets do not erase in-memory results');
let originalStorage=globalThis.localStorage;globalThis.localStorage={getItem:()=>'{broken',setItem:()=>{throw new Error('must not overwrite damaged storage');}};const damaged=new LocalLeaderboardStore();damaged.read();check(damaged.write({version:3,runs:[]})===false,'malformed existing storage is preserved');globalThis.localStorage=originalStorage;
let active=0,maxActive=0,created=0,decoded=0;
const loader=new AssetLoader({concurrency:3,timeout:100,imageFactory:()=>{created++;return {set src(value){active++;maxActive=Math.max(maxActive,active);queueMicrotask(()=>this.onload());},decode:async()=>{await new Promise(r=>setTimeout(r,1));decoded++;active--;}};}}),progress=[];
await loader.preload(['a','b','c','d','e','a'],p=>progress.push(p));check(maxActive<=3&&decoded===5&&created===5,'bounded loading concurrency, duplicate paths decoded once');await loader.preload(['a','b']);check(created===5&&decoded===5,'warm cache reuses decoded images');check(progress[0].completed===0&&progress.at(-1).completed===5,'progress reflects readiness');
let attempts=0;const retryLoader=new AssetLoader({timeout:50,imageFactory:()=>({set src(value){attempts++;queueMicrotask(()=>attempts===1?this.onerror():this.onload());},decode:async()=>{}})});
await assert.rejects(retryLoader.preload(['retry']),/could not be prepared/);await retryLoader.preload(['retry']);check(attempts===2,'failed assets can be retried');
const timeoutLoader=new AssetLoader({timeout:5,imageFactory:()=>({set src(value){}})});await assert.rejects(timeoutLoader.preload(['missing']),/could not be prepared/);check(true,'missing image cannot cause endless loading');
console.log(`Competition improvement validation passed: ${checks.toLocaleString('en-US')} checks.`);
