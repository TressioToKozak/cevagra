import { createRunId } from "./rng.js?v=16";
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
export function leaderboardCsv(rows){const quote=value=>`"${String(value??"").replaceAll('"','""')}"`;return ["Run ID,Rank,Participant,Score,Accuracy,Date and time,Run seed,Event ID,Mistakes",...rows.map((row,index)=>[row.id,index+1,row.name,row.score,`${row.accuracy}%`,row.timestamp,row.runSeed||row.competitionSeed,row.eventId,row.mistakes].map(quote).join(","))].join("\r\n");}
