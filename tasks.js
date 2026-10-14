export const CARRIERS=["DHL","UPS","TNT","TOF","KLG","BRINGCARGO"];
export const GIFTS=["TEDDY BEAR","TRAIN SET","SNOW GLOBE","PUZZLE","ROBOT","RED SLED","DRUM","DOLL","SKATES","BLOCKS"];
export const GAME_CONFIGS=[
  {id:"picking",name:"SPEED PICKING",time:15,max:100,action:"CLICK",instruction:"Find the requested SKU. Click the matching warehouse location.",hint:"A correct SKU immediately brings the next pick."},
  {id:"conveyor",name:"CONVEYOR RUSH",time:20,max:100,action:"DRAG",instruction:"Drag each moving box into its matching carrier zone.",hint:"Sort it before it leaves the conveyor."},
  {id:"barcode",name:"BARCODE HUNT",time:15,max:100,action:"CLICK",instruction:"Find the box matching the displayed SKU.",hint:"Compare every digit before you click."},
  {id:"packing",name:"PACKING TETRIS",time:25,max:100,action:"DRAG",instruction:"Drag boxes onto the pallet. Fit every box without overlaps.",hint:"Fit every shape without overlaps; green fits, red does not."},
  {id:"detective",name:"WMS DETECTIVE",time:15,max:100,action:"SELECT",instruction:"Select every row where the WMS SKU differs from the scanner SKU.",hint:"Select every row that does not match, then lock your answer."},
  {id:"loading",name:"TRUCK LOADING",time:20,max:100,action:"DRAG",instruction:"Load the last delivery deepest inside the truck.",hint:"Click a pallet then a slot, or drag it. Swap pallets to change the load order."},
  {id:"memory",name:"MEMORY CHALLENGE",time:15,max:100,action:"MEMORIZE",instruction:"Remember the five gifts. Then select the same gifts.",hint:"Then select only the gifts from Santa’s manifest."},
  {id:"quality",name:"QUALITY CONTROL",time:15,max:100,action:"SELECT",instruction:"Inspect the parcels and find every visible problem.",hint:"Look for damage, bad labels, missing data and wrong SKUs."},
  {id:"final",name:"FINAL DISPATCH",time:25,max:200,action:"CHECK",instruction:"Compare the order with the packed shipment.",hint:"Flag every mismatch. RELEASE a matching shipment or HOLD an incorrect one."}
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

// Prefer underused eligible positions without forcing newly added slots.
// A hard usage cap and exclusion of the previous position keep rounds balanced.
export function balancedPositions(counts,rng){
  const used=Array(Math.max(...counts)).fill(0),cap=Math.ceil(counts.length/Math.min(...counts));let previous=-1;
  return counts.map(count=>{
    const eligible=Array.from({length:count},(_,i)=>i).filter(i=>(i!==previous||count===1)&&used[i]<cap);
    const weighted=eligible.flatMap(i=>Array(used[i]===0?3:1).fill(i)),position=rng.pick(weighted);
    used[position]++;previous=position;return position;
  });
}
export const PACKING_SETS=[
  [[3,2],[2,2],[3,1],[1,3],[2,1],[1,2],[2,2],[3,1],[2,1],[1,1]],
  [[3,2],[2,2],[1,3],[3,1],[1,2],[2,1],[2,2],[1,3],[1,2],[1,1]],
  [[3,2],[3,1],[1,3],[3,1],[1,3],[2,1],[2,2],[3,1],[1,2],[1,1]],
  [[3,2],[2,2],[3,1],[1,3],[2,1],[1,2],[2,2],[2,1],[1,2],[2,1]]
];

export function buildCompetition(seed,rng){
  return Object.fromEntries(GAME_CONFIGS.map((config,index)=>[config.id,buildTask(config.id,rng.fork(`${index}:${config.id}`))]));
}

export function buildTask(type,rng){
  if(type==="picking"||type==="barcode"){
    const targets=unique(10,()=>sku(rng)),counts=targets.map((_,index)=>6+Math.floor(index/3)),positions=balancedPositions(counts,rng.fork("answer-positions")),visual=rng.fork("artwork");
    return {targets,rounds:targets.map((target,index)=>{
      const options=similarSkus(rng,target,counts[index]).filter(value=>value!==target);options.splice(positions[index],0,target);
      const variants=type==="picking"?visual.shuffle([0,1,2,3,4,5,0,1,2]).slice(0,counts[index]):visual.shuffle(Array.from({length:counts[index]},(_,i)=>i%3));
      return {target,options,variants};
    })};
  }
  if(type==="conveyor"){
    const carriers=rng.shuffle(CARRIERS),assignments=rng.shuffle([...CARRIERS,...CARRIERS]),visual=rng.fork("artwork");
    return {carriers,parcels:Array.from({length:12},(_,index)=>({id:`GIFT-${index+1}`,carrier:assignments[index],gift:rng.pick(GIFTS),variant:visual.int(0,2)}))};
  }
  if(type==="packing"){
    const set=rng.int(0,PACKING_SETS.length-1),visual=rng.fork("artwork");
    return {cols:8,rows:5,set,layoutSeed:rng.int(0,0x7fffffff),boxes:rng.shuffle(PACKING_SETS[set]).map(([w,h],index)=>({id:`BOX-${index+1}`,w,h,gift:rng.pick(GIFTS),variant:visual.int(0,1)}))};
  }
  if(type==="detective"){
    const locations=rng.shuffle(unique(8,()=>rng.int(1,24)).map((number,i)=>`${"ABCD"[i%4]}-${String(number).padStart(2,"0")}`)),wrongRows=new Set(rng.shuffle([0,1,2,3,4,5,6,7]).slice(0,3));
    const rows=rng.shuffle(Array.from({length:8},(_,index)=>{const expected=sku(rng),actual=wrongRows.has(index)?similarSkus(rng,expected,2).find(value=>value!==expected):expected;return {id:`REC-${index+1}`,location:locations[index],expected,actual};}));
    return {rows,solution:rows.filter(row=>row.expected!==row.actual).map(row=>row.id)};
  }
  if(type==="loading"){const ids=unique(7,()=>`PLT-${digits(rng,4)}`),cities=rng.shuffle(["Oslo","Boston","Zurich","Toronto","Helsinki","Edinburgh","Copenhagen"]),pallets=Array.from({length:7},(_,index)=>({id:ids[index],stop:index+1,city:cities[index]}));return {pallets:rng.shuffle(pallets),solution:[...pallets].sort((a,b)=>b.stop-a.stop).map(item=>item.id)};}
  if(type==="memory"){const shipment=rng.shuffle(GIFTS).slice(0,5);return {shipment,options:rng.shuffle([...shipment,...rng.shuffle(GIFTS.filter(gift=>!shipment.includes(gift))).slice(0,3)])};}
  if(type==="quality"){const issues=rng.shuffle(["dented","wrong-label","missing","wrong-sku",null,null,null,null]),parcels=Array.from({length:8},(_,index)=>({id:`GIFT-${index+1}`,sku:sku(rng),carrier:rng.pick(CARRIERS),issue:issues[index],variant:rng.fork(`parcel-art-${index}`).int(0,2),sticker:rng.fork(`parcel-decor-${index}`).int(0,3)}));return {parcels:rng.shuffle(parcels),solution:parcels.filter(parcel=>parcel.issue).map(parcel=>parcel.id)};}
  if(type==="final"){
    const order={id:`SHP-${digits(rng)}`,sku:sku(rng),quantity:rng.pick([10,12,14]),carrier:rng.pick(CARRIERS),serials:12};
    const issuePool=rng.shuffle(["WRONG QUANTITY","WRONG CARRIER","WRONG SKU","MISSING SERIALS"]),solution=rng.int(0,1)?issuePool.slice(0,2):[];
    const actual={sku:solution.includes("WRONG SKU")?similarSkus(rng,order.sku,2).find(value=>value!==order.sku):order.sku,quantity:solution.includes("WRONG QUANTITY")?order.quantity-2:order.quantity,carrier:solution.includes("WRONG CARRIER")?rng.pick(CARRIERS.filter(item=>item!==order.carrier)):order.carrier,serials:solution.includes("MISSING SERIALS")?11:12};
    return {order,actual,options:issuePool,solution,action:solution.length?"HOLD":"RELEASE"};
  }
  throw new Error(`Unknown minigame: ${type}`);
}
