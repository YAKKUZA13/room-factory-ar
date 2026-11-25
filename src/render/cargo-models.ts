import * as THREE from 'three';
import { ITEM_COLORS } from '../core/recipes';
import type { ItemType } from '../core/types';

export class CargoModels {
  private readonly models = new Map<ItemType, { model: THREE.Group; material: THREE.MeshStandardMaterial }>();
  private readonly dark = new THREE.MeshStandardMaterial({ color: '#26313b', roughness: 0.65 });
  private readonly metal = new THREE.MeshStandardMaterial({ color: '#b9c3ce', roughness: 0.38, metalness: 0.35 });
  private readonly contacts = new THREE.MeshStandardMaterial({ color: '#daa05d', roughness: 0.42, metalness: 0.45 });

  instantiate(item: ItemType): THREE.Group {
    const existing = this.models.get(item);
    if (existing) return existing.model.clone();
    const material = new THREE.MeshStandardMaterial({ color: ITEM_COLORS[item], roughness: 0.58, metalness: 0.12 });
    const model = this.build(item, material);
    this.models.set(item, { model, material });
    return model.clone();
  }

  dispose(): void {
    for (const { model, material } of this.models.values()) {
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) node.geometry.dispose();
      });
      material.dispose();
    }
    this.models.clear();
    this.dark.dispose();
    this.metal.dispose();
    this.contacts.dispose();
  }

  private build(item: ItemType, main: THREE.MeshStandardMaterial): THREE.Group {
    const group = new THREE.Group();
    group.name = `cargo-${item}`;
    const box = (w: number, h: number, d: number, x = 0, y = h / 2, z = 0, material = main) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };
    const cylinder = (r: number, h: number, x = 0, y = h / 2, z = 0, material = main, sides = 12) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides), material);
      mesh.position.set(x, y, z);
      group.add(mesh);
    };
    const fourCorners = [-0.14, 0.14].flatMap((x) => [-0.14, 0.14].map((z) => [x, z] as const));

    switch (item) {
      case 'ore':
      case 'copper':
      case 'lithium': {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.105), main);
        rock.scale.set(1.25, 0.76, 0.95);
        rock.rotation.set(0.35, 0.2, 0.12);
        rock.position.y = 0.07;
        group.add(rock);
        break;
      }
      case 'resin':
        cylinder(0.1, 0.15);
        cylinder(0.07, 0.025, 0, 0.155, 0, this.dark);
        break;
      case 'sand': {
        const mound = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 7), main);
        mound.position.y = 0.06;
        group.add(mound);
        break;
      }
      case 'pellets':
        for (const [x, z] of [[-0.076, -0.035], [0.065, -0.05], [0, 0.075]] as const) {
          cylinder(0.047, 0.06, x, 0.03, z, main, 7);
        }
        break;
      case 'plastic':
        box(0.3, 0.045, 0.22);
        box(0.26, 0.035, 0.19, -0.025, 0.06, 0.015);
        break;
      case 'plate':
        box(0.31, 0.026, 0.24);
        for (const x of [-0.1, 0, 0.1]) box(0.012, 0.012, 0.18, x, 0.028, 0, this.dark);
        break;
      case 'copper-foil':
        box(0.3, 0.013, 0.25);
        box(0.23, 0.013, 0.17, 0.015, 0.019, 0.015, this.contacts);
        cylinder(0.048, 0.035, 0.073, 0.029, -0.048, main);
        break;
      case 'alloy': {
        const ingot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.09, 4), main);
        ingot.rotation.y = Math.PI / 4;
        ingot.scale.z = 0.7;
        ingot.position.y = 0.045;
        group.add(ingot);
        break;
      }
      case 'module':
        box(0.28, 0.13, 0.21);
        box(0.2, 0.022, 0.045, 0, 0.14, 0.065, this.contacts);
        break;
      case 'wire':
      case 'insulated-wire': {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.036, 6, 16), main);
        coil.rotation.x = Math.PI / 2;
        coil.position.y = 0.057;
        group.add(coil);
        box(0.075, 0.025, 0.025, 0.13, 0.025, 0.065, this.contacts);
        break;
      }
      case 'silicon':
        cylinder(0.14, 0.033);
        box(0.185, 0.006, 0.018, 0.018, 0.035, 0, this.metal).rotation.y = 0.65;
        break;
      case 'chip':
        box(0.19, 0.07, 0.19);
        for (const x of [-0.15, 0.15]) {
          for (const z of [-0.065, 0, 0.065]) box(0.09, 0.015, 0.02, x * 0.85, 0.018, z, this.metal);
        }
        break;
      case 'board':
      case 'programmable-board':
      case 'controller':
        box(0.31, 0.03, 0.25);
        for (const x of [-0.09, 0, 0.09]) box(0.025, 0.009, 0.18, x, 0.034, 0, this.contacts);
        if (item !== 'board') box(0.16, 0.055, 0.125, 0, 0.06, -0.02, this.dark);
        if (item === 'controller') {
          box(0.24, 0.022, 0.14, 0, 0.094, -0.02, this.metal);
          box(0.19, 0.04, 0.04, 0, 0.051, 0.1, this.dark);
        }
        break;
      case 'motors':
        for (const [x, z] of fourCorners) {
          cylinder(0.048, 0.085, x * 0.55, 0.043, z * 0.55);
          cylinder(0.019, 0.036, x * 0.55, 0.09, z * 0.55, this.contacts);
        }
        break;
      case 'rotors':
        for (const [x, z] of fourCorners) {
          box(0.155, 0.022, 0.033, x * 0.65, 0.024, z * 0.58).rotation.y = z * 3;
          cylinder(0.022, 0.038, x * 0.65, 0.03, z * 0.58, this.metal);
        }
        break;
      case 'cell':
        cylinder(0.068, 0.18);
        cylinder(0.027, 0.018, 0, 0.095, 0, this.contacts);
        group.rotation.z = Math.PI / 2;
        group.position.set(0.09, 0.055, 0);
        break;
      case 'battery':
      case 'avionics':
        box(0.29, item === 'battery' ? 0.11 : 0.17, 0.2);
        for (const x of [-0.07, 0.07]) box(0.027, 0.12, 0.206, x, 0.058, 0, this.dark);
        box(0.13, 0.036, 0.05, 0, 0.071, 0.114, this.contacts);
        if (item === 'avionics') box(0.22, 0.025, 0.16, 0, 0.181, 0, this.metal);
        break;
      case 'frame':
      case 'airframe':
      case 'drone':
        for (const angle of [-Math.PI / 4, Math.PI / 4]) {
          box(0.45, 0.032, 0.039, 0, 0.037).rotation.y = angle;
        }
        if (item === 'drone') box(0.17, 0.1, 0.18, 0, 0.067, 0, this.dark);
        else box(0.155, 0.031, 0.16);
        for (const [x, z] of fourCorners) {
          cylinder(0.047, item === 'frame' ? 0.027 : 0.055, x, 0.054, z, this.dark);
          if (item !== 'frame') {
            box(0.13, 0.014, 0.033, x, 0.088, z, item === 'drone' ? this.metal : main).rotation.y = (x * z > 0 ? 1 : -1) * 0.4;
          }
        }
        break;
    }
    return group;
  }
}

export class CargoDisplay {
  readonly group = new THREE.Group();
  private current: ItemType | undefined;

  constructor(private readonly models: CargoModels) {
    this.group.visible = false;
  }

  show(item?: ItemType): void {
    this.group.visible = item !== undefined;
    if (item === undefined || item === this.current) return;
    this.group.clear();
    this.group.add(this.models.instantiate(item));
    this.current = item;
  }
}
