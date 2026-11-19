// Private server worker: generates tasks and replays legal actions, never client scores.
import fs from 'node:fs';
import {GAME_CONFIGS,buildGameOrder,buildCompetition} from './tasks.js';
import {SeededRandom} from './rng.js';
import {scoreStandard,scoreClassification,scoreSpeedPicking} from './scoring.js';
import {SealSimulation} from './sealing.js';
const fail=message=>{throw Error(message);};
const unique=(items,options)=>Array.isArray(items)&&new Set(items).size===items.length&&items.every(x=>options.includes(x));
export function plan(seed){const rng=new SeededRandom(seed);return {seed,configs:buildGameOrder(rng.fork('game-order')),tasks:buildCompetition(seed,rng)};}
export function replay({config,task,events,elapsed}){
 if(!config||!task||!Array.isArray(events)||events.length>6000||!Number.isFinite(elapsed)||elapsed<0||elapsed>config.time+.8)fail('Invalid stage');
 let last=0;for(const e of events){if(!e||!Number.isFinite(e.at)||e.at<last||e.at<0||e.at>Math.min(config.time*1000+100,elapsed*1000+150))fail('Invalid action time');last=e.at;}
 const remaining=Math.max(0,config.time-elapsed),timing={timeRemaining:remaining,timeLimit:config.time};let correct=0,mistakes=0,attempts=0,score=0,complete=false;
 const id=config.id,selected=new Set();let action=null;
 if(id==='picking'){
  let index=0;const cooldown=new Map();for(const e of events){if(e.type!=='pick'||index>=task.rounds.length||!task.rounds[index].options.includes(e.sku))fail('Invalid pick');if((cooldown.get(e.sku)||0)>e.at)fail('Pick cooldown');if(e.sku===task.rounds[index].target){correct++;index++;cooldown.clear();}else{mistakes++;cooldown.set(e.sku,e.at+250);}}
  complete=correct===task.rounds.length;score=scoreSpeedPicking({correct,total:task.rounds.length,mistakes,...timing});attempts=task.rounds.length+mistakes;mistakes+=task.rounds.length-correct;
 }else if(id==='conveyor'){
  let index=0;for(const e of events){const item=task.parcels[index];if(!item||!['sort','miss'].includes(e.type)||e.id!==item.id)fail('Invalid parcel order');if(e.type==='sort'&&!task.carriers.includes(e.carrier))fail('Invalid chute');if(e.type==='sort'&&e.carrier===item.carrier)correct++;else mistakes++;index++;}
  complete=index===task.parcels.length;score=scoreStandard({correct,total:task.parcels.length,mistakes,completed:correct===task.parcels.length,...timing});attempts=task.parcels.length;mistakes+=task.parcels.length-index;
 }else if(id==='packing'){
  const cells=Array.from({length:task.rows},()=>Array(task.cols).fill(null)),placed=new Set();let occupied=0;
  for(const e of events){const box=task.boxes.find(b=>b.id===e.id);if(e.type!=='place'||!box||placed.has(e.id)||!Number.isInteger(e.x)||!Number.isInteger(e.y)||Math.abs(e.x)>20||Math.abs(e.y)>20)fail('Invalid placement');
   const valid=e.x>=0&&e.y>=0&&e.x+box.w<=task.cols&&e.y+box.h<=task.rows&&Array.from({length:box.h},(_,dy)=>Array.from({length:box.w},(_,dx)=>cells[e.y+dy][e.x+dx])).flat().every(x=>!x);
   if(!valid){mistakes++;continue;}placed.add(e.id);for(let dy=0;dy<box.h;dy++)for(let dx=0;dx<box.w;dx++)cells[e.y+dy][e.x+dx]=e.id;occupied+=box.w*box.h;
  }
  correct=placed.size;complete=correct===task.boxes.length;score=scoreStandard({correct:occupied,total:task.boxes.reduce((n,b)=>n+b.w*b.h,0),mistakes,completed:complete,...timing});attempts=task.boxes.length+mistakes;mistakes+=task.boxes.length-correct;
 }else if(id==='loading'){
  const slots=Array(task.solution.length).fill(null);for(const e of events){if(e.type==='submit'){if(slots.some(x=>!x)||e!==events.at(-1))fail('Incomplete load');complete=true;continue;}if(e.type!=='load'||!task.pallets.some(p=>p.id===e.id)||!Number.isInteger(e.index)||e.index<0||e.index>=slots.length)fail('Invalid loading move');const source=slots.indexOf(e.id),occupant=slots[e.index];if(source===e.index)continue;if(source>=0)slots[source]=null;if(occupant&&source>=0)slots[source]=occupant;slots[e.index]=e.id;}
  correct=slots.filter((x,i)=>x===task.solution[i]).length;attempts=slots.length;mistakes=attempts-correct;score=scoreStandard({correct,total:attempts,mistakes:0,completed:correct===attempts,...timing});
 }else if(['detective','quality','memory','final'].includes(id)){
  const options=id==='detective'?task.rows.map(x=>x.id):id==='quality'?task.parcels.map(x=>x.id):task.options;
  for(const e of events){if(id==='memory'&&e.at<3950)fail('Memory phase not finished');if(e.type==='toggle'){if(!options.includes(e.value))fail('Unknown selection');selected.has(e.value)?selected.delete(e.value):selected.add(e.value);}else if(e.type==='submit'){if(e!==events.at(-1))fail('Action after submission');if(id==='final'&&!['HOLD','RELEASE'].includes(e.action))fail('Invalid dispatch');action=e.action||null;complete=true;}else fail('Unknown action');}
  const solution=id==='memory'?task.shipment:task.solution;correct=options.filter(x=>selected.has(x)===solution.includes(x)).length;attempts=options.length;mistakes=attempts-correct;
  score=scoreClassification({selected:[...selected],solution,universe:options,...timing});
  if(id==='final'){const base=solution.length?scoreClassification({selected:[...selected],solution,universe:options,timeRemaining:config.time,timeLimit:config.time,max:150}):scoreStandard({correct:selected.size===0?1:0,total:1,mistakes:selected.size,completed:selected.size===0,timeRemaining:config.time,timeLimit:config.time,max:150});score=!solution.length&&action===null?0:Math.round((base+(action===task.action?50:0))*(.25+.75*remaining/config.time));correct+=action===task.action?1:0;mistakes+=action===task.action?0:1;attempts++;}
 }else if(id==='barcode'){
  const sim=new SealSimulation();let consumed=0;for(const e of events){if(e.type!=='wrap'||!Number.isFinite(e.y)||Math.abs(e.y)>3||typeof e.holding!=='boolean'||!Number.isFinite(e.dt)||e.dt<=0||e.dt>.050001)fail('Invalid film sample');consumed+=e.dt;if(consumed>e.at/1000+.075)fail('Impossible film duration');sim.y=e.y;sim.hold(e.holding);sim.step(e.dt);}
  if(consumed>elapsed+.1)fail('Film time exceeds server time');score=sim.score;complete=sim.sealed;correct=Math.round(sim.coverage*24);mistakes=sim.breaks+Math.floor(sim.outside)+Math.floor(sim.waste);attempts=correct+mistakes;
 }else fail('Unknown game');
 if(!complete&&elapsed<config.time-.15)fail('Premature completion');
 return {id,name:config.name,max:config.max,score:Math.max(0,Math.min(config.max,score)),correct,mistakes,attempts};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){try{const input=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(input.op==='plan'?plan(input.seed):replay(input)));}catch(e){console.error(e.message);process.exitCode=1;}}
