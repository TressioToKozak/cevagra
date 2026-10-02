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
const prompt = (rng, variants) => choice(variants, rng);

export class DifficultyManager {
  static forRound(round) {
    const tier=Math.min(4,Math.ceil(round/3));
    return {tier,rows:[5,6,8,10][tier-1],errors:tier<3?1:2};
  }
}

export class TaskTimer {
  static calculate(task) {
    if(task.mode==="final")return 24;
    const rows=task.panels?.reduce((total,panel)=>total+(panel.rows?.length||panel.items?.length||0),0)||task.items?.length||0;
    const answers=task.solution.length, multi=answers>1?2:0;
    const similar=task.difficulty.tier>=2&&["picking","serials","scanner"].includes(task.type)?1:0;
    let seconds;
    switch(task.type){
      case "wms": seconds=8; break;
      case "packing": seconds=9+(task.highlight?.value.includes("FRAGILE")?2:0); break;
      case "quality": seconds=7+rows*.45+multi; break;
      case "picking": seconds=8+(rows-4)*.55+similar; break;
      case "labels": seconds=8+rows*.45+multi; break;
      case "inventory": seconds=8+rows*.5+multi; break;
      case "serials": seconds=8+rows*.45+multi+similar; break;
      case "scanner": seconds=8+rows*.45+multi+similar; break;
      case "carrier": seconds=13+task.items.length; break;
      case "priority": seconds=9+rows*.4+multi; break;
      case "pallet": case "loading": seconds=10+(task.items?.length||0)*.9; break;
      default: seconds=10;
    }
    if(answers>1)seconds=Math.max(seconds,["serials","labels"].includes(task.type)?12:11);
    return Math.max(8,Math.min(18,Math.round(seconds)));
  }
}

export class TaskGenerator {
  constructor(rng=Math.random){this.rng=rng;}
  base(type,title,instruction,difficulty){return {type,title,instruction,difficulty,panels:[],selectable:[],solution:[],mode:"select",submitLabel:"CHECK",penalty:5};}

  picking(d){
    const target=sku(this.rng,d.tier), products=uniqueValues(d.rows,()=>{let value;do{value=sku(this.rng,d.tier);}while(value===target);return value;}); products[int(0,products.length-1,this.rng)]=target;
    const rows=products.map((product,i)=>({key:`ROW-${i}`,cells:[location(this.rng),product,int(1,20,this.rng)]}));
    const solution=rows.filter(row=>row.cells[1]===target).map(row=>row.key);
    const task=this.base("picking","ELF PICK LIST",prompt(this.rng,["FIND THIS GIFT SKU FOR THE ELVES","LOCATE THE SKU FOR SANTA’S ORDER","WHICH SHELF HOLDS THIS CHRISTMAS GIFT?"]),d); task.highlight={label:"TARGET SKU",value:target};
    task.panels=[table("STOCK",["LOCATION","SKU","QTY"],shuffle(rows,this.rng),true)]; task.solution=solution; task.selectable=rows.map(row=>row.key); return task;
  }

  inventory(d){
    const rows=[],solution=[];
    for(let i=0;i<d.rows;i++){
      const key=`ROW-${i+1}`,counted=int(5,25,this.rng),wrong=i<d.errors,wms=wrong?counted+int(1,4,this.rng):counted;
      rows.push({key,cells:[location(this.rng),wms,counted,wms===counted?"MATCH":"WRONG"]}); if(wrong)solution.push(key);
    }
    const task=this.base("inventory","WORKSHOP STOCK",prompt(this.rng,["FIND THE WRONG COUNTS IN THE ELF WORKSHOP","MARK EVERY GIFT COUNT THAT DOES NOT MATCH","WHICH CHRISTMAS STOCK ROWS ARE WRONG?"]),d);
    task.panels=[table("STOCK NUMBERS",["LOCATION","WMS","COUNTED","CHECK"],shuffle(rows,this.rng),true)];task.solution=solution;task.selectable=rows.map(row=>row.key);return task;
  }

  serials(d){
    const count=5+d.tier*2,expected=uniqueValues(count,()=>serial(this.rng)),scanned=[...expected],solution=[];
    for(let i=0;i<d.errors;i++){const index=i*2;scanned[index]=mutate(scanned[index],this.rng);solution.push(`ROW-${index}`);}
    const rows=expected.map((value,i)=>({key:`ROW-${i}`,cells:[value,scanned[i],value===scanned[i]?"MATCH":"WRONG"]}));
    const task=this.base("serials","SLEIGH SERIAL CHECK",prompt(this.rng,d.errors===1?["FIND THE WRONG SERIAL BEFORE SANTA DEPARTS","MARK THE GIFT WITH THE WRONG SERIAL"]:["FIND BOTH WRONG SERIALS BEFORE LOADING THE SLEIGH","MARK THE TWO GIFTS WITH WRONG SERIALS"]),d);
    task.panels=[table("SERIALS",["EXPECTED","SCANNED","CHECK"],rows,true)];task.solution=solution;task.selectable=rows.map(row=>row.key);return task;
  }

  labels(d){
    const shipment=id("SHP",this.rng),carrier=choice(CARRIERS,this.rng),destination=choice(destinations,this.rng),rows=[],solution=[];
    for(let i=0;i<d.rows;i++){const key=`LABEL-${i+1}`,wrong=i<d.errors,cells=[key,shipment,wrong?choice(CARRIERS.filter(name=>name!==carrier),this.rng):carrier,destination];rows.push({key,cells});if(wrong)solution.push(key);}
    const task=this.base("labels","CHRISTMAS LABELS",prompt(this.rng,d.errors===1?["FIND THE WRONG CARRIER ON SANTA’S LABELS","WHICH CHRISTMAS LABEL HAS THE WRONG CARRIER?"]:["FIND BOTH WRONG CARRIERS ON THE GIFT LABELS","MARK THE TWO INCORRECT CHRISTMAS LABELS"]),d);
    task.panels=[table("ORDER",["SHIPMENT","CARRIER","TO"],[{cells:[shipment,carrier,destination]}]),table("LABELS",["LABEL","SHIPMENT","CARRIER","TO"],shuffle(rows,this.rng),true)];task.solution=solution;task.selectable=rows.map(row=>row.key);return task;
  }

  packing(d){
    const weight=int(8,27,this.rng),fragile=d.tier>=3&&this.rng()>.5,limits=[10,20,30,40],fitting=limits.find(limit=>limit>=weight),valid=`BOX ${String.fromCharCode(65+limits.indexOf(fitting))}`;
    const rows=limits.slice(0,d.tier<3?3:4).map((limit,i)=>{const name=`BOX ${String.fromCharCode(65+i)}`;return {key:name,cells:[name,`${limit} KG`,fragile?(name===valid||limit>fitting?"YES":"NO"):"—"]};});
    if(fragile){const validRow=rows.find(row=>row.key===valid);validRow.cells[2]="YES";}
    const task=this.base("packing","GIFT BOX CHECK",prompt(this.rng,["CHOOSE THE SMALLEST GIFT BOX THAT FITS","HELP THE ELVES PICK THE TIGHTEST SAFE BOX","WHICH CHRISTMAS BOX FITS THIS GIFT?"]),d); task.highlight={label:"ITEM",value:`${weight} KG${fragile?" · FRAGILE":""}`};
    task.panels=[table("BOXES",["BOX","MAX WEIGHT","FRAGILE"],rows,true)];task.solution=[valid];task.selectable=rows.map(row=>row.key);return task;
  }

  pallet(d){
    const items=Array.from({length:4+d.tier},(_,i)=>({key:`BOX ${i+1}`,weight:5+i*4,fragile:i===0}));
    return this.orderTask("pallet","SANTA’S PALLET","BUILD TOP TO BOTTOM: FRAGILE GIFT FIRST, HEAVIEST BOX LAST.",d,items,(a,b)=>a.fragile?-1:b.fragile?1:a.weight-b.weight);
  }

  loading(d){
    const keys=uniqueValues(4+d.tier,()=>id("PLT",this.rng)),items=keys.map((key,i)=>({key,stop:i+1,weight:int(100,500,this.rng)}));
    return this.orderTask("loading","SLEIGH LOAD ORDER","LOAD SANTA’S LAST STOP FIRST",d,items,(a,b)=>b.stop-a.stop);
  }

  carrier(d){
    const count=Math.min(3+d.tier,6),carriers=shuffle(CARRIERS,this.rng).slice(0,count);
    const boxIds=uniqueValues(count,()=>id("BOX",this.rng));
    const items=carriers.map((carrier,index)=>({key:boxIds[index],carrier,destination:destinations[index%destinations.length]}));
    const targets=shuffle(carriers,this.rng).map((carrier,index)=>({key:`TRUCK-${carrier}`,carrier,label:`BAY ${index+1} · ${carrier}`}));
    const task=this.base("carrier","CHRISTMAS TRUCK SORTING","LOAD EVERY GIFT BOX INTO ITS CARRIER’S TRUCK",d);
    task.mode="match";task.items=shuffle(items,this.rng);task.targets=targets;task.solution=items.map(item=>`${item.key}:${`TRUCK-${item.carrier}`}`);task.submitLabel="CHECK ALL TRUCKS";return task;
  }

  orderTask(type,title,instruction,d,items,sorter){const task=this.base(type,title,instruction,d);task.mode="order";task.items=shuffle(items,this.rng);task.solution=[...items].sort(sorter).map(item=>item.key);task.submitLabel="CHECK ORDER";return task;}

  wms(d){
    const counted=int(5,25,this.rng),match=this.rng()>.5,wms=match?counted:counted+int(1,4,this.rng),options=["YES","NO"];
    const task=this.base("wms","ELF COUNT CHECK",prompt(this.rng,["DO THE ELF AND WMS COUNTS MATCH?","IS SANTA’S GIFT COUNT CORRECT?","CHECK THE TWO CHRISTMAS STOCK COUNTS"]),d);
    task.panels=[table("STOCK",["WMS","COUNTED"],[{cells:[wms,counted]}]),list("ANSWER",options.map(value=>({key:value,label:value})),true)];task.solution=[match?"YES":"NO"];task.selectable=options;return task;
  }

  scanner(d){
    const targets=uniqueValues(2+(d.tier>2?1:0),()=>sku(this.rng,d.tier)),scans=shuffle([...targets,...uniqueValues(d.rows-targets.length,()=>{let value;do{value=sku(this.rng,d.tier);}while(targets.includes(value));return value;})],this.rng);
    const task=this.base("scanner","SLEIGH SCAN",prompt(this.rng,["SELECT ONLY THE SKUS FOR THIS SLEIGH","MARK EVERY GIFT ON SANTA’S ORDER","WHICH SCANNED GIFTS BELONG ON THIS SLEIGH?"]),d);
    task.panels=[list("ORDER",targets),list("SCANNED ITEMS",scans.map((value,i)=>({key:`${i}:${value}`,label:value})),true)];task.solution=scans.map((value,i)=>targets.includes(value)?`${i}:${value}`:null).filter(Boolean);task.selectable=scans.map((value,i)=>`${i}:${value}`);return task;
  }

  priority(d){
    const rows=[],levels=["EXPRESS","STANDARD","ECONOMY"],target=choice(levels,this.rng);
    for(let i=0;i<Math.min(d.rows,7);i++){const key=`ORDER-${digits(4,this.rng)}`,level=i===0?target:choice(levels.filter(value=>value!==target),this.rng);rows.push({key,cells:[key,choice(destinations,this.rng),level]});}
    const task=this.base("priority","CHRISTMAS EXPRESS",prompt(this.rng,["FIND THE GIFT ORDER WITH THIS SERVICE","SELECT THE ORDER FOR SANTA’S PRIORITY QUEUE","WHICH PRESENT MUST LEAVE THE WORKSHOP NEXT?"]),d);
    task.highlight={label:"SERVICE",value:target};task.panels=[table("READY ORDERS",["ORDER","TO","SERVICE"],shuffle(rows,this.rng),true)];task.solution=[rows[0].key];task.selectable=rows.map(row=>row.key);return task;
  }

  quality(d){
    const rows=[],solution=[];
    for(let i=0;i<d.rows;i++){const key=`ITEM-${i+1}`,damaged=i<d.errors;rows.push({key,cells:[key,sku(this.rng,d.tier),damaged?"DAMAGED":"OK"]});if(damaged)solution.push(key);}
    const task=this.base("quality","GIFT QUALITY CHECK",prompt(this.rng,d.errors===1?["FIND THE DAMAGED GIFT BEFORE LOADING","MARK THE PRESENT THAT FAILED THE ELF CHECK"]:["FIND BOTH DAMAGED GIFTS BEFORE LOADING","MARK THE TWO PRESENTS THAT FAILED THE ELF CHECK"]),d);
    task.panels=[table("ITEMS",["ITEM","SKU","STATUS"],shuffle(rows,this.rng),true)];task.solution=solution;task.selectable=rows.map(row=>row.key);return task;
  }

  generate(type,d,round=d.tier*3){const task=this[type](d);task.difficulty={...d,time:TaskTimer.calculate(task,round)};return task;}
  generateFinal(){
    const d={tier:5,errors:3},shipment=id("SHP",this.rng),carrier=choice(CARRIERS,this.rng),destination=choice(destinations,this.rng),product=sku(this.rng),issues=["WRONG QTY","WRONG CARRIER","MISSING SERIAL"],all=[...issues,"WRONG PALLET","DAMAGED ITEM","WRONG SKU"];
    const task={type:"final",title:"SANTA’S FINAL DISPATCH",instruction:"FIND ALL 3 ERRORS BEFORE THE SLEIGH LEAVES, THEN HOLD THE SHIPMENT",difficulty:d,mode:"final",solution:issues,action:"HOLD",selectable:all,penalty:5,panels:[table("ORDER",["SHIPMENT","SKU","QTY","CARRIER","TO"],[{cells:[shipment,product,12,carrier,destination]}]),table("SHIPMENT",["SKU","PACKED","LABEL CARRIER","SERIALS"],[{cells:[product,10,choice(CARRIERS.filter(name=>name!==carrier),this.rng),"11 / 12"]}]),list("WHAT IS WRONG?",shuffle(all,this.rng).map(value=>({key:value,label:value})),true)]};
    task.difficulty={...d,time:TaskTimer.calculate(task,13)};return task;
  }
}

export const TASK_TYPES=["picking","inventory","serials","labels","packing","pallet","loading","wms","scanner","quality","carrier","priority"];
export const taskIsCorrect=(task,selected,order=[],action=null,matches={})=>{
  if(task.mode==="match")return task.solution.every(pair=>{const [item,target]=pair.split(":");return matches[item]===target;})&&Object.keys(matches).length===task.solution.length;
  const answer=task.mode==="order"?order:selected;
  return answer.length===task.solution.length&&answer.every((value,index)=>task.mode==="order"?value===task.solution[index]:task.solution.includes(value))&&(!task.action||task.action===action);
};
