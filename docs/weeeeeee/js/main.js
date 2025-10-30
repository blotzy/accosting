// Cache buster: Change this version number to force users to get new JS files
// Update this in one place, and all imports will use the new version
const V = '4';

import { setupWorld, updateWorld, getNearestDistance, resetWorld, setWorldQuality } from './world.js?v=4';
import { setupPlayer, updatePlayer, getPlayerInfo, resetPlayer } from './player.js?v=4';
import { setupUI, updateUI } from './ui.js?v=4';
import { Scoring } from './scoring.js?v=4';
import { autoScaleQualityTick } from './perf.js?v=4';
import { getConfig } from './config.js?v=4';
import { setupAudio, playWindSound, updateWindSound, playDingSound, playCrashSound, playWeeSound, stopAllSounds } from './audio.js?v=4';

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
  ctx.audioState = {
    lastWeeTime: 0,
    lastDingDistance: Infinity,
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
  setupAudio(ctx);

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

    // Audio updates
    updateWindSound(ctx, playerInfo.speed, playerInfo.verticalVelocity);

    // Play ding for near misses
    if (nearest < 6 && nearest > playerInfo.collisionRadius) {
      if (nearest < ctx.audioState.lastDingDistance - 0.5) {
        playDingSound(ctx, nearest);
        ctx.audioState.lastDingDistance = nearest;
      }
    } else {
      ctx.audioState.lastDingDistance = Infinity;
    }

    // Play WEEEEE when diving fast
    const timeSinceLastWee = ctx.time - ctx.audioState.lastWeeTime;
    if (playerInfo.verticalVelocity < config.audio.weeThreshold &&
        timeSinceLastWee > config.audio.weeCooldown) {
      playWeeSound(ctx);
      ctx.audioState.lastWeeTime = ctx.time;
    }

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
  playWindSound(ctx);
}

export function pauseRun() {
  ctx.paused = true;
  stopAllSounds(ctx);
}

export function resumeRun() {
  ctx.paused = false;
  playWindSound(ctx);
}

export function triggerCrash() {
  ctx.running = false;
  ctx.paused = false;
  playCrashSound(ctx);
  stopAllSounds(ctx);
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
  ctx.audioState.lastWeeTime = 0;
  ctx.audioState.lastDingDistance = Infinity;
  setWorldQuality(ctx, 0);
  ctx.running = true;
  ctx.paused = false;
  playWindSound(ctx);
}

setup();
