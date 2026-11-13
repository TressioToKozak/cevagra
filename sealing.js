const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
// Continuous coverage is earned only where film actually passes during rotation.
export class SealSimulation {
  constructor(){this.elapsed=0;this.y=0;this.target=0;this.started=false;this.sealed=false;this.holding=false;this.gap=0;this.broken=false;this.breaks=0;this.waste=0;this.outside=0;this.layers=Array(64).fill(0);}
  hold(value){if(value&&!this.holding){this.gap=0;this.broken=false;}this.holding=value;}
  step(dt,y=this.y){
    if(!Number.isFinite(dt)||dt<=0||this.sealed)return;
    dt=Math.min(dt,.1);this.elapsed+=dt;this.y=y;
    // Reference path for demos only. Players can start and finish at any height.
    this.target=clamp((this.elapsed-1)/11.3);
    if(!this.holding){if(this.started&&!this.broken){this.gap+=dt;if(this.gap>.35){this.breaks++;this.broken=true;}}return;}
    if(y<-.035||y>1.035){this.outside+=dt;return;}
    this.started=true;
    for(let i=0;i<this.layers.length;i++)if(Math.abs(i/(this.layers.length-1)-y)<=.085)this.layers[i]+=dt/1.35;
    if(this.layers[Math.round(clamp(y)*(this.layers.length-1))]>2.1)this.waste+=dt*.6;
    // An average cannot conceal a bare patch: every height needs a full wrap.
    this.sealed=this.layers.every(layer=>layer>=1);
  }
  get coverage(){return this.layers.reduce((sum,n)=>sum+clamp(n),0)/this.layers.length;}
  get score(){return Math.round(clamp(Math.pow(this.coverage,2.4)*70+(this.sealed?30:0)-this.waste*6-this.outside*10-this.breaks*12,0,100));}
}
// Rendering only. Angular bins retain where the moving web touched the load;
// SealSimulation remains the sole authority for coverage, penalties and completion.
const VISUAL_COLUMNS=128,VISUAL_ROWS=64;
const wrapAngle=n=>((n%360)+360)%360;
export function sealContact(angle){
  const a=(45-angle)*Math.PI/180,s=Math.sin(a),c=Math.cos(a),r=.5/Math.max(Math.abs(s),Math.abs(c));
  return {x:s*r,z:c*r};
}
export class SealFilmVisual {
  constructor(){this.cells=new Float32Array(VISUAL_COLUMNS*VISUAL_ROWS);this.previous=new Float64Array(VISUAL_ROWS);this.elapsed=0;this.dirty=new Set([0,1,2,3]);this.revision=0;
    this.wallColumns=Array.from({length:4},(_,face)=>Uint8Array.from({length:32},(_,col)=>{
      const t=(col+.5)/32-.5,points=[[t,.5],[.5,-t],[-t,-.5],[-.5,t]],p=points[face];
      return Math.floor(wrapAngle(Math.atan2(p[0],p[1])*180/Math.PI)/360*VISUAL_COLUMNS)%VISUAL_COLUMNS;
    }));
  }
  sync(sim){
    const dt=sim.elapsed-this.elapsed;
    if(dt>0){
      // Subsample the swept angle so a slow frame cannot leave holes around corners.
      const count=Math.max(1,Math.ceil(dt/1.35*VISUAL_COLUMNS*2));
      for(let row=0;row<VISUAL_ROWS;row++){
        const earned=sim.layers[row]-this.previous[row];if(earned<=0)continue;
        for(let sample=0;sample<count;sample++){
          const angle=(this.elapsed+dt*(sample+.5)/count)/1.35*360+25;
          const col=Math.floor(wrapAngle(45-angle)/360*VISUAL_COLUMNS);
          const index=row*VISUAL_COLUMNS+col;
          const next=Math.min(3,this.cells[index]+earned*VISUAL_COLUMNS/count);
          if(next!==this.cells[index]){this.cells[index]=next;this.dirty.add(Math.floor(wrapAngle(col*360/VISUAL_COLUMNS+45)/90)%4);this.revision++;}
        }
      }
    }
    this.elapsed=sim.elapsed;this.previous.set(sim.layers);
  }
  density(face,u,row){
    // Map a Cartesian wall coordinate onto the angular coverage map, with the
    // same clockwise ordering as the four CSS rotateY surfaces.
    return this.cells[row*VISUAL_COLUMNS+this.wallColumns[face][clamp(Math.floor(u*32),0,31)]];
  }
}

let ribbonSequence=0;
export function createPalletSealing(Base){return class PalletSealing extends Base {
  render(){
    this.sim=new SealSimulation();this.filmVisual=new SealFilmVisual();this.pointer=null;this.keys=new Set();
    const art='assets/pallet-sealing/';
    const ribbonId=`seal-ribbon-${++ribbonSequence}`;
    const sides=['front','right','back','left'];
    const faces=sides.map((side,index)=>`<div class="seal-face seal-face-${side}"><div class="seal-cartons"><img class="seal-carton-wall" src="${art}cartons-side-${index+1}.png" alt="Nine CEVA Logistics cartons, ${side} wall" draggable="false"></div><div class="seal-film"></div><span class="seal-finish-stamp">✓ SEALED</span></div>`).join('');
    const blocks=[-.43,0,.43].flatMap(z=>[0,43,86].map(x=>`<div class="seal-pallet-block" style="left:${x}%;transform:translateZ(calc(var(--pallet-size)*${z}))">${sides.map(side=>`<i class="seal-block-${side}"></i>`).join('')}</div>`)).join('');
    const pallet=`<div class="seal-pallet" aria-hidden="true">${sides.map(side=>`<div class="seal-pallet-face seal-pallet-${side}"></div>`).join('')}<div class="seal-pallet-deck"></div><div class="seal-pallet-bottom"></div>${blocks}</div>`;
    this.root.innerHTML=`<section class="seal-layout" aria-label="Pallet sealing"><div class="seal-arena">

      <div class="seal-workspace"><div class="seal-turntable"><span>CEVA · WRAPPING STATION</span></div><div class="seal-shadow"></div><div class="seal-stack">${faces}<div class="seal-top"></div>${pallet}</div><svg class="seal-ribbon" aria-hidden="true"><defs><pattern id="${ribbonId}-texture" width="1" height="1" patternContentUnits="objectBoundingBox"><image href="${art}stretch-ribbon.png" width="1" height="1" preserveAspectRatio="none"/></pattern><linearGradient id="${ribbonId}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f2faff" stop-opacity=".65"/><stop offset=".4" stop-color="#dce9f1" stop-opacity=".37"/><stop offset="1" stop-color="#fff" stop-opacity=".72"/></linearGradient><linearGradient id="${ribbonId}-edge" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0"/><stop offset=".12" stop-color="white"/><stop offset="1" stop-color="white"/></linearGradient><mask id="${ribbonId}-blend" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%"><rect width="100%" height="100%" fill="url(#${ribbonId}-edge)"/></mask></defs><g mask="url(#${ribbonId}-blend)"><path class="seal-ribbon-texture" fill="url(#${ribbonId}-texture)"/><path class="seal-ribbon-sheet" fill="url(#${ribbonId})"/><path class="seal-ribbon-strands" fill="none" stroke="#f4fbff" stroke-opacity=".55" stroke-width=".65"/></g></svg><div class="seal-control"><div class="seal-rail"></div><button type="button" class="seal-roll" aria-label="Hold film roll and move only up or down. Space to hold, arrow keys to move." aria-describedby="seal-status"><span class="seal-roll-spool"><img src="${art}stretch-roll.png" alt="" draggable="false"></span><span class="seal-grip" aria-hidden="true"></span></button></div></div>
      <span id="seal-status" class="visually-hidden" role="status" aria-live="polite">Hold the roll at any height and cover the whole pallet.</span>
      </div><footer class="seal-meters"><div><span>COVERAGE <b id="seal-coverage">0%</b></span><div class="seal-meter"><i id="seal-coverage-bar"></i></div><small>Cover every part. Start at any height.</small></div><div><span>FILM USED <b id="seal-usage">GOOD</b></span><div class="seal-meter seal-film-meter"><i id="seal-usage-bar"></i></div><small id="seal-feedback">Hold continuously for an unbroken seal.</small></div><div class="seal-penalties"><span>FILM BREAKS <b id="seal-breaks">0</b></span><small>Releasing the roll can tear the film.</small></div></footer></section>`;
    this.roll=this.root.querySelector('.seal-roll');this.control=this.root.querySelector('.seal-control');this.stack=this.root.querySelector('.seal-stack');
    this.films=[...this.root.querySelectorAll('.seal-film')];
    this.filmMasks=this.films.map(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=64;const edge=document.createElement('canvas');edge.width=128;edge.height=256;return {canvas,ctx:canvas.getContext('2d'),data:new ImageData(32,64),edge,edgeCtx:edge.getContext('2d')};});
    this.ribbon=this.root.querySelector('.seal-ribbon');this.ribbonPaths=['sheet','texture','strands'].map(name=>this.ribbon.querySelector('.seal-ribbon-'+name));
    this.ribbonBlend=this.ribbon.querySelector('linearGradient[id$="-edge"]');
    const observer=new ResizeObserver(()=>{this.geometryDirty=true;});observer.observe(this.root.querySelector('.seal-workspace'));this.geometryDirty=true;
    this.cleanups.push(()=>observer.disconnect());
    this.listen(this.control,'pointerdown',event=>{if(event.button!==0||this.pointer!==null)return;event.preventDefault();this.pointer=event.pointerId;const r=this.roll.getBoundingClientRect();this.grab=event.target.closest('.seal-roll')?event.clientY-r.top-r.height/2:0;if(!event.target.closest('.seal-roll')){const rail=this.control.getBoundingClientRect();this.sim.y=clamp(1-(event.clientY-rail.top)/rail.height);}this.sim.hold(true);this.roll.setPointerCapture?.(event.pointerId);this.paint();});
    this.listen(this.roll,'pointermove',event=>{if(event.pointerId!==this.pointer)return;event.preventDefault();const r=this.control.getBoundingClientRect();this.sim.y=1-(event.clientY-this.grab-r.top)/r.height;this.paint();});
    const release=event=>{if(event.pointerId!==this.pointer)return;const id=this.pointer;this.pointer=null;this.sim.hold(false);if(this.roll.hasPointerCapture?.(id))this.roll.releasePointerCapture(id);this.paint();};
    this.listen(this.roll,'pointerup',release);this.listen(this.roll,'pointercancel',release);this.listen(this.roll,'lostpointercapture',release);
    this.listen(this.roll,'keydown',event=>{if([' ','Enter','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();this.keys.add(event.key);if(event.key===' '||event.key==='Enter')this.sim.hold(true);}});
    this.listen(this.roll,'keyup',event=>{this.keys.delete(event.key);if(event.key===' '||event.key==='Enter'){event.preventDefault();this.sim.hold(false);}});
    this.listen(this.roll,'blur',()=>{this.keys.clear();if(this.pointer===null)this.sim.hold(false);});
    this.cleanups.push(()=>{this.cancelFrame(this.raf);this.keys.clear();this.sim.hold(false);if(this.pointer!==null&&this.roll.hasPointerCapture?.(this.pointer))this.roll.releasePointerCapture(this.pointer);this.pointer=null;});this.paint();
  }
  start(){this.last=this.now();const tick=now=>{if(this.locked||this.ctx.isActive?.()===false)return;const dt=Math.min(.05,Math.max(0,(now-this.last)/1000));this.last=now;if(this.keys.has('ArrowUp'))this.sim.y+=dt*.13;if(this.keys.has('ArrowDown'))this.sim.y-=dt*.13;this.sim.step(dt);this.liveScore=this.score();this.paint();if(this.sim.sealed){this.ctx.finish();return;}this.raf=this.frame(tick);};this.raf=this.frame(tick);}
  paint(){
    const s=this.sim,y=clamp(s.y,-.08,1.08),outside=s.y<-.035||s.y>1.035;
    this.roll.style.bottom=`${y*100}%`;this.roll.classList.toggle('is-held',s.holding);this.roll.setAttribute('aria-pressed',String(s.holding));
    this.stack.style.transform=`rotateX(-11deg) rotateY(${s.elapsed/1.35*360+25}deg)`;
    this.filmVisual.sync(s);this.paintFilm();
    this.paintRibbon(s.holding&&!outside);
    this.root.classList.toggle('seal-complete',s.sealed);
    const message=s.sealed?'Pallet sealed. Ready for dispatch.':outside?'Outside the pallet. Move the roll back onto the load.':s.broken?'Film torn. Hold the roll again to continue.':!s.holding?'Hold the roll at any height.':s.waste>.6?'Extra layers are using too much film.':'Cover the bare cardboard. Fill every gap.';
    const status=this.root.querySelector('#seal-status');if(status.textContent!==message)status.textContent=message;
    this.root.querySelector('#seal-coverage').textContent=`${s.sealed?100:Math.min(99,Math.floor(s.coverage*100))}%`;this.root.querySelector('#seal-coverage-bar').style.width=`${s.coverage*100}%`;
    this.root.querySelector('#seal-usage').textContent=s.waste>2?'EXCESS':s.waste>.6?'HIGH':'GOOD';this.root.querySelector('#seal-usage-bar').style.width=`${Math.min(100,s.layers.reduce((sum,n)=>sum+n,0)/s.layers.length*55)}%`;this.root.querySelector('#seal-usage-bar').classList.toggle('is-excess',s.waste>2);
    this.root.querySelector('#seal-breaks').textContent=String(s.breaks);this.root.classList.toggle('seal-warning',outside||s.broken);
    this.correct=Math.round(s.coverage*24);this.mistakes=s.breaks+Math.floor(s.outside)+Math.floor(s.waste);
  }
  paintFilm(){
    const visual=this.filmVisual,now=this.now();
    // Only changed wall masks, at most 30 times/s; lighting never rerasterizes coverage.
    if(visual.dirty.size&&(this.maskTime===undefined||now-this.maskTime>=1000/30||this.sim.sealed)){
      for(const face of visual.dirty){const mask=this.filmMasks[face],bytes=mask.data.data;
        for(let row=0;row<64;row++)for(let col=0;col<32;col++){
          const d=visual.density(face,(col+.5)/32,row),i=((63-row)*32+col)*4;
          bytes[i+3]=Math.round(255*(d<=0?0:Math.min(.98,.90*Math.min(1,d)+.04*Math.max(0,d-1))));
        }
        // A thin turned edge only where deposited film meets bare cardboard.
        const edge=mask.edgeCtx;edge.clearRect(0,0,128,256);
        for(let row=0;row<64;row++)for(let col=0;col<32;col++){
          if(visual.density(face,(col+.5)/32,row)<.15)continue;
          const y=(63-row)*4,x=col*4;
          for(const offset of [-1,1])if(row+offset<0||row+offset>=64||visual.density(face,(col+.5)/32,row+offset)<.15){
            const line=y+(offset<0?3:0);edge.fillStyle='rgba(255,255,255,.85)';edge.fillRect(x,line,4,1);edge.fillStyle='rgba(28,39,48,.25)';edge.fillRect(x,line+(offset<0?-1:1),4,1);
          }
        }
        this.films[face].style.setProperty('--film-edge','url("'+mask.edge.toDataURL()+'")');
        mask.ctx.putImageData(mask.data,0,0);const image='url("'+mask.canvas.toDataURL()+'")';
        this.films[face].style.maskImage=image;this.films[face].style.webkitMaskImage=image;
      }
      visual.dirty.clear();this.maskTime=now;this.maskWrites=(this.maskWrites||0)+1;
    }
    const angle=this.sim.elapsed/1.35*360+25,bucket=Math.floor(angle/3);
    if(bucket!==this.lightBucket){this.lightBucket=bucket;this.films.forEach((film,face)=>{
      const normal=(angle+face*90)*Math.PI/180,light=Math.pow(Math.max(0,Math.cos(normal-.5)),5);
      film.style.setProperty('--film-light',(.18+light*.82).toFixed(2));
      film.style.setProperty('--film-shift',Math.round(Math.sin(normal)*65)+'%');
    });}
  }
  measureSeal(){
    const world=this.root.querySelector('.seal-workspace'),style=getComputedStyle(world);
    this.sealGeometry={width:world.clientWidth,height:world.clientHeight,perspective:parseFloat(style.perspective),x:this.stack.offsetLeft+this.stack.offsetWidth/2,y:this.stack.offsetTop+this.stack.offsetHeight/2,size:this.stack.offsetWidth,loadHeight:this.stack.offsetHeight,rollX:this.control.offsetLeft+this.roll.offsetLeft+this.roll.querySelector('.seal-roll-spool').offsetLeft,railTop:this.control.offsetTop,railHeight:this.control.clientHeight};
    this.geometryDirty=false;
  }
  projectSeal(point,height){
    const g=this.sealGeometry,angle=(this.sim.elapsed/1.35*360+25)*Math.PI/180,tilt=-11*Math.PI/180;
    const x=(point.x*Math.cos(angle)+point.z*Math.sin(angle))*g.size,z=(-point.x*Math.sin(angle)+point.z*Math.cos(angle))*g.size,y=(.5-height)*g.loadHeight;
    const ry=y*Math.cos(tilt)-z*Math.sin(tilt),rz=y*Math.sin(tilt)+z*Math.cos(tilt),scale=g.perspective/(g.perspective-rz);
    return {x:g.width/2+(g.x+x-g.width/2)*scale,y:g.height/2+(g.y+ry-g.height/2)*scale};
  }
  paintRibbon(visible){
    const svg=this.ribbon;svg.style.opacity=visible?'.86':'0';if(!visible)return;
    if(this.geometryDirty||!this.sealGeometry)this.measureSeal();const g=this.sealGeometry;if(!g.width)return;
    const contact=sealContact(this.sim.elapsed/1.35*360+25),y=clamp(this.sim.y),top=this.projectSeal(contact,clamp(y+.085)),bottom=this.projectSeal(contact,clamp(y-.085));
    const end=g.rollX,endY=g.railTop+(1-y)*g.railHeight,half=g.railHeight*.085;
    svg.setAttribute('viewBox',`0 0 ${g.width} ${g.height}`);
    this.ribbonBlend.setAttribute('x1',top.x);this.ribbonBlend.setAttribute('x2',end);
    const edge=t=>{const x=top.x+(bottom.x-top.x)*t,sy=top.y+(bottom.y-top.y)*t,ey=endY+(t*2-1)*half,m=(x+end)/2;return `M ${x} ${sy} Q ${m} ${(sy+ey)/2+1.5} ${end} ${ey}`;};
    const sheet=edge(0)+` L ${end} ${endY+half} Q ${(bottom.x+end)/2} ${(bottom.y+endY+half)/2+1.5} ${bottom.x} ${bottom.y} Z`;
    this.ribbonPaths[0].setAttribute('d',sheet);this.ribbonPaths[1].setAttribute('d',sheet);
    this.ribbonPaths[2].setAttribute('d',[0,.13,.32,.56,.79,1].map(edge).join(' '));
    this.ribbonContact={...contact,top,bottom,end,endY};
  }
  score(){return this.sim?.score||0;}
};}
