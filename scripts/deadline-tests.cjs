const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});try{
 const p=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(process.env.TEST_ORIGIN||'http://127.0.0.1:8002/');await p.evaluate(async()=>{
  window.qa=(await import('./game.js?v=23')).manager;
  const {assetLoader}=await import('./asset-loader.js?v=20');await assetLoader.preload((await import('./asset-manifest.js?v=20')).COMPETITION_ASSETS);
  window.testNow=1000;Object.defineProperty(performance,'now',{configurable:true,value:()=>testNow});
  window.setup=async id=>{const {GAME_CONFIGS,buildCompetition}=await import('./tasks.js?v=20'),{SeededRandom}=await import('./rng.js?v=20');qa.reset();document.body.classList.remove('menu-active','results-active');qa.playerName='DEADLINE QA';qa.runId=crypto.randomUUID();qa.runSeed='DEADLINE';qa.gameConfigs=GAME_CONFIGS;qa.tasks=buildCompetition('DEADLINE',new SeededRandom('DEADLINE'));qa.index=GAME_CONFIGS.findIndex(c=>c.id===id);qa.state='countdown';await qa.startGame();clearInterval(qa.timer);qa.timer=null;if(id==='conveyor')cancelAnimationFrame(qa.active.raf);if(id==='memory')qa.active.hide();window.stage=qa.active;window.oldToken=qa.stageToken;};
  window.snapshot=()=>JSON.stringify({score:stage.score(),correct:stage.correct,mistakes:stage.mistakes,index:stage.index,selected:stage.selected instanceof Set?[...stage.selected]:stage.selected,placed:stage.placed,cells:stage.cells,slots:stage.slots,action:stage.action,locked:stage.locked,disabled:[...stage.root.querySelectorAll('button')].map(n=>n.disabled),pressed:[...stage.root.querySelectorAll('[aria-pressed]')].map(n=>n.getAttribute('aria-pressed'))});
  window.drag=(node,x,y,release=true)=>{node.setPointerCapture=()=>{};node.releasePointerCapture=()=>{};const r=node.getBoundingClientRect();node.dispatchEvent(new PointerEvent('pointerdown',{pointerId:91,button:0,clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true,cancelable:true}));node.dispatchEvent(new PointerEvent('pointermove',{pointerId:91,clientX:x,clientY:y,bubbles:true,cancelable:true}));if(release)node.dispatchEvent(new PointerEvent('pointerup',{pointerId:91,clientX:x,clientY:y,bubbles:true,cancelable:true}));return node;};
  window.act=id=>{const a=stage,r=a.root;
   if(id==='picking'||id==='barcode'){r.querySelector(`[data-sku="${a.current.target}"]`).click();return;}
   if(id==='conveyor'){const z=r.querySelector(`[data-chute="${a.active.carrier}"]`).getBoundingClientRect();drag(a.box,z.left+z.width/2,z.top+z.height/2);return;}
   if(id==='packing'){a.syncGeometry();const box=a.data.boxes[0],n=r.querySelector(`[data-shape="${box.id}"]`),g=a.packingGrid,size=a.boxGeometry(box);drag(n,g.left+size.width/2,g.top+size.height/2);return;}
   if(id==='loading'){r.querySelector('[data-pallet-id]').click();r.querySelector('[data-slot="0"]').click();return;}
   r.querySelector(({detective:'[data-row]',memory:'[data-gift]',quality:'[data-quality]',final:'[data-issue]'})[id]).click();
  };
 });
 const ids=['picking','conveyor','barcode','packing','detective','loading','memory','quality','final'];
 for(const id of ids){
  for(const offset of [-1,0,1]){
   const result=await p.evaluate(async({id,offset})=>{await setup(id);testNow=qa.guard.deadline+offset;const before=snapshot();for(let i=0;i<(offset<0?1:10);i++)act(id);return {before,after:snapshot(),results:qa.results.length,ghosts:document.querySelectorAll('.drag-ghost').length};},{id,offset});
   if(offset<0)assert.notEqual(result.after,result.before,`${id}: action one ms before deadline accepted`);else assert.equal(result.after,result.before,`${id}: deadline/+1 action ignored before interval`);
   assert.equal(result.results,0);assert.equal(result.ghosts,0);
  }
  // Submission controls must obey the same gate, without locking answers late.
  const submission=({detective:'#lock-detective',memory:'#lock-memory',quality:'#lock-quality',loading:'#lock-loading',final:'[data-action]'})[id];
  if(submission)await p.evaluate(async({id,submission})=>{await setup(id);testNow=qa.guard.deadline;if(id==='loading')document.querySelector(submission).disabled=false;const before=snapshot();for(let i=0;i<10;i++)document.querySelector(submission).click();if(snapshot()!==before||qa.results.length)throw Error(id+' late submission changed state');},{id,submission});
  // Expiration, stale callbacks and repeated completion never append twice.
  await p.evaluate(async id=>{await setup(id);testNow=qa.guard.deadline+1;const oldNode=stage.root.querySelector('button'),expiredToken=oldToken;act(id);qa.completeGame(oldToken);const count=qa.results.length,total=JSON.stringify(qa.scores);for(let i=0;i<10;i++){oldNode?.click();qa.completeGame(oldToken);}if(count!==1||qa.results.length!==1||JSON.stringify(qa.scores)!==total)throw Error(id+' duplicate completion');if(document.querySelector('.drag-ghost,.drop-ready,.drag-source'))throw Error('unclean drag');await setup(id);const before=snapshot();oldNode?.click();qa.completeGame(expiredToken);if(snapshot()!==before||qa.results.length)throw Error(id+' stale input');},id);
  console.log(id+': before/exact/after deadline, late submissions, repeated completion and stale input passed.');
 }
 for(const id of ['conveyor','packing','loading'])for(const kind of ['pointerup','pointercancel','lostpointercapture']){
  await p.evaluate(async({id,kind})=>{await setup(id);const a=stage,r=a.root;let n,x,y;if(id==='conveyor'){n=a.box;const z=r.querySelector(`[data-chute="${a.active.carrier}"]`).getBoundingClientRect();x=z.left+z.width/2;y=z.top+z.height/2;}else if(id==='loading'){n=r.querySelector('[data-pallet-id]');const z=r.querySelector('[data-slot="0"]').getBoundingClientRect();x=z.left+z.width/2;y=z.top+z.height/2;}else{a.syncGeometry();const b=a.data.boxes[0],g=a.packingGrid,s=a.boxGeometry(b);n=r.querySelector(`[data-shape="${b.id}"]`);x=g.left+s.width/2;y=g.top+s.height/2;}
   testNow=qa.guard.deadline-1;drag(n,x,y,false);const before=snapshot();testNow=qa.guard.deadline;n.dispatchEvent(new PointerEvent(kind,{pointerId:91,clientX:x,clientY:y,bubbles:true,cancelable:true}));if(snapshot()!==before)throw Error(id+' late '+kind+' changed board/score');if(document.querySelector('.drag-ghost,.drop-ready,.drag-source,.preview-edge,.source-slot'))throw Error(id+' late drag not cleaned');qa.completeGame(oldToken);if(qa.results.length!==1)throw Error('missing timeout result');
  },{id,kind});
 }
 // Last correct answer and timeout race in both orders, with no extra result.
 for(const expired of [false,true])await p.evaluate(async expired=>{await setup('picking');stage.index=stage.data.rounds.length-1;stage.correct=stage.index;stage.draw();testNow=qa.guard.deadline+(expired?0:-1);const n=stage.root.querySelector(`[data-sku="${stage.current.target}"]`),before=stage.correct;n.click();qa.completeGame(oldToken);qa.completeGame(oldToken);if(qa.results.length!==1||stage.correct!==before+(expired?0:1)||qa.results[0].score>qa.gameConfigs[qa.index].max)throw Error('last answer timeout race');},expired);
 assert.deepEqual(errors,[]);console.log('Late drop/cancellation cleanup in all three drag games and last-answer/timeout races passed.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
