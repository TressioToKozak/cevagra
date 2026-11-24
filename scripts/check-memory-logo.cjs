const assert=require('node:assert/strict');
module.exports=async page=>{
 const geometry=await page.evaluate(()=>{
  const frame=document.querySelector('.memory-platform').getBoundingClientRect(),image=document.querySelector('.memory-platform img').getBoundingClientRect();
  // Bounds of the complete CEVA LOGISTICS mark in the unchanged 1536x614 artwork.
  const logo={left:image.left+image.width*.375,right:image.left+image.width*.63,top:image.top+image.height*.48,bottom:image.top+image.height*.68};
  const overlap=[...document.querySelectorAll('.memory-gift figcaption')].filter(n=>{const r=n.getBoundingClientRect();return r.left<logo.right&&r.right>logo.left&&r.top<logo.bottom&&r.bottom>logo.top;}).map(n=>n.textContent);
  return{inside:logo.top>=frame.top&&logo.bottom<=frame.bottom&&logo.left>=frame.left&&logo.right<=frame.right&&logo.bottom<=innerHeight&&logo.top>=0,overlap,instructions:getComputedStyle(document.querySelector('.instruction-card')).display,notice:!!document.querySelector('.memory-info')};
 });
 assert(geometry.inside,'The entire CEVA LOGISTICS region stays inside the conveyor crop and viewport');
 assert.deepEqual(geometry.overlap,[],'No gift caption covers CEVA LOGISTICS');
 assert.equal(geometry.instructions,'none','Memorization hides the redundant instruction card');assert.equal(geometry.notice,false);
};
