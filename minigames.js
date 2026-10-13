import { CARRIERS } from "./tasks.js";
import { scoreClassification, scoreStandard } from "./scoring.js";
import { attachPointerDrag } from "./interactions.js";

export function planPalletMove(slots,id,targetIndex){
  const next=[...slots],sourceIndex=next.indexOf(id),occupant=next[targetIndex]||null;
  if(sourceIndex===targetIndex)return {slots:next,sourceIndex,occupant:null,displacedTo:null};
  if(sourceIndex>=0)next[sourceIndex]=null;
  if(occupant&&occupant!==id&&sourceIndex>=0)next[sourceIndex]=occupant;
  next[targetIndex]=id;
  return {slots:next,sourceIndex,occupant:occupant===id?null:occupant,displacedTo:occupant?(sourceIndex>=0?sourceIndex:"yard"):null};
}

export function offsetGridCoordinate(coordinate,anchor={x:0,y:0}){
  const [x,y]=coordinate.split(":").map(Number);
  return `${x-anchor.x}:${y-anchor.y}`;
}

export function gridDragAnchor(rect,box,stepX,stepY,clientX,clientY){
  return {x:Math.max(0,Math.min(box.w-1,Math.floor((clientX-rect.left)/stepX))),y:Math.max(0,Math.min(box.h-1,Math.floor((clientY-rect.top)/stepY)))};
}

const PACKING_BOX_ASSETS={
  "1x1":["box-1x1-a.png","box-1x1-b.png"],"1x2":["box-1x2.png"],"1x3":["box-1x3.png"],
  "2x1":["box-2x1-a.png","box-2x1-b.png"],"2x2":["box-2x2-a.png","box-2x2-b.png"],
  "3x1":["box-3x1-a.png","box-3x1-b.png"],"3x2":["box-3x2.png"]
};

/** Resolve artwork by collision dimensions, never by the shuffled BOX number. */
export function packingBoxAsset(box,variant=0){
  const assets=PACKING_BOX_ASSETS[`${box.w}x${box.h}`];
  if(!assets)throw new Error(`No Packing Tetris artwork for ${box.w}x${box.h}`);
  return `assets/packing-tetris/boxes/${assets[variant%assets.length]}`;
}

/** Pack the inventory onto a fixed 8 x 5 unit rack without changing piece scale. */
export function packingInventoryLayout(boxes,cols=8,rows=5){
  const occupied=Array.from({length:rows},()=>Array(cols).fill(false)),positions={};
  const ordered=[...boxes].sort((a,b)=>b.w*b.h-a.w*a.h||b.h-a.h||b.w-a.w);
  const search=index=>{
    if(index===ordered.length)return true;
    const box=ordered[index];
    for(let y=0;y<=rows-box.h;y++)for(let x=0;x<=cols-box.w;x++){
      let open=true;for(let dy=0;dy<box.h&&open;dy++)for(let dx=0;dx<box.w;dx++)if(occupied[y+dy][x+dx]){open=false;break;}
      if(!open)continue;
      for(let dy=0;dy<box.h;dy++)for(let dx=0;dx<box.w;dx++)occupied[y+dy][x+dx]=true;
      positions[box.id]={x,y};if(search(index+1))return true;
      delete positions[box.id];for(let dy=0;dy<box.h;dy++)for(let dx=0;dx<box.w;dx++)occupied[y+dy][x+dx]=false;
    }
    return false;
  };
  if(!search(0))throw new Error("Packing inventory does not fit its unit rack");
  return positions;
}

export class BaseMinigame {
  init(context){this.ctx=context;this.root=context.root;this.data=context.data;this.mistakes=0;this.correct=0;this.cleanups=[];this.locked=false;return this;}
  render(){}
  start(){}
  score(){return 0;}
  complete(){this.locked=true;return {score:this.score(),mistakes:this.mistakes,correct:this.correct,attempts:this.correct+this.mistakes};}
  listen(node,event,handler){node.addEventListener(event,handler);this.cleanups.push(()=>node.removeEventListener(event,handler));}
  timeout(handler,delay){const id=setTimeout(handler,delay);this.cleanups.push(()=>clearTimeout(id));return id;}
  cleanup(){this.locked=true;this.dragGhost?.remove();this.dragGhost=null;this.cleanups.splice(0).forEach(fn=>fn());}
  flash(symbol,text,anchor){this.ctx.flash(symbol,text);this.ctx.feedback?.(symbol==="×"?"error":"success",text,anchor);this.ctx.update();}
  get remaining(){return this.ctx.remaining();}
}

class RapidFind extends BaseMinigame {
  constructor(kind){super();this.kind=kind;}
  render(){this.index=0;this.draw();}
  draw(){const round=this.data.rounds[this.index%this.data.rounds.length],isBarcode=this.kind==="barcode";this.current=round;this.root.innerHTML=`<div class="focus-card"><span>${isBarcode?"SANTA’S BARCODE":"TARGET GIFT SKU"}</span><strong>${round.target}</strong></div><div class="${isBarcode?"barcode-grid":"inventory-grid"}">${round.options.map((value,index)=>`<button class="${isBarcode?"barcode-parcel":"stock-card"}" data-sku="${value}">${isBarcode?'<i class="barcode"></i>':`<small>LOC ${String(index+1).padStart(2,"0")}</small>`}<strong>${value}</strong>${isBarcode?'<span>CEVA GIFT</span>':'<span>READY</span>'}</button>`).join("")}</div>`;this.root.querySelectorAll("[data-sku]").forEach(button=>this.listen(button,"click",()=>this.choose(button)));}
  choose(button){if(this.locked)return;const correct=button.dataset.sku===this.current.target;button.classList.remove("choice-correct","choice-wrong");void button.offsetWidth;button.classList.add(correct?"choice-correct":"choice-wrong",this.kind==="barcode"?"scan-result":"pick-result");if(correct){this.correct++;this.index++;this.flash("✓",this.kind==="barcode"?"SCAN CORRECT":"CORRECT SKU",button);if(this.index>=this.data.rounds.length)return this.ctx.finish();this.draw();}else{this.mistakes++;this.flash("×",this.kind==="barcode"?"WRONG BARCODE":"WRONG SKU",button);this.timeout(()=>button.classList.remove("choice-wrong","scan-result","pick-result"),260);}}
  score(){return scoreStandard({correct:Math.min(this.correct,10),total:10,mistakes:this.mistakes,completed:this.correct>=10,timeRemaining:this.remaining,timeLimit:this.ctx.config.time});}
  complete(){const result=super.complete(),missed=Math.max(0,10-this.correct);return {...result,correct:this.correct,mistakes:this.mistakes+missed,attempts:10+this.mistakes,score:this.score()};}
}

const SPEED_PICKING_LOCATIONS=[
  "location-01-natural-wood-pallet.png",
  "location-02-blue-pallet.png",
  "location-03-red-pallet.png",
  "location-04-yellow-pallet.png",
  "location-05-green-pallet.png",
  "location-06-purple-pallet.png"
];

// Code 128 module widths, indexed by symbol value. Barcode Hunt uses Code Set B,
// which covers every printable character used by the generated SKU values.
const CODE128_PATTERNS=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];

/** Return the exact Code 128-B symbols, including checksum and stop. */
export function code128Values(value){
  const text=String(value);if(!text||[...text].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)>126))throw new Error("Code 128-B supports printable ASCII only");
  const data=[...text].map(char=>char.charCodeAt(0)-32),checksum=(104+data.reduce((sum,symbol,index)=>sum+symbol*(index+1),0))%103;
  return [104,...data,checksum,106];
}

/** Crisp, dependency-free barcode artwork; the SKU caption remains inside the label. */
export function code128Svg(value){
  const patterns=code128Values(value).map(symbol=>CODE128_PATTERNS[symbol]),quiet=10,total=patterns.reduce((sum,pattern)=>sum+[...pattern].reduce((a,n)=>a+Number(n),0),0)+quiet*2;let x=quiet,bars="";
  for(const pattern of patterns)for(let index=0;index<pattern.length;index++){const width=Number(pattern[index]);if(index%2===0)bars+=`<rect x="${x}" y="1" width="${width}" height="38"/>`;x+=width;}
  const caption=String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  return `<svg class="carton-barcode" viewBox="0 0 ${total} 55" role="img" aria-label="Barcode for ${caption}" shape-rendering="crispEdges"><g fill="#03080e">${bars}</g><text x="${total/2}" y="52" text-anchor="middle" fill="#061426">${caption}</text></svg>`;
}

const BARCODE_CARTONS=[
  {name:"front",asset:"box-front-square-label.png"},
  {name:"left",asset:"box-angle-left-blank-label.png"},
  {name:"right",asset:"box-angle-right-blank-label.png"}
];

export class SpeedPicking extends RapidFind{
  constructor(){super("picking");}
  draw(){
    const round=this.data.rounds[this.index%this.data.rounds.length];this.current=round;
    this.root.innerHTML=`<div class="picking-target" aria-live="polite"><span>TARGET SKU</span><strong>${round.target}</strong></div><div class="picking-locations">${round.options.map((value,index)=>`<button class="picking-card" data-sku="${value}" aria-label="Location ${index+1}, ${value}"><span class="picking-photo"><img src="assets/speed-picking/locations/${SPEED_PICKING_LOCATIONS[index%SPEED_PICKING_LOCATIONS.length]}" alt="" draggable="false"><span class="picking-location">LOC ${String(index+1).padStart(2,"0")}</span><i class="picking-frame" aria-hidden="true"></i></span><span class="picking-card-footer"><strong>${value}</strong><i aria-hidden="true"></i></span></button>`).join("")}</div>`;
    this.root.querySelectorAll("[data-sku]").forEach(button=>this.listen(button,"click",()=>this.choose(button)));
  }
}
export class BarcodeHunt extends RapidFind{
  constructor(){super("barcode");}
  draw(){
    const round=this.data.rounds[this.index%this.data.rounds.length];this.current=round;
    const density=round.options.length>8?" barcode-grid-max":round.options.length>6?" barcode-grid-many":"";
    this.root.innerHTML=`<div class="barcode-target" aria-live="polite"><span>SANTA’S BARCODE</span><strong>${round.target}</strong></div><div class="barcode-grid${density}">${round.options.map((value,index)=>{const carton=BARCODE_CARTONS[index%BARCODE_CARTONS.length];return `<button class="barcode-parcel" data-sku="${value}" aria-label="Scan carton ${value}"><span class="barcode-card-shell" aria-hidden="true"></span><span class="carton carton-${carton.name}"><img src="assets/barcode-hunt/boxes/${carton.asset}" alt="" draggable="false"><span class="carton-label">${code128Svg(value)}</span></span></button>`;}).join("")}</div>`;
    this.root.querySelectorAll("[data-sku]").forEach(button=>this.listen(button,"click",()=>this.choose(button)));
  }
}

export class ConveyorRush extends BaseMinigame {
  render(){
    this.index=0;this.active=null;this.dragging=false;this.settling=false;
    const art="assets/conveyor-rush/";
    this.root.innerHTML=`<div class="conveyor"><img class="conveyor-base" src="${art}belt/belt-base.png" alt="" draggable="false"><div class="conveyor-motion" aria-hidden="true"><div></div></div><img class="conveyor-trim" src="${art}belt/belt-front-trim.png" alt="" draggable="false"><div id="moving-parcel"></div></div><div class="chutes" aria-label="Carrier sorting zones">${CARRIERS.map(carrier=>`<div class="carrier-zone" data-chute="${carrier}" role="group" aria-label="${carrier}, drop matching parcel here"><div class="chute-art" aria-hidden="true"><img class="chute-image" src="${art}zones/zone-${carrier.toLowerCase()}.png" alt="" draggable="false"><img class="chute-state chute-hover" src="${art}states/drop-valid.png" alt="" draggable="false"><img class="chute-state chute-success" src="${art}states/drop-valid-check.png" alt="" draggable="false"><img class="chute-state chute-error" src="${art}states/drop-invalid.png" alt="" draggable="false"></div><div class="chute-copy"><img class="carrier-badge" src="${art}carriers/badge-${carrier.toLowerCase()}.png" alt="" draggable="false"><span class="carrier-name">${carrier}</span><small>DROP MATCHING BOX HERE</small><b class="chute-status" aria-hidden="true"></b></div></div>`).join("")}</div>`;
    this.cleanups.push(()=>this.root.querySelector(".conveyor-motion")?.remove());
    this.resizeObserver=globalThis.ResizeObserver?new ResizeObserver(()=>{
      if(!this.box||this.locked)return;
      if(this.dragging)this.geometryPending=true;else this.measureTrack(true);
    }):null;
    const belt=this.root.querySelector(".conveyor");if(belt)this.resizeObserver?.observe(belt);
    this.cleanups.push(()=>this.resizeObserver?.disconnect());
  }
  start(){this.spawn();this.lastFrame=performance.now();const tick=now=>{if(this.locked)return;const seconds=(now-this.lastFrame)/1000;this.lastFrame=now;if(this.active&&!this.dragging&&!this.settling){this.x+=this.speed*seconds;this.position();if(this.box&&this.x>this.endX)this.miss();}if(!this.locked)this.raf=requestAnimationFrame(tick);};this.raf=requestAnimationFrame(tick);this.cleanups.push(()=>cancelAnimationFrame(this.raf));}
  spawn(){
    if(this.locked||this.index>=this.data.parcels.length)return;
    this.active=this.data.parcels[this.index];
    // Variant selection is presentation only; never consume the gameplay RNG.
    const variant=["front","angle-left","angle-right"][this.index%3],art="assets/conveyor-rush/";
    const host=this.root.querySelector("#moving-parcel");
    host.innerHTML=`<div class="moving-box conveyor-parcel parcel-${variant}${this.active.carrier==="BRINGCARGO"?" parcel-long-carrier":""}" data-moving-box role="group" aria-label="${this.active.carrier}, ${this.active.id}, ${this.active.gift}"><img class="parcel-art" src="${art}boxes/parcel-${variant}.png" alt="" draggable="false"><div class="parcel-label"><img src="${art}labels/shipping-label-${variant}.png" alt="" draggable="false"><div class="parcel-copy"><b>${this.active.carrier}</b><span>${this.active.id}</span><small>${this.active.gift}</small></div></div></div>`;
    this.box=host.firstElementChild;this.measureTrack();this.position();
    this.boxDragCleanup=attachPointerDrag({element:this.box,targets:()=>this.root.querySelectorAll("[data-chute]"),hitPadding:12,createGhost:({element})=>{const node=element.cloneNode(true);node.style.transform="none";return node;},onStart:()=>{this.dragging=true;},onDrop:({target})=>{this.dragging=false;if(target)this.sort(target);else if(this.geometryPending)this.measureTrack(true);},onCancel:()=>{this.dragging=false;if(this.geometryPending)this.measureTrack(true);this.position();}});
    this.cleanups.push(this.boxDragCleanup);
  }
  measureTrack(preserveProgress=false){
    const belt=this.root.querySelector(".conveyor"),track=this.root.querySelector(".conveyor-motion"),host=this.root.querySelector("#moving-parcel");
    if(!belt||!track||!this.box)return;
    const progress=preserveProgress&&this.endX>this.startX?(this.x-this.startX)/(this.endX-this.startX):0;
    const beltRect=belt.getBoundingClientRect(),trackRect=track.getBoundingClientRect(),boxRect=this.box.getBoundingClientRect();
    this.trackStart=trackRect.left-beltRect.left;this.trackEnd=trackRect.right-beltRect.left;
    this.boxWidth=boxRect.width;this.startX=this.trackStart-this.boxWidth;this.endX=this.trackEnd;
    this.travelDuration=Math.max(2.6,3.8-this.index*.11);
    this.speed=(this.endX-this.startX)/this.travelDuration;
    this.x=this.startX+progress*(this.endX-this.startX);
    // Parcel coordinates share the belt origin; clipping hides entry/exit off the surface.
    host.style.clipPath=`inset(0 ${Math.max(0,beltRect.width-this.trackEnd)}px 0 ${this.trackStart}px)`;
    this.box.style.top=`${trackRect.bottom-beltRect.top-boxRect.height}px`;
    this.geometryPending=false;this.position();
  }
  position(){if(this.box&&!this.dragging)this.box.style.transform=`translate3d(${this.x}px,0,0)`;}
  sort(zone){
    if(!this.active||this.settling)return;
    this.settling=true;const correct=zone.dataset.chute===this.active.carrier;
    zone.classList.add(correct?"accepted":"rejected");
    // Routine sort feedback stays on the chute instead of shaking all hit targets.
    if(correct){this.correct++;this.ctx.flash("✓","PERFECT SORT");}
    else{this.mistakes++;this.ctx.flash("×","WRONG CARRIER");}
    this.ctx.update();this.box?.remove?.();this.box=null;this.advance();
    this.timeout(()=>zone.classList.remove("accepted","rejected"),240);
  }
  advance(){this.boxDragCleanup?.();this.boxDragCleanup=null;this.index++;this.active=null;this.settling=false;if(this.index>=this.data.parcels.length)return this.ctx.finish();this.spawn();}
  miss(){if(!this.active||this.settling)return;this.mistakes++;this.flash("×","MISSED BOX");this.advance();}
  score(){return scoreStandard({correct:this.correct,total:this.data.parcels.length,mistakes:this.mistakes,completed:this.correct===this.data.parcels.length,timeRemaining:this.remaining,timeLimit:this.ctx.config.time});}
  complete(){const result=super.complete(),missed=Math.max(0,this.data.parcels.length-this.correct-this.mistakes);return {...result,mistakes:this.mistakes+missed,attempts:this.data.parcels.length,score:this.score()};}
}

export class PackingTetris extends BaseMinigame {
  render(){
    this.cells=Array.from({length:this.data.rows},()=>Array(this.data.cols).fill(null));
    this.placed={};this.selected=null;this.previewCells=[];this.previewKey="";
    this.root.innerHTML=`<div class="packing-layout"><section class="box-bank"><div class="data-title">AVAILABLE BOXES</div><div class="shape-rack" role="list"></div></section><section class="pallet-panel"><div class="data-title">PALLET <span>•</span> ${this.data.cols} × ${this.data.rows} CELLS</div><div class="pallet-grid-wrap"><div class="pallet-board"><div class="pallet-grid">${this.cells.flatMap((row,y)=>row.map((_,x)=>`<button class="pallet-cell" data-cell="${x}:${y}" aria-label="Pallet cell ${x+1}, ${y+1}"></button>`)).join("")}<div class="placed-layer" aria-hidden="true"></div></div></div></div><div class="packing-key"><span><i class="key-valid"></i> FITS HERE</span><span><i class="key-invalid"></i> DOES NOT FIT</span></div></section></div>`;
    const rack=this.root.querySelector(".shape-rack"),layout=packingInventoryLayout(this.data.boxes,this.data.cols,this.data.rows);
    this.data.boxes.forEach((box,index)=>{const position=layout[box.id],slot=document.createElement("div");slot.className="shape-slot";slot.setAttribute("role","listitem");Object.assign(slot.style,{gridColumn:`${position.x+1} / span ${box.w}`,gridRow:`${position.y+1} / span ${box.h}`});const button=document.createElement("button");button.className="shape-box";button.dataset.shape=box.id;button.style.setProperty("--w",box.w);button.style.setProperty("--h",box.h);button.innerHTML=this.boxMarkup(box,packingBoxAsset(box,index));slot.append(button);rack.append(slot);this.bindShape(button,box);});
    this.root.querySelectorAll("[data-cell]").forEach(cell=>this.listen(cell,"click",()=>this.place(this.selected,cell.dataset.cell)));
    const grid=this.root.querySelector(".pallet-grid");
    this.resizeObserver=globalThis.ResizeObserver?new ResizeObserver(()=>this.syncGeometry()):null;
    this.resizeObserver?.observe(grid);this.cleanups.push(()=>this.resizeObserver?.disconnect());
    requestAnimationFrame(()=>this.syncGeometry());
  }
  boxMarkup(box,asset){return `<span class="shape-art"><img src="${asset}" alt="" draggable="false"></span><span class="shape-copy"><strong>${box.id}</strong><small>${box.w} × ${box.h}</small></span>`;}
  bindShape(element,box){
    this.listen(element,"click",()=>{if(!element.dataset.dragged)this.selectShape(box.id);});
    this.cleanups.push(attachPointerDrag({element,targets:()=>this.root.querySelectorAll("[data-cell]"),hitPadding:5,createGhost:({rect,event})=>{const geometry=this.boxGeometry(box),xRatio=(event.clientX-rect.left)/rect.width,yRatio=(event.clientY-rect.top)/rect.height,node=document.createElement("div");node.className="packing-drag-ghost";node.innerHTML=this.boxMarkup(box,element.querySelector("img").getAttribute("src"));return {node,rect:{left:event.clientX-xRatio*geometry.width,top:event.clientY-yRatio*geometry.height,...geometry}};},onStart:({startX,startY})=>{this.selectShape(box.id);this.root.classList.add("is-dragging");const rect=element.getBoundingClientRect(),styles=getComputedStyle(this.root),stepX=parseFloat(styles.getPropertyValue("--pack-step-x")),stepY=parseFloat(styles.getPropertyValue("--pack-step-y"));this.dragAnchor=gridDragAnchor(rect,box,stepX,stepY,startX,startY);this.dragCoordinate=null;},onMove:({target})=>{this.dragCoordinate=target?offsetGridCoordinate(target.dataset.cell,this.dragAnchor):null;this.dragCoordinate?this.preview(box.id,this.dragCoordinate):this.clearPreview();},onDrop:({target})=>{this.root.classList.remove("is-dragging");this.clearPreview();if(target&&this.dragCoordinate)this.place(box.id,this.dragCoordinate);else this.flash("×","DROP ON THE PALLET");this.dragAnchor=null;this.dragCoordinate=null;},onCancel:()=>{this.root.classList.remove("is-dragging");this.clearPreview();this.dragAnchor=null;this.dragCoordinate=null;}}));
  }
  boxGeometry(box){const styles=getComputedStyle(this.root),stepX=parseFloat(styles.getPropertyValue("--pack-step-x")),stepY=parseFloat(styles.getPropertyValue("--pack-step-y")),cellW=parseFloat(styles.getPropertyValue("--pack-cell-w")),cellH=parseFloat(styles.getPropertyValue("--pack-cell-h"));return {width:cellW+(box.w-1)*stepX,height:cellH+(box.h-1)*stepY};}
  syncGeometry(){
    const grid=this.root.querySelector(".pallet-grid"),first=grid?.querySelector('[data-cell="0:0"]'),next=grid?.querySelector('[data-cell="1:0"]'),below=grid?.querySelector('[data-cell="0:1"]');if(!first||!next||!below)return;
    const a=first.getBoundingClientRect(),b=next.getBoundingClientRect(),c=below.getBoundingClientRect();
    this.root.style.setProperty("--pack-cell-w",`${a.width}px`);this.root.style.setProperty("--pack-cell-h",`${a.height}px`);this.root.style.setProperty("--pack-step-x",`${b.left-a.left}px`);this.root.style.setProperty("--pack-step-y",`${c.top-a.top}px`);
    this.root.style.setProperty("--pack-gap-x",`${b.left-a.right}px`);this.root.style.setProperty("--pack-gap-y",`${c.top-a.bottom}px`);
    Object.keys(this.placed).forEach(id=>this.positionPlaced(id));
  }
  positionPlaced(id){const placement=this.placed[id],box=this.data.boxes.find(item=>item.id===id),block=this.root.querySelector(`[data-placed="${id}"]`),cell=this.root.querySelector(`[data-cell="${placement?.x}:${placement?.y}"]`),grid=this.root.querySelector(".pallet-grid");if(!placement||!block||!cell||!grid)return;const cr=cell.getBoundingClientRect(),gr=grid.getBoundingClientRect(),styles=getComputedStyle(this.root),stepX=parseFloat(styles.getPropertyValue("--pack-step-x")),stepY=parseFloat(styles.getPropertyValue("--pack-step-y")),cellW=parseFloat(styles.getPropertyValue("--pack-cell-w")),cellH=parseFloat(styles.getPropertyValue("--pack-cell-h"));Object.assign(block.style,{left:`${cr.left-gr.left}px`,top:`${cr.top-gr.top}px`,width:`${cellW+(box.w-1)*stepX}px`,height:`${cellH+(box.h-1)*stepY}px`});}
  selectShape(id){this.selected=id;this.root.querySelectorAll("[data-shape]").forEach(box=>box.classList.toggle("picked",box.dataset.shape===id));}
  canPlace(id,coordinate){if(!id||this.placed[id])return false;const box=this.data.boxes.find(item=>item.id===id),[x,y]=coordinate.split(":").map(Number);return x>=0&&y>=0&&x+box.w<=this.data.cols&&y+box.h<=this.data.rows&&Array.from({length:box.h},(_,dy)=>Array.from({length:box.w},(_,dx)=>this.cells[y+dy][x+dx])).flat().every(value=>!value);}
  clearPreview(){if(!this.previewCells.length)return;this.previewCells.forEach(cell=>cell.classList.remove("valid-target","invalid-target","preview-edge"));this.previewCells=[];this.previewKey="";}
  preview(id,coordinate){if(!id)return this.clearPreview();const valid=this.canPlace(id,coordinate),key=`${id}:${coordinate}:${valid}`;if(key===this.previewKey)return;this.clearPreview();this.previewKey=key;const box=this.data.boxes.find(item=>item.id===id),[x,y]=coordinate.split(":").map(Number);for(let dy=0;dy<box.h;dy++)for(let dx=0;dx<box.w;dx++){const cell=this.root.querySelector(`[data-cell="${x+dx}:${y+dy}"]`);if(cell){cell.classList.add(valid?"valid-target":"invalid-target","preview-edge");this.previewCells.push(cell);}}}
  place(id,coordinate){
    if(!id||this.placed[id])return;const box=this.data.boxes.find(item=>item.id===id),[x,y]=coordinate.split(":").map(Number);
    if(!this.canPlace(id,coordinate)){this.mistakes++;this.root.querySelector(`[data-shape="${id}"]`)?.classList.add("placement-error");this.timeout(()=>this.root.querySelector(`[data-shape="${id}"]`)?.classList.remove("placement-error"),220);this.flash("×","BOX DOES NOT FIT");return;}
    for(let dy=0;dy<box.h;dy++)for(let dx=0;dx<box.w;dx++)this.cells[y+dy][x+dx]=id;
    this.placed[id]={x,y};this.correct++;this.selected=null;
    const source=this.root.querySelector(`[data-shape="${id}"]`);source?.classList.add("packed-away");
    const block=document.createElement("div");block.className="placed-box placed-pop";block.dataset.placed=id;block.innerHTML=`<img src="${source?.querySelector("img")?.src||packingBoxAsset(box)}" alt=""><span><b>${id}</b><small>${box.w} × ${box.h}</small></span>`;this.root.querySelector(".placed-layer").append(block);this.positionPlaced(id);
    this.clearPreview();this.flash("✓","BOX PACKED");
    if(this.correct===this.data.boxes.length)this.timeout(()=>this.ctx.finish(),250);
  }
  score(){const occupied=this.cells.flat().filter(Boolean).length,total=this.data.boxes.reduce((sum,box)=>sum+box.w*box.h,0);return scoreStandard({correct:occupied,total,mistakes:this.mistakes,completed:this.correct===this.data.boxes.length,timeRemaining:this.remaining,timeLimit:this.ctx.config.time});}
  complete(){const result=super.complete(),missed=this.data.boxes.length-this.correct;return {...result,mistakes:this.mistakes+missed,attempts:this.data.boxes.length+this.mistakes,score:this.score()};}
}

export class WmsDetective extends BaseMinigame {
  render(){
    this.selected=new Set();const art="assets/wms-detective/";
    const barcode=value=>code128Svg(value).replace('viewBox=', 'preserveAspectRatio="none" viewBox=');
    const columns=`<div class="wms-column-set"><span class="wms-column-location">LOCATION</span><span class="wms-column-expected">WMS REGISTERED <small>(EXPECTED)</small></span><span class="wms-column-actual">PHYSICAL SCAN <small>(ACTUAL)</small></span><span class="wms-column-flag">FLAG</span></div>`;
    this.root.innerHTML=`<section class="detective-terminal" aria-label="Warehouse management system record comparison"><header class="terminal-status"><div class="wms-system-heading"><img src="${art}icons/monitor.png" alt="" draggable="false"><div><strong>WMS · WAREHOUSE MANAGEMENT SYSTEM</strong><span>Compare the registered and scanned SKU for each location.</span></div></div><b id="detective-count" aria-live="polite">0 SELECTED</b><div class="wms-scanner-status"><i aria-hidden="true"></i><span>PHYSICAL SCANNER ONLINE</span></div></header><div class="detective-columns" aria-hidden="true">${columns}${columns}</div><div class="detective-records">${this.data.rows.map(row=>`<button class="detective-row" data-row="${row.id}" aria-pressed="false" aria-label="Rack ${row.location}, WMS ${row.expected}, physical scan ${row.actual}"><span class="wms-checkbox" aria-hidden="true"></span><span class="record-location"><small>RACK</small><b>${row.location}</b></span><span class="record-code expected"><small>WMS RECORD</small><b>${row.expected}</b><span class="wms-barcode" aria-hidden="true">${barcode(row.expected)}</span></span><span class="compare-arrow" aria-hidden="true"><img src="${art}icons/compare_arrow.png" alt="" draggable="false"></span><span class="record-code actual"><small>SCANNER READ</small><b>${row.actual}</b><span class="wms-barcode" aria-hidden="true">${barcode(row.actual)}</span></span><span class="record-flag"><b>MARK</b></span></button>`).join("")}</div><footer class="detective-footer"><span><img src="${art}icons/info.png" alt="" draggable="false">Select every row where the two SKU codes differ.</span><button class="lock-answer terminal-confirm" id="lock-detective"><img src="${art}icons/lock.png" alt="" draggable="false"><span>CONFIRM FLAGGED RECORDS</span></button></footer></section>`;
    this.listen(this.root.querySelector("#lock-detective"),"click",()=>{if(this.locked)return;this.locked=true;this.ctx.finish();});
    this.root.querySelectorAll("[data-row]").forEach(row=>this.listen(row,"click",()=>{
      if(this.locked)return;
      const id=row.dataset.row,selected=!this.selected.has(id);selected?this.selected.add(id):this.selected.delete(id);
      row.classList.toggle("selected",selected);row.setAttribute("aria-pressed",String(selected));
      row.querySelector(".record-flag b").textContent=selected?"FLAGGED":"MARK";
      this.root.querySelector("#detective-count").textContent=`${this.selected.size} SELECTED`;
      this.ctx.update();
    }));
  }
  // Selection must not disclose correctness through the shared live-score HUD.
  get liveScore(){return this.locked?this.score():0;}
  score(){return scoreClassification({selected:[...this.selected],solution:this.data.solution,universe:this.data.rows.map(row=>row.id),timeRemaining:this.remaining,timeLimit:this.ctx.config.time});}
  complete(){const result=super.complete();const answers=new Set(this.data.solution);this.correct=this.data.rows.filter(row=>this.selected.has(row.id)===answers.has(row.id)).length;this.mistakes=this.data.rows.length-this.correct;return {...result,score:this.score(),correct:this.correct,mistakes:this.mistakes,attempts:this.data.rows.length};}
}

export class TruckLoading extends BaseMinigame {
  render(){
    this.slots=Array(this.data.pallets.length).fill(null);this.selected=null;this.cards=new Map();
    this.root.innerHTML=`<div class="loading-guide"><strong>LAST DELIVERY → LOAD FIRST</strong><span>Deepest position is unloaded last</span></div><div class="truck-scene"><div class="truck-cab">TRUCK<br>FRONT</div><div class="truck-body"><div class="load-arrow"><span>DEEPEST · LOAD FIRST</span><b>←</b><span>REAR DOOR</span></div><div class="truck-slots">${this.slots.map((_,index)=>`<div class="truck-slot" data-slot="${index}"><small>POSITION ${index+1}</small><span class="slot-placeholder">DROP HERE</span></div>`).join("")}</div></div><div class="rear-door">OPEN<br>REAR</div></div><div class="pallet-yard"><span>PALLETS WAITING</span><div class="pallet-yard-cards"></div></div><button class="lock-answer" id="lock-loading" disabled>LOCK LOAD ORDER</button>`;
    const yard=this.root.querySelector(".pallet-yard-cards");
    this.data.pallets.forEach(pallet=>{const card=document.createElement("button");card.className="load-pallet";card.dataset.palletId=pallet.id;card.innerHTML=`<i aria-hidden="true">⠿</i><b>${pallet.city}</b><span>${this.deliveryLabel(pallet)}</span>`;yard.append(card);this.cards.set(pallet.id,card);this.bindPallet(card,pallet.id);});
    this.listen(this.root.querySelector("#lock-loading"),"click",()=>this.ctx.finish());
    this.root.querySelectorAll("[data-slot]").forEach(slot=>this.listen(slot,"click",event=>{if(event.target.closest(".load-pallet"))return;this.place(this.selected,Number(slot.dataset.slot));}));
  }
  deliveryLabel(pallet){const last=this.data.pallets.length;if(pallet.stop===last)return `STOP ${pallet.stop} · LAST DELIVERY · LOAD FIRST`;if(pallet.stop===1)return "STOP 1 · FIRST DELIVERY · LOAD LAST";return `STOP ${pallet.stop} · DELIVERY ${pallet.stop}`;}
  bindPallet(card,id){
    this.listen(card,"click",event=>{event.stopPropagation();if(!card.dataset.dragged)this.selectPallet(id);});
    this.cleanups.push(attachPointerDrag({element:card,targets:()=>this.root.querySelectorAll("[data-slot]"),hitPadding:12,onStart:()=>{this.selectPallet(id);this.root.classList.add("is-dragging");card.closest(".truck-slot")?.classList.add("source-slot");},onDrop:({target})=>{this.root.classList.remove("is-dragging");this.root.querySelectorAll(".source-slot").forEach(slot=>slot.classList.remove("source-slot"));if(target)this.place(id,Number(target.dataset.slot));},onCancel:()=>{this.root.classList.remove("is-dragging");this.root.querySelectorAll(".source-slot").forEach(slot=>slot.classList.remove("source-slot"));}}));
  }
  selectPallet(id){this.selected=this.selected===id?null:id;this.cards.forEach((card,key)=>card.classList.toggle("picked",key===this.selected));}
  setSlot(index,id){this.slots[index]=id;const slot=this.root.querySelector(`[data-slot="${index}"]`),card=id?this.cards.get(id):null;slot.classList.toggle("occupied",Boolean(id));slot.querySelector(".slot-placeholder").hidden=Boolean(id);if(card){slot.append(card);card.classList.remove("picked");}}
  place(id,index){
    if(!id||index<0||index>=this.slots.length)return;
    const {sourceIndex,occupant}=planPalletMove(this.slots,id,index);
    if(sourceIndex===index){this.selectPallet(null);return;}
    if(sourceIndex>=0)this.setSlot(sourceIndex,null);
    if(occupant&&occupant!==id){if(sourceIndex>=0)this.setSlot(sourceIndex,occupant);else{this.slots[index]=null;this.root.querySelector(".pallet-yard-cards").append(this.cards.get(occupant));}}
    this.setSlot(index,id);this.selected=null;this.cards.forEach(card=>card.classList.remove("picked"));
    const slot=this.root.querySelector(`[data-slot="${index}"]`);slot.classList.remove("placed-pop");void slot.offsetWidth;slot.classList.add("placed-pop");const note=document.createElement("span");note.className="slot-feedback";note.textContent=occupant?"✓ SWAPPED":"✓ LOADED";slot.append(note);this.timeout(()=>{slot.classList.remove("placed-pop");note.remove();},360);
    this.root.querySelector("#lock-loading").disabled=this.slots.some(value=>!value);this.ctx.update();
  }
  score(){const correct=this.slots.filter((id,index)=>id===this.data.solution[index]).length;return scoreStandard({correct,total:this.slots.length,mistakes:0,completed:correct===this.slots.length,timeRemaining:this.remaining,timeLimit:this.ctx.config.time});}
  complete(){const result=super.complete(),correct=this.slots.filter((id,index)=>id===this.data.solution[index]).length;return {...result,correct,mistakes:this.slots.length-correct,attempts:this.slots.length,score:this.score()};}
}

export class MemoryChallenge extends BaseMinigame {
  render(){this.selected=new Set();this.revealed=false;this.root.innerHTML=`<div class="memory-stage"><p>MEMORIZE THESE GIFTS</p><div class="gift-memory">${this.data.shipment.map(gift=>`<span>🎁 <b>${gift}</b></span>`).join("")}</div><strong>THE MANIFEST HIDES IN 4 SECONDS</strong></div>`;}
  start(){this.timeout(()=>this.hide(),4000);}
  hide(){if(this.locked)return;this.revealed=true;this.root.innerHTML=`<div class="memory-stage"><p>WHICH GIFTS WERE ON SANTA’S MANIFEST?</p><div class="memory-options">${this.data.options.map(gift=>`<button data-gift="${gift}">🎁 <b>${gift}</b></button>`).join("")}</div><button class="lock-answer" id="lock-memory">LOCK MANIFEST</button></div>`;this.listen(this.root.querySelector("#lock-memory"),"click",()=>this.ctx.finish());this.root.querySelectorAll("[data-gift]").forEach(button=>this.listen(button,"click",()=>{this.selected.has(button.dataset.gift)?this.selected.delete(button.dataset.gift):this.selected.add(button.dataset.gift);button.classList.toggle("selected");}));}
  score(){return scoreClassification({selected:[...this.selected],solution:this.data.shipment,universe:this.data.options,timeRemaining:this.remaining,timeLimit:this.ctx.config.time});}
  complete(){const result=super.complete(),answers=new Set(this.data.shipment),correct=this.data.options.filter(gift=>this.selected.has(gift)===answers.has(gift)).length;return {...result,correct,mistakes:this.data.options.length-correct,attempts:this.data.options.length,score:this.score()};}
}

export class QualityControl extends BaseMinigame {
  render(){
    this.selected=new Set();const art="assets/quality_control/";
    this.root.innerHTML=`<div class="quality-inspection"><div class="quality-legend"><span>EXPECTED: VALID CARRIER LABEL</span><span>COMPLETE SKU</span><span>UNDAMAGED BOX</span></div><div class="quality-grid">${this.data.parcels.map((parcel,index)=>{
      // Artwork variants never consume the task RNG or change the parcel data.
      const variant=["front","left","right"][index%3],carrier=parcel.issue==="wrong-label"?"OTHER":parcel.carrier,sku=parcel.issue==="missing"?"SKU ———":parcel.issue==="wrong-sku"?"SKU-ERROR":parcel.sku;
      const issueAsset={dented:"issue_damage",missing:"issue_missing_data","wrong-label":"issue_wrong_carrier","wrong-sku":"issue_wrong_sku"}[parcel.issue];
      return `<button class="quality-box qc-card ${parcel.issue||""}" data-quality="${parcel.id}" aria-pressed="false" aria-label="${parcel.id}, ${carrier}, ${sku}"><span class="qc-parcel qc-parcel-${variant}"><img class="qc-box-art" src="${art}boxes/box_${variant}.png" alt="" draggable="false">${parcel.issue==="dented"?`<img class="qc-damage" src="${art}damage/damage_crush.png" alt="" draggable="false"><img class="qc-damage qc-damage-tear" src="${art}damage/damage_tear.png" alt="" draggable="false">`:""}<img class="qc-sticker" src="${art}decor/${["sticker_tree","sticker_gift","sticker_holly","sticker_snowflake"][index%4]}.png" alt="" draggable="false"><span class="qc-label"><img src="${art}labels/label_base.png" alt="" draggable="false"><span class="qc-label-copy"><span class="qc-carrier">${carrier}</span><b class="qc-gift">${parcel.id}</b><small class="qc-sku${parcel.issue==="missing"?" qc-sku-missing":""}">${parcel.issue==="missing"?'<span>SKU</span><span class="qc-empty-field" aria-label="Missing SKU"></span>':sku}</small></span></span>${issueAsset?`<img class="qc-issue" src="${art}issues/${issueAsset}.png" alt="" draggable="false">`:""}</span><span class="qc-selection" aria-hidden="true">SELECTED</span><span class="qc-state" aria-hidden="true"></span></button>`;
    }).join("")}</div><div class="quality-footer"><button class="lock-answer" id="lock-quality"><span aria-hidden="true">▣</span> LOCK QUALITY CHECK</button></div></div>`;
    this.listen(this.root.querySelector("#lock-quality"),"click",()=>{if(this.locked)return;this.locked=true;this.ctx.finish();});
    this.root.querySelectorAll("[data-quality]").forEach(box=>this.listen(box,"click",()=>{
      const id=box.dataset.quality;this.selected.has(id)?this.selected.delete(id):this.selected.add(id);
      box.classList.toggle("selected");box.setAttribute("aria-pressed",String(this.selected.has(id)));
    }));
  }
  score(){return scoreClassification({selected:[...this.selected],solution:this.data.solution,universe:this.data.parcels.map(parcel=>parcel.id),timeRemaining:this.remaining,timeLimit:this.ctx.config.time});}
  complete(){const result=super.complete(),answers=new Set(this.data.solution),correct=this.data.parcels.filter(parcel=>this.selected.has(parcel.id)===answers.has(parcel.id)).length;return {...result,correct,mistakes:this.data.parcels.length-correct,attempts:this.data.parcels.length,score:this.score()};}
}

export class FinalDispatch extends BaseMinigame {
  render(){this.selected=new Set();this.action=null;const {order,actual}=this.data;this.root.closest(".competition-shell")?.classList.add("final-stage");this.root.innerHTML=`<div class="final-alert">FINAL SLEIGH CLEARANCE · CHECK ALL DETAILS</div><div class="dispatch-compare"><section><h3>CHRISTMAS ORDER</h3><dl><dt>SHIPMENT</dt><dd>${order.id}</dd><dt>SKU</dt><dd>${order.sku}</dd><dt>QUANTITY</dt><dd>${order.quantity}</dd><dt>CARRIER</dt><dd>${order.carrier}</dd><dt>SERIALS</dt><dd>${order.serials} / ${order.serials}</dd></dl></section><section><h3>PACKED SHIPMENT</h3><dl><dt>SHIPMENT</dt><dd>${order.id}</dd><dt>SKU</dt><dd>${actual.sku}</dd><dt>QUANTITY</dt><dd>${actual.quantity}</dd><dt>CARRIER</dt><dd>${actual.carrier}</dd><dt>SERIALS</dt><dd>${actual.serials} / ${order.serials}</dd></dl></section></div><div class="final-issues">${this.data.options.map(issue=>`<button data-issue="${issue}">${issue}</button>`).join("")}</div><div class="dispatch-actions"><button class="confirm-hold" data-action="HOLD">CONFIRM · HOLD SHIPMENT</button></div>`;this.root.querySelectorAll("[data-issue]").forEach(button=>this.listen(button,"click",()=>{this.selected.has(button.dataset.issue)?this.selected.delete(button.dataset.issue):this.selected.add(button.dataset.issue);button.classList.toggle("selected");}));this.listen(this.root.querySelector("[data-action=HOLD]"),"click",button=>{this.action="HOLD";button.currentTarget.classList.add("selected");this.timeout(()=>this.ctx.finish(),180);});}
  score(){const base=scoreClassification({selected:[...this.selected],solution:this.data.solution,universe:this.data.options,timeRemaining:this.remaining,timeLimit:this.ctx.config.time,max:180});return Math.min(200,base+(this.action===this.data.action?20:0));}
  complete(){const result=super.complete(),answers=new Set(this.data.solution),issueCorrect=this.data.options.filter(issue=>this.selected.has(issue)===answers.has(issue)).length,actionCorrect=this.action===this.data.action;return {...result,score:this.score(),correct:issueCorrect+(actionCorrect?1:0),mistakes:this.data.options.length-issueCorrect+(actionCorrect?0:1),attempts:this.data.options.length+1};}
  cleanup(){this.root.closest(".competition-shell")?.classList.remove("final-stage");super.cleanup();}
}

export const MINIGAME_CLASSES={picking:SpeedPicking,conveyor:ConveyorRush,barcode:BarcodeHunt,packing:PackingTetris,detective:WmsDetective,loading:TruckLoading,memory:MemoryChallenge,quality:QualityControl,final:FinalDispatch};
