import * as THREE from 'three';
import { PALETTE } from '../core/constants';

export interface SaleFlash {
  mesh: THREE.Mesh;
  update(dt: number): void;
  trigger(): void;
  dispose(): void;
}

/**
 * A lightweight announcement effect for a completed sale. No post-processing,
 * no particles: one ring that expands and fades.
 */
export function createSaleFlash(color: number = 0x238b9b): SaleFlash {
  const geometry = new THREE.TorusGeometry(0.14, 0.018, 6, 24);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  let life = 0;

  return {
    mesh,
    trigger() {
      life = 1;
      mesh.visible = true;
    },
    update(dt: number) {
      if (life <= 0) return;
      life = Math.max(0, life - dt / 0.6);
      const t = 1 - life;
      mesh.scale.setScalar(0.7 + t * 1.8);
      material.opacity = life * 0.85;
      if (life <= 0) mesh.visible = false;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** A soft square contact patch, used instead of real shadow maps. */
export function createContactPatch(size = 0.9): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(size, size);
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.006;
  return mesh;
}

export function createLedMaterial(initial: number = 0x238b9b): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: initial });
}

export function ledColor(powered: boolean, enabled: boolean): number {
  if (!enabled) return 0x6b4a2a;
  if (!powered) return 0xd75f46;
  return 0x238b9b;
}

export { PALETTE };
