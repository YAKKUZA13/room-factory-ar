import * as THREE from 'three';
import { expect, it } from 'vitest';
import { FactoryRenderer } from '../../src/render/factory-renderer';
import { BUILDING_TYPES } from '../../src/core/constants';

it('previews the real geometry of every module with rotation and invalid tint', () => {
  const renderer = new FactoryRenderer();
  for (const type of BUILDING_TYPES) {
    renderer.setBuildingGhost(type, { x: 3, z: 4 }, 1, true);
    const ghost = renderer.root.getObjectByName('building-placement-ghost')!;
    expect(ghost.visible).toBe(true);
    let meshes = 0;
    ghost.traverse(child => { if (child instanceof THREE.Mesh) meshes += 1; });
    expect(meshes).toBeGreaterThan(3);
    expect(ghost.rotation.y).toBe(Math.PI / 2);
    expect(ghost.userData.buildingType).toBe(type);
    renderer.setBuildingGhost(type, { x: 4, z: 4 }, 3, false);
    expect(ghost.userData.allowed).toBe(false);
    const mesh = ghost.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh;
    expect((mesh.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xd75f46);
    renderer.setBuildingGhost(null, null, 0, false);
    expect(ghost.visible).toBe(false);
  }
  renderer.dispose();
});
