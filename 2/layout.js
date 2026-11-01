// Includes the device pedestal and the selection ring, plus breathing room.
export const MIN_SEPARATION = 4.8;
export const BOUNDS = Object.freeze({x:14,z:12});
export function canPlace(nodes,x,z,ignoreId=null){
  return Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<=BOUNDS.x&&Math.abs(z)<=BOUNDS.z&&nodes.every(n=>n.id===ignoreId||Math.hypot(n.x-x,n.z-z)>=MIN_SEPARATION-1e-6);
}
export function findFreePosition(nodes,anchor={x:0,z:0}){
  let best=null,bestScore=Infinity;
  // A fine search avoids depending on the order of previously placed devices.
  for(let z=-11;z<=11;z+=.5)for(let x=-13;x<=13;x+=.5){
    if(!canPlace(nodes,x,z))continue;
    const score=Math.hypot(x-anchor.x,z-anchor.z)+.18*Math.hypot(x,z);
    if(score<bestScore){bestScore=score;best={x,z};}
  }
  return best;
}
export function arrangeNodes(nodes){
  // 24 generous slots for the editor's maximum of 20 devices.
  const slots=[];
  for(const z of [-8.1,-2.7,2.7,8.1])for(const x of [-12.5,-7.5,-2.5,2.5,7.5,12.5])slots.push({x,z});
  // Preserve the user's rough geography by choosing the closest remaining slot.
  return nodes.map(n=>{let best=0;for(let i=1;i<slots.length;i++)if(Math.hypot(slots[i].x-n.x,slots[i].z-n.z)<Math.hypot(slots[best].x-n.x,slots[best].z-n.z))best=i;return {...n,...slots.splice(best,1)[0]};});
}
export function repairLayout(input){
  let changed=false;const fixed=[];
  for(const n of input){
    if(canPlace(fixed,n.x,n.z)){fixed.push({...n});continue;}
    changed=true;const pos=findFreePosition(fixed,n);
    if(!pos)return {nodes:arrangeNodes(input),changed:true};
    fixed.push({...n,...pos});
  }
  return {nodes:fixed,changed};
}
