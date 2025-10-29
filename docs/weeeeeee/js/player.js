import { getGlobalRNG } from './rng.js';

const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpVec3 = new THREE.Vector3();

const KEY_BINDINGS = {
  pitchUp: ['KeyW', 'ArrowUp'],
  pitchDown: ['KeyS', 'ArrowDown'],
  rollLeft: ['KeyA', 'ArrowLeft'],
  rollRight: ['KeyD', 'ArrowRight'],
  brake: ['ShiftLeft', 'ShiftRight', 'Space'],
};

function damp(current, target, lambda, dt) {
  const t = 1 - Math.exp(-lambda * dt);
  return THREE.MathUtils.lerp(current, target, THREE.MathUtils.clamp(t, 0, 1));
}

function createWShape() {
  // Create a blocky 'W' shape using boxes
  const blockGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const material = new THREE.MeshStandardMaterial({
    color: 0x7bdff2,
    flatShading: true,
    metalness: 0.3,
    roughness: 0.6
  });

  const wGroup = new THREE.Group();

  // Left vertical line (going down-right)
  for (let i = 0; i < 5; i++) {
    const block = new THREE.Mesh(blockGeom, material);
    block.position.set(-1.5, 2 - i * 0.5, 0);
    wGroup.add(block);
  }

  // Left valley (going up-right)
  for (let i = 0; i < 3; i++) {
    const block = new THREE.Mesh(blockGeom, material);
    block.position.set(-1 + i * 0.5, -0.5 + i * 0.5, 0);
    wGroup.add(block);
  }

  // Right valley (going down-right)
  for (let i = 0; i < 3; i++) {
    const block = new THREE.Mesh(blockGeom, material);
    block.position.set(0.5 + i * 0.5, 1 - i * 0.5, 0);
    wGroup.add(block);
  }

  // Right vertical line (going up)
  for (let i = 0; i < 5; i++) {
    const block = new THREE.Mesh(blockGeom, material);
    block.position.set(2, -0.5 + i * 0.5, 0);
    wGroup.add(block);
  }

  return wGroup;
}

export function setupPlayer(ctx) {
  const playerGroup = new THREE.Group();

  // Create the W-shaped player
  const wShape = createWShape();
  wShape.scale.set(0.8, 0.8, 0.8);
  playerGroup.add(wShape);

  ctx.scene.add(playerGroup);

  ctx.player = {
    object: playerGroup,
    velocity: new THREE.Vector3(),
    pitch: -0.05,
    yaw: 0,
    roll: 0,
    currentSpeed: ctx.config.player.baseSpeed,
    targetSpeed: ctx.config.player.baseSpeed,
    verticalVelocity: 0,  // Track vertical velocity for gravity
    elapsed: 0,
    collisionRadius: ctx.config.player.collisionRadius,
    keyboard: {},
    pointer: { active: false, x: 0, y: 0 },
    touch: { active: false, x: 0, y: 0, brake: false },
    settings: { sensitivity: 1, reduceMotion: false },
    swayPhase: 0,
    cameraTarget: new THREE.Vector3(),
    lastPosition: new THREE.Vector3(),
    exhaustParticles: [],  // Array to track exhaust particles
    exhaustSpawnTimer: 0,
  };

  initInputListeners(ctx);
  resetPlayer(ctx);
}

function initInputListeners(ctx) {
  window.addEventListener('keydown', (e) => {
    ctx.player.keyboard[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    ctx.player.keyboard[e.code] = false;
  });

  window.addEventListener(
    'contextmenu',
    (event) => {
      event.preventDefault();
    },
    { passive: false }
  );

  window.addEventListener('mousedown', (event) => {
    if (event.button === 2) {
      ctx.player.pointer.active = true;
    }
  });

  window.addEventListener('mouseup', (event) => {
    if (event.button === 2) {
      ctx.player.pointer.active = false;
    }
  });

  window.addEventListener('mousemove', (event) => {
    const pointer = ctx.player.pointer;
    if (!pointer.active) return;
    const scale = 0.0025 * (ctx.player.settings.sensitivity || 1);
    pointer.x = THREE.MathUtils.clamp(pointer.x + event.movementX * scale, -1.5, 1.5);
    pointer.y = THREE.MathUtils.clamp(pointer.y + event.movementY * scale, -1.5, 1.5);
  });
}

export function resetPlayer(ctx) {
  const player = ctx.player;
  const cfg = ctx.config.player;
  player.object.position.set(0, 24, 0);
  player.object.quaternion.identity();
  player.velocity.set(0, 0, 0);
  player.pitch = -0.08;
  player.yaw = 0;
  player.roll = 0;
  player.elapsed = 0;
  player.currentSpeed = cfg.baseSpeed;
  player.targetSpeed = cfg.baseSpeed;
  player.verticalVelocity = 0;
  player.swayPhase = 0;
  player.pointer.x = 0;
  player.pointer.y = 0;
  player.touch.active = false;
  player.touch.brake = false;
  ctx.camera.position.copy(player.object.position).add(new THREE.Vector3(0, ctx.config.camera.followHeight, -ctx.config.camera.followDistance - 6));
  ctx.camera.lookAt(player.object.position);
}

function createEParticle(ctx, position) {
  // Create a simple 'E' shape using text sprite
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  context.font = 'Bold 48px Arial';
  context.fillStyle = '#b2f7ef';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('E', 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.5, 1.5, 1);
  sprite.position.copy(position);

  ctx.scene.add(sprite);

  return {
    sprite,
    life: 1.0,  // Lifetime
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    ),
  };
}

function updateExhaust(ctx) {
  const player = ctx.player;
  const dt = ctx.dt;

  // Spawn new E particles
  player.exhaustSpawnTimer += dt;
  if (player.exhaustSpawnTimer > 0.05) {  // Spawn every 50ms
    player.exhaustSpawnTimer = 0;
    const spawnPos = player.object.position.clone();

    // Get the right direction relative to player orientation
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(player.object.quaternion);
    spawnPos.addScaledVector(right, -1.5);  // Offset to the right side of the W (negative because of orientation)
    spawnPos.z -= 1;  // Slightly behind

    const particle = createEParticle(ctx, spawnPos);
    player.exhaustParticles.push(particle);
  }

  // Update existing particles
  for (let i = player.exhaustParticles.length - 1; i >= 0; i--) {
    const p = player.exhaustParticles[i];
    p.life -= dt * 0.8;  // Fade out over time

    if (p.life <= 0) {
      // Remove dead particle
      ctx.scene.remove(p.sprite);
      p.sprite.material.map.dispose();
      p.sprite.material.dispose();
      player.exhaustParticles.splice(i, 1);
    } else {
      // Update particle
      p.sprite.position.add(p.velocity.clone().multiplyScalar(dt * 3));
      p.sprite.material.opacity = p.life;
      p.sprite.scale.set(1.5 * p.life, 1.5 * p.life, 1);
    }
  }
}

export function updatePlayer(ctx) {
  const player = ctx.player;
  const cfg = ctx.config.player;
  const dt = ctx.dt;

  player.elapsed += dt;

  // Update exhaust trail
  updateExhaust(ctx);

  const input = sampleInput(player);
  const sensitivity = player.settings.sensitivity || 1;
  const pitchInput = THREE.MathUtils.clamp(input.pitch * sensitivity, -1, 1);
  const rollInput = THREE.MathUtils.clamp(input.roll * sensitivity, -1, 1);
  const brakeInput = input.brake || player.touch.brake;

  const targetPitch = THREE.MathUtils.clamp(pitchInput * cfg.pitchLimit, -cfg.pitchLimit, cfg.pitchLimit);
  player.pitch = damp(player.pitch, targetPitch, cfg.pitchDamp, dt);

  const maxRoll = 0.75;
  const targetRoll = THREE.MathUtils.clamp(rollInput * maxRoll, -maxRoll, maxRoll);
  player.roll = damp(player.roll, targetRoll, cfg.rollDamp, dt);
  if (Math.abs(rollInput) < 0.05) {
    player.roll = damp(player.roll, 0, cfg.autoLevelRate, dt);
  }

  player.yaw += player.roll * cfg.rollTurnRate * dt * 0.8;
  player.yaw += rollInput * cfg.rollTurnRate * dt * 0.2;

  // Pointer relax
  player.pointer.x *= 0.9;
  player.pointer.y *= 0.9;

  // Gravity-based physics
  // Constant downward acceleration (gravity)
  const baseGravity = cfg.gravity;

  // Pitch modifies the rate of descent
  // With inverted controls: positive pitch = nose up, negative pitch = nose down
  // Nose down (negative pitch) = dive faster = more negative acceleration
  // Nose up (positive pitch) = resist gravity = less negative acceleration
  const pitchAcceleration = -player.pitch * cfg.pitchGravityEffect;

  const totalVerticalAccel = baseGravity + pitchAcceleration;

  // Apply acceleration to vertical velocity
  player.verticalVelocity += totalVerticalAccel * dt;

  // Clamp vertical velocity to reasonable limits
  player.verticalVelocity = THREE.MathUtils.clamp(player.verticalVelocity, -80, 40);

  // Separate dive and climb speed effects for independent tuning
  const diveSpeedBonus = player.verticalVelocity < 0
    ? -player.verticalVelocity * cfg.diveSpeedMultiplier
    : 0;

  const climbSpeedPenalty = player.verticalVelocity > 0
    ? player.verticalVelocity * cfg.climbSpeedMultiplier
    : 0;

  const progress = THREE.MathUtils.clamp(player.elapsed * cfg.difficulty.rampSpeed, 0, 1);
  const baseSpeed = cfg.baseSpeed + (cfg.maxSpeed - cfg.baseSpeed) * progress;
  const brakeFactor = brakeInput ? cfg.brakeFactor : 1;

  player.targetSpeed = Math.max(cfg.minSpeed, (baseSpeed + diveSpeedBonus - climbSpeedPenalty) * brakeFactor);
  player.currentSpeed = damp(player.currentSpeed, player.targetSpeed, 3.2, dt);

  // Orientation and position integration
  const orientation = player.object.quaternion;
  const euler = new THREE.Euler(player.pitch, player.yaw, player.roll, 'YXZ');
  orientation.setFromEuler(euler);

  const forward = tmpVec.set(0, 0, 1).applyQuaternion(orientation).normalize();
  const right = tmpVec2.set(1, 0, 0).applyQuaternion(orientation).normalize();

  const displacement = tmpVec3.copy(forward).multiplyScalar(player.currentSpeed * dt);
  displacement.addScaledVector(right, player.roll * cfg.lateralSpeed * dt);

  player.object.position.add(displacement);

  // Apply vertical velocity from gravity
  player.object.position.y += player.verticalVelocity * dt;

  // No upper or lower bounds - gravity and physics handle everything naturally

  player.lastPosition.copy(player.object.position);

  // Camera follow
  updateCamera(ctx, forward);

  // Feed difficulty back to world
  if (ctx.world) {
    ctx.world.densityFactor = 1 + (cfg.difficulty.maxDensityMultiplier - 1) * progress;
  }
}

function sampleInput(player) {
  const keyboard = player.keyboard;
  const pointer = player.pointer.active ? player.pointer : { x: 0, y: 0 };
  const touch = player.touch.active ? player.touch : { x: 0, y: 0, brake: false };

  const isPressed = (codes) => codes.some((code) => keyboard[code]);

  let pitch = 0;
  if (isPressed(KEY_BINDINGS.pitchDown)) pitch -= 1;  // S/Down = nose up (flight sim: pull back)
  if (isPressed(KEY_BINDINGS.pitchUp)) pitch += 1;    // W/Up = nose down (flight sim: push forward)
  pitch -= pointer.y * 0.8;  // Inverted mouse
  pitch -= touch.y;          // Inverted touch

  let roll = 0;
  if (isPressed(KEY_BINDINGS.rollLeft)) roll += 1;   // Left key = roll left
  if (isPressed(KEY_BINDINGS.rollRight)) roll -= 1;  // Right key = roll right
  roll -= pointer.x;  // Inverted mouse X
  roll -= touch.x;    // Inverted touch X

  const brake = isPressed(KEY_BINDINGS.brake);

  return { pitch, roll, brake };
}

function updateCamera(ctx, forward) {
  const player = ctx.player;
  const camCfg = ctx.config.camera;
  const target = player.object.position;
  const reduceMotion = player.settings.reduceMotion;

  // Calculate camera position relative to player
  // Use forward vector to position camera behind the player
  const right = tmpVec2.set(1, 0, 0).applyQuaternion(player.object.quaternion).normalize();
  const up = tmpVec3.set(0, 1, 0); // World up, not rotated

  // Start behind the player
  const desired = target.clone().addScaledVector(forward, -camCfg.followDistance);

  // Add height offset (world space up, not player's up)
  desired.y += camCfg.followHeight;

  // Add lateral offset based on roll
  desired.addScaledVector(right, player.roll * camCfg.lateralOffsetFactor);

  if (!reduceMotion) {
    player.swayPhase += ctx.dt * (player.currentSpeed * 0.05);
    desired.y += Math.sin(player.swayPhase) * 0.5;
    desired.x += Math.cos(player.swayPhase * 0.7) * 0.4;
  }

  // Set camera position directly for X and Z (no lag)
  // But smooth Y (vertical) to reduce jarring up/down motion
  ctx.camera.position.x = desired.x;
  ctx.camera.position.z = desired.z;
  ctx.camera.position.y = THREE.MathUtils.lerp(ctx.camera.position.y, desired.y, 0.05);

  const lookTarget = target.clone().addScaledVector(forward, reduceMotion ? 6 : 12);
  ctx.camera.lookAt(lookTarget);
}

export function getPlayerInfo(ctx) {
  const player = ctx.player;
  const cfg = ctx.config.player;
  return {
    speed: player.currentSpeed,
    baseSpeed: cfg.baseSpeed,
    maxSpeed: cfg.maxSpeed,
    collisionRadius: player.collisionRadius,
    position: player.object.position,
    elapsed: player.elapsed,
    verticalVelocity: player.verticalVelocity,
  };
}

export function setTouchVector(ctx, vec) {
  ctx.player.touch.active = vec !== null;
  if (vec) {
    ctx.player.touch.x = THREE.MathUtils.clamp(vec.x, -1, 1);
    ctx.player.touch.y = THREE.MathUtils.clamp(vec.y, -1, 1);
  } else {
    ctx.player.touch.x = 0;
    ctx.player.touch.y = 0;
  }
}

export function setTouchBrake(ctx, active) {
  ctx.player.touch.brake = active;
}

export function applyPlayerSettings(ctx, settings) {
  ctx.player.settings = { ...ctx.player.settings, ...settings };
}
