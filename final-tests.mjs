import assert from 'node:assert/strict';
import {AssetLoader,ASSET_PRIORITY} from './asset-loader.js';
import {buildTask,GAME_CONFIGS} from './tasks.js';
import {SeededRandom} from './rng.js';
import {MINIGAME_CLASSES} from './minigames.js';
import {scoreClassification,scoreStandard} from './scoring.js';
let checks=0;const check=(condition,message)=>{checks++;assert(condition,message);};
for(let i=0;i<5000;i++){
 const task=buildTask('detective',new SeededRandom(`UNIQUE-WMS-${i}`));
 check(task.rows.length===8&&new Set(task.rows.map(row=>row.location)).size===8,'eight unique locations in every WMS challenge');
 check(task.solution.length===3&&task.rows.filter(row=>row.expected!==row.actual).length===3,'exactly three genuine WMS discrepancies');
}
for(let i=0;i<100;i++){
 const task=buildTask('final',new SeededRandom(`SCORING-150-50-${i}`)),game=new MINIGAME_CLASSES.final().init({root:{},data:task,config:GAME_CONFIGS.at(-1),remaining:()=>20});
 for(let mask=0;mask<16;mask++)for(const action of ['HOLD','RELEASE',null]){
  game.selected=new Set(task.options.filter((_,j)=>mask&(1<<j)));game.action=action;
  const classification=task.solution.length?scoreClassification({selected:[...game.selected],solution:task.solution,universe:task.options,timeRemaining:20,timeLimit:25,max:150}):scoreStandard({correct:game.selected.size===0?1:0,total:1,mistakes:game.selected.size,completed:game.selected.size===0,timeRemaining:20,timeLimit:25,max:150});
  const expected=!task.solution.length&&action===null?0:classification+(action===task.action?50:0);
  check(game.score()===expected,'Final uses 150 classification and 50 decision points');
  if(action!==task.action)check(game.score()<=150,'wrong decisions never receive 50 decision points');
  if(mask===15)check(game.score()<=50,'selecting every issue does not earn classification points');
 }
 game.selected=new Set(task.solution);game.action=task.action;check(game.score()===200,'both perfect Final outcomes retain the 200 maximum');
}
const started=[],images=new Map();
const loader=new AssetLoader({concurrency:3,timeout:1000,imageFactory:()=>({set src(path){this.path=path;started.push(path);images.set(path,this);},decode:async()=>{}})});
const background=loader.preload(['low-0','low-1','low-2','low-3','low-4','low-5'],()=>{},{priority:ASSET_PRIORITY.LOW});
check(started.length===2,'low priority leaves a reserved critical lane');
const previous=loader.cache.get('low-3'),promoted=loader.load('low-3',ASSET_PRIORITY.HIGH);
check(previous===promoted&&started[2]==='low-3','queued priority promotion reuses the original promise and starts immediately');
const inflight=loader.load('low-0',ASSET_PRIORITY.HIGH);check(inflight===loader.cache.get('low-0')&&started.filter(p=>p==='low-0').length===1,'in-flight promotion does not download again');
const critical=loader.load('critical',ASSET_PRIORITY.HIGH);
images.get('low-1').onload();await new Promise(resolve=>setTimeout(resolve,0));
check(started[3]==='critical','critical queued requests precede remaining background work');
for(let step=0;step<10&&loader.jobs.size;step++){
 check(loader.activeJobs.size<=3,'concurrency is global across overlapping preloads');
 for(const job of [...loader.activeJobs])job.image.onload?.();await new Promise(resolve=>setTimeout(resolve,0));
}
await Promise.all([background,promoted,inflight,critical]);check(new Set(started).size===started.length&&started.length===7,'all unique resources are prepared exactly once');
await loader.preload(started);check(started.length===7,'completed cache is reused');check(loader.jobs.size===0&&loader.activeJobs.size===0&&loader.queue.length===0,'completed jobs leave no scheduling references');
console.log(`Final improvement validation passed: ${checks.toLocaleString('en-US')} checks.`);

let holds=0;for(let i=0;i<5000;i++){const data=buildTask("final",new SeededRandom(`DISTRIBUTION-${i}`));holds+=data.action==="HOLD";}assert(holds>3800&&holds<4200,`80/20 distribution: ${holds}/5000 HOLD`);console.log(`Final distribution: ${holds}/5000 HOLD.`);
