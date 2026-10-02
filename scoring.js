export const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

export function scoreStandard({correct=0,total=1,mistakes=0,completed=false,timeRemaining=0,timeLimit=1,max=100}){
  const accuracy=clamp((correct-mistakes)/Math.max(1,total),0,1);
  const accuracyPoints=accuracy*.85*max;
  const speedPoints=completed?clamp(timeRemaining/timeLimit,0,1)*.15*max:0;
  return Math.round(clamp(accuracyPoints+speedPoints,0,max));
}

export function scoreClassification({selected=[],solution=[],universe=[],timeRemaining=0,timeLimit=1,max=100}){
  const chosen=new Set(selected),answers=new Set(solution);
  const correct=solution.filter(item=>chosen.has(item)).length;
  const mistakes=selected.filter(item=>!answers.has(item)).length;
  const perfect=correct===solution.length&&mistakes===0;
  return scoreStandard({correct,total:solution.length,mistakes,completed:perfect,timeRemaining,timeLimit,max});
}

export const sumScores = (scores) => Math.min(1000,Object.values(scores).reduce((sum,value)=>sum+value,0));
