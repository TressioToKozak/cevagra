const assert=require('node:assert/strict');
(async()=>{const originalFetch=global.fetch;let calls=0,release;global.document={baseURI:'https://example.com/'};global.fetch=()=>{calls++;return new Promise(resolve=>release=resolve);};try{const {ensureServerVisit}=await import('../game-protocol.js');const first=ensureServerVisit(),second=ensureServerVisit();assert.equal(first,second,'concurrent startup shares the pending visitor request');assert.equal(calls,1);release({ok:true});await Promise.all([first,second]);assert.equal(await ensureServerVisit(),true);assert.equal(calls,1);console.log('PASS: concurrent startup creates one visitor session request');}finally{global.fetch=originalFetch;delete global.document;}})().catch(e=>{console.error(e);process.exitCode=1;});
(async()=>{const {plan,replay}=await import('../game-verifier.mjs'),{SealSimulation}=await import('../sealing.js'),{packingInventoryLayout}=await import('../minigames.js');const game=plan('SERVER-PROOF');
 for(const config of game.configs){const t=game.tasks[config.id];let elapsed=2,events=[];
 if(config.id==='picking')events=t.rounds.map((r,i)=>({type:'pick',sku:r.target,at:(i+1)*100}));
 if(config.id==='conveyor')events=t.parcels.map((r,i)=>({type:'sort',id:r.id,carrier:r.carrier,at:(i+1)*100}));
 if(config.id==='packing'){const layout=packingInventoryLayout(t.boxes);events=t.boxes.map((b,i)=>({type:'place',id:b.id,...layout[b.id],at:(i+1)*100}));}
 if(config.id==='loading'){events=t.solution.map((id,index)=>({type:'load',id,index,at:(index+1)*100}));events.push({type:'submit',at:1000});}
 if(['detective','quality','memory','final'].includes(config.id)){const solution=config.id==='memory'?t.shipment:t.solution;const start=config.id==='memory'?4100:100;events=solution.map((value,i)=>({type:'toggle',value,at:start+i*40}));events.push({type:'submit',...(config.id==='final'?{action:t.action}:{}),at:start+500});elapsed=config.id==='memory'?5:2;}
 if(config.id==='barcode'){const sim=new SealSimulation();for(let i=0;i<900&&!sim.sealed;i++){sim.y=sim.target;sim.hold(true);sim.step(1/60);events.push({type:'wrap',y:sim.y,holding:true,dt:1/60,at:(i+1)*1000/60});}elapsed=events.at(-1).at/1000;}
 const r=replay({config,task:t,events,elapsed});assert.equal(r.score,config.id==='final'?188:100,config.id+' perfect legal trace');assert.equal(r.mistakes,0,config.id+' legal trace mistakes');
 if(events.length){assert.throws(()=>replay({config,task:t,events:[{...events[0],at:999999}],elapsed}),/time/);}
 console.log(config.id+': authoritative replay grades a legal perfect trace');
 }
 const picking=game.configs.find(c=>c.id==='picking'),task=game.tasks.picking;
 assert.throws(()=>replay({config:picking,task,events:[{type:'pick',sku:'FORGED',at:100}],elapsed:15}),/pick/);
 assert.throws(()=>replay({config:game.configs.find(c=>c.id==='memory'),task:game.tasks.memory,events:[{type:'toggle',value:game.tasks.memory.shipment[0],at:1}],elapsed:15}),/Memory/);
 assert.throws(()=>replay({config:game.configs.find(c=>c.id==='barcode'),task:game.tasks.barcode,events:[{type:'wrap',dt:.05,y:.5,holding:true,at:0},{type:'wrap',dt:.05,y:.5,holding:true,at:0},{type:'wrap',dt:.05,y:.5,holding:true,at:0}],elapsed:15}),/duration/);
 console.log('PASS: legal replays for all nine games and invalid tasks, phases, timestamps and film duration rejected');
})().catch(e=>{console.error(e);process.exitCode=1;});
