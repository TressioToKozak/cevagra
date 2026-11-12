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
  const id=globalThis.crypto?.randomUUID?.()||`visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let playMs=0,playing=false,started=null;
  const account=()=>{const now=performance.now();if(started!==null)playMs+=Math.max(0,now-started);started=playing&&!document.hidden?now:null;};
  const flush=()=>{account();const data=read();data.visits[id]=Math.round(playMs);write(data);try{void fetch(new URL('api/statistics',document.baseURI),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,playMs:Math.round(playMs)}),keepalive:true}).catch(()=>{});}catch{}};
  const tracker={setPlaying(value){if(value===playing)return;account();playing=value;started=playing&&!document.hidden?performance.now():null;if(!value)flush();},completed(run){localStatistics([run]);},flush};
  document.addEventListener('visibilitychange',flush);
  window.addEventListener('pagehide',()=>{flush();started=null;});
  window.addEventListener('pageshow',()=>{started=playing&&!document.hidden?performance.now():null;});
  window.addEventListener('online',flush);
  setInterval(flush,15000);flush();return tracker;
}
