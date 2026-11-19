import assert from 'node:assert/strict';
import {createGameProtocol} from '../game-protocol.js';
const originalFetch=globalThis.fetch;
const requests=[],waiting=[];let nonce='nonce-0',seq=0,active=0,peak=0,endReceived=false;
globalThis.document={baseURI:'https://example.test/'};
const ok=data=>({ok:true,json:async()=>data});
globalThis.fetch=async(url,options={})=>{
 const path=new URL(url).pathname,body=JSON.parse(options.body||'{}');
 if(path==='/api/session')return ok({session:true});
 if(path==='/api/game/capabilities')return ok({protocol:1});
 if(path==='/api/game/start')return ok({id:'game-1'});
 if(path==='/api/game/stage')return ok({nonce});
 if(path==='/api/game/events'){
  active++;peak=Math.max(peak,active);requests.push(body);
  assert.equal(body.nonce,nonce);assert.equal(body.seq,seq+1);assert(body.events.length<=400);
  return new Promise(resolve=>waiting.push(()=>{active--;seq++;nonce='nonce-'+seq;resolve(ok({nonce,seq}));}));
 }
 if(path==='/api/game/end'){assert.equal(body.nonce,nonce);assert.equal(active,0);endReceived=true;return ok({result:{score:37}});}
 if(path==='/api/game/finish'){assert(endReceived,'finish waits for stage end, including its buffered actions');return ok({run:{id:'verified-run'}});}
 throw Error(path);
};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
try{
 const protocol=await createGameProtocol();await protocol.start('QA','qa@example.test');await protocol.begin('picking');
 protocol.record({type:'pick',sku:'0'});protocol.flush();await turn();assert.equal(requests.length,1);
 for(let i=1;i<=950;i++){protocol.record({type:'pick',sku:String(i)});protocol.flush();}
 assert.equal(requests.length,1,'a slow acknowledgement does not enqueue frozen request snapshots');
 const ended=protocol.end(),finished=protocol.finish();assert.equal(protocol.end(),ended,'stage end is idempotent while pending');
 for(let i=0;i<4;i++){assert.equal(waiting.length,1);waiting.shift()();await turn();}
 assert.deepEqual(await ended,{score:37});assert.deepEqual(await finished,{id:'verified-run'});assert.equal(peak,1);assert.equal(requests.length,4);
 assert.deepEqual(requests.flatMap(r=>r.events.map(e=>e.sku)),Array.from({length:951},(_,i)=>String(i)),'coalescing preserves every action in order');
 assert.equal(protocol.failed,false);protocol.abandon();
 console.log('PASS: bounded sequential checkpoint batches, fresh coalescing, all actions retained and end waits for nonce acknowledgements');
}finally{globalThis.fetch=originalFetch;delete globalThis.document;}
