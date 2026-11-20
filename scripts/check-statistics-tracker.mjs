import assert from 'node:assert/strict';
const original={fetch:globalThis.fetch,document:globalThis.document,window:globalThis.window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator'),setInterval:globalThis.setInterval};
const listeners={},beacons=[],bodies=[];let sessions=0,failSession=true,failStats=false,expired=false,active=0,peak=0,release;
globalThis.document={baseURI:'https://example.test/',hidden:false,addEventListener:(name,fn)=>listeners[name]=fn};
globalThis.window={addEventListener:(name,fn)=>listeners[name]=fn};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{sendBeacon:(url,blob)=>{beacons.push(blob);return true;}}});
globalThis.setInterval=()=>0;
globalThis.fetch=async(url,options)=>{
 if(new URL(url).pathname==='/api/session'){sessions++;if(failSession){failSession=false;throw Error('First visit failed');}return {ok:true};}
 active++;peak=Math.max(peak,active);bodies.push(JSON.parse(options.body));
 try{if(release!==undefined)await new Promise(resolve=>release=resolve);if(expired){expired=false;return {ok:false,status:401};}if(failStats){failStats=false;return {ok:false,status:503};}return {ok:true,status:200};}finally{active--;}
};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
try{
 const {createGameAnalytics}=await import('../analytics.js');const tracker=createGameAnalytics();await turn();await turn();
 assert.equal(sessions,1);assert.equal(bodies.length,0);
 await listeners.online();assert.equal(sessions,2);assert.equal(bodies.length,1,'Online retries after a failed initial visitor request');
 failStats=true;await tracker.flush();await tracker.flush();assert.equal(bodies.length,3,'Non-OK HTTP responses do not disable subsequent statistics');
 expired=true;await tracker.flush();assert.equal(sessions,3,'An expired visitor triggers server session recovery');
 release=null;const pending=tracker.flush();await turn();tracker.setPlaying(true);document.hidden=true;tracker.setPlaying(false);const unblock=release;release=undefined;unblock();await pending;
 assert.equal(peak,1,'Heartbeat requests are serialized');assert.equal(bodies.at(-1).visible,false,'The latest hidden state follows any earlier request');
 listeners.pagehide();assert.deepEqual(JSON.parse(await beacons[0].text()),{visible:false});
 assert(bodies.every(body=>Object.keys(body).join(',')==='visible'),'No browser IDs or play duration are sent');
 console.log('PASS: initial-session recovery, HTTP failure recovery, 401 session renewal, serialized visibility updates and final hidden beacon');
}finally{for(const key of ['fetch','document','window','setInterval']){if(original[key]===undefined)delete globalThis[key];else globalThis[key]=original[key];}if(original.navigator)Object.defineProperty(globalThis,'navigator',original.navigator);else delete globalThis.navigator;}
