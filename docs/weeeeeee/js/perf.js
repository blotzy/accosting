import { setWorldQuality } from './world.js';

export function autoScaleQualityTick(ctx) {
  if (!ctx.world) return;
  const perf = ctx.perf;
  const cfg = ctx.config.perf;

  perf.accumulator += ctx.dt;
  perf.frames += 1;

  if (perf.accumulator < cfg.fpsWindow) return;

  const fps = perf.frames / perf.accumulator;
  perf.currentFps = fps;
  perf.accumulator = 0;
  perf.frames = 0;

  if (fps < cfg.lowFpsThreshold) {
    perf.lowTimer += cfg.fpsWindow;
    perf.highTimer = Math.max(0, perf.highTimer - cfg.fpsWindow);
  } else if (fps > cfg.highFpsThreshold) {
    perf.highTimer += cfg.fpsWindow;
    perf.lowTimer = Math.max(0, perf.lowTimer - cfg.fpsWindow);
  } else {
    perf.lowTimer = Math.max(0, perf.lowTimer - cfg.fpsWindow * 0.5);
    perf.highTimer = Math.max(0, perf.highTimer - cfg.fpsWindow * 0.5);
  }

  if (perf.lowTimer >= cfg.lowFpsDuration && perf.step < cfg.lodSteps) {
    perf.step += 1;
    setWorldQuality(ctx, perf.step);
    perf.lowTimer = 0;
  } else if (perf.highTimer >= cfg.highFpsDuration && perf.step > 0) {
    perf.step -= 1;
    setWorldQuality(ctx, perf.step);
    perf.highTimer = 0;
  }
}
