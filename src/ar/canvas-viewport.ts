/** XR8 reads the drawing buffer, not CSS dimensions, when cropping the camera feed. */
export function bindCanvasViewport(canvas: HTMLCanvasElement): () => void {
  const host = canvas.parentElement;
  const resize = () => {
    const width = Math.max(1, host?.clientWidth ?? window.innerWidth);
    const height = Math.max(1, host?.clientHeight ?? window.innerHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.setProperty('width', `${width}px`, 'important');
    canvas.style.setProperty('height', `${height}px`, 'important');
  };
  const observer = new ResizeObserver(resize);
  if (host) observer.observe(host);
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  resize();
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', resize);
    window.visualViewport?.removeEventListener('resize', resize);
  };
}
