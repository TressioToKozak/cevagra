import { TaskGenerator, DifficultyManager, TASK_TYPES, taskIsCorrect } from "./tasks.js";
import { LeaderboardManager, normalizeName } from "./storage.js";

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
