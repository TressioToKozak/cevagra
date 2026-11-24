export const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

export function scoreStandard({correct=0,total=1,mistakes=0,completed=false,timeRemaining=0,timeLimit=1,max=100,timeSensitive=false}){
  const accuracy=clamp((correct-mistakes)/Math.max(1,total),0,1);
  const accuracyPoints=accuracy*(timeSensitive?.75:.85)*max;
  // Timed tasks keep a short 15% grace period, then lose up to 25 speed points.
  // Other games retain their existing half-limit speed window.
  const speedPoints=completed?clamp(timeRemaining/(timeLimit*(timeSensitive?.85:.5)),0,1)*(timeSensitive?.25:.15)*max:0;
  return Math.round(clamp(accuracyPoints+speedPoints,0,max));
}

export function scoreClassification({selected=[],solution=[],universe=[],timeRemaining=0,timeLimit=1,max=100,timeSensitive=false}){
  const chosen=new Set(selected),answers=new Set(solution);
  const correct=solution.filter(item=>chosen.has(item)).length;
  const mistakes=selected.filter(item=>!answers.has(item)).length;
  const perfect=correct===solution.length&&mistakes===0;
  return scoreStandard({correct,total:solution.length,mistakes,completed:perfect,timeRemaining,timeLimit,max,timeSensitive});
}

// Quality Control is a timed inspection: no opening grace period.
export function scoreQualityControl(options={}){
  const {timeRemaining=0,timeLimit=15}=options;
  const accuracyScore=scoreClassification({...options,timeSensitive:true,timeRemaining:timeLimit,timeLimit});
  const pace=.6+.4*clamp(timeRemaining/Math.max(.001,timeLimit),0,1);
  return Math.round(clamp(accuracyScore*pace,0,options.max??100));
}

// Four mismatches allow half a second more pace tolerance; two allow half a second less.
export function scoreWmsDetective(options={}){
  const {solution=[],timeRemaining=0,timeLimit=15}=options;
  const allowance=clamp(solution.length-3,-1,1)*.5;
  return scoreClassification({...options,timeSensitive:true,timeRemaining:clamp(timeRemaining+allowance,0,timeLimit),timeLimit});
}

export const sumScores = (scores) => Math.min(1000,Object.values(scores).reduce((sum,value)=>sum+value,0));

export function scoreSpeedPicking({correct=0,total=10,mistakes=0,timeRemaining=0,timeLimit=15,pickTimes=null}){
  const count=Math.min(Math.max(0,Math.floor(correct)),Math.max(1,total));
  const progress=clamp(count/Math.max(1,total),0,1);
  const elapsed=clamp(timeLimit-timeRemaining,0,timeLimit);
  // Earn pace points on each correct hit; timeout must not erase them.
  // Noninteractive callers without a trace use evenly spaced hits as a fallback.
  const times=pickTimes?.length===count?pickTimes:Array.from({length:count},(_,i)=>elapsed*(i+1)/count);
  let previous=0,pace=0;
  for(const at of times){const response=Math.max(0,at-previous);pace+=Math.exp(-response/2.5);previous=at;}
  return Math.round(clamp(85*Math.pow(progress,.3)+20*pace/Math.max(1,total)-mistakes*4,0,100));
}
