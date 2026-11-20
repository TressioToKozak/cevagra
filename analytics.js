import {ensureServerVisit} from './game-protocol.js?v=73';
// Statistics use separate storage, so deleting leaderboard results keeps the totals.
const KEY='ceva-competition-statistics-v1';
function read(){try{const d=JSON.parse(localStorage.getItem(KEY));if(d&&typeof d.visits==='object'&&d.visits&&Array.isArray(d.runs))return d;}catch{}return {since:new Date().toISOString(),visits:{},runs:[]};}
function write(data){try{localStorage.setItem(KEY,JSON.stringify(data));}catch{}}
export function localStatistics(rows=[]){
  const data=read(),runs=new Map(data.runs.map(run=>[run.id,run]));
  for(const run of rows)if(run.id&&!runs.has(run.id))runs.set(run.id,{id:run.id,name:run.name,email:run.email||''});
  data.runs=[...runs.values()];write(data);
  const players=new Map();for(const run of data.runs){const key=(run.email||run.name||'').trim().toLowerCase();if(!key)continue;const player=players.get(key)||{name:run.name,email:run.email,count:0};player.count++;players.set(key,player);}
  return {visits:Object.keys(data.visits).length,playMs:Object.values(data.visits).reduce((sum,value)=>sum+value,0),games:data.runs.length,topPlayer:[...players.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))[0]||null,since:data.since};
}
export function createGameAnalytics(){
  let playing=false,inFlight=null,pending=false;
  const send=async()=>{
    while(pending){
      pending=false;
      const visible=playing&&!document.hidden;
      try{
        // A failed first request must not permanently disable this tracker.
        await ensureServerVisit();
        const post=()=>fetch(new URL('api/statistics',document.baseURI),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visible}),keepalive:true,signal:AbortSignal.timeout(5000)});
        let response=await post();
        if(response.status===401){await ensureServerVisit(true);response=await post();}
        if(!response.ok)throw Error('Statistics unavailable');
      }catch{break;} // Next heartbeat / online event retries with the current state.
    }
  };
  const flush=()=>{pending=true;if(!inFlight){inFlight=send().finally(()=>{inFlight=null;if(pending)flush();});}return inFlight;};
  const tracker={setPlaying(value){playing=value;flush();},completed(){},flush};
  document.addEventListener('visibilitychange',flush);
  window.addEventListener('pagehide',()=>{
    playing=false;
    // Start the final keepalive synchronously; late older heartbeats are ignored server-side.
    if(navigator.sendBeacon){navigator.sendBeacon(new URL('api/statistics',document.baseURI),new Blob([JSON.stringify({visible:false})],{type:'application/json'}));}
    else flush();
  });
  window.addEventListener('online',flush);setInterval(flush,10000);flush();return tracker;
}
