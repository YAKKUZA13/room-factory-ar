import { MARKER_FILTER } from '../core/constants';
import type { DomainError, Result } from '../core/types';
import { domainError, err, ok } from '../core/types';
import type {
  AnchorManagerPort,
  AnchorState,
  MarkerObservation,
  RigidPose,
  SlamStatus,
} from './tracking-port';
import {
  angleErrorDegrees,
  clonePose,
  composePose,
  isValidPose,
  normalizePose,
  relativePose,
  slerpPose,
  translationErrorMeters,
} from './transforms';
import type { MarkerFilterConfig } from './marker-pose-filter';

export interface AnchorManagerOptions {
  markerName: string;
  slamStatus?: SlamStatus;
  onAnchorChange?: (anchor: AnchorState) => void;
  smoothingSeconds?: number;
}

export interface MarkerCorrection {
  targetPose: RigidPose;
  translationMeters: number;
  angleDegrees: number;
  requiresConfirmation: boolean;
  applied: boolean;
}

export function cloneAnchor(anchor: AnchorState): AnchorState {
  if (anchor.kind === 'unbound') return { kind: 'unbound' };
  return {
    kind: 'marker',
    markerName: anchor.markerName,
    markerToFactory: clonePose(anchor.markerToFactory),
    bindingVersion: 1,
  };
}

export function isValidAnchor(anchor: unknown): anchor is AnchorState {
  if (!anchor || typeof anchor !== 'object') return false;
  const candidate = anchor as Record<string, unknown>;
  if (candidate.kind === 'unbound') return true;
  if (candidate.kind !== 'marker') return false;
  if (typeof candidate.markerName !== 'string' || candidate.markerName.length === 0) {
    return false;
  }
  if (candidate.bindingVersion !== 1) return false;
  const pose = candidate.markerToFactory as RigidPose | undefined;
  return Boolean(pose && isValidPose(pose));
}

/**
 * Owns the durable anchor (only marker-relative data) and the in-session world
 * pose. Persistent world coordinates from a previous SLAM session are never used.
 * See SPEC.md §4.5–§4.7.
 */
export class AnchorManager implements AnchorManagerPort {
  private anchor: AnchorState;
  private readonly markerName: string;
  private readonly onAnchorChange?: (anchor: AnchorState) => void;
  private readonly smoothingSeconds: number;
  private slamStatus: SlamStatus;

  private requestedWorldPose: RigidPose | null = null;
  private displayWorldPose: RigidPose | null = null;
  private temporary = false;

  constructor(initialAnchor: AnchorState, options: AnchorManagerOptions) {
    if (!isValidAnchor(initialAnchor)) {
      throw new Error('Invalid initial anchor');
    }
    this.anchor = cloneAnchor(initialAnchor);
    this.markerName = options.markerName;
    this.onAnchorChange = options.onAnchorChange;
    this.slamStatus = options.slamStatus ?? 'initializing';
    this.smoothingSeconds = options.smoothingSeconds ?? MARKER_FILTER.correctionSmoothingSeconds;
  }

  getAnchor(): AnchorState {
    return cloneAnchor(this.anchor);
  }

  getWorldFactoryPose(): RigidPose | null {
    return this.requestedWorldPose ? clonePose(this.requestedWorldPose) : null;
  }

  getDisplayFactoryPose(): RigidPose | null {
    return this.displayWorldPose ? clonePose(this.displayWorldPose) : null;
  }

  isTemporary(): boolean {
    return this.temporary;
  }

  getSlamStatus(): SlamStatus {
    return this.slamStatus;
  }

  setSlamStatus(status: SlamStatus): void {
    this.slamStatus = status;
  }

  beginFreePlacement(): void {
    this.requestedWorldPose = null;
    this.displayWorldPose = null;
    this.temporary = false;
  }

  confirmFreePlacement(worldPose: RigidPose): void {
    const pose = normalizePose(worldPose);
    this.requestedWorldPose = pose;
    this.displayWorldPose = clonePose(pose);
    this.temporary = false;
  }

  bindToMarker(observation: MarkerObservation): Result<AnchorState, DomainError> {
    const guard = this.validateObservation(observation, true);
    if (!guard.ok) return guard;
    if (!this.requestedWorldPose) {
      return err(
        domainError('no-factory-pose', 'Сначала разместите завод в пространстве.'),
      );
    }

    let markerToFactory: RigidPose;
    try {
      // T_M_F = inverse(T_W_M) * T_W_F
      markerToFactory = relativePose(observation.poseWorld, this.requestedWorldPose);
    } catch (error) {
      return err(
        domainError('invalid-state', 'Не удалось вычислить привязку к маркеру.', {
          error: String(error),
        }),
      );
    }

    this.anchor = {
      kind: 'marker',
      markerName: observation.name,
      markerToFactory,
      bindingVersion: 1,
    };
    this.temporary = false;
    this.onAnchorChange?.(this.getAnchor());
    return ok(this.getAnchor());
  }

  requestRelocalization(): void {
    this.requestedWorldPose = null;
    this.displayWorldPose = null;
    this.temporary = false;
  }

  restoreFromMarker(observation: MarkerObservation): Result<RigidPose, DomainError> {
    const guard = this.validateObservation(observation, true);
    if (!guard.ok) return guard;
    if (this.anchor.kind !== 'marker') {
      return err(
        domainError('no-factory-pose', 'Завод не привязан к карточке; нужна привязка.'),
      );
    }
    if (observation.name !== this.anchor.markerName) {
      return err(
        domainError('marker-mismatch', 'Это не та карточка, к которой привязан завод.', {
          expected: this.anchor.markerName,
          received: observation.name,
        }),
      );
    }

    let target: RigidPose;
    try {
      // T_W_F = T_W_M * T_M_F
      target = composePose(observation.poseWorld, this.anchor.markerToFactory);
    } catch (error) {
      return err(
        domainError('invalid-state', 'Не удалось восстановить позу завода.', {
          error: String(error),
        }),
      );
    }

    const hadDisplay = this.displayWorldPose !== null;
    this.requestedWorldPose = target;
    this.displayWorldPose = hadDisplay ? this.displayWorldPose : clonePose(target);
    this.temporary = false;
    return ok(clonePose(target));
  }

  placeTemporarily(pose: RigidPose): void {
    // The durable marker anchor is deliberately untouched. Autosave reads getAnchor().
    const normalized = normalizePose(pose);
    this.requestedWorldPose = normalized;
    this.displayWorldPose = clonePose(normalized);
    this.temporary = true;
  }

  rebindToMarker(observation: MarkerObservation): Result<void, DomainError> {
    const guard = this.validateObservation(observation, true);
    if (!guard.ok) return guard;
    if (!this.requestedWorldPose) {
      return err(
        domainError('no-factory-pose', 'Нет текущей позы завода для перепривязки.'),
      );
    }
    let markerToFactory: RigidPose;
    try {
      markerToFactory = relativePose(observation.poseWorld, this.requestedWorldPose);
    } catch (error) {
      return err(
        domainError('invalid-state', 'Не удалось пересчитать привязку.', {
          error: String(error),
        }),
      );
    }
    this.anchor = {
      kind: 'marker',
      markerName: observation.name,
      markerToFactory,
      bindingVersion: 1,
    };
    this.temporary = false;
    this.onAnchorChange?.(this.getAnchor());
    return ok(undefined);
  }

  /** Expected factory world pose if the marker were observed now. */
  computeMarkerTarget(observation: MarkerObservation): Result<RigidPose, DomainError> {
    if (this.anchor.kind !== 'marker') {
      return err(domainError('no-factory-pose', 'Нет маркерной привязки.'));
    }
    if (observation.name !== this.anchor.markerName) {
      return err(domainError('marker-mismatch', 'Другой маркер.'));
    }
    if (!this.requestedWorldPose) {
      return err(domainError('no-factory-pose', 'Нет текущей позы завода.'));
    }
    try {
      return ok(composePose(observation.poseWorld, this.anchor.markerToFactory));
    } catch (error) {
      return err(
        domainError('invalid-state', 'Не удалось вычислить ожидаемую позу.', {
          error: String(error),
        }),
      );
    }
  }

  /**
   * Compares the current session pose with the pose implied by a re-observed
   * marker. Small drift is applied smoothly; large drift requires explicit
   * confirmation and never rewrites T_M_F.
   */
  applyMarkerCorrection(
    observation: MarkerObservation,
    force = false,
    config: Pick<MarkerFilterConfig, 'maxPositionSpreadMeters' | 'maxAngleSpreadDegrees'> = {
      maxPositionSpreadMeters: MARKER_FILTER.correctionConfirmMeters,
      maxAngleSpreadDegrees: MARKER_FILTER.correctionConfirmDegrees,
    },
  ): MarkerCorrection {
    if (!this.requestedWorldPose || this.anchor.kind !== 'marker') {
      return {
        targetPose: this.requestedWorldPose ?? { position: [0, 0, 0], quaternion: [0, 0, 0, 1] },
        translationMeters: Number.POSITIVE_INFINITY,
        angleDegrees: Number.POSITIVE_INFINITY,
        requiresConfirmation: true,
        applied: false,
      };
    }
    const targetResult = this.computeMarkerTarget(observation);
    if (!targetResult.ok) {
      return {
        targetPose: clonePose(this.requestedWorldPose),
        translationMeters: Number.POSITIVE_INFINITY,
        angleDegrees: Number.POSITIVE_INFINITY,
        requiresConfirmation: true,
        applied: false,
      };
    }
    const target = targetResult.value;
    const translationMeters = translationErrorMeters(this.requestedWorldPose, target);
    const angleDegrees = angleErrorDegrees(this.requestedWorldPose, target);
    const requiresConfirmation =
      !force &&
      (translationMeters > config.maxPositionSpreadMeters ||
        angleDegrees > config.maxAngleSpreadDegrees);

    if (requiresConfirmation) {
      return {
        targetPose: target,
        translationMeters,
        angleDegrees,
        requiresConfirmation: true,
        applied: false,
      };
    }

    this.requestedWorldPose = target;
    if (!this.displayWorldPose) this.displayWorldPose = clonePose(target);
    return {
      targetPose: target,
      translationMeters,
      angleDegrees,
      requiresConfirmation: false,
      applied: true,
    };
  }

  /** Advances the smoothed display pose toward the requested pose. */
  update(dtSeconds: number): void {
    if (!this.requestedWorldPose) {
      this.displayWorldPose = null;
      return;
    }
    if (!this.displayWorldPose) {
      this.displayWorldPose = clonePose(this.requestedWorldPose);
      return;
    }
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;

    const errorMeters = translationErrorMeters(this.displayWorldPose, this.requestedWorldPose);
    const errorDegrees = angleErrorDegrees(this.displayWorldPose, this.requestedWorldPose);
    if (errorMeters < 1e-4 && errorDegrees < 0.01) {
      this.displayWorldPose = clonePose(this.requestedWorldPose);
      return;
    }

    const tau = Math.max(0.05, this.smoothingSeconds / 3);
    const alpha = 1 - Math.exp(-dtSeconds / tau);
    this.displayWorldPose = slerpPose(this.displayWorldPose, this.requestedWorldPose, alpha);
  }

  private validateObservation(
    observation: MarkerObservation,
    requireSlam: boolean,
  ): Result<void, DomainError> {
    if (observation.name !== this.markerName) {
      return err(
        domainError('marker-mismatch', 'Наблюдается неизвестный image target.', {
          expected: this.markerName,
          received: observation.name,
        }),
      );
    }
    if (requireSlam && this.slamStatus !== 'normal') {
      return err(
        domainError('slam-not-tracking', 'Для привязки нужен уверенный SLAM (NORMAL).', {
          status: this.slamStatus,
        }),
      );
    }
    if (!isValidPose(observation.poseWorld)) {
      return err(domainError('invalid-state', 'Некорректная поза маркера.'));
    }
    return ok(undefined);
  }
}
