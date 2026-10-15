const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:8003/cevagra/';
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if(r.status()>=400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(origin);
    await page.evaluate(async () => {
      window.qa = (await import('./game.js?v=21')).manager;
      window.configs = (await import('./tasks.js?v=20')).GAME_CONFIGS;
      window.make = (await import('./tasks.js?v=20')).buildCompetition;
      window.RNG = (await import('./rng.js?v=20')).SeededRandom;
      await (await import('./asset-loader.js?v=20')).assetLoader.preload((await import('./asset-manifest.js?v=20')).COMPETITION_ASSETS);
      window.nativeDrags = 0;
      document.addEventListener('dragstart', () => nativeDrags++);
    });
    const noSelection = async label => assert.equal(await page.evaluate(() => getSelection().toString()), '', label);
    const rapid = async locator => {
      const r = await locator.boundingBox();
      await page.mouse.click(r.x+r.width*.5,r.y+r.height*.5,{clickCount:2});
      await page.mouse.click(r.x+r.width*.5,r.y+r.height*.5,{clickCount:5});
      await noSelection('rapid/double clicking creates no DOM selection');
    };
    const setup = async (id, brief=false) => {
      await page.evaluate(async ({id,brief}) => {
        qa.reset();document.body.classList.remove('menu-active','results-active');
        qa.gameConfigs=configs;qa.tasks=make('MISSION-QA',new RNG('MISSION-QA'));qa.index=configs.findIndex(c=>c.id===id);
        qa.playerName='Visual QA';
        if(brief) qa.briefing();
        else {qa.state='countdown';await qa.startGame();clearInterval(qa.timer);qa.active.ctx.remaining=()=>qa.active.ctx.config.time;qa.active.ctx.finish=()=>{};}
      },{id,brief});
      if(brief) await page.waitForFunction(()=>qa.stageReady);
      await page.waitForTimeout(350);
    };
    const fit = async selector => page.locator(selector).evaluateAll(nodes=>nodes.every(n=>{
      const r=n.getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&r.width>0&&r.height>0;
    }));
    if(!process.env.SELECTION_ONLY){for(const [width,height] of [[1920,1080],[1366,768],[1280,720]]) {
      await page.setViewportSize({width,height});
      for(const [index,id] of configsList().entries()) {
        await setup(id,true);
        assert.equal(await page.locator('.mission-progress li').count(),9);
        assert.equal(await page.locator('.mission-progress .completed').count(),index);
        assert.equal(await page.locator('.mission-progress .current').count(),1);
        assert.equal(await page.locator('.mission-progress [aria-current="step"]').count(),1);
        assert(await fit('.gate-logo,.mission-heading,.briefing-objective,.briefing-hint,.briefing-facts,#ready-button,.mission-paused'));
        const title = await page.locator('#mission-title').evaluate(n=>({scroll:n.scrollWidth,width:n.clientWidth}));
        assert(title.scroll<=title.width+1,`${id}: title fits`);
        assert.equal(await page.locator('.mission-heading img').getAttribute('draggable'),'false');
        await rapid(page.locator('.briefing-objective'));
        assert.equal(await page.evaluate(()=>qa.state),'briefing');
        assert(await page.evaluate(()=>qa.guard.closed));
        await page.screenshot({path:`/tmp/ceva-mission-${id}-${width}.png`});
      }
      for(const scenario of [{score:70,name:'Jo',rank:101},{score:665,name:'Alexandria-Montgomery XX',rank:101},{score:1000,name:'WWWWWWWWWWWWWWWWWWWWWWWW',rank:1}]) {
        await page.evaluate(scenario=>{
          qa.reset();qa.playerName=scenario.name;qa.runId=crypto.randomUUID();qa.runSeed='RESULT-QA';qa.eventId='QA';qa.totalAttempts=100;qa.totalCorrect=scenario.score===1000?100:scenario.score<100?10:70;qa.totalMistakes=100-qa.totalCorrect;
          const fixture=Array.from({length:100},(_,i)=>({id:`fixture-${i}`,name:'Previous',normalizedName:'previous',score:990,accuracy:99,mistakes:0,timestamp:'2026-10-14T00:00:00Z'}));
          localStorage.setItem('christmas-logistics-leaderboard-v1',JSON.stringify({version:3,runs:fixture}));
          let left=scenario.score;qa.results=configs.map(c=>{const score=Math.min(left,c.max);left-=score;return {...c,score};});qa.scores=Object.fromEntries(qa.results.map(c=>[c.id,c.score]));qa.state='transition';qa.finish();qa.cancelScoreAnimation();document.querySelector('#final-score').textContent=scenario.score;
        },scenario);
        await page.waitForTimeout(350);
        assert.equal(await page.locator('.results-player strong').textContent(),scenario.name);
        assert.equal(await page.locator('.results-rank strong').textContent(),`#${scenario.rank}`);
        assert.equal(await page.locator('#final-score').textContent(),String(scenario.score));
        assert.equal(await page.locator('.results-game-card').count(),9);
        assert(await fit('.results-header,.results-summary,.results-player strong,.results-rank,.results-stats,.results-game-card,.results-actions button'));
        const geometry=await page.locator('.results-game-card').evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
        assert(geometry.every(r=>Math.abs(r.w-geometry[0].w)<1&&Math.abs(r.h-geometry[0].h)<1));
        const playerFits=await page.locator('.results-player strong').evaluate(n=>{const a=n.getBoundingClientRect(),b=n.parentElement.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom&&n.scrollWidth<=n.clientWidth+1;});
        assert(playerFits,'long player name stays inside its card');
        assert(await page.locator('.results-progress').evaluateAll(ns=>ns.every(n=>{const score=Number(n.getAttribute('aria-valuenow')),max=Number(n.getAttribute('aria-valuemax'));return Math.abs(parseFloat(n.firstElementChild.style.width)-score/max*100)<.01;})));
        const buttons=await page.locator('.results-actions button').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height));assert.equal(buttons[0],buttons[1]);
        await rapid(page.locator('.results-player strong'));
        await page.screenshot({path:`/tmp/ceva-report-${scenario.score}-${width}.png`});
        await rapid(page.locator('#view-board'));assert(await page.locator('#modal').isVisible());await rapid(page.locator('.leaderboard-title'));await page.locator('#modal-close').click();
        await page.locator('#return-start').click();assert.equal(await page.locator('#player-name').inputValue(),'');
      }
    }
    }
    // Actual editing and selection remain native inside inputs and editable HTML.
    const name=page.locator('#player-name');await name.fill('Normal name');await name.click();const inputRect=await name.boundingBox();await page.mouse.move(inputRect.x+24,inputRect.y+inputRect.height/2);await page.mouse.down();await page.mouse.move(inputRect.x+110,inputRect.y+inputRect.height/2,{steps:6});await page.mouse.up();assert(await name.evaluate(n=>n.selectionEnd>n.selectionStart),'mouse selection stays available in the name field');await name.press('ControlOrMeta+A');assert.equal(await name.evaluate(n=>n.selectionEnd-n.selectionStart),11);await name.type('Edited');assert.equal(await name.inputValue(),'Edited');
    await page.evaluate(()=>{const box=document.createElement('div');box.contentEditable='true';box.id='editable-qa';box.innerHTML='<span>Editable text</span>';document.querySelector('#app').append(box);Object.assign(box.style,{position:'fixed',top:'10px',left:'10px',zIndex:100});const textarea=document.createElement('textarea');textarea.id='textarea-qa';textarea.value='Textarea';box.after(textarea);Object.assign(textarea.style,{position:'fixed',top:'50px',left:'10px',zIndex:100});});
    await page.locator('#editable-qa').click();await page.locator('#editable-qa').press('ControlOrMeta+A');assert.equal(await page.evaluate(()=>getSelection().toString()),'Editable text');await page.locator('#editable-qa').press('Backspace');await page.locator('#editable-qa').type('Replacement');assert.equal(await page.locator('#editable-qa').textContent(),'Replacement');
    await page.locator('#textarea-qa').click();await page.locator('#textarea-qa').press('ControlOrMeta+A');assert.equal(await page.locator('#textarea-qa').evaluate(n=>n.selectionEnd-n.selectionStart),8);
    await page.evaluate(()=>{document.querySelector('#editable-qa').remove();document.querySelector('#textarea-qa').remove();getSelection().removeAllRanges();});
    await page.setViewportSize({width:1366,height:768});
    for(const id of configsList()) {
      await setup(id);
      if(id==='memory')await page.evaluate(()=>qa.active.hide());
      if(id==='conveyor')await page.evaluate(()=>{cancelAnimationFrame(qa.active.raf);qa.active.x=400;qa.active.position();});
      const selector={picking:'.picking-card-footer strong',conveyor:'.parcel-copy b',barcode:'.barcode-sku',packing:'[data-shape]',detective:'.record-code b',loading:'.pallet-copy b',memory:'[data-gift]',quality:'.qc-gift',final:'[data-issue]'}[id];
      await rapid(page.locator(selector).first());
      await rapid(page.locator('#score-value'));
      assert(await page.locator('#minigame-root img').evaluateAll(ns=>ns.every(n=>n.draggable===false&&getComputedStyle(n).webkitUserDrag==='none')));
      if(['conveyor','loading','packing'].includes(id)) {
        const source=page.locator({conveyor:'[data-moving-box]',loading:'[data-pallet-id]',packing:'[data-shape]'}[id]).first();const r=await source.boundingBox();
        await page.mouse.move(r.x+r.width*.4,r.y+r.height*.4);await page.mouse.down();await page.mouse.move(r.x+r.width*.4+20,r.y+r.height*.4+15,{steps:5});
        assert.equal(await page.locator('.drag-ghost').count(),1);await noSelection(id+' drag does not select surrounding text');await page.mouse.up();assert.equal(await page.locator('.drag-ghost').count(),0);
      }
      assert.equal(await page.evaluate(()=>nativeDrags),0,id+' has no native image drag');console.log(id+': rapid clicks and selection/drag policy passed.');
    }
    await setup('quality',true);const ready=page.locator('#ready-button');await ready.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');assert.equal(await ready.evaluate(n=>getComputedStyle(n).outlineStyle),'solid');await rapid(ready);assert.equal(await page.evaluate(()=>qa.state),'countdown');assert(await page.evaluate(()=>qa.guard.closed));const qaStateReset=await page.evaluate(()=>{qa.reset();qa.landing();return qa.state;});assert.equal(qaStateReset,'menu');
    // The image-only fallback cancels dragstart, without blanket pointer cancellation.
    const prevented=await page.locator('#app img').first().evaluate(img=>{const event=new DragEvent('dragstart',{bubbles:true,cancelable:true});img.dispatchEvent(event);return event.defaultPrevented;});assert(prevented);
    const admin=await browser.newPage();await admin.goto(origin+'?organizer=1');await admin.locator('#competition-seed').fill('Organizer editable');await admin.locator('#competition-seed').press('ControlOrMeta+A');assert.equal(await admin.locator('#competition-seed').evaluate(n=>n.selectionEnd-n.selectionStart),18);await admin.close();
    assert.deepEqual(errors,[]);
    console.log(process.env.SELECTION_ONLY?'Selection/drag prevention and editable exceptions passed.':'27 premium briefings, 9 result scenarios, rank #1/#101, long names, uniform cards, progress ratios, return/leaderboard, rapid clicks across nine games, custom drags, no native image dragging, and editable exceptions passed.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
function configsList(){return ['picking','conveyor','barcode','packing','detective','loading','memory','quality','final'];}
