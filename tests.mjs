import { TaskGenerator, DifficultyManager, TaskTimer, TASK_TYPES, taskIsCorrect, CARRIERS } from "./tasks.js";
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
      assert(task.difficulty.time >= 5 && task.difficulty.time <= 14, `${type} has a safe complexity timer`);
    }
  }
  const final = generator.generateFinal();
  assert(final.solution.length >= 2 && final.solution.length <= 4, "final has 2–4 issues");
  assert(taskIsCorrect(final, final.solution, [], "HOLD"), "final validates correct hold");
  assert(!taskIsCorrect(final, final.solution, [], "RELEASE"), "final rejects invalid release");
}
console.log(`Procedural validation passed: ${checks.toLocaleString()} checks across 300 simulated runs.`);

const timerGenerator = new TaskGenerator();
const early = Object.fromEntries(TASK_TYPES.map(type => [type,timerGenerator.generate(type,DifficultyManager.forRound(1),1).difficulty.time]));
const late = Object.fromEntries(TASK_TYPES.map(type => [type,timerGenerator.generate(type,DifficultyManager.forRound(12),12).difficulty.time]));
assert(early.wms === 5 && late.wms === 5, "yes/no tasks use five seconds");
assert(early.picking >= 6 && early.picking <= 8, "small SKU search uses six to eight seconds");
assert(early.packing >= 6 && early.packing <= 8 && late.packing <= 10, "box tasks use six to ten seconds");
assert(early.serials >= 8 && late.serials >= 10 && late.serials <= 14, "serial time grows with list size");
assert(early.pallet >= 10 && late.pallet <= 14 && early.loading >= 10 && late.loading <= 14, "ordering tasks include interaction time");
assert(new TaskGenerator().generateFinal().difficulty.time === 18, "final task uses eighteen seconds");
const sameTask=timerGenerator.serials(DifficultyManager.forRound(9));
assert(TaskTimer.calculate(sameTask,12) < TaskTimer.calculate(sameTask,1), "late-game modifier trims the same task timer");
const fullRunTimes=[];
for(let run=0;run<300;run++){
  const generated=new TaskGenerator(),recent=[];let seconds=3+18+(13*.5);
  for(let round=1;round<=12;round++){
    let pool=TASK_TYPES.filter(type=>!recent.slice(-3).includes(type));
    if(round<=3)pool=pool.filter(type=>!["pallet","loading","quality"].includes(type));
    if(round>=10)pool=pool.filter(type=>!["packing","wms"].includes(type));
    const type=pool[Math.floor(Math.random()*pool.length)];recent.push(type);
    seconds+=generated.generate(type,DifficultyManager.forRound(round),round).difficulty.time;
  }
  fullRunTimes.push(seconds);
}
assert(Math.min(...fullRunTimes)>=110&&Math.max(...fullRunTimes)<=180,"300 full timer simulations stay near two to three minutes");
assert(CARRIERS.join(",") === "DHL,UPS,TNT,TOF,KLG,BRINGCARGO", "only approved carrier names are used");
const source = JSON.stringify(Array.from({length:50},()=>new TaskGenerator().labels(DifficultyManager.forRound(8))));
assert(CARRIERS.some(carrier => source.includes(carrier)), "label tasks use approved carriers");
const html = readFileSync("index.html", "utf8");
const css = readFileSync("styles.css", "utf8");
const gameSource = readFileSync("game.js", "utf8");
assert(!/SOUND ON|SETTINGS/.test(html + gameSource), "sound and settings controls are removed");
assert(css.includes("height:calc(100dvh") && css.includes("max-width:none") && css.includes("overflow:hidden"), "full-screen no-scroll rules are present");
assert(css.includes(".task-instruction{font-size:clamp(28px,3vw,42px)") && css.includes(".task-head h1{font:800 clamp(10px"), "question is larger than task title");
assert(!/reconciliation|discrepancy|exception|corrective|allocation|investigate|compliance|inconsistency/i.test(html + gameSource + source), "player text avoids difficult terms");
assert((html.match(/<i><\/i>/g)||[]).length >= 24 && css.includes("@keyframes snowfall"), "lightweight falling snow is present");
assert(html.includes("holiday-corner gifts") && html.includes("holiday-corner tree") && html.includes("candy-cane"), "edge decorations are present");
assert(gameSource.includes('this.playerName="";this.resetState();this.landing("")'), "play again clears the player and returns to entry");
assert(!/SCANNER OFFLINE|PALLET DAMAGED|TRUCK ARRIVED EARLY|maybeIncident|incidentCount/.test(gameSource), "random interruption events are removed");

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
