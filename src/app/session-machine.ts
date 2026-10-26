export type SessionState =
  | 'STARTING'
  | 'PERMISSION_REQUIRED'
  | 'INITIALIZING'
  | 'SCANNING'
  | 'FREE_PLACEMENT'
  | 'FREE_UNBOUND'
  | 'BINDING'
  | 'BOUND_TRACKING'
  | 'NEEDS_RELOCALIZATION'
  | 'RELOCALIZING'
  | 'TRACKING_LIMITED'
  | 'CAMERA_DENIED'
  | 'UNSUPPORTED'
  | 'ENGINE_ERROR'
  | 'DESKTOP_3D';

const TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  STARTING: ['DESKTOP_3D', 'PERMISSION_REQUIRED', 'CAMERA_DENIED', 'UNSUPPORTED', 'ENGINE_ERROR'],
  PERMISSION_REQUIRED: [
    'INITIALIZING',
    'DESKTOP_3D',
    'CAMERA_DENIED',
    'UNSUPPORTED',
    'ENGINE_ERROR',
  ],
  INITIALIZING: [
    'SCANNING',
    'NEEDS_RELOCALIZATION',
    'CAMERA_DENIED',
    'UNSUPPORTED',
    'ENGINE_ERROR',
    'TRACKING_LIMITED',
  ],
  SCANNING: [
    'FREE_PLACEMENT',
    'NEEDS_RELOCALIZATION',
    'SCANNING',
    'CAMERA_DENIED',
    'UNSUPPORTED',
    'ENGINE_ERROR',
    'TRACKING_LIMITED',
  ],
  FREE_PLACEMENT: [
    'FREE_UNBOUND',
    'SCANNING',
    'NEEDS_RELOCALIZATION',
    'TRACKING_LIMITED',
    'ENGINE_ERROR',
    'CAMERA_DENIED',
  ],
  FREE_UNBOUND: [
    'BINDING',
    'BOUND_TRACKING',
    'FREE_PLACEMENT',
    'NEEDS_RELOCALIZATION',
    'TRACKING_LIMITED',
    'SCANNING',
    'ENGINE_ERROR',
    'CAMERA_DENIED',
  ],
  BINDING: [
    'BOUND_TRACKING',
    'FREE_UNBOUND',
    'NEEDS_RELOCALIZATION',
    'TRACKING_LIMITED',
    'ENGINE_ERROR',
    'CAMERA_DENIED',
  ],
  BOUND_TRACKING: [
    'TRACKING_LIMITED',
    'NEEDS_RELOCALIZATION',
    'BINDING',
    'DESKTOP_3D',
    'ENGINE_ERROR',
  ],
  NEEDS_RELOCALIZATION: [
    'RELOCALIZING',
    'BOUND_TRACKING',
    'FREE_PLACEMENT',
    'FREE_UNBOUND',
    'DESKTOP_3D',
    'TRACKING_LIMITED',
    'CAMERA_DENIED',
    'ENGINE_ERROR',
  ],
  RELOCALIZING: [
    'BOUND_TRACKING',
    'NEEDS_RELOCALIZATION',
    'FREE_PLACEMENT',
    'FREE_UNBOUND',
    'TRACKING_LIMITED',
    'ENGINE_ERROR',
    'CAMERA_DENIED',
  ],
  TRACKING_LIMITED: [
    'BOUND_TRACKING',
    'FREE_UNBOUND',
    'NEEDS_RELOCALIZATION',
    'SCANNING',
    'CAMERA_DENIED',
    'ENGINE_ERROR',
    'DESKTOP_3D',
  ],
  CAMERA_DENIED: ['PERMISSION_REQUIRED', 'DESKTOP_3D', 'ENGINE_ERROR'],
  UNSUPPORTED: ['DESKTOP_3D', 'PERMISSION_REQUIRED'],
  ENGINE_ERROR: ['PERMISSION_REQUIRED', 'DESKTOP_3D', 'UNSUPPORTED'],
  DESKTOP_3D: ['STARTING', 'PERMISSION_REQUIRED', 'ENGINE_ERROR'],
};

export interface SessionTransition {
  from: SessionState;
  to: SessionState;
  reason: string;
  at: number;
}

export class SessionMachine {
  private state: SessionState = 'STARTING';
  private previous: SessionState = 'STARTING';
  private readonly listeners = new Set<(state: SessionState, transition: SessionTransition) => void>();
  private readonly log?: (transition: SessionTransition, accepted: boolean) => void;

  constructor(log?: (transition: SessionTransition, accepted: boolean) => void) {
    this.log = log;
  }

  get current(): SessionState {
    return this.state;
  }

  get previousState(): SessionState {
    return this.previous;
  }

  canEdit(): boolean {
    return this.state === 'FREE_UNBOUND' || this.state === 'BOUND_TRACKING';
  }

  isAr(): boolean {
    return this.state !== 'DESKTOP_3D' && this.state !== 'STARTING';
  }

  isBound(): boolean {
    return this.state === 'BOUND_TRACKING';
  }

  transition(next: SessionState, reason: string): boolean {
    const transition: SessionTransition = {
      from: this.state,
      to: next,
      reason,
      at: performance.now(),
    };
    const allowed = next === this.state || TRANSITIONS[this.state].includes(next);
    this.log?.(transition, allowed);
    if (!allowed) {
      console.warn(`[session] rejected transition ${this.state} -> ${next} (${reason})`);
      return false;
    }
    if (next !== this.state) {
      this.previous = this.state;
      this.state = next;
    }
    for (const listener of this.listeners) listener(this.state, transition);
    return true;
  }

  force(next: SessionState, reason: string): void {
    const transition: SessionTransition = {
      from: this.state,
      to: next,
      reason: `${reason} (forced)`,
      at: performance.now(),
    };
    this.previous = this.state;
    this.state = next;
    this.log?.(transition, true);
    for (const listener of this.listeners) listener(this.state, transition);
  }

  subscribe(listener: (state: SessionState, transition: SessionTransition) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
