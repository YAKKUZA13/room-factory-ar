const paths: Record<string, string> = {
  generator: '<path d="m13 2-8 12h6l-1 8 9-12h-6z"/>',
  extractor: '<path d="M4 7h16M7 3v4m10-4v4M8 7l2 10h4l2-10m-6 10 2 4 2-4"/>',
  conveyor: '<rect x="3" y="7" width="18" height="10" rx="4"/><path d="M7 12h10m-3-3 3 3-3 3"/>',
  processor: '<path d="m12 2 9 5v10l-9 5-9-5V7zm0 10v10M3 7l9 5 9-5"/>',
  lift: '<path d="M5 2v20M19 2v20M5 18h14M5 6h14m-7 9V9m-3 3 3-3 3 3"/>',
};
export function moduleIcon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.processor}</svg>`;
}
