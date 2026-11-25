import * as THREE from 'three';
import { BUILDING_SPECS } from '../core/constants';
import type { Building } from '../core/types';
import type { ConveyorShape } from '../core/conveyor-topology';
import { CargoDisplay, type CargoModels } from './cargo-models';
import { beltLength, beltPoint } from './conveyor-path';

export interface ConveyorMaterials {
  graphite: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  teal: THREE.MeshStandardMaterial;
  amber: THREE.MeshStandardMaterial;
  light: THREE.MeshStandardMaterial;
  belt: THREE.MeshStandardMaterial;
  cargoModels: CargoModels;
}

export interface ConveyorVisual {
  group: THREE.Group;
  setShape(shape: ConveyorShape): void;
  update(building: Building, elapsedSeconds: number, powered: boolean): void;
  dispose(): void;
}

/** Flat, thick ribbons meet the cell edges without end posts or gaps. */
function ribbon(shape: ConveyorShape, width: number, bottom: number, top: number, lateral = 0): THREE.BufferGeometry {
  const outline = new THREE.Shape();
  const segments = shape === 'straight' ? 1 : 24;
  for (let i = 0; i <= segments; i++) {
    const point = beltPoint(shape, i / segments, lateral - width / 2);
    if (i === 0) outline.moveTo(point.x, point.z);
    else outline.lineTo(point.x, point.z);
  }
  for (let i = segments; i >= 0; i--) {
    const point = beltPoint(shape, i / segments, lateral + width / 2);
    outline.lineTo(point.x, point.z);
  }
  outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: top - bottom, bevelEnabled: false, steps: 1 });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, top, 0);
  return geometry;
}

export function createConveyorVisual(materials: ConveyorMaterials): ConveyorVisual {
  const group = new THREE.Group();
  group.name = 'conveyor-belt';
  const structure = new THREE.Group();
  group.add(structure);
  const ribGeometry = new THREE.BoxGeometry(0.68, 0.012, 0.025);
  const ribs = Array.from({ length: 8 }, (_, index) => {
    const rib = new THREE.Mesh(ribGeometry, materials.metal);
    rib.name = `belt-tread-${index}`;
    group.add(rib);
    return rib;
  });
  const cargo = new CargoDisplay(materials.cargoModels);
  cargo.group.name = 'belt-cargo';
  group.add(cargo.group);
  let shape: ConveyorShape | null = null;
  let phaseDistance = 0;
  let lastElapsed: number | null = null;

  function positionRibs(): void {
    const count = shape === 'straight' ? 8 : 6;
    for (let i = 0; i < ribs.length; i++) {
      const rib = ribs[i]!;
      rib.visible = i < count;
      if (!rib.visible) continue;
      const t = (i / count + phaseDistance / beltLength(shape!)) % 1;
      const point = beltPoint(shape!, t);
      rib.position.set(point.x, 0.119, point.z);
      rib.rotation.y = Math.atan2(point.dx, point.dz);
    }
  }

  function setShape(nextShape: ConveyorShape): void {
    if (shape === nextShape) return;
    shape = nextShape;
    for (const child of structure.children) (child as THREE.Mesh).geometry.dispose();
    structure.clear();
    const parts = [
      ['belt-base', 0.88, 0.015, 0.065, 0, materials.graphite],
      ['belt-surface', 0.70, 0.065, 0.11, 0, materials.belt],
      ['belt-rail-left', 0.07, 0.06, 0.14, -0.385, materials.amber],
      ['belt-rail-right', 0.07, 0.06, 0.14, 0.385, materials.amber],
    ] as const;
    for (const [name, width, bottom, top, lateral, material] of parts) {
      const mesh = new THREE.Mesh(ribbon(shape, width, bottom, top, lateral), material);
      mesh.name = name;
      structure.add(mesh);
    }
    group.userData.shape = shape;
    positionRibs();
  }
  setShape('straight');

  return {
    group, setShape,
    update(building: Building, elapsedSeconds: number, powered: boolean) {
      const dt = lastElapsed === null ? 0 : Math.max(0, Math.min(0.1, elapsedSeconds - lastElapsed));
      lastElapsed = elapsedSeconds;
      if (powered) {
        const spacing = beltLength(shape!) / (shape === 'straight' ? 8 : 6);
        phaseDistance = (phaseDistance + dt * 0.5) % spacing;
      }
      positionRibs();
      const carried = building.buffer[0];
      cargo.show(carried);
      if (carried) {
        const t = Math.max(0, Math.min(1, building.progress / BUILDING_SPECS.conveyor.cycleSeconds));
        const point = beltPoint(shape!, t);
        cargo.group.position.set(point.x, 0.132, point.z);
        cargo.group.rotation.y = Math.atan2(point.dx, point.dz) + 0.2;
      }
    },
    dispose() {
      for (const child of structure.children) (child as THREE.Mesh).geometry.dispose();
      ribGeometry.dispose();
      structure.clear();
      group.clear();
    },
  };
}
