const CONFIG = {
  seed: {
    daily: true,
    fallback: 'winged-isles',
  },
  render: {
    maxDevicePixelRatio: 1.75,
  },
  camera: {
    fov: 68,
    followDistance: 8,
    followHeight: 3.5,
    followDamp: 0.12,
    lateralOffsetFactor: 0.6,
  },
  player: {
    baseSpeed: 55,
    maxSpeed: 110,
    accelPerSecond: 2,
    brakeFactor: 0.4,  // Reduced from 0.55 for stronger braking (lower = more braking)
    lateralSpeed: 28,
    verticalSpeed: 22,
    rollTurnRate: 1.7,
    yawDamp: 0.1,
    rollDamp: 8,
    pitchDamp: 6,
    pitchLimit: 0.6,
    autoLevelRate: 1.5,
    collisionRadius: 2.4,
    drag: 0.98,
    gravity: -12,  // Base downward acceleration
    pitchGravityEffect: 25,  // How much pitch affects vertical acceleration
    diveSpeedMultiplier: 1.2,  // Speed bonus when diving
    climbSpeedMultiplier: 20,  // Speed penalty when climbing (higher = more penalty)
    minSpeed: 10,  // Minimum speed when climbing
    difficulty: {
      rampSpeed: 0.0025,
      maxDensityMultiplier: 1.9,
    },
  },
  world: {
    chunkLength: 220,
    chunksAhead: 6,
    chunksBehind: 2,
    chunkSizeX: 200,  // Larger chunks = fewer total chunks
    chunkSizeY: 200,  // Larger chunks = fewer total chunks
    chunksRadiusX: 3,  // Reduced from 4 for performance (±600 units coverage)
    chunksRadiusY: 3,  // Reduced from 4 for performance (±600 units coverage)
    spanX: 180,  // Increased to fill larger chunks
    spanY: 180,  // Increased to fill larger chunks
    baseRocksPerChunk: 6,  // Reduced from 8 for better performance
    minRockGap: 24,
    archChance: 0.12,  // Reduced from 0.18
    bridgeChance: 0.08,  // Reduced from 0.12
    rockScale: [5, 32],  // Increased range for more size variety in letter rocks
    cellSize: 18,
    lodDistances: [0, 120, 240],
    drawDistance: 480,
  },
  scoring: {
    baseRate: 1,
    speedFactor: 0.3,
    proxMin: 1,
    proxMax: 6,
    proxMultMin: 1,
    proxMultMax: 5,
    streakGrowRate: 1.2,
    streakDecayRate: 0.9,
    streakMax: 4,
  },
  visuals: {
    fogColor: '#172033',
    fogDensity: 0.008,
    backgroundColor: '#0f1725',
    keyLightColor: 0x88aaff,
    keyLightIntensity: 1.3,
    fillLightColor: 0x223355,
    fillLightIntensity: 0.4,
    ambientIntensity: 0.6,
    farPlane: 1500,
  },
  perf: {
    fpsWindow: 2.5,
    lowFpsThreshold: 40,
    highFpsThreshold: 55,
    lowFpsDuration: 3,
    highFpsDuration: 5,
    lodSteps: 2,
  },
  audio: {
    masterVolume: 0.5,
    weeThreshold: -30,  // Vertical velocity threshold to trigger "WEEEEE"
    weeCooldown: 3,  // Seconds between WEEEEE sounds
  },
};

export function getConfig() {
  return CONFIG;
}
