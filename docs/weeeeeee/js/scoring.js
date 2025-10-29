const BEST_KEY = 'wingedBestScore';

function safeStorage(key, value) {
  try {
    if (value === undefined) {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    /* ignore */
  }
  return null;
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  const t = THREE.MathUtils.clamp((value - inMin) / (inMax - inMin), 0, 1);
  return THREE.MathUtils.lerp(outMin, outMax, t);
}

export class Scoring {
  constructor(config) {
    this.config = config;
    this.score = 0;
    this.time = 0;
    this.streakTimer = 0;
    this.streak = 0;
    this.multiplier = 1;
    this.best = safeStorage(BEST_KEY) ?? 0;
    this.lastDistance = Infinity;
    this.gameOver = false;
  }

  tick(dt, nearestDistance, playerInfo) {
    if (this.gameOver) return;
    this.time += dt;
    this.lastDistance = nearestDistance;

    const cfg = this.config;
    const clampedDistance = isFinite(nearestDistance) ? Math.max(nearestDistance, 0) : cfg.proxMax;
    const proximityMult = mapRange(
      clampedDistance,
      cfg.proxMin,
      cfg.proxMax,
      cfg.proxMultMax,
      cfg.proxMultMin
    );

    if (clampedDistance <= cfg.proxMax) {
      this.streakTimer = Math.min(cfg.streakMax, this.streakTimer + dt * cfg.streakGrowRate);
    } else {
      this.streakTimer = Math.max(0, this.streakTimer - dt * cfg.streakDecayRate);
    }
    this.streak = this.streakTimer;

    const streakMult = 1 + this.streakTimer;
    const speedNorm =
      (playerInfo.speed - playerInfo.baseSpeed) / Math.max(1, playerInfo.maxSpeed - playerInfo.baseSpeed);
    const speedMult = 1 + Math.max(0, speedNorm) * cfg.speedFactor;
    const totalMult = proximityMult * streakMult * speedMult;
    this.multiplier = totalMult;

    const baseRate = cfg.baseRate;
    this.score += baseRate * totalMult * dt;
  }

  handleCrash() {
    this.gameOver = true;
    const finalScore = Math.floor(this.score);
    if (finalScore > this.best) {
      this.best = finalScore;
      safeStorage(BEST_KEY, this.best);
    }
  }

  reset() {
    this.score = 0;
    this.time = 0;
    this.streakTimer = 0;
    this.streak = 0;
    this.multiplier = 1;
    this.lastDistance = Infinity;
    this.gameOver = false;
  }

  getState() {
    return {
      score: Math.floor(this.score),
      time: this.time,
      multiplier: this.multiplier,
      streak: this.streak,
      best: this.best,
      gameOver: this.gameOver,
      lastDistance: this.lastDistance,
    };
  }
}
