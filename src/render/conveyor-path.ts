import type { ConveyorShape } from '../core/conveyor-topology';

export interface BeltPoint { x: number; z: number; dx: number; dz: number }

/** Unit-cell paths, with the outlet on local +Z; turns are exact quarter circles. */
export function beltPoint(shape: ConveyorShape, t: number, lateral = 0): BeltPoint {
  if (shape === 'straight') return { x: lateral, z: t - 0.5, dx: 0, dz: 1 };
  const sign = shape === 'from-left' ? 1 : -1;
  const theta = -Math.PI / 2 + sign * t * Math.PI / 2;
  const dx = -Math.sin(theta) * sign;
  const dz = Math.cos(theta) * sign;
  return {
    x: -sign * 0.5 + Math.cos(theta) * 0.5 + dz * lateral,
    z: 0.5 + Math.sin(theta) * 0.5 - dx * lateral,
    dx, dz,
  };
}

export function beltLength(shape: ConveyorShape): number {
  return shape === 'straight' ? 1 : Math.PI / 4;
}
