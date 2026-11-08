import * as THREE from 'three';

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
