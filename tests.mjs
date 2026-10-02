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
      else if(task.mode === "match"){const matches=Object.fromEntries(task.solution.map(pair=>pair.split(":")));assert(taskIsCorrect(task,[],[],null,matches),`${type} validates every box-to-truck match`);}
      else assert(taskIsCorrect(task, task.solution), `${type} validates selection`);
      assert(!taskIsCorrect(task, [], []), `${type} rejects empty response`);
      assert(task.difficulty.time >= 8 && task.difficulty.time <= 18, `${type} has a safe complexity timer`);
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
assert(early.wms === 8 && late.wms === 8, "yes/no tasks use eight seconds");
assert(early.picking >= 8 && early.picking <= 11, "small SKU search gets enough reading time");
assert(early.packing >= 9 && early.packing <= 11 && late.packing <= 11, "box tasks allow time for comparing limits");
assert(early.serials >= 11 && late.serials >= 15 && late.serials <= 18, "serial time grows with list size");
assert(early.pallet >= 14 && late.pallet <= 18 && early.loading >= 14 && late.loading <= 18, "ordering tasks include drag interaction time");
assert(new TaskGenerator().generateFinal().difficulty.time === 24, "final task uses twenty-four seconds");
const sameTask=timerGenerator.serials(DifficultyManager.forRound(9));
assert(TaskTimer.calculate(sameTask,12) === TaskTimer.calculate(sameTask,1), "the same task keeps a fair complexity-based timer");
const fullRunTimes=[];
for(let run=0;run<300;run++){
  const generated=new TaskGenerator(),recent=[];let seconds=3+24+(13*.5);
  for(let round=1;round<=12;round++){
    let pool=TASK_TYPES.filter(type=>!recent.slice(-3).includes(type));
    if(round<=3)pool=pool.filter(type=>!["pallet","loading","quality"].includes(type));
    if(round>=10)pool=pool.filter(type=>!["packing","wms"].includes(type));
    const type=pool[Math.floor(Math.random()*pool.length)];recent.push(type);
    seconds+=generated.generate(type,DifficultyManager.forRound(round),round).difficulty.time;
  }
  fullRunTimes.push(seconds);
}
assert(Math.min(...fullRunTimes)>=145&&Math.max(...fullRunTimes)<=240,"300 full timer simulations stay in a balanced play window");

const instructions=new Set(Array.from({length:80},()=>new TaskGenerator().picking(DifficultyManager.forRound(2)).instruction));
assert(instructions.size >= 3, "question wording varies between generated tasks");
const carrierTask=new TaskGenerator().generate("carrier",DifficultyManager.forRound(6),6);
assert(carrierTask.mode === "match" && carrierTask.items.length >= 3 && carrierTask.targets.length === carrierTask.items.length, "carrier task provides multiple boxes and matching trucks");
const carrierMatches=Object.fromEntries(carrierTask.solution.map(pair=>pair.split(":")));
assert(taskIsCorrect(carrierTask,[],[],null,carrierMatches), "carrier task requires every box to reach its truck");
const palletTask=new TaskGenerator().pallet(DifficultyManager.forRound(6));
const palletOrder=[...palletTask.items].sort((a,b)=>palletTask.solution.indexOf(a.key)-palletTask.solution.indexOf(b.key));
assert(palletOrder[0].fragile && palletOrder.at(-1).weight > palletOrder[1].weight, "pallet visual order is fragile/light on top and heavy at bottom");
assert(TASK_TYPES.length >= 12, "a shift has enough task types to avoid repeats");
for(let run=0;run<200;run++){
  const used=[];
  for(let round=1;round<=12;round++){
    const unused=TASK_TYPES.filter(type=>!used.includes(type));let pool=unused;
    if(round<=3)pool=pool.filter(type=>!["pallet","loading","quality"].includes(type));
    if(round>=10)pool=pool.filter(type=>!["packing","wms"].includes(type));
    if(!pool.length)pool=unused;used.push(pool[Math.floor(Math.random()*pool.length)]);
  }
  assert(new Set(used).size===12,"a shift does not repeat task types");
}
assert(CARRIERS.join(",") === "DHL,UPS,TNT,TOF,KLG,BRINGCARGO", "only approved carrier names are used");
const source = JSON.stringify(Array.from({length:50},()=>new TaskGenerator().labels(DifficultyManager.forRound(8))));
assert(CARRIERS.some(carrier => source.includes(carrier)), "label tasks use approved carriers");
const html = readFileSync("index.html", "utf8");
const css = readFileSync("styles.css", "utf8");
const gameSource = readFileSync("game.js", "utf8");
assert(html.includes('src="logo.png"') && html.includes("CEVA LOGISTICS"), "CEVA logo is used in the header");
assert(!/data-move|USE ARROWS|order-controls/.test(gameSource), "box ordering no longer uses arrow controls");
assert(gameSource.includes("draggable=\"true\"") && gameSource.includes("assignBox"), "ordering and multi-box truck matching use drag interactions");
assert(gameSource.includes('const correct=taskIsCorrect') && gameSource.includes('fastBonus=timeout?0'), "a correct answer at timeout still earns base points");
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
