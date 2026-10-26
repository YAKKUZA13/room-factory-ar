import * as THREE from 'three';

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

export function toNdc(clientX: number, clientY: number, viewport: ViewportRect): THREE.Vector2 {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  return ndc.set(
    ((clientX - viewport.left) / width) * 2 - 1,
    -((clientY - viewport.top) / height) * 2 + 1,
  );
}

export function makeRay(
  camera: THREE.Camera,
  clientX: number,
  clientY: number,
  viewport: ViewportRect,
): THREE.Raycaster {
  raycaster.setFromCamera(toNdc(clientX, clientY, viewport), camera);
  raycaster.near = 0;
  raycaster.far = 200;
  return raycaster;
}

export function raycastFirst(
  camera: THREE.Camera,
  clientX: number,
  clientY: number,
  viewport: ViewportRect,
  objects: THREE.Object3D[],
): THREE.Intersection | null {
  const hits = makeRay(camera, clientX, clientY, viewport).intersectObjects(objects, true);
  return hits[0] ?? null;
}

export function localPointOnPlane(
  camera: THREE.Camera,
  clientX: number,
  clientY: number,
  viewport: ViewportRect,
  plane: THREE.Mesh,
  owner: THREE.Object3D,
): THREE.Vector3 | null {
  const hit = raycastFirst(camera, clientX, clientY, viewport, [plane]);
  if (!hit) return null;
  return owner.worldToLocal(hit.point.clone());
}

export function projectToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  viewport: ViewportRect,
): { x: number; y: number; inFront: boolean } {
  const projected = point.clone().project(camera);
  return {
    x: viewport.left + (projected.x * 0.5 + 0.5) * viewport.width,
    y: viewport.top + (-projected.y * 0.5 + 0.5) * viewport.height,
    inFront: projected.z > -1 && projected.z < 1,
  };
}
