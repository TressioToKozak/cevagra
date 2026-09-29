const STORAGE_KEY = "christmas-logistics-leaderboard-v1";

export const normalizeName = (name) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

export class LeaderboardManager {
  read() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return parsed?.version === 1 && Array.isArray(parsed.players) ? parsed : { version: 1, players: [] };
    } catch { return { version: 1, players: [] }; }
  }

  write(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
    catch { return false; }
  }

  saveRun(run) {
    const data = this.read();
    let player = data.players.find((item) => item.normalizedName === run.normalizedName);
    if (!player) {
      player = { name: run.name, normalizedName: run.normalizedName, gamesPlayed: 0, lastPlayed: run.timestamp, runs: [] };
      data.players.push(player);
    }
    player.name = run.name;
    player.gamesPlayed += 1;
    player.lastPlayed = run.timestamp;
    player.runs.push(run);
    player.runs = player.runs.slice(-30);
    this.write(data);
    return this.getLeaderboard();
  }

  getLeaderboard() {
    return this.read().players.map((player) => {
      const best = [...player.runs].sort(LeaderboardManager.compareRuns)[0];
      return { ...best, gamesPlayed: player.gamesPlayed, name: player.name, normalizedName: player.normalizedName };
    }).filter((entry) => entry.score != null).sort(LeaderboardManager.compareRuns);
  }

  getPlayerBest(normalizedName) { return this.getLeaderboard().find((row) => row.normalizedName === normalizedName); }
  getHighScore() { return this.getLeaderboard()[0]?.score || 0; }
  getPlayerHistory(normalizedName) { return this.read().players.find((p) => p.normalizedName === normalizedName)?.runs || []; }
  clearLeaderboard() { try { localStorage.removeItem(STORAGE_KEY); return true; } catch { return false; } }
  static compareRuns(a, b) { return b.score - a.score || b.accuracy - a.accuracy || a.averageResponseTime - b.averageResponseTime; }
}
