import assert from 'node:assert/strict';
import {createGameProtocol} from '../game-protocol.js';
const originalFetch=globalThis.fetch;globalThis.document={baseURI:'https://example.test/'};
const ok=data=>({ok:true,json:async()=>data});
try{
 globalThis.fetch=async()=>{throw new TypeError('Network unavailable');};
 assert.equal((await createGameProtocol()).available,null,'A failed capability probe is not permission to silently switch to local practice');
 globalThis.fetch=async()=>({ok:false,status:503});
 assert.equal((await createGameProtocol()).available,null);
 globalThis.fetch=async()=>({ok:false,status:404});
 assert.equal((await createGameProtocol()).available,false,'Static hosting retains explicit practice');
 const calls={events:[],end:[],finish:[]};let rejectEvents=false;
 globalThis.fetch=async(url,options={})=>{
  const endpoint=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body||'{}');
  if(endpoint==='capabilities')return ok({protocol:1});if(endpoint==='session')return ok({session:true});
  if(endpoint==='start')return ok({id:rejectEvents?'rejected-game':'retry-game'});
  if(endpoint==='stage')return ok({nonce:'initial'});
  calls[endpoint].push(body);
  if(endpoint==='events'){
   if(rejectEvents)return {ok:false,status:400};
   if(calls.events.length===1)throw new TypeError('Lost acknowledgement');
   return ok({nonce:'accepted',seq:1});
  }
  if(endpoint==='end')return calls.end.length===1?{ok:false,status:503}:ok({result:{score:44}});
  if(endpoint==='finish'){
   if(calls.finish.length===1)throw new TypeError('Response lost');
   return calls.finish.length===2?{ok:false,status:503}:ok({run:{id:'retry-game',score:44}});
  }
  throw Error(endpoint);
 };
 const protocol=await createGameProtocol();await protocol.start('QA','qa@example.test');await protocol.begin('picking');protocol.record({type:'pick',sku:'sku'});
 const end=protocol.end(),finished=protocol.finish();assert.deepEqual(await end,{score:44});assert.deepEqual(await finished,{id:'retry-game',score:44});
 assert.equal(protocol.failed,false);assert.equal(calls.events.length,2);assert.equal(calls.end.length,2);assert.equal(calls.finish.length,3);
 for(const bodies of Object.values(calls))assert(bodies.every(body=>JSON.stringify(body)===JSON.stringify(bodies[0])),'Retry keeps the exact original nonce, sequence and event timestamps');
 protocol.abandon();rejectEvents=true;calls.events=[];calls.finish=[];
 await protocol.start('QA','qa@example.test');await protocol.begin('picking');protocol.record({type:'pick',sku:'sku'});await protocol.end();
 assert.equal(calls.events.length,1,'Permanent trace rejection is not retried');assert.equal(protocol.failed,true);await assert.rejects(protocol.finish());assert.equal(calls.finish.length,0,'Rejected traces cannot bypass replay by submitting a final result');protocol.abandon();
 console.log('PASS: bounded identical retries, permanent rejection stops publication, and unavailable backend does not imply practice mode');
}finally{globalThis.fetch=originalFetch;delete globalThis.document;}
