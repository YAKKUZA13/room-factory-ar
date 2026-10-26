import * as THREE from 'three';
import { BUILDING_SPECS } from '../core/constants';
import type { Building } from '../core/types';
import { ITEM_COLORS } from '../core/recipes';

export interface ConveyorMaterials {
  graphite: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  teal: THREE.MeshStandardMaterial;
  amber: THREE.MeshStandardMaterial;
  light: THREE.MeshStandardMaterial;
  belt: THREE.MeshStandardMaterial;
}

export interface ConveyorVisual {
  group: THREE.Group;
  update(building: Building, elapsedSeconds: number, powered: boolean): void;
  dispose(): void;
}

const BELT_HALF = 0.34;

function box(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Builds one conveyor in cell-local units. The conveyor's forward direction is
 * local +Z; the building visual rotation handles the world direction.
 */
export function createConveyorVisual(materials: ConveyorMaterials): ConveyorVisual {
  const group = new THREE.Group();
  const owned: Array<THREE.Material | THREE.BufferGeometry> = [];

  const base = box(0.9, 0.06, 0.9, materials.graphite, 0, 0.03, 0);
  group.add(base);

  const belt = box(0.58, 0.025, 0.78, materials.belt, 0, 0.125, 0);
  group.add(belt);

  const railLeft = box(0.1, 0.06, 0.9, materials.amber, -0.42, 0.1, 0);
  const railRight = box(0.1, 0.06, 0.9, materials.amber, 0.42, 0.1, 0);
  group.add(railLeft, railRight);

  const inputFrame = box(0.52, 0.3, 0.05, materials.graphite, 0, 0.2, -0.44);
  const outputFrame = box(0.52, 0.3, 0.05, materials.graphite, 0, 0.2, 0.44);
  group.add(inputFrame, outputFrame);

  const inputLip = box(0.4, 0.06, 0.06, materials.teal, 0, 0.34, -0.44);
  const outputLip = box(0.4, 0.06, 0.06, materials.teal, 0, 0.34, 0.44);
  group.add(inputLip, outputLip);

  const rollerPivots: THREE.Object3D[] = [];
  const rollerCount = 5;
  for (let i = 0; i < rollerCount; i += 1) {
    const z = -BELT_HALF + (i / (rollerCount - 1)) * BELT_HALF * 2;
    const pivot = new THREE.Object3D();
    pivot.position.set(0, 0.15, z);
    const roller = cylinder(0.055, 0.055, 0.62, 10, materials.metal);
    roller.rotation.z = Math.PI / 2;
    pivot.add(roller);
    group.add(pivot);
    rollerPivots.push(pivot);
  }

  const ribs: THREE.Mesh[] = [];
  const ribCount = 5;
  for (let i = 0; i < ribCount; i += 1) {
    const rib = box(0.54, 0.012, 0.035, materials.graphite, 0, 0.145, 0);
    group.add(rib);
    ribs.push(rib);
  }

  // Direction arrow: shaft + triangular head pointing local +Z.
  const arrowMaterial = materials.teal;
  const shaft = box(0.07, 0.015, 0.22, arrowMaterial, 0, 0.2, 0.04);
  const headGeometry = new THREE.ConeGeometry(0.11, 0.18, 3);
  const head = new THREE.Mesh(headGeometry, arrowMaterial);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.2, 0.24);
  group.add(shaft, head);
  owned.push(headGeometry);

  // Item mesh: dark ore crystal. One per conveyor, driven by the logical buffer.
  const itemGeometry = new THREE.DodecahedronGeometry(0.07, 0);
  const itemMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d3436,
    roughness: 0.5,
    metalness: 0.45,
    emissive: 0x0b2a2e,
    emissiveIntensity: 0.6,
  });
  owned.push(itemGeometry, itemMaterial);
  const item = new THREE.Mesh(itemGeometry, itemMaterial);
  item.rotation.set(0.4, 0.2, 0.1);
  item.visible = false;
  group.add(item);

  let phase = 0;
  let lastElapsed = 0;

  return {
    group,
    update(building: Building, elapsedSeconds: number, powered: boolean) {
      const dt = Math.max(0, Math.min(0.1, elapsedSeconds - lastElapsed));
      lastElapsed = elapsedSeconds;
      if (powered) phase = (phase + dt * 1.5) % 1;

      for (let i = 0; i < rollerPivots.length; i += 1) {
        const pivot = rollerPivots[i];
        if (pivot) pivot.rotation.x = phase * Math.PI * 4 + i * 0.4;
      }
      for (let i = 0; i < ribs.length; i += 1) {
        const rib = ribs[i];
        if (!rib) continue;
        const offset = (i / ribs.length + phase) % 1;
        rib.position.z = -BELT_HALF + offset * BELT_HALF * 2;
      }

      const hasItem = building.buffer.length > 0;
      item.visible = hasItem;
      if (hasItem) {
        itemMaterial.color.set(ITEM_COLORS[building.buffer[0]!]);
        const t = Math.max(
          0,
          Math.min(1, building.progress / BUILDING_SPECS.conveyor.cycleSeconds),
        );
        item.position.set(0, 0.2, -BELT_HALF + t * BELT_HALF * 2);
        item.rotation.y = elapsedSeconds * 0.8;
      }
    },
    dispose() {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
        }
      });
      for (const resource of owned) resource.dispose();
      group.clear();
    },
  };
}
