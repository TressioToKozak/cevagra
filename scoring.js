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

export const sumScores = (scores) => Math.min(1000,Object.values(scores).reduce((sum,value)=>sum+value,0));

export function scoreSpeedPicking({correct=0,total=10,mistakes=0,timeRemaining=0,timeLimit=15}){
  const progress=clamp(correct/Math.max(1,total),0,1);
  const remaining=clamp(timeRemaining/Math.max(.001,timeLimit),0,1);
  const completion=correct>=total?10*clamp(remaining/.85,0,1):0;
  const pace=.88+.12*clamp(remaining/.85,0,1);
  return Math.round(clamp(90*Math.pow(progress,.45)*pace+completion-mistakes*4,0,100));
}
