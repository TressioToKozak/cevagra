import { TaskGenerator, DifficultyManager, TASK_TYPES, taskIsCorrect, CARRIERS } from "./tasks.js";
import { LeaderboardManager, normalizeName } from "./storage.js";
import { readFileSync } from "node:fs";

let checks = 0;
const assert = (condition, message) => { checks++; if (!condition) throw new Error(message); };
for (let run = 0; run < 300; run++) {
  const generator = new TaskGenerator();
  for (let round = 1; round <= 12; round++) {
    const d = DifficultyManager.forRound(round);
    for (const type of TASK_TYPES) {
      const task = generator.generate(type, d);
      assert(task.solution.length > 0, `${type} has a solution`);
      assert(new Set(task.solution).size === task.solution.length, `${type} solution is unique`);
      if (task.mode === "order") assert(taskIsCorrect(task, [], task.solution), `${type} validates order`);
      else assert(taskIsCorrect(task, task.solution), `${type} validates selection`);
      assert(!taskIsCorrect(task, [], []), `${type} rejects empty response`);
    }
  }
  const final = generator.generateFinal();
  assert(final.solution.length >= 2 && final.solution.length <= 4, "final has 2–4 issues");
  assert(taskIsCorrect(final, final.solution, [], "HOLD"), "final validates correct hold");
  assert(!taskIsCorrect(final, final.solution, [], "RELEASE"), "final rejects invalid release");
}
console.log(`Procedural validation passed: ${checks.toLocaleString()} checks across 300 simulated runs.`);

assert(DifficultyManager.maximumRunSeconds() < 180, "maximum active game time is under three minutes");
assert([1,2,3].every(round => DifficultyManager.forRound(round).time <= 7), "easy rounds use no more than seven seconds");
assert(DifficultyManager.forRound(12).time <= 12, "hard rounds use no more than twelve seconds");
assert(CARRIERS.join(",") === "DHL,UPS,TNT,TOF,KLG,BRINGCARGO", "only approved carrier names are used");
const source = JSON.stringify(Array.from({length:50},()=>new TaskGenerator().labels(DifficultyManager.forRound(8))));
assert(CARRIERS.some(carrier => source.includes(carrier)), "label tasks use approved carriers");
const html = readFileSync("index.html", "utf8");
const css = readFileSync("styles.css", "utf8");
const gameSource = readFileSync("game.js", "utf8");
assert(!/SOUND ON|SETTINGS/.test(html + gameSource), "sound and settings controls are removed");
assert(css.includes("height:calc(100dvh") && css.includes("max-width:none") && css.includes("overflow:hidden"), "full-screen no-scroll rules are present");
assert(css.includes(".task-instruction{font-size:clamp(20px") && css.includes(".task-head h1{font:800 clamp(10px"), "question is larger than task title");
assert(!/reconciliation|discrepancy|exception|corrective|allocation|investigate|compliance|inconsistency/i.test(html + gameSource + source), "player text avoids difficult terms");

const memory = new Map();
global.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
const board = new LeaderboardManager();
const run = (name, score, accuracy, averageResponseTime) => ({ name, normalizedName: normalizeName(name), score, accuracy, averageResponseTime, correctActions: 10, mistakes: 1, bestStreak: 4, roundsCompleted: 12, timestamp: new Date().toISOString() });
board.saveRun(run("Daniel", 1000, 90, 8));
board.saveRun(run("DANIEL", 1200, 80, 9));
board.saveRun(run("Alex", 1200, 90, 10));
board.saveRun(run("Marta", 1200, 90, 7));
assert(board.getLeaderboard().length === 3, "repeated normalized player is deduplicated");
assert(board.getLeaderboard()[0].name === "Marta", "leaderboard applies score, accuracy, then time tie breakers");
assert(board.getPlayerHistory("daniel").length === 2, "run history is retained");
board.clearLeaderboard();
assert(board.getLeaderboard().length === 0, "leaderboard reset clears data");
console.log("Storage validation passed: normalization, best-run selection, tie breakers, history, and reset.");
