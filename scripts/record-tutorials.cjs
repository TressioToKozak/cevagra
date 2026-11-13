// Capture the actual minigames through real browser pointer interactions.
const {chromium}=require('playwright');
const {mkdirSync,rmSync}=require('node:fs');
const path=require('node:path');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8023';
const root=path.resolve(__dirname,'..','work','tutorial-recordings');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});try{
const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin);await page.evaluate(async()=>{
window.qa=(await import('./game.js?v=57')).manager;
window.configs=(await import('./tasks.js?v=52')).GAME_CONFIGS;
window.make=(await import('./tasks.js?v=52')).buildCompetition;
window.RNG=(await import('./rng.js?v=20')).SeededRandom;
await(await import('./asset-loader.js?v=20')).assetLoader.preload((await import('./asset-manifest.js?v=55')).COMPETITION_ASSETS);
const cursor=document.createElement('img');cursor.id='recording-cursor';cursor.src='assets/cursor/pointer.png';Object.assign(cursor.style,{position:'fixed',width:'30px',height:'40px',zIndex:'999999',pointerEvents:'none',left:'-100px',top:'-100px',filter:'drop-shadow(0 2px 3px #000)'});document.body.append(cursor);
window.addEventListener('pointermove',event=>{cursor.style.left=event.clientX+'px';cursor.style.top=event.clientY+'px';});
});
await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
let frame=0,folder;
async function capture(){await page.clock.runFor(125);await page.screenshot({path:path.join(folder,String(frame++).padStart(4,'0')+'.png')});}
async function hold(count=5){for(let i=0;i<count;i++)await capture();}
async function point(selector){const r=await page.locator(selector).first().boundingBox();if(!r)throw Error('Missing '+selector);return{x:r.x+r.width/2,y:r.y+r.height/2};}
async function move(target,count=5){const start=await page.evaluate(()=>{const c=document.getElementById('recording-cursor');return{x:parseFloat(c.style.left)||0,y:parseFloat(c.style.top)||0};});for(let i=1;i<=count;i++){await page.mouse.move(start.x+(target.x-start.x)*i/count,start.y+(target.y-start.y)*i/count);await capture();}}
async function click(selector){const target=await point(selector);await move(target);await page.mouse.down();await capture();await page.mouse.up();await hold(4);}
async function drag(source,target){const start=await point(source);await move(start,4);const live=await point(source);await page.mouse.move(live.x,live.y);await page.mouse.down();await capture();await move(target,9);await page.mouse.up();await hold(6);}
for(const id of ['picking','conveyor','barcode','packing','detective','loading','memory','quality','final'].filter(id=>!process.env.RECORD_GAMES||process.env.RECORD_GAMES.split(',').includes(id))){
folder=path.join(root,id);rmSync(folder,{recursive:true,force:true});mkdirSync(folder,{recursive:true});frame=0;
await page.evaluate(id=>{qa.reset();document.body.classList.remove('menu-active','results-active');qa.gameConfigs=configs;qa.tasks=make('REAL-TUTORIAL-2026',new RNG('REAL-TUTORIAL-2026'));qa.index=configs.findIndex(c=>c.id===id);qa.playerName='HOW TO PLAY';qa.state='countdown';void qa.startGame();},id);
for(let i=0;i<500;i++){if(await page.evaluate(()=>qa.state==='playing'))break;await page.clock.runFor(32);await page.waitForTimeout(10);}
if(await page.evaluate(()=>qa.state)!=='playing')throw Error('Stage did not start: '+id);
await page.evaluate(()=>{qa.active.ctx.finish=()=>{};});await page.mouse.move(680,680);
await hold(id==='memory'?32:6);
if(id==='picking'){
for(let i=0;i<2;i++){const target=await page.evaluate(()=>qa.active.current.target);await click(`[data-sku="${target}"]`);}
}else if(id==='barcode'){
const roll=await point('.seal-roll'),rail=await page.locator('.seal-control').boundingBox();await page.mouse.move(roll.x,rail.y);await page.mouse.down();
for(let i=0;i<110;i++){const target=await page.evaluate(i=>{const a=qa.active,r=a.control.getBoundingClientRect();return {x:r.left+r.width/2,y:r.bottom-(1-Math.max(0,Math.min(1,(i-8)/90)))*r.height,sealed:a.sim.sealed};},i);if(target.sealed)break;await page.mouse.move(roll.x,target.y);await capture();}await page.mouse.up();
}else if(id==='conveyor'){
const carrier=await page.evaluate(()=>qa.active.active.carrier);await drag('[data-moving-box]',await point(`[data-chute="${carrier}"]`));
}else if(id==='packing'){
const placements=await page.evaluate(async()=>{const {packingInventoryLayout}=await import('./minigames.js?v=27');const a=qa.active;const positions=packingInventoryLayout(a.data.boxes,a.data.cols,a.data.rows);return Object.entries(positions).slice(0,2).map(([id,pos])=>{const box=a.data.boxes.find(b=>b.id===id),size=a.boxGeometry(box),cell=document.querySelector(`[data-cell="${pos.x}:${pos.y}"]`).getBoundingClientRect();return{id,x:cell.left+size.width/2,y:cell.top+size.height/2};});});
for(const pos of placements)await drag(`[data-shape="${pos.id}"]`,pos);
}else if(id==='detective'||id==='quality'){
const solution=await page.evaluate(()=>qa.active.data.solution);for(const value of solution)await click(`[data-${id==='detective'?'row':'quality'}="${value}"]`);await click(id==='detective'?'#lock-detective':'#lock-quality');
}else if(id==='loading'){
const solution=await page.evaluate(()=>qa.active.data.solution);for(let i=0;i<2;i++)await drag(`[data-pallet-id="${solution[i]}"]`,await point(`[data-slot="${i}"]`));
}else if(id==='memory'){
const gifts=await page.evaluate(()=>qa.active.data.shipment);for(const gift of gifts)await click(`[data-gift="${gift}"]`);await click('#lock-memory');
}else if(id==='final'){
const data=await page.evaluate(()=>qa.active.data);for(const issue of data.solution)await click(`[data-issue="${issue}"]`);await click(`[data-action="${data.action}"]`);
}
const success=await page.evaluate(id=>{const a=qa.active;return id==='conveyor'?a.index>0:id==='packing'?Object.keys(a.placed).length>=2:id==='loading'?a.slots.filter(Boolean).length>=2:true;},id);if(!success)throw Error('Demonstration did not complete a real interaction: '+id);
await hold(id==='barcode'?2:8);console.log(id+': '+frame+' captured gameplay frames');
}
if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
