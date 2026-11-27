export const QUALITY = Object.freeze({
  low: { dpr: 1, shadow: 512, pixels: 1_000_000, label: '省電' },
  balanced: { dpr: 1.5, shadow: 1024, pixels: 2_000_000, label: '平衡' },
  high: { dpr: 2, shadow: 2048, pixels: 4_000_000, label: '高畫質' },
});
export function pixelRatio(tier, deviceRatio, width, height) {
  const preset = QUALITY[tier];
  return Math.min(deviceRatio || 1, preset.dpr, Math.sqrt(preset.pixels / Math.max(1, width * height)));
}

// Hysteresis: slow for 6s before reducing, fast for 20s before recovering.
// Ignore loading/tab-resume stalls. Auto never goes beyond balanced.
export class AdaptiveQuality {
  constructor() { this.reset(); }
  reset() { this.tier = 'balanced'; this.frames = 0; this.total = 0; this.slow = 0; this.fast = 0; this.cooldown = 5000; }
  sample(ms) {
    if (!Number.isFinite(ms) || ms <= 0 || ms > 250) { this.total = this.frames = this.slow = this.fast = 0; this.cooldown = 5000; return null; }
    if (this.cooldown > 0) { this.cooldown -= ms; return null; }
    this.total += ms; this.frames++;
    if (this.total < 2000) return null;
    const mean = this.total / this.frames;
    this.slow = mean > 24 ? this.slow + this.total : 0;
    this.fast = mean < 18 ? this.fast + this.total : 0;
    this.total = this.frames = 0;
    if (this.tier === 'balanced' && this.slow >= 6000) {
      this.tier = 'low'; this.slow = this.fast = 0; this.cooldown = 15000; return this.tier;
    }
    if (this.tier === 'low' && this.fast >= 20000) {
      this.tier = 'balanced'; this.slow = this.fast = 0; this.cooldown = 15000; return this.tier;
    }
    return null;
  }
}

export function createQualityController(renderer, sun, select, onChange) {
  const adaptive = new AdaptiveQuality();
  let mode = 'auto', tier = 'balanced';
  try { const saved = localStorage.getItem('doro-quality'); if (saved === 'auto' || QUALITY[saved]) mode = saved; } catch {}
  function apply() {
    tier = mode === 'auto' ? adaptive.tier : mode;
    const preset = QUALITY[tier];
    renderer.setPixelRatio(pixelRatio(tier, devicePixelRatio, innerWidth, innerHeight));
    renderer.setSize(innerWidth, innerHeight);
    if (sun.shadow.mapSize.x !== preset.shadow) {
      sun.shadow.map?.dispose(); sun.shadow.map = null;
      sun.shadow.mapSize.set(preset.shadow, preset.shadow);
      sun.shadow.needsUpdate = true;
    }
    select.value = mode;
    select.options[0].textContent = `自動（${QUALITY[adaptive.tier].label}）`;
    onChange(tier);
  }
  select.addEventListener('change', () => {
    mode = select.value; adaptive.reset();
    try { localStorage.setItem('doro-quality', mode); } catch {}
    apply(); select.blur();
  });
  apply();
  return { get tier() { return tier; }, get fpsLimit() { return mode === 'low' ? 30 : 60; }, resize: apply,
    sample(ms) { if (mode === 'auto' && adaptive.sample(ms)) apply(); },
    resetTiming() { adaptive.total = adaptive.frames = adaptive.slow = adaptive.fast = 0; adaptive.cooldown = 5000; },
  };
}
