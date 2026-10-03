const STORAGE_KEY = "christmas-logistics-leaderboard-v1";
const legacyRunId=(playerIndex,runIndex,timestamp)=>`legacy-${playerIndex+1}-${runIndex+1}-${String(timestamp||"unknown")}`;
const newRunId=()=>globalThis.crypto?.randomUUID?.()||`run-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const normalizeName = (name) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

// Storage is deliberately isolated behind this adapter. A shared competition API can
// implement the same read/write contract without changing leaderboard rules.
export class LocalLeaderboardStore {
  read() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if(value?.version===3&&Array.isArray(value.runs))return {version:3,runs:value.runs.map((run,index)=>({...run,id:run.id||legacyRunId(0,index,run.timestamp)}))};
      if([1,2].includes(value?.version)&&Array.isArray(value.players))return {version:3,runs:value.players.flatMap((player,playerIndex)=>(player.runs||[]).map((run,runIndex)=>({...run,id:run.id||legacyRunId(playerIndex,runIndex,run.timestamp),name:run.name||player.name,normalizedName:run.normalizedName||player.normalizedName||normalizeName(player.name||"")})))};
      return {version:3,runs:[]};
    } catch { return {version:3,runs:[]}; }
  }
  write(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; } catch { return false; } }
  clear() { try { localStorage.removeItem(STORAGE_KEY); return true; } catch { return false; } }
}

export class LeaderboardManager {
  constructor(store = new LocalLeaderboardStore()) { this.store = store; }
  read() { return this.store.read(); }
  saveRun(run) {
    const data=this.read();
    run.id ||= newRunId();data.runs.push({...run});
    this.store.write(data);return this.getLeaderboard();
  }
  getLeaderboard(){return this.read().runs.filter(row=>row.score!=null).sort(LeaderboardManager.compareRuns);}
  getHighScore(){return this.getLeaderboard()[0]?.score||0;}
  getPlayerHistory(name){return this.read().runs.filter(run=>run.normalizedName===name);}
  clearLeaderboard(){return this.store.clear();}
  static compareRuns(a,b){return b.score-a.score||b.accuracy-a.accuracy||a.mistakes-b.mistakes||String(a.timestamp).localeCompare(String(b.timestamp));}
}

const SETTINGS_KEY = "christmas-logistics-settings-v1";
export class CompetitionSettings {
  constructor(store=globalThis.localStorage){this.store=store;}
  getSeed(){try{return this.store?.getItem(SETTINGS_KEY)||"CEVA-CHRISTMAS-2026";}catch{return "CEVA-CHRISTMAS-2026";}}
  setSeed(seed){const clean=String(seed).trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,40);if(!clean)return false;try{this.store?.setItem(SETTINGS_KEY,clean);return true;}catch{return false;}}
}
export function leaderboardCsv(rows){const quote=value=>`"${String(value??"").replaceAll('"','""')}"`;return ["Run ID,Rank,Participant,Score,Accuracy,Date and time",...rows.map((row,index)=>[row.id,index+1,row.name,row.score,`${row.accuracy}%`,row.timestamp].map(quote).join(","))].join("\r\n");}
