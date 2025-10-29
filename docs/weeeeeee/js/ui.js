import { setTouchVector, setTouchBrake, applyPlayerSettings } from './player.js';
import { setWorldQuality } from './world.js';

const SETTINGS_KEY = 'wingedSettings';

const DEFAULT_SETTINGS = {
  drawDistance: 480,
  postfx: false,
  sensitivity: 1,
  volume: 0.6,
  mute: false,
  reduceMotion: false,
  highContrast: false,
};

function safeGetSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (err) {
    return { ...DEFAULT_SETTINGS };
  }
}

function safeStoreSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    /* ignore */
  }
}

export function setupUI(ctx) {
  const hud = {
    speed: document.getElementById('speed'),
    score: document.getElementById('score'),
    mult: document.getElementById('mult'),
    streak: document.getElementById('streak'),
    pauseBtn: document.getElementById('pauseBtn'),
  };

  const panels = {
    menu: document.getElementById('menu'),
    pause: document.getElementById('pauseOverlay'),
    gameOver: document.getElementById('gameOver'),
    settings: document.getElementById('settings'),
    how: document.getElementById('how'),
  };

  const gameOverEls = {
    finalScore: document.getElementById('finalScore'),
    bestScore: document.getElementById('bestScore'),
  };

  const settingsForm = panels.settings.querySelector('form');
  const touchControls = document.getElementById('touchControls');
  const joystick = document.getElementById('joystick');
  const joystickHandle = document.getElementById('joystickHandle');
  const touchBrake = document.getElementById('touchBrake');

  const settings = safeGetSettings();
  applySettings(ctx, settings);
  hydrateSettingsForm(settingsForm, settings);

  const ui = {
    hud,
    panels,
    gameOverEls,
    settingsForm,
    settings,
    touch: {
      enabled: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      active: false,
      startX: 0,
      startY: 0,
    },
    joystick,
    joystickHandle,
    touchBrake,
    state: 'menu',
    previousState: null,
    lastGameOverState: false,
  };
  ctx.ui = ui;

  // Ensure all panels are hidden except menu on initialization
  panels.pause.hidden = true;
  panels.pause.style.display = 'none';
  panels.gameOver.hidden = true;
  panels.gameOver.style.display = 'none';
  panels.settings.hidden = true;
  panels.settings.style.display = 'none';
  panels.how.hidden = true;
  panels.how.style.display = 'none';
  panels.menu.hidden = false;
  panels.menu.style.display = 'flex';

  hud.pauseBtn.addEventListener('click', () => togglePause(ctx));
  document.body.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      e.preventDefault();
      togglePause(ctx);
    }
  });

  panels.menu.addEventListener('click', (event) => handlePanelClick(ctx, event));
  panels.pause.addEventListener('click', (event) => handlePanelClick(ctx, event));
  panels.gameOver.addEventListener('click', (event) => handlePanelClick(ctx, event));
  panels.how.addEventListener('click', (event) => handlePanelClick(ctx, event));

  settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(settingsForm);
    const updated = {
      drawDistance: Number(formData.get('drawDistance')),
      postfx: formData.get('postfx') === 'on',
      sensitivity: Number(formData.get('sensitivity')),
      volume: Number(formData.get('volume')),
      mute: formData.get('mute') === 'on',
      reduceMotion: formData.get('reduceMotion') === 'on',
      highContrast: formData.get('highContrast') === 'on',
    };
    ui.settings = { ...ui.settings, ...updated };
    safeStoreSettings(ui.settings);
    applySettings(ctx, ui.settings);
    hidePanel(ui, 'settings');
  });

  panels.settings.querySelector('[data-action="closeSettings"]').addEventListener('click', () => {
    hydrateSettingsForm(settingsForm, ui.settings);
    hidePanel(ui, 'settings');
  });

  if (ui.touch.enabled) {
    touchControls.hidden = false;
    setupTouchControls(ctx, ui);
  } else {
    touchControls.remove();
  }
}

function handlePanelClick(ctx, event) {
  const rawTarget = event.target;
  if (!(rawTarget instanceof Element)) return;
  const target = rawTarget.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (!action) return;
  event.preventDefault();
  handlePanelAction(ctx, action);
}

function handlePanelAction(ctx, action) {
  const ui = ctx.ui;
  switch (action) {
    case 'start':
      hidePanel(ui, 'menu');
      ctx.actions.resetRun();
      ui.state = 'running';
      break;
    case 'settings':
      showPanel(ui, 'settings');
      break;
    case 'how':
      ui.previousState = ui.state;
      if (ui.previousState === 'menu') {
        hidePanel(ui, 'menu');
      } else if (ui.previousState === 'paused') {
        hidePanel(ui, 'pause');
      } else if (ui.previousState === 'running') {
        ctx.actions.pauseRun();
      }
      showPanel(ui, 'how');
      ui.state = 'how';
      break;
    case 'closeHow':
      closeHowPanel(ctx);
      break;
    case 'resume':
      ctx.actions.resumeRun();
      hidePanel(ui, 'pause');
      ui.state = 'running';
      break;
    case 'restart':
      hidePanel(ui, 'pause');
      hidePanel(ui, 'gameOver');
      ctx.actions.resetRun();
      ui.state = 'running';
      break;
    case 'menu':
      ctx.actions.pauseRun();
      ctx.running = false;
      ctx.paused = false;
      ctx.scoring.reset();
      hidePanel(ui, 'pause');
      hidePanel(ui, 'gameOver');
      showPanel(ui, 'menu');
      ui.state = 'menu';
      break;
    default:
      break;
  }
}

function closeHowPanel(ctx) {
  const ui = ctx.ui;
  hidePanel(ui, 'how');
  if (ui.previousState === 'menu') {
    showPanel(ui, 'menu');
  } else if (ui.previousState === 'paused') {
    showPanel(ui, 'pause');
  } else if (ui.previousState === 'running') {
    ctx.actions.resumeRun();
  } else {
    // Fallback: if previousState is null or unexpected, show the menu
    showPanel(ui, 'menu');
  }
  ui.state = ui.previousState || (ctx.running ? 'running' : 'menu');
  ui.previousState = null;
}

function togglePause(ctx) {
  const ui = ctx.ui;
  if (!ctx.running || ctx.scoring.gameOver) return;
  if (ctx.paused) {
    ctx.actions.resumeRun();
    hidePanel(ui, 'pause');
    ui.state = 'running';
  } else {
    ctx.actions.pauseRun();
    showPanel(ui, 'pause');
    ui.state = 'paused';
  }
}

function showPanel(ui, panel) {
  const element = ui.panels[panel];
  if (element) {
    element.hidden = false;
    element.style.display = 'flex';
  }
}

function hidePanel(ui, panel) {
  const element = ui.panels[panel];
  if (element) {
    element.hidden = true;
    element.style.display = 'none';
  }
}

function applySettings(ctx, settings) {
  ctx.config.world.drawDistance = settings.drawDistance;
  if (ctx.world) {
    ctx.world.drawDistance = settings.drawDistance;
    setWorldQuality(ctx, ctx.perf?.step ?? 0);
  }
  applyPlayerSettings(ctx, {
    sensitivity: settings.sensitivity,
    reduceMotion: settings.reduceMotion,
  });
  document.body.classList.toggle('high-contrast', !!settings.highContrast);
}

function hydrateSettingsForm(form, settings) {
  form.drawDistance.value = settings.drawDistance;
  form.postfx.checked = settings.postfx;
  form.sensitivity.value = settings.sensitivity;
  form.volume.value = settings.volume;
  form.mute.checked = settings.mute;
  form.reduceMotion.checked = settings.reduceMotion;
  form.highContrast.checked = settings.highContrast;
}

function setupTouchControls(ctx, ui) {
  const joystick = ui.joystick;
  const handle = ui.joystickHandle;
  const radius = joystick.clientWidth * 0.5;

  const updateHandle = (x, y) => {
    handle.style.transform = `translate(${x}px, ${y}px)`;
  };

  const handleMove = (clientX, clientY) => {
    const rect = joystick.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const dist = Math.min(Math.hypot(dx, dy), radius);
    const angle = Math.atan2(dy, dx);
    const clampedX = Math.cos(angle) * dist;
    const clampedY = Math.sin(angle) * dist;
    updateHandle(clampedX, clampedY);
    setTouchVector(ctx, { x: clampedX / radius, y: clampedY / radius });
  };

  const resetHandle = () => {
    updateHandle(0, 0);
    setTouchVector(ctx, null);
  };

  joystick.addEventListener(
    'touchstart',
    (event) => {
      ui.touch.active = true;
      const touch = event.touches[0];
      handleMove(touch.clientX, touch.clientY);
    },
    { passive: true }
  );

  joystick.addEventListener(
    'touchmove',
    (event) => {
      const touch = event.touches[0];
      handleMove(touch.clientX, touch.clientY);
    },
    { passive: true }
  );

  joystick.addEventListener(
    'touchend',
    () => {
      ui.touch.active = false;
      resetHandle();
    },
    { passive: true }
  );

  joystick.addEventListener(
    'touchcancel',
    () => {
      ui.touch.active = false;
      resetHandle();
    },
    { passive: true }
  );

  ui.touchBrake.addEventListener('touchstart', () => setTouchBrake(ctx, true), { passive: true });
  ui.touchBrake.addEventListener('touchend', () => setTouchBrake(ctx, false), { passive: true });
  ui.touchBrake.addEventListener('touchcancel', () => setTouchBrake(ctx, false), { passive: true });
}

export function updateUI(ctx) {
  if (!ctx.ui) return;
  const ui = ctx.ui;
  const hud = ui.hud;

  const scoreState = ctx.scoring.getState();

  if (ctx.player) {
    hud.speed.textContent = `SPD ${Math.round(ctx.player.currentSpeed)}`;
  }
  hud.score.textContent = `SCORE ${scoreState.score}`;
  hud.mult.textContent = `x${scoreState.multiplier.toFixed(1)}`;
  hud.streak.textContent = `STREAK ${scoreState.streak.toFixed(1)}`;

  if (scoreState.lastDistance < ctx.player.collisionRadius * 1.2) {
    hud.streak.classList.add('near');
  } else {
    hud.streak.classList.remove('near');
  }

  if (scoreState.gameOver && !ui.lastGameOverState) {
    ui.gameOverEls.finalScore.textContent = `Score: ${scoreState.score}`;
    ui.gameOverEls.bestScore.textContent = `Best: ${scoreState.best}`;
    hidePanel(ui, 'pause');
    showPanel(ui, 'gameOver');
    ui.state = 'gameOver';
  }
  ui.lastGameOverState = scoreState.gameOver;
}
