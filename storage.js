import { createRunId } from "./rng.js?v=20";
const STORAGE_KEY = "christmas-logistics-leaderboard-v1";
const legacyRunId=(playerIndex,runIndex,timestamp)=>`legacy-${playerIndex+1}-${runIndex+1}-${String(timestamp||"unknown")}`;
const newRunId=createRunId;

export const normalizeName = (name) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

// This adapter stores results only in this browser. Original storage keys stay intact.
export class LocalLeaderboardStore {
  read() {
    this.error=null;try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if(value?.version===3&&Array.isArray(value.runs))return {version:3,runs:value.runs.map((run,index)=>({...run,id:run.id||legacyRunId(0,index,run.timestamp)}))};
      if([1,2].includes(value?.version)&&Array.isArray(value.players))return {version:3,runs:value.players.flatMap((player,playerIndex)=>(player.runs||[]).map((run,runIndex)=>({...run,id:run.id||legacyRunId(playerIndex,runIndex,run.timestamp),name:run.name||player.name,normalizedName:run.normalizedName||player.normalizedName||normalizeName(player.name||"")})))};
      if(value!==null)throw new Error("Unrecognized saved leaderboard format");
      return {version:3,runs:[]};
    } catch(error) { this.error=error;return {version:3,runs:[]}; }
  }
  write(data) { if(this.error)return false;try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; } catch { return false; } }
  clear() { try { localStorage.removeItem(STORAGE_KEY); return true; } catch { return false; } }
}

// Keep the synchronous local API: SQL synchronization never blocks a screen.
export class SqlLeaderboardStore extends LocalLeaderboardStore {
  constructor(){super();this.revision=0;this.remote=[];this.deleted=new Set();this.acknowledged=new Set();this.syncing=null;this.onchange=()=>{};}
  read(){const local=super.read();const rows=new Map(this.remote.map(run=>[run.id,run]));for(const run of local.runs)rows.set(run.id,run);return {version:3,runs:[...rows.values()].filter(run=>!this.deleted.has(run.id))};}
  write(data){const saved=super.write(data);this.pending=data.runs;this.revision++;void this.sync();return saved;}
  clear(){this.pending=[];return super.clear();}
  async request(options){const response=await fetch(new URL("api/leaderboard",document.baseURI),{...options,signal:AbortSignal.timeout(5000),cache:"no-store"});if(!response.ok)throw new Error("Leaderboard unavailable");return response.json();}
  sync(){
    if(this.syncing)return this.syncing;
    const revision=this.revision;
    this.syncing=(async()=>{
      try{
        // Retry locally retained runs using stable IDs; SQL ignores duplicates.
        let pending;
        while((pending=(this.pending||super.read().runs).filter(run=>!this.acknowledged.has(run.id))).length){
          const batch=pending.slice(0,100);
          const result=await this.request({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runs:batch})});
          if(!Array.isArray(result.saved)||!batch.every(run=>result.saved.includes(run.id)))throw new Error("Incomplete save");
          for(const id of result.saved)this.acknowledged.add(id);
        }
        const result=await this.request();
        if(!Array.isArray(result.runs))throw new Error("Invalid leaderboard");
        this.deleted=new Set(result.deleted||[]);for(const id of this.deleted)this.acknowledged.add(id);
        this.remote=result.runs;this.onchange();
      }catch{/* Local results remain available; retry on next save/open/online. */}
    })().finally(()=>{this.syncing=null;if(this.revision!==revision)void this.sync();});
    return this.syncing;
  }
}

export class LeaderboardManager {
  constructor(store = new LocalLeaderboardStore()) { this.store = store;this.unsaved=new Map();this.lastSaveSucceeded=true; }
  read() { const data=this.store.read();return {...data,runs:[...data.runs,...[...this.unsaved.values()].filter(run=>!data.runs.some(saved=>saved.id===run.id))]}; }
  saveRun(run) {
    const data=this.read();
    run.id ||= newRunId();while(data.runs.some(saved=>saved.id===run.id))run.id=newRunId();
    run.timestamp ||= new Date().toISOString();data.runs.push({...run});
    this.lastSaveSucceeded=this.store.write(data)!==false;
    if(this.lastSaveSucceeded)this.unsaved.clear();else this.unsaved.set(run.id,{...run});
    return this.getLeaderboard();
  }
  getLeaderboard(){return this.read().runs.filter(row=>row.score!=null).sort(LeaderboardManager.compareRuns);}
  getHighScore(){return this.getLeaderboard()[0]?.score||0;}
  getPlayerHistory(name){return this.read().runs.filter(run=>run.normalizedName===name);}
  clearLeaderboard(){const cleared=this.store.clear();if(cleared!==false)this.unsaved.clear();return cleared;}
  static compareRuns(a,b){return b.score-a.score||b.accuracy-a.accuracy||a.mistakes-b.mistakes||String(a.timestamp).localeCompare(String(b.timestamp))||String(a.id).localeCompare(String(b.id));}
}

const SETTINGS_KEY = "christmas-logistics-settings-v1";
export class CompetitionSettings {
  constructor(store){if(store!==undefined)this.store=store;else try{this.store=globalThis.localStorage;}catch{this.store=null;}}
  getEventId(){try{return this.store?.getItem(SETTINGS_KEY)||"CEVA-CHRISTMAS-2026";}catch{return "CEVA-CHRISTMAS-2026";}}
  setEventId(seed){const clean=String(seed).trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,40);if(!clean||!this.store)return false;try{this.store.setItem(SETTINGS_KEY,clean);return true;}catch{return false;}}
  getSeed(){return this.getEventId();}
  setSeed(seed){return this.setEventId(seed);}

}
export function leaderboardCsv(rows){const quote=value=>`"${String(value??"").replaceAll('"','""')}"`;return ["Run ID,Rank,Participant,Score,Accuracy,Date and time,Run seed,Event ID,Mistakes,Email",...rows.map((row,index)=>[row.id,index+1,row.name,row.score,`${row.accuracy}%`,row.timestamp,row.runSeed||row.competitionSeed,row.eventId,row.mistakes,row.email].map(quote).join(","))].join("\r\n");}
