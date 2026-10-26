export interface CanvasInputCallbacks {
  onTap(clientX: number, clientY: number): void;
  onDragMove?(clientX: number, clientY: number): void;
  onDragEnd?(): void;
}

/** Pointer/tap handling for the AR canvas; OrbitControls owns desktop drag. */
export class CanvasInputController {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: CanvasInputCallbacks;
  private dragEnabled = false;
  private active: {
    id: number;
    startX: number;
    startY: number;
    moved: boolean;
    time: number;
  } | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: CanvasInputCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerCancel);
    canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  setDragEnabled(enabled: boolean): void {
    this.dragEnabled = enabled;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.active = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      time: performance.now(),
    };
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional; ignore unsupported environments.
    }
    event.preventDefault();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const active = this.active;
    if (!active || active.id !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
    if (!active.moved && distance >= 7) active.moved = true;
    if (active.moved && this.dragEnabled) {
      this.callbacks.onDragMove?.(event.clientX, event.clientY);
    }
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const active = this.active;
    if (!active || active.id !== event.pointerId) return;
    this.active = null;
    const distance = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
    const duration = performance.now() - active.time;
    if (active.moved) {
      this.callbacks.onDragEnd?.();
    } else if (distance < 7 && duration < 700) {
      this.callbacks.onTap(event.clientX, event.clientY);
    }
  };

  private handlePointerCancel = (event: PointerEvent): void => {
    if (this.active?.id !== event.pointerId) return;
    this.active = null;
    this.callbacks.onDragEnd?.();
  };

  private handleContextMenu = (event: Event): void => {
    event.preventDefault();
  };
}
