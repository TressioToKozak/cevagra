import { CompetitionSettings, LeaderboardManager, leaderboardCsv, normalizeName } from "./storage.js?v=18";
import { ArcadeEffects, animateNumber } from "./effects.js?v=18";
import { SeededRandom, createRunId, createRunSeed } from "./rng.js?v=18";
import { ACTIVE_SECONDS, GAME_CONFIGS, TRANSITION_SECONDS, buildCompetition, buildGameOrder } from "./tasks.js?v=18";
import { MINIGAME_CLASSES } from "./minigames.js?v=18";
import { sumScores } from "./scoring.js?v=18";
import { StageGuard } from "./lifecycle.js?v=18";
import { assetLoader, ASSET_PRIORITY } from "./asset-loader.js?v=18";
import { COMMON_ASSETS, GAME_ASSETS, COMPETITION_ASSETS, GAMEPLAY_BACKGROUNDS } from "./asset-manifest.js?v=18";

const $=(selector,root=document)=>root.querySelector(selector);
const esc=value=>String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
// Only native image drags are cancelled; inputs and custom pointer gestures stay native.
document.addEventListener("dragstart",event=>{
  if(event.target.closest?.("#app img,#modal img,.drag-ghost")&&!event.target.closest('[contenteditable]:not([contenteditable="false"])'))event.preventDefault();
});
const organizerEnabled=new URLSearchParams(location.search).get("organizer")==="1";
const requestedSeed=new URLSearchParams(location.search).get("seed");
const settings=new CompetitionSettings();
const app=$("#app"),modal=$("#modal"),modalContent=$("#modal-content"),leaderboard=new LeaderboardManager();
const RESULT_ICONS={
  picking:"speed-picking",
  conveyor:"conveyor-rush",
  barcode:"barcode-hunt",
  packing:"packing-tetris",
  detective:"wms-detective",
  loading:"truck-loading",
  memory:"memory-challenge",
  quality:"quality-control",
  final:"final-dispatch"
};

export class CompetitionManager {
  constructor({root=app,seed=requestedSeed,loader=assetLoader}={}){this.root=root;this.debugSeed=seed;this.loader=loader;this.flowSerial=0;this.guard=new StageGuard();this.reset();}
  reset(){this.flowSerial++;this.briefingVersion=(this.briefingVersion||0)+1;this.preparedStage?.wrapper.remove();this.preparedStage=null;this.stageReady=false;this.state="menu";this.runId=null;this.cancelScoreAnimation?.();this.stopTimer();this.active?.cleanup();this.effects?.destroy();this.active=null;this.playerName="";this.index=-1;this.scores={};this.results=[];this.totalCorrect=0;this.totalAttempts=0;this.totalMistakes=0;this.transitioning=false;}
  landing(prefill="") {this.state="menu";this.stopTimer();this.active?.cleanup();document.body.classList.remove("results-active");document.body.classList.add("menu-active");this.root.innerHTML=`<section class="menu-screen" aria-labelledby="menu-title"><div class="menu-content"><img draggable="false" class="menu-logo" fetchpriority="high" decoding="async" src="assets/menu/logo-light.webp" alt="CEVA Logistics"><h1 id="menu-title"><span>CHRISTMAS</span><strong>LOGISTICS CHALLENGE</strong></h1><p class="menu-details">9 GAMES <i>•</i> 3 MINUTES <i>•</i> 1,000 POINTS</p><form class="menu-form" id="start-form" autocomplete="off"><label class="visually-hidden" for="player-name">Participant name</label><div class="menu-input-wrap"><span aria-hidden="true"></span><input id="player-name" name="competition-participant" maxlength="24" value="${esc(prefill)}" placeholder="Enter your name..." autocomplete="one-time-code" data-lpignore="true" data-form-type="other" spellcheck="false" autofocus></div><div class="menu-error" id="name-error" aria-live="polite"></div><button class="menu-start" type="submit"><i aria-hidden="true"></i><span>START GAME</span></button><button class="menu-leaderboard" type="button" id="leaderboard-button"><span aria-hidden="true">🏆</span> VIEW LEADERBOARD</button></form></div></section>`;$("#start-form").onsubmit=event=>{event.preventDefault();const input=$("#player-name"),name=input.value.trim().replace(/\s+/g," ");if(!name){$("#name-error").textContent="Enter a participant name to begin.";return input.focus();}this.playerName=name;this.prepare();};$("#leaderboard-button").onclick=()=>showLeaderboard();this.preloadInBackground();if(organizerEnabled&&!this.organizerOpened){this.organizerOpened=true;showOrganizer();}}
  preloadInBackground(){
    this.loader.preload([...COMMON_ASSETS.filter(path=>path.includes("/menu/")),...COMMON_ASSETS.filter(path=>path.includes("/cursor/"))],()=>{},{priority:ASSET_PRIORITY.HIGH}).catch(()=>{});
    if(this.backgroundScheduled)return;this.backgroundScheduled=true;
    const run=()=>{this.backgroundPreload=this.loader.preload(COMPETITION_ASSETS,()=>{},{priority:ASSET_PRIORITY.LOW}).catch(()=>{});};
    if(globalThis.requestIdleCallback)requestIdleCallback(run,{timeout:500});else setTimeout(run,0);
  }
  prepare(){
    if(this.state!=="menu")return;
    this.stopTimer();this.active?.cleanup();this.effects?.destroy();this.active=null;
    document.body.classList.remove("menu-active");this.scores={};this.results=[];this.totalCorrect=0;this.totalAttempts=0;this.totalMistakes=0;this.index=-1;
    this.runId=createRunId();this.runSeed=this.debugSeed||createRunSeed();this.eventId=settings.getEventId();this.startedAt=new Date().toISOString();
    const rng=new SeededRandom(this.runSeed);this.gameConfigs=buildGameOrder(rng.fork("game-order"));this.tasks=buildCompetition(this.runSeed,rng);
    ++this.flowSerial;this.state="between";this.next();
  }
  next(){
    if(this.state!=="between")return;this.index++;
    if(this.index>=this.gameConfigs.length)return this.finish();this.briefing();
  }
  briefing(){
    this.preparedStage?.wrapper.remove();this.active?.cleanup();this.effects?.destroy();this.preparedStage=null;this.stageReady=false;this.deadline=null;this.state="briefing";this.transitioning=false;const config=this.gameConfigs[this.index];
    const words=config.name.split(" "),last=words.pop(),progress=Array.from({length:9},(_,i)=>`<li class="${i<this.index?"completed":i===this.index?"current":"upcoming"}" ${i===this.index?'aria-current="step"':""}><span class="visually-hidden">Challenge ${i+1}: ${i<this.index?"completed":i===this.index?"current":"upcoming"}</span></li>`).join("");
    this.root.innerHTML=`<section class="warehouse-gate" style="--gate-background:url('${GAMEPLAY_BACKGROUNDS[config.id]}')" aria-labelledby="mission-title"><div class="gate-panel briefing-panel">
      <svg class="mission-frame" viewBox="0 0 760 900" preserveAspectRatio="none" aria-hidden="true"><path d="M20 55 L48 24 H300 L330 52 H738 M738 52 H752 M20 55 V275 L34 291 V784 L52 805 H145 L160 825 H710"/><path class="frame-gold" d="M29 130 V232 M29 692 V769"/><path class="frame-detail" d="M328 72 H435 M58 844 H153"/></svg>
      <header class="mission-brand"><img draggable="false" class="gate-logo" src="assets/menu/logo-light.webp" alt="CEVA Logistics"></header>
      <div class="mission-identification"><p class="mission-kicker"><i aria-hidden="true"></i> MISSION BRIEFING</p><div class="eyebrow">CHALLENGE ${this.index+1} / 9</div><ol class="mission-progress" aria-label="Challenge progress">${progress}</ol></div>
      <div class="mission-heading"><div class="mission-icon-frame"><img draggable="false" class="briefing-icon" src="assets/results/icons/${RESULT_ICONS[config.id]}.svg" alt=""></div><h1 id="mission-title"><span>${esc(words.join(" "))}</span><em>${esc(last)}</em></h1></div>
      <div class="mission-copy"><p class="briefing-objective">${config.instruction}</p><p class="briefing-hint">${config.hint}</p></div>
      <div class="briefing-facts"><span class="mission-clock" aria-hidden="true">◷</span><span>${config.action}</span><strong>${config.time} SECONDS</strong></div>
      <div class="mission-action"><button class="primary industrial-primary" id="ready-button" disabled><span>I'M READY</span><b aria-hidden="true">›</b></button><div class="challenge-readiness" id="challenge-readiness" role="status" aria-live="polite">Preparing challenge...</div></div>
      <p class="mission-paused"><span aria-hidden="true">ⓘ</span> The clock is paused until you begin.</p>
    </div></section>`;
    $("#ready-button",this.root).onclick=()=>{if(this.state!=="briefing"||!this.stageReady)return;this.state="countdown";this.countdown(3,this.flowSerial);};this.prepareBriefing();
  }
  async prepareBriefing(){
    const serial=this.flowSerial,index=this.index,version=++this.briefingVersion,config=this.gameConfigs[index];
    const valid=()=>serial===this.flowSerial&&index===this.index&&version===this.briefingVersion&&this.state==="briefing";
    this.stageReady=false;$("#ready-button",this.root).disabled=true;$("#challenge-readiness",this.root).textContent="Preparing challenge...";
    const next=this.gameConfigs[index+1];
    try{
      const preparing=this.loadStage(config,valid);
      if(next)this.loader.preload(GAME_ASSETS[next.id],()=>{},{priority:ASSET_PRIORITY.MEDIUM}).catch(()=>{});
      const stage=await preparing;if(!valid()||!stage)return;
      this.stageReady=true;$("#ready-button",this.root).disabled=false;$("#challenge-readiness",this.root).textContent="";
    }catch{
      if(!valid())return;this.active?.cleanup();this.effects?.destroy();this.preparedStage?.wrapper.remove();this.preparedStage=null;
      $("#challenge-readiness",this.root).innerHTML='<span>Challenge images could not be prepared. The clock is paused.</span><button class="secondary" id="retry-challenge">RETRY CHALLENGE</button>';
      $("#retry-challenge",this.root).onclick=()=>{if(valid())this.prepareBriefing();};
    }
  }
  async loadStage(config,valid=()=>true){
    await this.loader.preload([...GAME_ASSETS[config.id],"assets/menu/logo-light.webp",`assets/results/icons/${RESULT_ICONS[config.id]}.svg`],()=>{},{priority:ASSET_PRIORITY.HIGH});
    if(!valid())return null;
    const stage=this.preparedStage=this.buildStage(config);stage.active.prepare?.();
    await this.loader.decodeDom(stage.shell);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(!valid()){stage.active.cleanup();stage.effects.destroy();stage.wrapper.remove();return null;}
    stage.active.syncGeometry?.();return stage;
  }
  countdown(value,serial=this.flowSerial){
    if(serial!==this.flowSerial||this.state!=="countdown")return;
    this.root.innerHTML=value===0?'<div class="countdown go">GO!</div>':`<div class="countdown">${value}</div>`;
    if(this.preparedStage)this.root.append(this.preparedStage.wrapper);
    this.transitionHandle=setTimeout(()=>value===0?this.startGame():this.countdown(value-1,serial),value===0?350:850);
  }
  buildStage(config){
    const GameClass=MINIGAME_CLASSES[config.id],container=document.createElement("div");let token;
    container.innerHTML=`<section class="competition-shell stage-preparing" data-game="${config.id}" style="--game-background:url('${GAMEPLAY_BACKGROUNDS[config.id]}')"><div class="competition-hud"><div><small>PLAYER</small><strong>${esc(this.playerName)}</strong></div><div><small>MINIGAME</small><strong>${this.index+1} / 9 · ${config.name}</strong></div><div><small>SCORE</small><strong id="score-value">${sumScores(this.scores)} / 1000</strong></div><div class="clock"><small>TIME</small><strong id="stage-time">${config.time.toFixed(1)}</strong></div></div><div class="overall"><span>ACTIVE TIME REMAINING</span><div class="overall-progress"><i id="overall-bar"></i></div><b id="overall-time">${ACTIVE_SECONDS}s</b></div><header class="minigame-head"><div><div class="eyebrow">CHALLENGE ${String(this.index+1).padStart(2,"0")}</div><h1>${config.name}</h1></div><div class="instruction-card"><strong>${config.action}</strong><span>${config.instruction}</span><small>${config.hint}</small></div></header><div class="minigame-root" id="minigame-root"></div><div class="score-flash" id="score-flash" aria-live="polite"></div></section>`;
    const shell=container.firstElementChild,wrapper=document.createElement("div");wrapper.className="stage-preparation";wrapper.setAttribute("aria-hidden","true");wrapper.inert=true;wrapper.append(shell);this.root.append(wrapper);
    this.effects=new ArcadeEffects($("#minigame-root",shell));const context={isActive:()=>this.state==="playing",root:$("#minigame-root",shell),data:this.tasks[config.id],config,remaining:()=>this.deadline===null?config.time:Math.max(0,(this.deadline-performance.now())/1000),flash:(symbol,text)=>this.flash(symbol,text),feedback:(kind,text,anchor)=>this.effects.feedback(kind,text,anchor),selection:text=>this.effects.selection(text),update:()=>this.updateHud(),finish:()=>this.completeGame(token)};
    const active=this.active=new GameClass().init(context);active.render();
    return {wrapper,shell,active,effects:this.effects,activate:newToken=>{token=newToken;}};
  }
  async startGame(){
    if(this.state!=="countdown")return;const serial=this.flowSerial,config=this.gameConfigs[this.index];this.state="building";this.pendingResult=null;
    try{
      const stage=this.preparedStage||await this.loadStage(config,()=>serial===this.flowSerial&&this.state==="building");
      if(serial!==this.flowSerial||!stage)return;
      this.root.replaceChildren(stage.shell);this.preparedStage=null;
      stage.active.syncGeometry?.();stage.active.measureTrack?.(true);
      const token=this.guard.begin(config.time);this.deadline=this.guard.deadline;this.stageToken=token;stage.activate(token);this.state="playing";
      stage.shell.classList.remove("stage-preparing");stage.active.start();
      this.timer=setInterval(()=>{if(this.stageToken!==token||this.state!=="playing")return;this.updateHud();if(performance.now()>=this.deadline)this.completeGame(token);},50);this.updateHud();
    }catch{
      if(serial!==this.flowSerial)return;this.briefing();
    }
  }
  elapsedBeforeCurrent(){return this.gameConfigs.slice(0,this.index).reduce((sum,game)=>sum+game.time,0);}
  updateHud(){
    if(!this.active||this.state!=="playing")return;
    const remaining=Math.max(0,(this.deadline-performance.now())/1000),elapsed=this.elapsedBeforeCurrent()+(this.gameConfigs[this.index].time-remaining),competitionRemaining=Math.max(0,ACTIVE_SECONDS-elapsed),percent=competitionRemaining/ACTIVE_SECONDS*100;
    const stage=$("#stage-time"),bar=$("#overall-bar"),overall=$("#overall-time"),scoreNode=$("#score-value"),liveScore=Math.min(this.gameConfigs[this.index].max,this.pendingResult?.score??this.active.liveScore??this.active.score()),displayScore=Math.min(1000,sumScores(this.scores)+liveScore);
    if(scoreNode&&scoreNode.dataset.score!==String(displayScore)){scoreNode.dataset.score=String(displayScore);scoreNode.textContent=`${displayScore} / 1000`;scoreNode.classList.remove("score-changed");void scoreNode.offsetWidth;scoreNode.classList.add("score-changed");}
    if(stage){stage.textContent=remaining.toFixed(1);stage.classList.toggle("critical",remaining<5);}if(bar)bar.style.width=`${percent}%`;if(overall)overall.textContent=`${Math.ceil(competitionRemaining)}s`;
  }

  flash(symbol,text){const node=$("#score-flash");if(!node)return;node.textContent=`${symbol} ${text}`;node.classList.remove("show");cancelAnimationFrame(this.flashFrame);this.flashFrame=requestAnimationFrame(()=>{if(this.state==="playing")node.classList.add("show");});}

  completeGame(token=this.stageToken){if(this.state!=="playing"||this.transitioning||!this.guard.complete(token))return;this.transitioning=true;this.state="transition";const config=this.gameConfigs[this.index],result=this.pendingResult||this.active.complete();this.stopTimer();this.active.cleanup();this.effects?.destroy();this.scores[config.id]=Math.min(config.max,result.score);this.results.push({...result,id:config.id,name:config.name,max:config.max});this.totalCorrect+=result.correct;this.totalAttempts+=result.attempts;this.totalMistakes+=result.mistakes;if(this.index===this.gameConfigs.length-1)return this.finish();const total=sumScores(this.scores);this.root.innerHTML=`<section class="stage-transition"><div class="eyebrow">${config.name} COMPLETE</div><strong>+${this.scores[config.id]}</strong><span>/ ${config.max} POINTS</span><div class="transition-track"><i></i></div><small>${this.index===this.gameConfigs.length-1?"CALCULATING FINAL RESULT":"NEXT: "+this.gameConfigs[this.index+1].name}</small><b>TOTAL ${total} / 1000</b></section>`;const serial=this.flowSerial;this.transitionHandle=setTimeout(()=>{if(serial!==this.flowSerial)return;this.transitioning=false;this.state="between";this.next();},TRANSITION_SECONDS*1000);}
  stopTimer(){cancelAnimationFrame(this.flashFrame);this.flashFrame=null;if(this.timer)clearInterval(this.timer);this.timer=null;if(this.transitionHandle)clearTimeout(this.transitionHandle);this.transitionHandle=null;this.stageToken=null;this.guard?.cancel();}
  finish(){
    if(this.state==="results")return;this.state="results";this.stopTimer();
    const score=sumScores(this.scores),previousRecord=leaderboard.getHighScore(),accuracy=this.totalAttempts?Math.round(this.totalCorrect/this.totalAttempts*100):0,timestamp=new Date().toISOString(),run={id:this.runId,name:this.playerName,normalizedName:normalizeName(this.playerName),score,accuracy,mistakes:this.totalMistakes,averageResponseTime:0,minigameScores:this.scores,timestamp,competitionSeed:this.runSeed,runSeed:this.runSeed,eventId:this.eventId,startedAt:this.startedAt,debugSeed:!!this.debugSeed};
    const board=leaderboard.saveRun(run),rank=board.findIndex(row=>row.id===run.id)+1,isRecord=score>previousRecord;
    document.body.classList.remove("menu-active");
    document.body.classList.add("results-active");
    const gameCards=this.results.map(result=>{
      const percent=Math.max(0,Math.min(100,result.max?result.score/result.max*100:0));
      const icon=RESULT_ICONS[result.id];
      return `<article class="results-game-card"><img draggable="false" src="assets/results/icons/${icon}.svg" alt=""><div class="results-game-copy"><div><h3>${esc(result.name)}</h3><strong>${result.score} <small>/ ${result.max}</small></strong></div><div class="results-progress" role="progressbar" aria-label="${esc(result.name)} score" aria-valuemin="0" aria-valuemax="${result.max}" aria-valuenow="${result.score}"><i style="width:${percent}%"></i></div></div></article>`;
    }).join("");
    this.root.innerHTML=`<section class="results-screen ${isRecord?"new-record":""} ${leaderboard.lastSaveSucceeded?"":"storage-failed"}" aria-labelledby="results-title">
      <header class="results-header"><span class="results-brand"><img draggable="false" class="results-logo" src="assets/menu/logo-light.webp" alt="CEVA Logistics"></span><div><p class="mission-kicker">MISSION REPORT</p><h1 id="results-title">CHRISTMAS RUN COMPLETE</h1></div>${isRecord?'<span class="results-record-badge">NEW COMPETITION RECORD</span>':""}</header>
      <section class="results-summary" aria-label="Run summary"><div class="results-player hud-card"><span>PLAYER</span><strong>${esc(this.playerName)}</strong></div>
      <section class="results-final-score hud-card"><img draggable="false" src="assets/results/icons/score-star.svg" alt=""><div><span>FINAL SCORE</span><strong><b id="final-score">0</b><small>/ 1000</small></strong></div></section>
      <section class="results-rank hud-card"><img draggable="false" src="assets/results/icons/rank-trophy.svg" alt=""><div><span>RANK</span><strong>#${rank}</strong><small>COMPETITION RECORD <b>${board[0]?.score??score}</b></small></div></section>
      <section class="results-stats" aria-label="Run statistics"><div class="hud-card"><img draggable="false" src="assets/results/icons/accuracy.svg" alt=""><span>ACCURACY</span><strong>${accuracy}%</strong></div><div class="hud-card"><img draggable="false" src="assets/results/icons/mistakes.svg" alt=""><span>MISTAKES</span><strong>${this.totalMistakes}</strong></div><div class="hud-card"><img draggable="false" src="assets/results/icons/challenges.svg" alt=""><span>CHALLENGES</span><strong>${this.results.length} / 9</strong></div></section></section>
      <section class="results-games" aria-label="Challenge results">${gameCards}</section>
      ${leaderboard.lastSaveSucceeded?"":'<div class="storage-warning" role="alert"><span>This result could not be saved permanently. Export your results before closing this page.</span><button class="secondary" id="export-unsaved">EXPORT CSV</button></div>'}<div class="results-actions"><button class="industrial-primary" id="return-start" aria-label="Return to Start"><span>RETURN TO START</span></button><button class="industrial-secondary" id="view-board" aria-label="Leaderboard"><span>LEADERBOARD</span></button></div>
    </section>`;
    $("#return-start").onclick=()=>{this.reset();this.landing();};
    $("#view-board").onclick=()=>showLeaderboard(run.id);if($("#export-unsaved"))$("#export-unsaved").onclick=downloadCsv;
    this.cancelScoreAnimation=animateNumber($("#final-score"),score,900);
    if(isRecord){this.effects=new ArcadeEffects(this.root);this.effects.burst($(".results-final-score"));}
  }
}

export const manager=new CompetitionManager();
function showLeaderboard(current=""){manager.loader.preload(COMMON_ASSETS.filter(path=>path.includes("/leaderboard/")),()=>{},{priority:ASSET_PRIORITY.HIGH}).catch(()=>{});const rows=leaderboard.getLeaderboard();modal.classList.add("leaderboard-modal");$("#modal-kicker").textContent="";modalContent.innerHTML=`<section class="leaderboard-panel"><header class="leaderboard-title"><h2 id="modal-title"><span>CHRISTMAS</span> COMPETITION RESULTS</h2><img draggable="false" src="assets/leaderboard/logo-from-reference.webp" alt="CEVA Logistics"></header><div class="record-banner"><img draggable="false" src="assets/leaderboard/trophy.webp" alt=""><div><strong>COMPETITION RECORD</strong></div><b>${rows[0]?.score??0}</b></div>${rows.length?`<div class="leaderboard-scroll"><table class="leaderboard"><thead><tr><th>RANK</th><th>PLAYER</th><th>SCORE</th><th>ACCURACY</th><th>DATE &amp; TIME</th></tr></thead><tbody>${rows.map((row,index)=>`<tr class="${index<3?`podium podium-${index+1}`:""} ${row.id===current?"current":""}"><td>${index<3?`<img draggable="false" src="assets/leaderboard/medal-${index+1}.webp" alt="${index+1}${index===0?"st":index===1?"nd":"rd"} place">`:index+1}</td><td>${esc(row.name)}</td><td>${row.score}</td><td>${row.accuracy}%</td><td><time datetime="${esc(row.timestamp)}">${new Date(row.timestamp).toLocaleString("en-GB",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"})}</time></td></tr>`).join("")}</tbody></table></div>`:'<div class="leaderboard-empty">NO COMPLETED RUNS</div>'}</section>`;modal.showModal();}
function downloadCsv(){const blob=new Blob([leaderboardCsv(leaderboard.getLeaderboard())],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="ceva-christmas-leaderboard.csv";link.click();URL.revokeObjectURL(url);}
function showOrganizer(){if(!organizerEnabled)return;modal.classList.remove("leaderboard-modal");const seed=settings.getSeed();$("#modal-kicker").textContent="ORGANIZER TOOLS";modalContent.innerHTML=`<h2>COMPETITION CONTROL</h2><p class="local-note">These settings apply only on this computer.</p><label class="field-label" for="competition-seed">EVENT IDENTIFIER</label><input class="name-input" id="competition-seed" maxlength="40" value="${esc(seed)}"><p class="settings-help">Each participant receives a new random run seed. This label identifies the event only. Debug replay: add ?seed=YOUR-SEED to the URL.</p><div class="organizer-actions"><button class="primary" id="save-seed">SAVE EVENT ID</button><button class="secondary" id="export-results">EXPORT CSV</button><button class="danger" id="reset-results">RESET RESULTS</button></div><div id="organizer-status" class="error-text" aria-live="polite"></div>`;$("#save-seed").onclick=()=>{if(settings.setSeed($("#competition-seed").value)){$("#organizer-status").textContent="✓ Event identifier saved.";}};$("#export-results").onclick=downloadCsv;$("#reset-results").onclick=()=>{
    $("#organizer-status").innerHTML='<section class="reset-confirmation"><p>This will permanently delete ALL results stored on this computer. Export a CSV backup first.</p><button class="secondary" id="backup-before-reset">EXPORT CSV BACKUP</button><label for="reset-confirmation">Type RESET to confirm deletion</label><input class="name-input" id="reset-confirmation" autocomplete="off"><div><button class="danger" id="confirm-reset" disabled>DELETE ALL LOCAL RESULTS</button><button class="secondary" id="cancel-reset">CANCEL</button></div></section>';
    $("#backup-before-reset").onclick=downloadCsv;$("#reset-confirmation").oninput=()=>{$("#confirm-reset").disabled=$("#reset-confirmation").value!=="RESET";};
    $("#cancel-reset").onclick=()=>{$("#organizer-status").textContent="Reset cancelled. Results have been kept.";};
    $("#confirm-reset").onclick=()=>{if($("#reset-confirmation").value!=="RESET")return;$("#organizer-status").textContent=leaderboard.clearLeaderboard()!==false?"Local competition results cleared.":"Results could not be cleared. Browser storage is unavailable.";};
  };modal.showModal();}
$("#modal-close").onclick=()=>modal.close();
manager.landing();
