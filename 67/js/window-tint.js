import { DoubleSide, MeshPhysicalMaterial } from 'three';

export function windowTint(name) {
  return new MeshPhysicalMaterial({
    name, color: 0x17232b, roughness: .16, metalness: .34,
    clearcoat: 1, clearcoatRoughness: .1, envMapIntensity: .88,
    transparent: true, opacity: .84, depthWrite: false, side: DoubleSide,
  });
}
