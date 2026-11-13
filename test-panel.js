import {TestGameClock} from './test-clock.js?v=58';

export function mountTestPanel(manager,{GAME_CONFIGS,buildCompetition,SeededRandom,createRunSeed,RESULT_ICONS,GAMEPLAY_BACKGROUNDS}){
  document.body.classList.add('test-mode');
  const root=manager.root,clock=new TestGameClock(),storageKey='ceva-test-attempts-v1',escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let attempts={};try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'{}');for(const game of GAME_CONFIGS){const row=saved?.[game.id];if(row&&Number.isFinite(row.score)&&row.score>=0&&row.score<=game.max)attempts[game.id]={score:row.score,max:game.max};}}catch{}
  let pausedView=null,pausedAnimations=[];
  const currentAttempt=()=>attempts[GAME_CONFIGS[manager.index]?.id];
  const attemptText=record=>`Last attempt: ${record.score} / ${record.max}`;
  function resetPause(){clock.clear();if(pausedView){pausedView.classList.remove('test-paused');const game=pausedView.querySelector('.minigame-root');if(game)game.inert=false;}pausedAnimations=[];pausedView=null;}
  function togglePause(view,button){
    if(manager.state!=='playing')return;
    const game=view.querySelector('.minigame-root');
    if(clock.paused){
      view.classList.remove('test-paused');game.inert=false;
      for(const animation of pausedAnimations)if(animation.playState==='paused'&&animation.effect?.target?.isConnected)animation.play();
      pausedAnimations=[];pausedView=null;clock.resume();button.textContent='STOP';button.setAttribute('aria-label','Stop game');button.setAttribute('aria-pressed','false');
    }else{
      manager.interfaceEffects.clearPress();clock.pause();pausedView=view;
      pausedAnimations=view.getAnimations({subtree:true}).filter(animation=>animation.playState==='running');pausedAnimations.forEach(animation=>animation.pause());
      game.inert=true;view.classList.add('test-paused');button.textContent='RESUME';button.setAttribute('aria-label','Resume game');button.setAttribute('aria-pressed','true');
    }
  }
  function navigate(id){const url=new URL(location.href);if(id)url.searchParams.set('game',id);else url.searchParams.delete('game');history.pushState({},'',url);route();}
  function decorate(view,kind){
    const button=document.createElement('button');button.type='button';button.className='test-back';button.setAttribute('aria-label','Back to all minigames');button.innerHTML='<span aria-hidden="true">←</span><span>All games</span>';button.onclick=()=>navigate(null);
    if(kind==='playing'){
      const cell=view.querySelector('.competition-hud>div');cell.replaceChildren(button);
      const tools=document.createElement('div');tools.className='test-play-tools';const record=currentAttempt();
      tools.innerHTML=`<span class="test-last-score">${record?attemptText(record):'No completed attempt yet'}</span><button type="button" class="test-pause" aria-label="Stop game" aria-pressed="false">STOP</button>`;
      view.querySelector('.competition-hud').after(tools);const pause=tools.querySelector('.test-pause');pause.onclick=()=>togglePause(view,pause);return;
    }
    button.classList.add('test-back-floating');view.append(button);
    if(kind==='briefing'){
      view.querySelector('#ready-button>span').textContent='START GAME';view.querySelector('.mission-kicker').textContent='MINIGAME TEST';
      const record=currentAttempt();if(record){const result=document.createElement('p');result.className='test-last-attempt';result.textContent=attemptText(record);result.setAttribute('role','status');view.querySelector('.mission-action').prepend(result);}
    }
  }
  function showPicker(){
    manager.reset();document.body.classList.remove('menu-active','results-active');document.body.classList.add('test-picker-active');
    root.innerHTML=`<section class="test-picker"><header><div><p class="eyebrow">CEVA · TEST MODE</p><h1>Choose a minigame</h1><p>Open the instructions, play, then try again.</p></div><div class="test-picker-actions"><a class="test-panel-link" href="panel/">← Back to panel</a><img src="assets/menu/logo-light.webp" alt="CEVA Logistics" draggable="false"></div></header><div class="test-games">${GAME_CONFIGS.map((game,i)=>`<a class="test-game-card" data-test-game="${game.id}" draggable="false" href="?game=${game.id}"><div class="test-card-art" style="background-image:url('${GAMEPLAY_BACKGROUNDS[game.id]}')"><img src="assets/results/icons/${RESULT_ICONS[game.id]}.svg" alt="" draggable="false"><span>${String(i+1).padStart(2,'0')}</span></div><div class="test-card-copy"><h2>${escape(game.name)}</h2><p>${game.time} seconds · ${game.max} points</p>${attempts[game.id]?`<small class="test-card-score">${attemptText(attempts[game.id])}</small>`:''}<span>OPEN GAME <b aria-hidden="true">↗</b></span></div></a>`).join('')}</div></section>`;
    root.querySelectorAll('[data-test-game]').forEach(link=>link.onclick=event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate(link.dataset.testGame);});
  }
  function showBriefing(id){
    manager.reset();document.body.classList.remove('menu-active','results-active','test-picker-active');
    manager.gameConfigs=GAME_CONFIGS;const seed=createRunSeed();manager.tasks=buildCompetition(seed,new SeededRandom(seed));manager.index=GAME_CONFIGS.findIndex(game=>game.id===id);manager.playerName='TEST MODE';manager.briefing();
  }
  function route(){const id=new URLSearchParams(location.search).get('game');if(GAME_CONFIGS.some(game=>game.id===id))showBriefing(id);else showPicker();}
  manager.testMode={clock,resetPause,decorate,exit:()=>navigate(null),complete:config=>{
    const score=manager.scores[config.id];if(Number.isFinite(score)){attempts[config.id]={score:Math.max(0,Math.min(config.max,Math.round(score))),max:config.max};try{sessionStorage.setItem(storageKey,JSON.stringify(attempts));}catch{}}
    showBriefing(config.id);
  }};
  window.addEventListener('popstate',route);
  manager.preloadInBackground();route();
}
