import * as THREE from 'three';
import {
  DEFAULT_CELL_SIZE_METERS,
  MAX_CELL_SIZE_METERS,
  MAX_PLACEMENT_SCALE,
  MIN_CELL_SIZE_METERS,
  MIN_PLACEMENT_SCALE,
} from '../core/constants';
import type { RigidPose } from '../ar/tracking-port';
import { clonePose, normalizePose } from '../ar/transforms';

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _quaternion = new THREE.Quaternion();
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Free placement state: a horizontal podium in front of the camera. Hit tests
 * are only a hint; the user can always adjust height, yaw and scale.
 */
export class PlacementController {
  private pose: RigidPose | null = null;
  private yaw = 0;
  private scale = 1;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.pose = null;
    this.yaw = 0;
    this.scale = 1;
  }

  setFromCamera(camera: THREE.Camera): RigidPose {
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, -1);
    _forward.normalize();
    const position: [number, number, number] = [
      camera.position.x + _forward.x * 0.8,
      0,
      camera.position.z + _forward.z * 0.8,
    ];
    this.yaw = Math.atan2(_forward.x, _forward.z);
    this.pose = this.compose(position, this.yaw);
    return clonePose(this.pose);
  }

  setFromHitTest(hit: RigidPose, camera: THREE.Camera): RigidPose {
    // Reject non-horizontal hits (walls) but keep the reported height.
    const normal = _up.clone().applyQuaternion(new THREE.Quaternion(...hit.quaternion));
    if (normal.y < 0.55) return this.setFromCamera(camera);
    camera.getWorldDirection(_forward);
    _forward.y = 0;
    if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, -1);
    _forward.normalize();
    this.yaw = Math.atan2(_forward.x, _forward.z);
    this.pose = this.compose([hit.position[0], hit.position[1], hit.position[2]], this.yaw);
    return clonePose(this.pose);
  }

  setPosition(x: number, y: number, z: number): void {
    this.pose = this.compose([x, y, z], this.yaw);
  }

  setYawDegrees(degrees: number): void {
    const normalized = ((degrees % 360) + 360) % 360;
    this.yaw = (normalized * Math.PI) / 180;
    if (this.pose) {
      this.pose = this.compose([...this.pose.position], this.yaw);
    }
  }

  rotateByDegrees(delta: number): void {
    const current = this.getYawDegrees();
    this.setYawDegrees(current + delta);
  }

  adjustHeight(deltaMeters: number): void {
    if (!this.pose) return;
    this.pose = this.compose(
      [
        this.pose.position[0],
        Math.min(2, Math.max(-0.5, this.pose.position[1] + deltaMeters)),
        this.pose.position[2],
      ],
      this.yaw,
    );
  }

  setScale(scale: number): void {
    this.scale = Math.min(MAX_PLACEMENT_SCALE, Math.max(MIN_PLACEMENT_SCALE, scale));
  }

  getScale(): number {
    return this.scale;
  }

  getCellSize(): number {
    return Math.min(
      MAX_CELL_SIZE_METERS,
      Math.max(MIN_CELL_SIZE_METERS, DEFAULT_CELL_SIZE_METERS * this.scale),
    );
  }

  getPose(): RigidPose | null {
    return this.pose ? clonePose(this.pose) : null;
  }

  isReady(): boolean {
    return this.pose !== null;
  }

  getYawDegrees(): number {
    return ((this.yaw * 180) / Math.PI + 360) % 360;
  }

  private compose(position: [number, number, number], yaw: number): RigidPose {
    _euler.set(0, yaw, 0, 'YXZ');
    _quaternion.setFromEuler(_euler);
    return normalizePose({
      position,
      quaternion: [_quaternion.x, _quaternion.y, _quaternion.z, _quaternion.w],
    });
  }
}
