import './styles/global.css';
import './styles/hud.css';
import './styles/dialogs.css';
import { AppController } from './app/app-controller';
import { Screens, mountScreensTemplate } from './ui/screens';

function boot(): void {
  const sceneCanvas = document.getElementById('scene-canvas');
  const canvasHost = document.getElementById('canvas-host');
  const uiRoot = document.getElementById('ui-root');
  if (!(sceneCanvas instanceof HTMLCanvasElement) || !canvasHost || !uiRoot) {
    throw new Error('Не найдены базовые элементы страницы (#scene-canvas, #canvas-host, #ui-root).');
  }

  // Fields in Screens query the mounted template, so mounting must happen first.
  mountScreensTemplate(uiRoot);
  const screens = new Screens(uiRoot);
  const app = new AppController({ sceneCanvas, canvasHost, screens });
  window.addEventListener('pagehide', () => app.dispose(), { once: true });
}

try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
} catch (error) {
  console.error(error);
  const fallback = document.createElement('div');
  fallback.className = 'fatal-error';
  fallback.innerHTML = `
    <h1>ROOM FACTORY AR</h1>
    <p>Приложение не смогло запуститься. Обновите страницу или откройте её в современном браузере.</p>
    <pre></pre>
  `;
  const pre = fallback.querySelector('pre');
  if (pre) pre.textContent = error instanceof Error ? error.stack ?? error.message : String(error);
  document.body.appendChild(fallback);
}
