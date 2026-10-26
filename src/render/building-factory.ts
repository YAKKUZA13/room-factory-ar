import * as THREE from 'three';
import { LEVEL_HEIGHT, PALETTE } from '../core/constants';
import type { Building, BuildingType } from '../core/types';
import { createConveyorVisual, type ConveyorMaterials, type ConveyorVisual } from './conveyor-renderer';
import { createContactPatch, createLedMaterial, createSaleFlash, ledColor, type SaleFlash } from './visual-effects';

export interface VisualMaterials extends ConveyorMaterials {
  amber: THREE.MeshStandardMaterial;
  graphite: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  teal: THREE.MeshStandardMaterial;
  light: THREE.MeshStandardMaterial;
  danger: THREE.MeshStandardMaterial;
  belt: THREE.MeshStandardMaterial;
}

export function createVisualMaterials(): VisualMaterials {
  return {
    amber: new THREE.MeshStandardMaterial({
      color: PALETTE.amber,
      roughness: 0.55,
      metalness: 0.25,
    }),
    graphite: new THREE.MeshStandardMaterial({
      color: PALETTE.graphite,
      roughness: 0.72,
      metalness: 0.28,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: PALETTE.metal,
      roughness: 0.38,
      metalness: 0.55,
    }),
    teal: new THREE.MeshStandardMaterial({
      color: PALETTE.teal,
      roughness: 0.45,
      metalness: 0.3,
      emissive: 0x0b2f35,
      emissiveIntensity: 0.6,
    }),
    light: new THREE.MeshStandardMaterial({
      color: PALETTE.light,
      roughness: 0.6,
      metalness: 0.1,
    }),
    danger: new THREE.MeshStandardMaterial({
      color: PALETTE.danger,
      roughness: 0.55,
      metalness: 0.2,
    }),
    belt: new THREE.MeshStandardMaterial({
      color: 0x111416,
      roughness: 0.9,
      metalness: 0.05,
    }),
  };
}

export function disposeVisualMaterials(materials: VisualMaterials): void {
  for (const material of Object.values(materials)) material.dispose();
}

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

function addScrews(group: THREE.Group, material: THREE.Material, radius = 0.42): void {
  const positions: Array<[number, number]> = [
    [-radius, -radius],
    [radius, -radius],
    [-radius, radius],
    [radius, radius],
  ];
  for (const [x, z] of positions) {
    const screw = cylinder(0.035, 0.035, 0.025, 8, material, x, 0.075, z);
    group.add(screw);
    const slot = box(0.05, 0.006, 0.01, material, x, 0.09, z);
    group.add(slot);
  }
}

interface Piston {
  group: THREE.Group;
  restY: number;
  amplitude: number;
  speed: number;
}

export class BuildingVisual {
  readonly group = new THREE.Group();
  readonly type: BuildingType;
  private readonly materials: VisualMaterials;
  private readonly ledMaterials: THREE.MeshBasicMaterial[] = [];
  private readonly conveyor: ConveyorVisual | null = null;
  private readonly flash: SaleFlash | null = null;
  private readonly rotor: THREE.Object3D | null = null;
  private readonly drill: THREE.Object3D | null = null;
  private readonly contactPatch: THREE.Mesh;
  private readonly pistons: Piston[] = [];
  private lastElapsed = 0;
  private readonly spawnAtSeconds = performance.now() / 1000;

  constructor(type: BuildingType, materials: VisualMaterials) {
    this.type = type;
    this.materials = materials;
    this.group.name = `building-${type}`;
    this.contactPatch = createContactPatch(type === 'processor' ? 0.82 : 0.88);
    this.group.add(this.contactPatch);

    switch (type) {
      case 'lift': {
        this.group.add(box(0.85, 0.08, 0.85, materials.graphite, 0, 0.04));
        for (const x of [-0.34, 0.34]) {
          this.group.add(box(0.06, LEVEL_HEIGHT, 0.06, materials.metal, x, LEVEL_HEIGHT / 2, -0.32));
          this.group.add(box(0.06, LEVEL_HEIGHT, 0.06, materials.metal, x, LEVEL_HEIGHT / 2, 0.32));
        }
        this.group.add(box(0.65, 0.06, 0.65, materials.teal, 0, 0.22));
        this.group.add(box(0.06, 0.02, 0.36, materials.light, 0, 0.27, 0.1));
        this.addLed(0.3, 0.12, 0.3);
        break;
      }
      case 'generator':
        this.rotor = this.buildGenerator();
        break;
      case 'extractor':
        this.drill = this.buildExtractor();
        break;
      case 'conveyor':
        this.conveyor = createConveyorVisual(materials);
        this.group.add(this.conveyor.group);
        break;
      case 'processor': {
        const flash = createSaleFlash();
        this.flash = flash;
        this.buildProcessor(flash);
        break;
      }
    }
  }

  update(building: Building, elapsedSeconds: number, brownout: boolean, reducedMotion = false): void {
    const dt = Math.max(0, Math.min(0.1, elapsedSeconds - this.lastElapsed));
    this.lastElapsed = elapsedSeconds;
    const motionElapsed = reducedMotion ? 0 : elapsedSeconds;
    const powered = building.enabled && !brownout;
    const age = Math.max(0, elapsedSeconds - this.spawnAtSeconds);
    const spawnT = Math.min(1, age / 0.28);
    const spawnScale = reducedMotion ? 1 : 0.9 + 0.1 * (1 - (1 - spawnT) * (1 - spawnT));
    if (Math.abs(this.group.scale.x - spawnScale) > 1e-4) {
      this.group.scale.setScalar(spawnScale);
    }
    const color = ledColor(powered, building.enabled);
    for (const material of this.ledMaterials) material.color.setHex(color);

    this.flash?.update(dt);

    switch (building.type) {
      case 'generator':
        if (this.rotor && building.enabled) {
          this.rotor.rotation.y = motionElapsed * 2.4;
        }
        break;
      case 'extractor':
        if (this.drill) {
          this.drill.rotation.y = motionElapsed * (powered ? 9 : 0.4);
          this.drill.position.y = 0.2 + Math.sin(motionElapsed * 6) * (powered ? 0.012 : 0.002);
        }
        for (const piston of this.pistons) {
          piston.group.position.y =
            piston.restY +
            (powered && building.buffer.length === 0
              ? Math.sin(motionElapsed * piston.speed) * piston.amplitude
              : 0);
        }
        break;
      case 'processor':
        for (const piston of this.pistons) {
          const active = powered && building.buffer.length > 0;
          piston.group.position.y =
            piston.restY + (active ? Math.sin(motionElapsed * piston.speed) * piston.amplitude : 0);
        }
        break;
      case 'conveyor':
        this.conveyor?.update(building, motionElapsed, powered);
        break;
    }
  }

  flashSale(): void {
    this.flash?.trigger();
  }

  dispose(): void {
    this.conveyor?.dispose();
    this.flash?.dispose();
    for (const material of this.ledMaterials) material.dispose();
    if (this.contactPatch.material instanceof THREE.Material) {
      this.contactPatch.material.dispose();
    }
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
      }
    });
    this.group.clear();
  }

  private addLed(x: number, y: number, z: number, scale = 1): void {
    const material = createLedMaterial();
    this.ledMaterials.push(material);
    const led = box(0.05 * scale, 0.02 * scale, 0.05 * scale, material, x, y, z);
    this.group.add(led);
  }

  private buildGenerator(): THREE.Object3D {
    const base = box(0.88, 0.08, 0.88, this.materials.amber, 0, 0.04, 0);
    this.group.add(base);
    addScrews(this.group, this.materials.metal);

    const plinth = box(0.7, 0.06, 0.7, this.materials.graphite, 0, 0.11, 0);
    this.group.add(plinth);

    const coilLeft = cylinder(0.13, 0.13, 0.28, 12, this.materials.graphite, -0.18, 0.28, 0);
    const coilRight = cylinder(0.13, 0.13, 0.28, 12, this.materials.graphite, 0.18, 0.28, 0);
    this.group.add(coilLeft, coilRight);
    for (const z of [-0.05, 0.05]) {
      const bandLeft = new THREE.Mesh(
        new THREE.TorusGeometry(0.132, 0.018, 6, 18),
        this.materials.amber,
      );
      bandLeft.rotation.x = Math.PI / 2;
      bandLeft.position.set(-0.18, 0.28, z);
      const bandRight = bandLeft.clone();
      bandRight.position.x = 0.18;
      this.group.add(bandLeft, bandRight);
    }

    const cap = box(0.72, 0.07, 0.5, this.materials.amber, 0, 0.45, 0);
    this.group.add(cap);
    const ventLeft = box(0.18, 0.12, 0.05, this.materials.graphite, -0.35, 0.28, 0.26);
    const ventRight = box(0.18, 0.12, 0.05, this.materials.graphite, 0.35, 0.28, 0.26);
    this.group.add(ventLeft, ventRight);

    const rotor = new THREE.Group();
    rotor.position.set(0, 0.52, 0);
    const hub = cylinder(0.08, 0.08, 0.06, 10, this.materials.graphite, 0, 0, 0);
    rotor.add(hub);
    for (let i = 0; i < 4; i += 1) {
      const blade = box(0.22, 0.03, 0.07, this.materials.teal, 0, 0, 0);
      blade.position.x = Math.cos((i * Math.PI) / 2) * 0.13;
      blade.position.z = Math.sin((i * Math.PI) / 2) * 0.13;
      blade.rotation.y = (i * Math.PI) / 2;
      rotor.add(blade);
    }
    this.group.add(rotor);

    this.addLed(-0.3, 0.14, 0.4);
    this.addLed(0.3, 0.14, 0.4);
    this.addLed(0, 0.14, -0.4);
    return rotor;
  }

  private buildExtractor(): THREE.Object3D {
    const base = box(0.88, 0.08, 0.88, this.materials.graphite, 0, 0.04, 0);
    this.group.add(base);
    addScrews(this.group, this.materials.metal);

    const body = box(0.58, 0.32, 0.58, this.materials.amber, 0, 0.27, 0);
    this.group.add(body);
    const belt = box(0.6, 0.045, 0.62, this.materials.graphite, 0, 0.1, 0);
    this.group.add(belt);

    const hopper = cylinder(0.18, 0.24, 0.18, 8, this.materials.graphite, 0, 0.5, 0);
    this.group.add(hopper);
    const hopperLip = cylinder(0.2, 0.2, 0.03, 8, this.materials.teal, 0, 0.59, 0);
    this.group.add(hopperLip);

    // Output chute at local +Z.
    const chute = box(0.42, 0.2, 0.08, this.materials.graphite, 0, 0.17, 0.44);
    this.group.add(chute);
    const chuteLip = box(0.32, 0.055, 0.09, this.materials.teal, 0, 0.29, 0.44);
    this.group.add(chuteLip);

    const pistonGroup = new THREE.Group();
    pistonGroup.position.set(0, 0.36, 0.24);
    const rod = cylinder(0.035, 0.035, 0.22, 8, this.materials.metal, 0, -0.08, 0);
    const head = box(0.26, 0.07, 0.18, this.materials.amber, 0, 0.06, 0);
    pistonGroup.add(rod, head);
    this.group.add(pistonGroup);
    this.pistons.push({ group: pistonGroup, restY: 0.36, amplitude: 0.05, speed: 7 });

    const drillGroup = new THREE.Group();
    drillGroup.position.set(0, 0.2, 0.39);
    const drillShaft = cylinder(0.035, 0.035, 0.2, 8, this.materials.metal, 0, 0.02, 0);
    drillGroup.add(drillShaft);
    const bit = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.14, 8),
      this.materials.metal,
    );
    bit.rotation.x = Math.PI;
    bit.position.y = -0.12;
    drillGroup.add(bit);
    this.group.add(drillGroup);

    this.addLed(-0.32, 0.13, 0.4);
    this.addLed(0.32, 0.13, 0.4);
    return drillGroup;
  }

  private buildProcessor(flash: SaleFlash): void {
    const base = box(0.88, 0.08, 0.88, this.materials.amber, 0, 0.04, 0);
    this.group.add(base);
    addScrews(this.group, this.materials.metal);

    const body = box(0.7, 0.72, 0.7, this.materials.graphite, 0, 0.44, 0);
    this.group.add(body);
    const trimLow = box(0.76, 0.05, 0.76, this.materials.amber, 0, 0.1, 0);
    const trimHigh = box(0.76, 0.05, 0.76, this.materials.amber, 0, 0.78, 0);
    this.group.add(trimLow, trimHigh);

    // Input ports on all four sides: processors accept from any direction.
    for (let side = 0; side < 4; side += 1) {
      const angle = (side * Math.PI) / 2;
      const frame = box(0.3, 0.26, 0.05, this.materials.graphite, 0, 0.35, 0.36);
      frame.rotation.y = angle;
      frame.position.set(Math.sin(angle) * 0.36, 0.35, Math.cos(angle) * 0.36);
      const lip = box(0.2, 0.06, 0.06, this.materials.teal, 0, 0.48, 0.36);
      lip.rotation.y = angle;
      lip.position.set(Math.sin(angle) * 0.37, 0.48, Math.cos(angle) * 0.37);
      this.group.add(frame, lip);
    }

    for (let i = 0; i < 3; i += 1) {
      const ventLeft = box(0.05, 0.12, 0.4, this.materials.teal, -0.37, 0.25 + i * 0.1, 0);
      const ventRight = box(0.05, 0.12, 0.4, this.materials.teal, 0.37, 0.25 + i * 0.1, 0);
      this.group.add(ventLeft, ventRight);
    }

    const cap = box(0.54, 0.07, 0.54, this.materials.amber, 0, 0.84, 0);
    this.group.add(cap);
    const chimney = cylinder(0.07, 0.09, 0.22, 10, this.materials.metal, 0.2, 0.95, -0.15);
    this.group.add(chimney);
    const chimneyGlow = cylinder(0.075, 0.075, 0.03, 10, this.materials.teal, 0.2, 1.06, -0.15);
    this.group.add(chimneyGlow);

    const pistonGroup = new THREE.Group();
    pistonGroup.position.set(-0.18, 0.62, 0.38);
    const rod = cylinder(0.045, 0.045, 0.3, 8, this.materials.metal, 0, -0.1, 0);
    const head = box(0.18, 0.08, 0.18, this.materials.teal, 0, 0.1, 0);
    pistonGroup.add(rod, head);
    this.group.add(pistonGroup);
    this.pistons.push({ group: pistonGroup, restY: 0.62, amplitude: 0.08, speed: 8 });

    flash.mesh.position.set(0, 0.55, 0.45);
    this.group.add(flash.mesh);

    this.addLed(-0.3, 0.12, 0.42);
    this.addLed(0.3, 0.12, 0.42);
    this.addLed(0, 0.89, 0.28);
  }
}
