import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createConveyorVisual } from '../../src/render/conveyor-renderer';
import { beltPoint } from '../../src/render/conveyor-path';
import { createVisualMaterials, disposeVisualMaterials } from '../../src/render/building-factory';
import { FactoryRenderer } from '../../src/render/factory-renderer';
import { createInitialFactoryState } from '../../src/core/initial-world';
import { must, place } from '../helpers';
import { applyCommand } from '../../src/core/commands';
import type { Building } from '../../src/core/types';

const building: Building = { id: 'b1', type: 'conveyor', x: 0, z: 0, rotation: 0, buffer: ['ore'], progress: 0.375, enabled: true, purchaseSource: 'starter' };

describe('continuous conveyor geometry', () => {
  it.each(['straight', 'from-left', 'from-right'] as const)('%s has an open animated surface and carries cargo along the same path', shape => {
    const materials = createVisualMaterials(), visual = createConveyorVisual(materials);
    visual.setShape(shape);
    const types: string[] = [];
    visual.group.traverse(object => { if (object instanceof THREE.Mesh) types.push(object.geometry.type); });
    expect(types).not.toContain('CylinderGeometry'); expect(types).not.toContain('ConeGeometry');
    const surface = visual.group.getObjectByName('belt-surface') as THREE.Mesh;
    surface.geometry.computeBoundingBox();
    expect(surface.geometry.boundingBox!.max.y).toBeCloseTo(0.11);
    const tread = visual.group.getObjectByName('belt-tread-0')!;
    visual.update(building, 10, true);
    const initial = tread.position.clone();
    visual.update(building, 10.1, true);
    expect(tread.position.distanceTo(initial)).toBeGreaterThan(0.01);
    const stopped = tread.position.clone();
    visual.update(building, 10.2, false);
    expect(tread.position.equals(stopped)).toBe(true);
    const cargo = visual.group.getObjectByName('belt-cargo')!;
    const midpoint = beltPoint(shape, 0.5);
    expect(cargo.position.x).toBeCloseTo(midpoint.x);
    expect(cargo.position.z).toBeCloseTo(midpoint.z);
    expect(beltPoint(shape, 1)).toMatchObject({ x: expect.closeTo(0), z: expect.closeTo(0.5), dx: expect.closeTo(0), dz: expect.closeTo(1) });
    visual.dispose(); disposeVisualMaterials(materials);
  });

  it('joins two cells edge to edge across the whole belt width, including both turn directions', () => {
    for (const shape of ['straight', 'from-left', 'from-right'] as const) {
      for (const lateral of [-0.35, 0, 0.35]) {
        const exit = beltPoint(shape, 1, lateral);
        const entry = beltPoint('straight', 0, lateral);
        expect(exit.x).toBeCloseTo(entry.x);
        expect(exit.z).toBeCloseTo(entry.z + 1);
      }
    }
  });

  it('rebuilds the installed model and preview from the same topology after edits', () => {
    const renderer = new FactoryRenderer();
    let state = place(createInitialFactoryState(), 'conveyor', 3, 4, 1);
    state = place(state, 'conveyor', 4, 4, 0);
    renderer.updateFactory(state);
    const buildings = renderer.root.getObjectByName('factory-buildings')!;
    const target = buildings.children.find(group => group.userData.buildingId === 'b2')!;
    expect(target.getObjectByName('conveyor-belt')!.userData.shape).toBe('from-left');
    renderer.setBuildingGhost('conveyor', { x: 4, z: 4 }, 0, false);
    expect(renderer.root.getObjectByName('building-placement-ghost')!.getObjectByName('conveyor-belt')!.userData.shape).toBe('from-left');
    state = must(applyCommand(state, { type: 'rotate', id: 'b1', clockwise: true }));
    renderer.updateFactory(state);
    expect(target.getObjectByName('conveyor-belt')!.userData.shape).toBe('straight');
    state = place(createInitialFactoryState(), 'conveyor', 4, 3, 0);
    state = place(state, 'conveyor', 3, 4, 1);
    renderer.updateFactory(state);
    renderer.setBuildingGhost('conveyor', { x: 4, z: 4 }, 0, true, 'b1');
    expect(renderer.root.getObjectByName('building-placement-ghost')!.getObjectByName('conveyor-belt')!.userData.shape).toBe('from-left');
    renderer.dispose();
  });
});
