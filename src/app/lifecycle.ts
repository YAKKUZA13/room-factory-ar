import type { FactoryEngine } from '../core/simulation';
import { FixedStepClock } from '../core/simulation';

/** One simulation driver per page session, independent of renderer FPS. */
export class SimulationDriver {
  private readonly clock = new FixedStepClock();

  tick(deltaSeconds: number, engine: FactoryEngine): number {
    if (document.hidden) {
      this.clock.reset();
      return 0;
    }
    return this.clock.update(deltaSeconds, (dt) => engine.step(dt));
  }

  reset(): void {
    this.clock.reset();
  }
}

export interface PageLifecycleCallbacks {
  onPersist(): void;
  onHidden(): void;
  onVisible(): void;
}

export function bindPageLifecycle(callbacks: PageLifecycleCallbacks): () => void {
  const handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      callbacks.onPersist();
      callbacks.onHidden();
    } else {
      callbacks.onVisible();
    }
  };
  const handlePageHide = (): void => {
    callbacks.onPersist();
  };
  const handleBeforeUnload = (): void => {
    callbacks.onPersist();
  };
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => {
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('pagehide', handlePageHide);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}

export function isLikelyMobile(): boolean {
  if (navigator.maxTouchPoints > 1) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function formatDeviceInfo(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const ua = navigator.userAgent;
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /CriOS/.test(ua) ? 'Chrome iOS'
    : /FxiOS/.test(ua) ? 'Firefox iOS'
    : /Firefox/.test(ua) ? 'Firefox'
    : /Chrome/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari'
    : 'Unknown';
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? 'unknown';
  return `${platform} · ${browser} · ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}`;
}

export function supportsWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}
