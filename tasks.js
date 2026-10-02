export const CARRIERS=["DHL","UPS","TNT","TOF","KLG","BRINGCARGO"];
export const GIFTS=["TEDDY BEAR","TRAIN SET","SNOW GLOBE","PUZZLE","ROBOT","RED SLED","DRUM","DOLL","SKATES","BLOCKS"];
export const GAME_CONFIGS=[
  {id:"picking",name:"SPEED PICKING",time:15,max:100,instruction:"Find each gift SKU before the elves need it."},
  {id:"conveyor",name:"CONVEYOR RUSH",time:20,max:100,instruction:"Send each moving gift to its carrier chute."},
  {id:"barcode",name:"BARCODE HUNT",time:15,max:100,instruction:"Click the parcel matching Santa’s target SKU."},
  {id:"packing",name:"PACKING TETRIS",time:25,max:100,instruction:"Pack every box into the pallet grid without overlaps."},
  {id:"detective",name:"WMS DETECTIVE",time:15,max:100,instruction:"Select records where WMS and the actual scan differ."},
  {id:"loading",name:"TRUCK LOADING",time:20,max:100,instruction:"Arrange pallets from the last delivery stop to the first."},
  {id:"memory",name:"MEMORY CHALLENGE",time:15,max:100,instruction:"Memorize Santa’s shipment, then select its gifts."},
  {id:"quality",name:"QUALITY CONTROL",time:15,max:100,instruction:"Select every parcel with a visible problem."},
  {id:"final",name:"FINAL DISPATCH",time:25,max:200,instruction:"Find every mismatch, then HOLD or RELEASE the sleigh shipment."}
];
export const ACTIVE_SECONDS=GAME_CONFIGS.reduce((sum,game)=>sum+game.time,0);
export const TRANSITION_SECONDS=1.5;
export const COMPETITION_SECONDS=180;

const digits=(rng,length=5)=>String(rng.int(10**(length-1),10**length-1));
export const sku=(rng)=>`SKU-${digits(rng)}`;
const unique=(count,factory)=>{const values=[];while(values.length<count){const value=factory();if(!values.includes(value))values.push(value);}return values;};
export const similarSkus=(rng,target,count)=>{
  const values=new Set([target]);
  while(values.size<count){const chars=[...target],at=rng.int(4,chars.length-1);chars[at]=String((Number(chars[at])+rng.int(1,8))%10);values.add(chars.join(""));}
  return rng.shuffle([...values]);
};

export function buildCompetition(seed,rng){
  return Object.fromEntries(GAME_CONFIGS.map((config,index)=>[config.id,buildTask(config.id,rng.fork(`${index}:${config.id}`))]));
}

export function buildTask(type,rng){
  if(type==="picking"||type==="barcode"){const targets=unique(10,()=>sku(rng));return {targets,rounds:targets.map((target,index)=>({target,options:similarSkus(rng,target,6+Math.floor(index/3))}))};}
  if(type==="conveyor"){return {parcels:Array.from({length:12},(_,index)=>({id:`GIFT-${index+1}`,carrier:rng.pick(CARRIERS),gift:rng.pick(GIFTS)}))};}
  if(type==="packing"){const shapes=[[2,2],[2,1],[1,2],[3,1],[1,1],[2,2],[3,1],[1,2]];return {cols:8,rows:5,boxes:shapes.map(([w,h],index)=>({id:`BOX-${index+1}`,w,h,gift:rng.pick(GIFTS)}))};}
  if(type==="detective"){const rows=Array.from({length:8},(_,index)=>{const expected=sku(rng),wrong=[1,4,6].includes(index),actual=wrong?similarSkus(rng,expected,2).find(value=>value!==expected):expected;return {id:`REC-${index+1}`,location:`${"ABCD"[index%4]}-${String(index+1).padStart(2,"0")}`,expected,actual};});return {rows,solution:rows.filter(row=>row.expected!==row.actual).map(row=>row.id)};}
  if(type==="loading"){const ids=unique(7,()=>`PLT-${digits(rng,4)}`),pallets=Array.from({length:7},(_,index)=>({id:ids[index],stop:index+1,city:["Oslo","Boston","Zurich","Toronto","Helsinki","Edinburgh","Copenhagen"][index]}));return {pallets:rng.shuffle(pallets),solution:[...pallets].sort((a,b)=>b.stop-a.stop).map(item=>item.id)};}
  if(type==="memory"){const shipment=rng.shuffle(GIFTS).slice(0,5);return {shipment,options:rng.shuffle([...shipment,...rng.shuffle(GIFTS.filter(gift=>!shipment.includes(gift))).slice(0,3)])};}
  if(type==="quality"){const issues=["dented","wrong-label","missing","wrong-sku"],parcels=Array.from({length:8},(_,index)=>({id:`GIFT-${index+1}`,sku:sku(rng),carrier:rng.pick(CARRIERS),issue:index<4?issues[index]:null}));return {parcels:rng.shuffle(parcels),solution:parcels.filter(parcel=>parcel.issue).map(parcel=>parcel.id)};}
  if(type==="final"){
    const order={id:`SHP-${digits(rng)}`,sku:sku(rng),quantity:12,carrier:rng.pick(CARRIERS),serials:12};
    const issuePool=rng.shuffle(["WRONG QUANTITY","WRONG CARRIER","WRONG SKU","MISSING SERIALS"]),solution=issuePool.slice(0,3);
    const actual={sku:solution.includes("WRONG SKU")?similarSkus(rng,order.sku,2).find(value=>value!==order.sku):order.sku,quantity:solution.includes("WRONG QUANTITY")?10:12,carrier:solution.includes("WRONG CARRIER")?rng.pick(CARRIERS.filter(item=>item!==order.carrier)):order.carrier,serials:solution.includes("MISSING SERIALS")?11:12};
    return {order,actual,options:issuePool,solution,action:"HOLD"};
  }
  throw new Error(`Unknown minigame: ${type}`);
}
