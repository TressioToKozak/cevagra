export function mountTestPanel(manager,{GAME_CONFIGS,buildCompetition,SeededRandom,createRunSeed,RESULT_ICONS,GAMEPLAY_BACKGROUNDS}){
  document.body.classList.add('test-mode');
  const root=manager.root,escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let lastAttempt=null;
  function navigate(id){const url=new URL(location.href);if(id)url.searchParams.set('game',id);else url.searchParams.delete('game');history.pushState({},'',url);route();}
  function decorate(view,kind){
    const button=document.createElement('button');button.type='button';button.className='test-back';button.setAttribute('aria-label','Back to all minigames');button.innerHTML='<span aria-hidden="true">←</span><span>All games</span>';button.onclick=()=>navigate(null);
    if(kind==='playing'){const cell=view.querySelector('.competition-hud>div');cell.replaceChildren(button);return;}
    button.classList.add('test-back-floating');view.append(button);
    if(kind==='briefing'){
      view.querySelector('#ready-button>span').textContent='START GAME';
      view.querySelector('.mission-kicker').textContent='MINIGAME TEST';
      if(lastAttempt){const result=document.createElement('p');result.className='test-last-attempt';result.textContent=`Last attempt: ${lastAttempt.score} / ${lastAttempt.max}`;view.append(result);}
    }
  }
  function showPicker(){
    manager.reset();document.body.classList.remove('menu-active','results-active');document.body.classList.add('test-picker-active');
    root.innerHTML=`<section class="test-picker"><header><div><p class="eyebrow">CEVA · TEST MODE</p><h1>Choose a minigame</h1><p>Open the instructions, play, then try again.</p></div><div class="test-picker-actions"><a class="test-panel-link" href="panel/">← Back to panel</a><img src="assets/menu/logo-light.webp" alt="CEVA Logistics" draggable="false"></div></header><div class="test-games">${GAME_CONFIGS.map((game,i)=>`<a class="test-game-card" data-test-game="${game.id}" draggable="false" href="?game=${game.id}"><div class="test-card-art" style="background-image:url('${GAMEPLAY_BACKGROUNDS[game.id]}')"><img src="assets/results/icons/${RESULT_ICONS[game.id]}.svg" alt="" draggable="false"><span>${String(i+1).padStart(2,'0')}</span></div><div class="test-card-copy"><h2>${escape(game.name)}</h2><p>${game.time} seconds · ${game.max} points</p><span>OPEN GAME <b aria-hidden="true">↗</b></span></div></a>`).join('')}</div></section>`;
    root.querySelectorAll('[data-test-game]').forEach(link=>link.onclick=event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();lastAttempt=null;navigate(link.dataset.testGame);});
  }
  function showBriefing(id){
    manager.reset();document.body.classList.remove('menu-active','results-active','test-picker-active');
    manager.gameConfigs=GAME_CONFIGS;const seed=createRunSeed();manager.tasks=buildCompetition(seed,new SeededRandom(seed));manager.index=GAME_CONFIGS.findIndex(game=>game.id===id);manager.playerName='TEST MODE';manager.briefing();
  }
  function route(){const id=new URLSearchParams(location.search).get('game');if(GAME_CONFIGS.some(game=>game.id===id))showBriefing(id);else showPicker();}
  manager.testMode={decorate,exit:()=>navigate(null),complete:(config,result)=>{lastAttempt={score:result.score,max:config.max};showBriefing(config.id);}};
  window.addEventListener('popstate',()=>{lastAttempt=null;route();});
  manager.preloadInBackground();route();
}
