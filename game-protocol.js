let visitPromise,visitCheckedAt=0;
export function ensureServerVisit(force=false){if(force)visitPromise=null;if(visitCheckedAt&&Date.now()-visitCheckedAt>60000)visitPromise=null;return visitPromise??=fetch(new URL('api/session',document.baseURI),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error('Session unavailable');visitCheckedAt=Date.now();return true;}).catch(error=>{visitPromise=null;throw error;});}
// Browser feedback is local; the server alone verifies and publishes a ranked run.
export async function createGameProtocol(){
 let available=null;try{const r=await fetch(new URL('api/game/capabilities',document.baseURI),{cache:'no-store',signal:AbortSignal.timeout(1500)});available=r.ok?(await r.json()).protocol===1:([404,405].includes(r.status)?false:null);}catch{}
 const protocol={available,failed:false,game:null,stage:null,queue:Promise.resolve(),ending:Promise.resolve(),generation:0};
 const request=async(path,body)=>{
  const attempts=['events','end','finish'].includes(path)?3:1;
  for(let attempt=0;attempt<attempts;attempt++){
   try{const r=await fetch(new URL('api/game/'+path,document.baseURI),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
    if(!r.ok){const error=Error('Server verification unavailable');error.status=r.status;throw error;}return await r.json();
   }catch(error){const retryable=!error.status||[408,429,500,502,503,504].includes(error.status);error.retryable=retryable;if(!retryable||attempt===attempts-1)throw error;await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));}
  }
 };
 protocol.start=async(name,email)=>{const generation=++protocol.generation;if(protocol.stage)clearTimeout(protocol.stage.timer);protocol.failed=false;protocol.game=null;protocol.stage=null;protocol.queue=Promise.resolve();protocol.ending=Promise.resolve();await ensureServerVisit();const game=await request('start',{name,email});if(generation!==protocol.generation)throw Error('Cancelled session');protocol.game=game;return game;};
 protocol.begin=async id=>{const gameId=protocol.game.id,generation=protocol.generation;await protocol.ending;await protocol.queue;if(protocol.failed)return;const data=await request('stage',{gameId,id});if(generation!==protocol.generation)throw Error('Cancelled session');protocol.stage={nonce:data.nonce,seq:0,events:[],started:performance.now(),closed:false,gameId,inFlight:null};};
 protocol.flush=()=>{
  const stage=protocol.stage;
  if(!stage||protocol.failed||!stage.events.length)return protocol.queue;
  if(stage.inFlight)return stage.inFlight;
  // While an acknowledgement is in flight, keep collecting into one fresh batch.
  const events=stage.events.splice(0,400);
  const pending=protocol.queue.then(async()=>{if(protocol.failed||protocol.game?.id!==stage.gameId)return;const data=await request('events',{gameId:stage.gameId,nonce:stage.nonce,seq:stage.seq+1,events});stage.nonce=data.nonce;stage.seq=data.seq;}).catch(()=>{if(protocol.game?.id===stage.gameId)protocol.failed=true;});
  stage.inFlight=pending;protocol.queue=pending;
  void pending.then(()=>{if(stage.inFlight===pending)stage.inFlight=null;if(protocol.stage===stage&&protocol.game?.id===stage.gameId&&stage.events.length&&!protocol.failed)protocol.flush();});
  return pending;
 };
 protocol.record=event=>{const stage=protocol.stage;if(!stage||stage.closed||protocol.failed)return;const item={...event,at:Math.max(0,performance.now()-stage.started)};stage.events.push(item);if(!stage.timer)stage.timer=setTimeout(()=>{stage.timer=null;protocol.flush();},event.type==='wrap'?200:50);return item.at;};
 protocol.end=()=>{
  const stage=protocol.stage;if(!stage)return Promise.resolve();
  if(stage.ending)return stage.ending;
  stage.ending=(async()=>{
  stage.closed=true;clearTimeout(stage.timer);
  while(!protocol.failed&&protocol.game?.id===stage.gameId&&(stage.events.length||stage.inFlight)){protocol.flush();await protocol.queue;}
  if(protocol.failed||protocol.game?.id!==stage.gameId)return;
  protocol.queue=protocol.queue.then(async()=>{if(protocol.failed||protocol.game?.id!==stage.gameId)return;const data=await request('end',{gameId:stage.gameId,nonce:stage.nonce});return data.result;}).catch(()=>{if(protocol.game?.id===stage.gameId)protocol.failed=true;});
  return protocol.queue;
  })();
  protocol.ending=stage.ending;
  return stage.ending;
 };
 protocol.finish=async()=>{const gameId=protocol.game.id,generation=protocol.generation;await protocol.ending;await protocol.queue;if(protocol.failed||generation!==protocol.generation)throw Error('This run could not be verified');return (await request('finish',{gameId})).run;};
 protocol.abandon=()=>{protocol.generation++;if(protocol.stage){protocol.stage.closed=true;clearTimeout(protocol.stage.timer);}protocol.stage=null;protocol.game=null;protocol.failed=false;};
 return protocol;
}
