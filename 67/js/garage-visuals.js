import * as THREE from 'three';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';

export function batchSharedMeshes(parent) {
  const batches = new Map();
  for (const mesh of parent.children) {
    if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.visible || mesh.material.transparent || Array.isArray(mesh.material)) continue;
    const key = [mesh.geometry.id, mesh.material.id, mesh.castShadow, mesh.receiveShadow].join('/');
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(mesh);
  }
  for (const meshes of batches.values()) {
    if (meshes.length < 3) continue;
    const first = meshes[0];
    const batch = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    meshes.forEach((mesh, index) => {
      mesh.updateMatrix();
      batch.setMatrixAt(index, mesh.matrix);
      mesh.removeFromParent();
    });
    parent.add(batch);
  }
}


// Parked preview models have no moving parts. Bake their visible meshes into
// groups by material so lightweight geometry also costs fewer draw calls.
export function bakeParkedCar(root) {
  const baked = new THREE.Group();
  const batches = new Map();
  root.updateMatrixWorld(true);
  root.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    const source = mesh.geometry;
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const key = [mesh.material.id, ...Object.keys(geometry.attributes).sort()].join('/');
    if (!batches.has(key)) batches.set(key,{ material:mesh.material, geometries:[] });
    batches.get(key).geometries.push(geometry);
  });
  for (const { material,geometries } of batches.values()) {
    const geometry = mergeGeometries(geometries);
    for (const part of geometries) part.dispose();
    baked.add(new THREE.Mesh(geometry,material));
  }
  return baked;
}
