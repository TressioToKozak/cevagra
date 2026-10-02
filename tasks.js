export const CARRIERS=["DHL","UPS","TNT","TOF","KLG","BRINGCARGO"];
export const GIFTS=["TEDDY BEAR","TRAIN SET","SNOW GLOBE","PUZZLE","ROBOT","RED SLED","DRUM","DOLL","SKATES","BLOCKS"];
export const GAME_CONFIGS=[
  {id:"picking",name:"SPEED PICKING",time:15,max:100,action:"CLICK",instruction:"Find the requested product in the warehouse.",hint:"A correct SKU immediately brings the next pick."},
  {id:"conveyor",name:"CONVEYOR RUSH",time:20,max:100,action:"DRAG",instruction:"Drag each moving box into its matching carrier zone.",hint:"Sort it before it leaves the conveyor."},
  {id:"barcode",name:"BARCODE HUNT",time:15,max:100,action:"CLICK",instruction:"Find the box matching the displayed SKU.",hint:"Compare every digit before you click."},
  {id:"packing",name:"PACKING TETRIS",time:25,max:100,action:"DRAG",instruction:"Place the boxes onto Santa’s pallet grid.",hint:"Fit every shape without overlaps; green fits, red does not."},
  {id:"detective",name:"WMS DETECTIVE",time:15,max:100,action:"SELECT",instruction:"Compare WMS records with the actual scans.",hint:"Select every row that does not match, then lock your answer."},
  {id:"loading",name:"TRUCK LOADING",time:20,max:100,action:"DRAG",instruction:"Load the pallets into the truck.",hint:"The LAST delivery goes deepest inside, so load it FIRST."},
  {id:"memory",name:"MEMORY CHALLENGE",time:15,max:100,action:"MEMORIZE",instruction:"Remember the gifts before they disappear.",hint:"Then select only the gifts from Santa’s manifest."},
  {id:"quality",name:"QUALITY CONTROL",time:15,max:100,action:"SELECT",instruction:"Inspect the parcels and find every visible problem.",hint:"Look for damage, bad labels, missing data and wrong SKUs."},
  {id:"final",name:"FINAL DISPATCH",time:25,max:200,action:"CHECK",instruction:"Identify every shipment discrepancy.",hint:"Select all mismatches, then confirm that the shipment must be held."}
];
export const ACTIVE_SECONDS=GAME_CONFIGS.reduce((sum,game)=>sum+game.time,0);
export const TRANSITION_SECONDS=1.5;
export const COMPETITION_SECONDS=180;
export const buildGameOrder=(rng)=>{const order=rng.shuffle(GAME_CONFIGS.slice(0,-1));if(new Set(order.map(game=>game.id)).size!==order.length)throw new Error("Duplicate minigame in competition order");return [...order,GAME_CONFIGS.at(-1)];};

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
  if(type==="packing"){const shapes=[[3,2],[2,2],[3,1],[1,3],[2,1],[1,2],[2,2],[3,1],[2,1],[1,1]];return {cols:8,rows:5,boxes:rng.shuffle(shapes).map(([w,h],index)=>({id:`BOX-${index+1}`,w,h,gift:rng.pick(GIFTS)}))};}
  if(type==="detective"){const wrongRows=new Set(rng.shuffle([0,1,2,3,4,5,6,7]).slice(0,3)),rows=Array.from({length:8},(_,index)=>{const expected=sku(rng),wrong=wrongRows.has(index),actual=wrong?similarSkus(rng,expected,2).find(value=>value!==expected):expected;return {id:`REC-${index+1}`,location:`${"ABCD"[index%4]}-${String(index+1).padStart(2,"0")}`,expected,actual};});return {rows,solution:rows.filter(row=>row.expected!==row.actual).map(row=>row.id)};}
  if(type==="loading"){const ids=unique(7,()=>`PLT-${digits(rng,4)}`),cities=rng.shuffle(["Oslo","Boston","Zurich","Toronto","Helsinki","Edinburgh","Copenhagen"]),pallets=Array.from({length:7},(_,index)=>({id:ids[index],stop:index+1,city:cities[index]}));return {pallets:rng.shuffle(pallets),solution:[...pallets].sort((a,b)=>b.stop-a.stop).map(item=>item.id)};}
  if(type==="memory"){const shipment=rng.shuffle(GIFTS).slice(0,5);return {shipment,options:rng.shuffle([...shipment,...rng.shuffle(GIFTS.filter(gift=>!shipment.includes(gift))).slice(0,3)])};}
  if(type==="quality"){const issues=rng.shuffle(["dented","wrong-label","missing","wrong-sku",null,null,null,null]),parcels=Array.from({length:8},(_,index)=>({id:`GIFT-${index+1}`,sku:sku(rng),carrier:rng.pick(CARRIERS),issue:issues[index]}));return {parcels:rng.shuffle(parcels),solution:parcels.filter(parcel=>parcel.issue).map(parcel=>parcel.id)};}
  if(type==="final"){
    const order={id:`SHP-${digits(rng)}`,sku:sku(rng),quantity:12,carrier:rng.pick(CARRIERS),serials:12};
    const issuePool=rng.shuffle(["WRONG QUANTITY","WRONG CARRIER","WRONG SKU","MISSING SERIALS"]),solution=issuePool.slice(0,2);
    const actual={sku:solution.includes("WRONG SKU")?similarSkus(rng,order.sku,2).find(value=>value!==order.sku):order.sku,quantity:solution.includes("WRONG QUANTITY")?10:12,carrier:solution.includes("WRONG CARRIER")?rng.pick(CARRIERS.filter(item=>item!==order.carrier)):order.carrier,serials:solution.includes("MISSING SERIALS")?11:12};
    return {order,actual,options:issuePool,solution,action:"HOLD"};
  }
  throw new Error(`Unknown minigame: ${type}`);
}
