import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const three=new URL('../vendor/three/build/three.module.js',import.meta.url).href;
registerHooks({resolve(specifier,context,next) {
  if (specifier.startsWith('three/addons/')) {
    return next(new URL('../vendor/three/'+specifier.slice('three/'.length),import.meta.url).href,context);
  }
  return next(specifier==='three' ? three : specifier,context);
}});
const {Box3,BoxGeometry,Group,Mesh,MeshStandardMaterial}=await import('three');
const {mergeRigidSurfaces}=await import('../js/garage-visuals.js');
const {circuitTileIndices}=await import('../js/drift-world.js');

test('body batches preserve world bounds, transparent panes and independent hinges',()=>{
  const root=new Group(), hinge=new Group(), bodyPaint=new MeshStandardMaterial();
  const glass=new MeshStandardMaterial({transparent:true});
  const box=material=>{
    const geometry=new BoxGeometry(1,1,1);
    geometry.clearGroups();
    return new Mesh(geometry,material);
  };
  const left=box(bodyPaint), right=box(bodyPaint), pane=box(glass), door=box(bodyPaint), mirrored=box(bodyPaint);
  left.position.z=-1.4;
  right.position.set(.5,0,1.4);
  right.rotation.y=.25;
  mirrored.position.x=-3;
  mirrored.scale.x=-1;
  hinge.position.x=2;
  hinge.add(door);
  root.add(left,right,pane,hinge,mirrored);
  root.position.set(4,2,-8);
  root.rotation.y=.45;
  const before=new Box3().setFromObject(root,true);
  mergeRigidSurfaces(root,[hinge]);
  const after=new Box3().setFromObject(root,true);
  assert.ok(before.min.distanceTo(after.min)<1e-6);
  assert.ok(before.max.distanceTo(after.max)<1e-6);
  assert.equal(door.parent,hinge);
  assert.equal(pane.parent,root);
  assert.equal(mirrored.parent,root);
  assert.equal(root.children.length,4);
  const merged=root.children.find(mesh=>mesh!==mirrored && mesh.material===bodyPaint);
  assert.equal(merged.geometry.index.count,left.geometry.index.count+right.geometry.index.count);
});

test('distant terrain keeps every shared tile edge and fills the same area',()=>{
  const size=32, stride=size+1;
  const fine=circuitTileIndices(size,size);
  const coarse=circuitTileIndices(size,size,true);
  assert.ok(coarse.length<fine.length*.35);
  const edges=new Map();
  const add=(a,b)=>{
    const key=a<b ? a+':'+b : b+':'+a;
    edges.set(key,(edges.get(key) ?? 0)+1);
  };
  let area=0;
  for (let i=0;i<coarse.length;i+=3) {
    const [a,b,c]=coarse.slice(i,i+3);
    const signed=(b%stride-a%stride)*(Math.floor(c/stride)-Math.floor(a/stride))
      -(c%stride-a%stride)*(Math.floor(b/stride)-Math.floor(a/stride));
    assert.ok(signed<0);
    area-=signed/2;
    add(a,b); add(b,c); add(c,a);
  }
  const boundary=[...edges].filter(([,count])=>count===1).map(([key])=>key);
  assert.equal(boundary.length,size*4);
  for (let i=0;i<size;i++) {
    assert.ok(boundary.includes(i+':'+(i+1)));
    assert.ok(boundary.includes((size*stride+i)+':'+(size*stride+i+1)));
    assert.ok(boundary.includes((i*stride)+':'+((i+1)*stride)));
    assert.ok(boundary.includes((i*stride+size)+':'+((i+1)*stride+size)));
  }
  assert.equal(area,size*size);
  assert.deepEqual(circuitTileIndices(15,15,true),circuitTileIndices(15,15));
});
