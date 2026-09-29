const destinations = ["Reykjavik", "Oslo", "Helsinki", "Edinburgh", "Toronto", "Boston", "Copenhagen", "Zurich"];
export const CARRIERS = ["DHL", "UPS", "TNT", "TOF", "KLG", "BRINGCARGO"];
const choice = (items, rng = Math.random) => items[Math.floor(rng() * items.length)];
const int = (min, max, rng = Math.random) => Math.floor(rng() * (max - min + 1)) + min;
const shuffle = (items, rng = Math.random) => [...items].sort(() => rng() - .5);
const digits = (length, rng) => String(int(10 ** (length - 1), 10 ** length - 1, rng));
const sku = (rng, tier = 4) => `SKU-${digits(tier < 2 ? 3 : 5, rng)}`;
const serial = (rng) => `SN-${digits(6, rng)}`;
const location = (rng) => `${choice("ABCD", rng)}${String(int(1,12,rng)).padStart(2,"0")}-${String(int(1,6,rng)).padStart(2,"0")}`;
const id = (prefix, rng) => `${prefix}-${digits(5, rng)}`;
const uniqueValues = (count, factory) => { const values=[]; while(values.length<count){const value=factory();if(!values.includes(value))values.push(value);} return values; };
const mutate = (value, rng) => { const chars=[...value], indexes=chars.map((c,i)=>/\d/.test(c)?i:-1).filter(i=>i>=0), at=choice(indexes,rng); chars[at]=String((Number(chars[at])+int(1,8,rng))%10); return chars.join(""); };
const table = (title, columns, rows, selectable=false) => ({type:"table",title,columns,rows,selectable});
const list = (title, items, selectable=false) => ({type:"list",title,items,selectable});

export class DifficultyManager {
  static forRound(round) {
    const tier=Math.min(4,Math.ceil(round/3));
    return {tier,rows:[5,6,8,10][tier-1],errors:tier<3?1:2,time:[7,8,10,12][tier-1]};
  }
  static maximumRunSeconds(){ return 3*7+3*8+3*10+3*12+15+8+4; }
}

export class TaskGenerator {
  constructor(rng=Math.random){this.rng=rng;}
  base(type,title,instruction,difficulty){return {type,title,instruction,difficulty,panels:[],selectable:[],solution:[],mode:"select",submitLabel:"CHECK",penalty:5};}

  picking(d){
    const target=sku(this.rng,d.tier), products=uniqueValues(d.rows,()=>{let value;do{value=sku(this.rng,d.tier);}while(value===target);return value;}); products[int(0,products.length-1,this.rng)]=target;
    const rows=products.map((product,i)=>({key:`ROW-${i}`,cells:[location(this.rng),product,int(1,20,this.rng)]}));
    const solution=rows.filter(row=>row.cells[1]===target).map(row=>row.key);
    const task=this.base("picking","SKU FIND",`FIND ${target}`,d);
    task.panels=[table("STOCK",["LOCATION","SKU","QTY"],shuffle(rows,this.rng),true)]; task.solution=solution; task.selectable=rows.map(row=>row.key); return task;
  }

  inventory(d){
    const rows=[],solution=[];
    for(let i=0;i<d.rows;i++){
      const key=`ROW-${i+1}`,counted=int(5,25,this.rng),wrong=i<d.errors,wms=wrong?counted+int(1,4,this.rng):counted;
      rows.push({key,cells:[location(this.rng),wms,counted,wms===counted?"MATCH":"WRONG"]}); if(wrong)solution.push(key);
    }
    const task=this.base("inventory","STOCK CHECK","SELECT ALL WRONG ROWS",d);
    task.panels=[table("STOCK NUMBERS",["LOCATION","WMS","COUNTED","CHECK"],shuffle(rows,this.rng),true)];task.solution=solution;task.selectable=rows.map(row=>row.key);return task;
  }

  serials(d){
    const count=5+d.tier*2,expected=uniqueValues(count,()=>serial(this.rng)),scanned=[...expected],solution=[];
    for(let i=0;i<d.errors;i++){const index=i*2;scanned[index]=mutate(scanned[index],this.rng);solution.push(`ROW-${index}`);}
    const rows=expected.map((value,i)=>({key:`ROW-${i}`,cells:[value,scanned[i],value===scanned[i]?"MATCH":"WRONG"]}));
    const task=this.base("serials","SERIAL CHECK",d.errors===1?"FIND THE WRONG SERIAL":"FIND BOTH WRONG SERIALS",d);
    task.panels=[table("SERIALS",["EXPECTED","SCANNED","CHECK"],rows,true)];task.solution=solution;task.selectable=rows.map(row=>row.key);return task;
  }

  labels(d){
    const shipment=id("SHP",this.rng),carrier=choice(CARRIERS,this.rng),destination=choice(destinations,this.rng),rows=[],solution=[];
    for(let i=0;i<d.rows;i++){const key=`LABEL-${i+1}`,wrong=i<d.errors,cells=[key,shipment,wrong?choice(CARRIERS.filter(name=>name!==carrier),this.rng):carrier,destination];rows.push({key,cells});if(wrong)solution.push(key);}
    const task=this.base("labels","LABEL CHECK",d.errors===1?"FIND THE WRONG CARRIER":"FIND BOTH WRONG CARRIERS",d);
    task.panels=[table("ORDER",["SHIPMENT","CARRIER","TO"],[{cells:[shipment,carrier,destination]}]),table("LABELS",["LABEL","SHIPMENT","CARRIER","TO"],shuffle(rows,this.rng),true)];task.solution=solution;task.selectable=rows.map(row=>row.key);return task;
  }

  packing(d){
    const weight=int(8,27,this.rng),fragile=d.tier>=3&&this.rng()>.5,limits=[10,20,30,40],fitting=limits.find(limit=>limit>=weight),valid=`BOX ${String.fromCharCode(65+limits.indexOf(fitting))}`;
    const rows=limits.slice(0,d.tier<3?3:4).map((limit,i)=>{const name=`BOX ${String.fromCharCode(65+i)}`;return {key:name,cells:[name,`${limit} KG`,fragile?(name===valid||limit>fitting?"YES":"NO"):"—"]};});
    if(fragile){const validRow=rows.find(row=>row.key===valid);validRow.cells[2]="YES";}
    const task=this.base("packing","BOX CHECK",fragile?`ITEM: ${weight} KG · FRAGILE — CHOOSE THE SMALLEST BOX THAT FITS`:`ITEM: ${weight} KG — CHOOSE THE SMALLEST BOX THAT FITS`,d);
    task.panels=[table("BOXES",["BOX","MAX WEIGHT","FRAGILE"],rows,true)];task.solution=[valid];task.selectable=rows.map(row=>row.key);return task;
  }

  pallet(d){
    const items=Array.from({length:4+d.tier},(_,i)=>({key:`BOX ${i+1}`,weight:5+i*4,fragile:i===0}));
    return this.orderTask("pallet","PALLET ORDER","PUT HEAVY BOXES AT THE BOTTOM. FRAGILE BOX ON TOP.",d,items,(a,b)=>a.fragile?1:b.fragile?-1:b.weight-a.weight);
  }

  loading(d){
    const keys=uniqueValues(4+d.tier,()=>id("PLT",this.rng)),items=keys.map((key,i)=>({key,stop:i+1,weight:int(100,500,this.rng)}));
    return this.orderTask("loading","LOAD ORDER","PUT THE LAST STOP IN FIRST",d,items,(a,b)=>b.stop-a.stop);
  }

  orderTask(type,title,instruction,d,items,sorter){const task=this.base(type,title,instruction,d);task.mode="order";task.items=shuffle(items,this.rng);task.solution=[...items].sort(sorter).map(item=>item.key);task.submitLabel="CHECK ORDER";return task;}

  wms(d){
    const counted=int(5,25,this.rng),match=this.rng()>.5,wms=match?counted:counted+int(1,4,this.rng),options=["YES","NO"];
    const task=this.base("wms","NUMBER CHECK","DO THESE NUMBERS MATCH?",d);
    task.panels=[table("STOCK",["WMS","COUNTED"],[{cells:[wms,counted]}]),list("ANSWER",options.map(value=>({key:value,label:value})),true)];task.solution=[match?"YES":"NO"];task.selectable=options;return task;
  }

  scanner(d){
    const targets=uniqueValues(2+(d.tier>2?1:0),()=>sku(this.rng,d.tier)),scans=shuffle([...targets,...uniqueValues(d.rows-targets.length,()=>{let value;do{value=sku(this.rng,d.tier);}while(targets.includes(value));return value;})],this.rng);
    const task=this.base("scanner","SKU SCAN","SELECT ONLY THE ORDER SKUS",d);
    task.panels=[list("ORDER",targets),list("SCANNED ITEMS",scans.map((value,i)=>({key:`${i}:${value}`,label:value})),true)];task.solution=scans.map((value,i)=>targets.includes(value)?`${i}:${value}`:null).filter(Boolean);task.selectable=scans.map((value,i)=>`${i}:${value}`);return task;
  }

  quality(d){
    const rows=[],solution=[];
    for(let i=0;i<d.rows;i++){const key=`ITEM-${i+1}`,damaged=i<d.errors;rows.push({key,cells:[key,sku(this.rng,d.tier),damaged?"DAMAGED":"OK"]});if(damaged)solution.push(key);}
    const task=this.base("quality","DAMAGE CHECK",d.errors===1?"FIND THE DAMAGED ITEM":"FIND BOTH DAMAGED ITEMS",d);
    task.panels=[table("ITEMS",["ITEM","SKU","STATUS"],shuffle(rows,this.rng),true)];task.solution=solution;task.selectable=rows.map(row=>row.key);return task;
  }

  generate(type,d){return this[type](d);}
  generateFinal(){
    const d={tier:5,errors:3,time:15},shipment=id("SHP",this.rng),carrier=choice(CARRIERS,this.rng),destination=choice(destinations,this.rng),product=sku(this.rng),issues=["WRONG QTY","WRONG CARRIER","MISSING SERIAL"],all=[...issues,"WRONG PALLET","DAMAGED ITEM","WRONG SKU"];
    return {type:"final",title:"FINAL DISPATCH",instruction:"FIND ALL 3 WRONG DETAILS, THEN HOLD THE SHIPMENT",difficulty:d,mode:"final",solution:issues,action:"HOLD",selectable:all,penalty:5,panels:[table("ORDER",["SHIPMENT","SKU","QTY","CARRIER","TO"],[{cells:[shipment,product,12,carrier,destination]}]),table("SHIPMENT",["SKU","PACKED","LABEL CARRIER","SERIALS"],[{cells:[product,10,choice(CARRIERS.filter(name=>name!==carrier),this.rng),"11 / 12"]}]),list("WHAT IS WRONG?",shuffle(all,this.rng).map(value=>({key:value,label:value})),true)]};
  }
}

export const TASK_TYPES=["picking","inventory","serials","labels","packing","pallet","loading","wms","scanner","quality"];
export const taskIsCorrect=(task,selected,order=[],action=null)=>{const answer=task.mode==="order"?order:selected;return answer.length===task.solution.length&&answer.every((value,index)=>task.mode==="order"?value===task.solution[index]:task.solution.includes(value))&&(!task.action||task.action===action);};
