import { uiStrings } from './strings';

export type NotificationKind = 'info' | 'success' | 'warning' | 'error';

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export class Notifications {
  private readonly root: HTMLElement;
  private readonly items: HTMLElement[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
  }

  show(
    message: string,
    kind: NotificationKind = 'info',
    durationMs = 4200,
    action?: NotificationAction,
  ): void {
    const toast = document.createElement('div');
    toast.className = `toast toast--${kind}`;
    toast.dataset.testid = 'notification';
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');

    const text = document.createElement('span');
    text.className = 'toast__text';
    text.textContent = message;
    toast.appendChild(text);

    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast__action';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        action.onClick();
        this.dismiss(toast);
      });
      toast.appendChild(button);
    }

    this.root.appendChild(toast);
    this.items.push(toast);
    while (this.items.length > 4) {
      const oldest = this.items.shift();
      if (oldest) this.dismiss(oldest);
    }

    if (durationMs > 0) {
      window.setTimeout(() => this.dismiss(toast), durationMs);
    }
  }

  success(message: string, action?: NotificationAction): void {
    this.show(message, 'success', 4200, action);
  }

  info(message: string, action?: NotificationAction): void {
    this.show(message, 'info', 3800, action);
  }

  warning(message: string, action?: NotificationAction): void {
    this.show(message, 'warning', 5200, action);
  }

  error(message: string, action?: NotificationAction): void {
    this.show(message, 'error', 7000, action);
  }

  storageUnavailable(): void {
    this.warning(uiStrings.storageUnavailable, {
      label: uiStrings.exportJson,
      onClick: () => {
        document.dispatchEvent(new CustomEvent('room-factory:export-request'));
      },
    });
  }

  clear(): void {
    for (const item of this.items) item.remove();
    this.items.length = 0;
  }

  private dismiss(toast: HTMLElement): void {
    const index = this.items.indexOf(toast);
    if (index >= 0) this.items.splice(index, 1);
    toast.classList.add('toast--out');
    window.setTimeout(() => toast.remove(), 180);
  }
}
