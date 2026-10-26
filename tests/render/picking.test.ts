import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createInitialFactoryState } from '../../src/core/initial-world';
import { FactoryRenderer } from '../../src/render/factory-renderer';
import { poseWithYaw } from '../../src/ar/transforms';
import { place } from '../helpers';

function viewport(): DOMRect {
  return {
    left: 0,
    top: 0,
    width: 800,
    height: 600,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('grid picking under a rotated/scaled factory root', () => {
  it('picks the same cell through a projected screen point', () => {
    const renderer = new FactoryRenderer();
    const scene = new THREE.Scene();
    renderer.attach(scene);
    const state = place(
      place(createInitialFactoryState({ factoryId: 'pick-test' }), 'generator', 2, 3, 1),
      'conveyor',
      4,
      5,
      2,
    );
    renderer.updateFactory(state);
    renderer.setCellSize(0.1);
    renderer.setWorldPose(poseWithYaw([0.2, 0, 0.1], 30));

    const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.01, 20);
    camera.position.set(0.2, 3, 0.1);
    camera.lookAt(new THREE.Vector3(0.2, 0, 0.1));
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const rect = viewport();
    for (const [x, z] of [
      [0, 0],
      [2, 3],
      [4, 5],
      [9, 9],
      [5, 5],
    ] as Array<[number, number]>) {
      const point = renderer.getCellScreenPoint(x, z, camera, rect);
      expect(point).not.toBeNull();
      const cell = renderer.pickCell(point!.x, point!.y, camera, rect);
      expect(cell).toEqual({ x, z });
    }

    const buildingPoint = renderer.getCellScreenPoint(2, 3, camera, rect);
    expect(buildingPoint).not.toBeNull();
    expect(renderer.pickBuilding(buildingPoint!.x, buildingPoint!.y, camera, rect)).toBe('b1');

    renderer.dispose();
    scene.clear();
  });

  it('returns null outside the platform', () => {
    const renderer = new FactoryRenderer();
    const scene = new THREE.Scene();
    renderer.attach(scene);
    renderer.updateFactory(createInitialFactoryState({ factoryId: 'pick-test' }));
    renderer.setCellSize(0.1);
    renderer.setWorldPose(poseWithYaw([0, 0, 0], 0));
    const camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.01, 20);
    camera.position.set(3, 3, 3);
    camera.lookAt(new THREE.Vector3(0, 0, 0));
    camera.updateMatrixWorld(true);
    expect(renderer.pickCell(0, 0, camera, viewport())).toBeNull();
    renderer.dispose();
    scene.clear();
  });
});
