const STORAGE_KEY = "christmas-logistics-leaderboard-v1";

export const normalizeName = (name) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

// Storage is deliberately isolated behind this adapter. A shared competition API can
// implement the same read/write contract without changing leaderboard rules.
export class LocalLeaderboardStore {
  read() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return [1,2].includes(value?.version) && Array.isArray(value.players) ? { ...value, version: 2 } : { version: 2, players: [] };
    } catch { return { version: 2, players: [] }; }
  }
  write(data) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; } catch { return false; } }
  clear() { try { localStorage.removeItem(STORAGE_KEY); return true; } catch { return false; } }
}

export class LeaderboardManager {
  constructor(store = new LocalLeaderboardStore()) { this.store = store; }
  read() { return this.store.read(); }
  saveRun(run) {
    const data=this.read();
    let player=data.players.find(item=>item.normalizedName===run.normalizedName);
    if(!player){player={name:run.name,normalizedName:run.normalizedName,gamesPlayed:0,runs:[]};data.players.push(player);}
    player.name=run.name;player.gamesPlayed++;player.runs.push(run);player.runs=player.runs.slice(-30);
    this.store.write(data);return this.getLeaderboard();
  }
  getLeaderboard(){return this.read().players.map(player=>{const best=[...player.runs].sort(LeaderboardManager.compareRuns)[0];return {...best,name:player.name,normalizedName:player.normalizedName,gamesPlayed:player.gamesPlayed};}).filter(row=>row.score!=null).sort(LeaderboardManager.compareRuns);}
  getHighScore(){return this.getLeaderboard()[0]?.score||0;}
  getPlayerHistory(name){return this.read().players.find(player=>player.normalizedName===name)?.runs||[];}
  clearLeaderboard(){return this.store.clear();}
  static compareRuns(a,b){return b.score-a.score||b.accuracy-a.accuracy||a.mistakes-b.mistakes||String(a.timestamp).localeCompare(String(b.timestamp));}
}

const SETTINGS_KEY = "christmas-logistics-settings-v1";
export class CompetitionSettings {
  constructor(store=globalThis.localStorage){this.store=store;}
  getSeed(){try{return this.store?.getItem(SETTINGS_KEY)||"CEVA-CHRISTMAS-2026";}catch{return "CEVA-CHRISTMAS-2026";}}
  setSeed(seed){const clean=String(seed).trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,40);if(!clean)return false;try{this.store?.setItem(SETTINGS_KEY,clean);return true;}catch{return false;}}
}
export function leaderboardCsv(rows){const quote=value=>`"${String(value??"").replaceAll('"','""')}"`;return ["Rank,Participant,Best score,Accuracy,Date and time",...rows.map((row,index)=>[index+1,row.name,row.score,`${row.accuracy}%`,row.timestamp].map(quote).join(","))].join("\r\n");}
