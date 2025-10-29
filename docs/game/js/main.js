import { setupWorld, updateWorld, getNearestDistance, resetWorld, setWorldQuality } from './world.js';
import { setupPlayer, updatePlayer, getPlayerInfo, resetPlayer } from './player.js';
import { setupUI, updateUI } from './ui.js';
import { Scoring } from './scoring.js';
import { autoScaleQualityTick } from './perf.js';
import { getConfig } from './config.js';

const config = getConfig();

let ctx;

export function setup() {
  ctx = {
    time: 0,
    dt: 0,
    renderer: null,
    scene: null,
    camera: null,
    running: false,
    paused: false,
    scoring: new Scoring(config.scoring),
    config,
  };
  ctx.perf = {
    accumulator: 0,
    frames: 0,
    lowTimer: 0,
    highTimer: 0,
    step: 0,
  };
  ctx.actions = {
    startRun,
    pauseRun,
    resumeRun,
    triggerCrash,
    resetRun,
  };

  const canvas = document.getElementById('game');
  ctx.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.render.maxDevicePixelRatio));
  ctx.renderer.setSize(window.innerWidth, window.innerHeight);
  ctx.scene = new THREE.Scene();
  ctx.scene.fog = new THREE.FogExp2(config.visuals.fogColor, config.visuals.fogDensity);
  ctx.camera = new THREE.PerspectiveCamera(config.camera.fov, window.innerWidth / window.innerHeight, 0.1, config.visuals.farPlane);

  setupWorld(ctx);
  setupPlayer(ctx);
  setupUI(ctx);

  window.addEventListener('resize', () => {
    ctx.camera.aspect = window.innerWidth / window.innerHeight;
    ctx.camera.updateProjectionMatrix();
    ctx.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  requestAnimationFrame(loop);
}

let last = performance.now();
function loop(t) {
  if (!ctx) return;

  ctx.dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  ctx.time = t / 1000;

  if (ctx.running && !ctx.paused) {
    updatePlayer(ctx);
    updateWorld(ctx);
    const nearest = getNearestDistance(ctx);
    const playerInfo = getPlayerInfo(ctx);
    ctx.scoring.tick(ctx.dt, nearest, playerInfo);
    if (nearest <= playerInfo.collisionRadius) {
      triggerCrash();
    }
    autoScaleQualityTick(ctx);
  }

  updateUI(ctx);
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(loop);
}

export function startRun() {
  ctx.running = true;
  ctx.paused = false;
}

export function pauseRun() {
  ctx.paused = true;
}

export function resumeRun() {
  ctx.paused = false;
}

export function triggerCrash() {
  ctx.running = false;
  ctx.paused = false;
  ctx.scoring.handleCrash();
}

export function resetRun() {
  resetPlayer(ctx);
  resetWorld(ctx);
  ctx.scoring.reset();
  ctx.perf.accumulator = 0;
  ctx.perf.frames = 0;
  ctx.perf.lowTimer = 0;
  ctx.perf.highTimer = 0;
  ctx.perf.step = 0;
  setWorldQuality(ctx, 0);
  ctx.running = true;
  ctx.paused = false;
}

setup();
