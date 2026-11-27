/** Optional local metrics, never telemetry. Enable with ?stats=1. */
export function createPerformanceMonitor(renderer, benchmark) {
  if (!new URLSearchParams(location.search).has('stats')) return { sample() {}, reset() {} };
  const panel = document.createElement('aside');
  panel.id = 'performance-panel'; panel.setAttribute('aria-label', '效能數據');
  const output = document.createElement('pre'); panel.append(output);
  if (import.meta.env.DEV) {
    for (const [label, scene] of [['測試出生點', 'home'], ['測試投擲區', 'practice']]) {
      const button = document.createElement('button'); button.textContent = label;
      button.onclick = () => { benchmark(scene); reset(); }; panel.append(button);
    }
  }
  document.body.append(panel);
  let intervals = [], cpu = [], elapsed = 0;
  function reset() { intervals = []; cpu = []; elapsed = 0; }
  return { reset, sample(frameMs, cpuMs, label = '') {
    if (frameMs <= 0 || frameMs > 250) { reset(); return; }
    intervals.push(frameMs); cpu.push(cpuMs); elapsed += frameMs;
    if (elapsed < 1000) return;
    const sorted = [...intervals].sort((a, b) => a - b);
    output.textContent = `${label}\nFPS ${(1000 * intervals.length / elapsed).toFixed(1)} · p95 ${sorted[Math.floor(sorted.length * .95)].toFixed(1)} ms\nCPU ${(cpu.reduce((a, b) => a + b, 0) / cpu.length).toFixed(1)} ms (不含 GPU)\nDraw calls ${renderer.info.render.calls} · 三角形 ${renderer.info.render.triangles}\nDPR ${renderer.getPixelRatio().toFixed(2)} · ${renderer.domElement.width} × ${renderer.domElement.height}\n載入 ${(performance.getEntriesByName('doro-ready')[0]?.startTime / 1000 || 0).toFixed(2)} s`;
    reset();
  } };
}
