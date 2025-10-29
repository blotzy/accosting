import { getGlobalRNG } from './rng.js';

const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

export function setupWorld(ctx) {
  const config = ctx.config.world;
  ctx.scene.background = new THREE.Color(ctx.config.visuals.backgroundColor);

  const root = new THREE.Group();
  root.name = 'WorldRoot';
  ctx.scene.add(root);

  addLights(ctx);

  const worldRng = getGlobalRNG().fork('world');

  ctx.world = {
    root,
    chunkLength: config.chunkLength,
    chunks: new Map(),
    cells: new Map(),
    cellSize: config.cellSize,
    densityFactor: 1,
    qualityStep: 0,
    drawDistance: config.drawDistance,
    rng: worldRng,
    materials: buildMaterials(),
    lastPlayerChunk: 0,
  };

  // Generate initial 3D grid of chunks around origin
  const startZ = -1;
  const endZ = config.chunksAhead;
  for (let z = startZ; z <= endZ; z++) {
    for (let x = -config.chunksRadiusX; x <= config.chunksRadiusX; x++) {
      for (let y = -config.chunksRadiusY; y <= config.chunksRadiusY; y++) {
        spawnChunk3D(ctx, z, x, y);
      }
    }
  }
}

export function resetWorld(ctx) {
  const world = ctx.world;
  if (!world) return;

  for (const [index, chunk] of Array.from(world.chunks.entries())) {
    removeChunk(world, index, chunk);
  }
  world.cells.clear();
  world.densityFactor = 1;
  world.qualityStep = 0;
  world.drawDistance = ctx.config.world.drawDistance;

  // Regenerate initial 3D grid of chunks
  const cfg = ctx.config.world;
  const startZ = -1;
  const endZ = cfg.chunksAhead;
  for (let z = startZ; z <= endZ; z++) {
    for (let x = -cfg.chunksRadiusX; x <= cfg.chunksRadiusX; x++) {
      for (let y = -cfg.chunksRadiusY; y <= cfg.chunksRadiusY; y++) {
        spawnChunk3D(ctx, z, x, y);
      }
    }
  }
}

function addLights(ctx) {
  const visuals = ctx.config.visuals;
  const ambient = new THREE.AmbientLight(0xffffff, visuals.ambientIntensity);
  ctx.scene.add(ambient);

  const key = new THREE.DirectionalLight(visuals.keyLightColor, visuals.keyLightIntensity);
  key.position.set(-80, 140, -40);
  ctx.scene.add(key);

  const fill = new THREE.HemisphereLight(visuals.fillLightColor, 0x050510, visuals.fillLightIntensity);
  ctx.scene.add(fill);
}

function buildMaterials() {
  const palette = [0x33415c, 0x24324f, 0x3a506b, 0x5bc0be, 0x96d1c7];
  return palette.map(
    (hex) =>
      new THREE.MeshStandardMaterial({
        color: hex,
        metalness: 0.05,
        roughness: 0.85,
        flatShading: true,
      })
  );
}

export function updateWorld(ctx) {
  const world = ctx.world;
  if (!world) return;

  const config = ctx.config.world;
  const playerPos = ctx.player.object.position;

  // Calculate current chunk indices based on player position in 3D
  const currentChunkZ = Math.floor(playerPos.z / world.chunkLength);
  const currentChunkX = Math.floor(playerPos.x / config.chunkSizeX);
  const currentChunkY = Math.floor(playerPos.y / config.chunkSizeY);

  world.lastPlayerChunk = currentChunkZ;

  ensureChunks3D(ctx, currentChunkZ, currentChunkX, currentChunkY);
  cullChunks3D(ctx, currentChunkZ, currentChunkX, currentChunkY);

  const now = ctx.time;
  for (const [, chunk] of world.chunks) {
    const distance = Math.abs(chunk.centerZ - playerPos.z);
    chunk.group.visible = distance < world.drawDistance;
    chunk.group.position.y = chunk.baseY + Math.sin(now * 0.18 + chunk.bobPhase) * chunk.bobAmplitude;
    for (const obstacle of chunk.obstacles) {
      obstacle.lod.update(ctx.camera);
    }
  }
}

function getChunkKey(indexZ, indexX, indexY) {
  return `${indexZ},${indexX},${indexY}`;
}

function ensureChunks3D(ctx, currentZ, currentX, currentY) {
  const world = ctx.world;
  const cfg = ctx.config.world;

  let chunksSpawnedThisFrame = 0;
  const maxChunksPerFrame = 3; // Limit chunk spawning to prevent lag spikes

  // Generate chunks in a 3D grid around the player
  for (let z = currentZ - cfg.chunksBehind; z <= currentZ + cfg.chunksAhead; z++) {
    for (let x = currentX - cfg.chunksRadiusX; x <= currentX + cfg.chunksRadiusX; x++) {
      for (let y = currentY - cfg.chunksRadiusY; y <= currentY + cfg.chunksRadiusY; y++) {
        const key = getChunkKey(z, x, y);
        if (!world.chunks.has(key)) {
          if (chunksSpawnedThisFrame < maxChunksPerFrame) {
            spawnChunk3D(ctx, z, x, y);
            chunksSpawnedThisFrame++;
          }
        }
      }
    }
  }
}

function cullChunks3D(ctx, currentZ, currentX, currentY) {
  const world = ctx.world;
  const cfg = ctx.config.world;

  for (const [key, chunk] of world.chunks) {
    const outOfRangeZ = chunk.indexZ < currentZ - cfg.chunksBehind - 1 || chunk.indexZ > currentZ + cfg.chunksAhead + 1;
    const outOfRangeX = Math.abs(chunk.indexX - currentX) > cfg.chunksRadiusX + 1;
    const outOfRangeY = Math.abs(chunk.indexY - currentY) > cfg.chunksRadiusY + 1;

    if (outOfRangeZ || outOfRangeX || outOfRangeY) {
      removeChunk(world, key, chunk);
    }
  }
}

function removeChunk(world, index, chunk) {
  world.root.remove(chunk.group);
  for (const obstacle of chunk.obstacles) {
    unregisterObstacle(world, obstacle);
    if (obstacle.lod && obstacle.lod.isLOD) {
      for (const level of obstacle.lod.levels) {
        level.object.geometry?.dispose?.();
      }
    }
    if (obstacle.mesh) {
      obstacle.mesh.geometry?.dispose?.();
    }
  }
  world.chunks.delete(index);
}

function spawnChunk3D(ctx, indexZ, indexX, indexY) {
  const world = ctx.world;
  const cfg = ctx.config.world;
  const chunkGroup = new THREE.Group();
  chunkGroup.name = `Chunk_${indexZ}_${indexX}_${indexY}`;

  // Calculate chunk position in world space
  const chunkOriginZ = indexZ * world.chunkLength;
  const chunkCenterX = indexX * cfg.chunkSizeX + cfg.chunkSizeX * 0.5;
  const chunkCenterY = indexY * cfg.chunkSizeY + cfg.chunkSizeY * 0.5;

  chunkGroup.position.z = chunkOriginZ;

  const chunkRng = world.rng.fork(`chunk-${indexZ}-${indexX}-${indexY}`);
  const bobPhase = chunkRng.nextRange(0, Math.PI * 2);
  const chunk = {
    indexZ,
    indexX,
    indexY,
    group: chunkGroup,
    origin: chunkOriginZ,
    centerZ: chunkOriginZ + world.chunkLength * 0.5,
    centerX: chunkCenterX,
    centerY: chunkCenterY,
    baseY: chunkRng.nextRange(-6, 6),
    bobPhase,
    bobAmplitude: chunkRng.nextRange(1.5, 3.5),
    obstacles: [],
  };
  const key = getChunkKey(indexZ, indexX, indexY);
  world.chunks.set(key, chunk);
  world.root.add(chunkGroup);

  const density = world.densityFactor || 1;
  const rockCount = Math.max(4, Math.round(cfg.baseRocksPerChunk * density));

  // Center obstacles around this chunk's position
  const anchors = generateAnchors(chunkRng, rockCount, cfg, chunkCenterX, chunkCenterY);

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    const rockRng = chunkRng.fork(`rock-${i}`);
    const obstacle = createRock(ctx, chunk, anchor, rockRng);
    chunk.obstacles.push(obstacle);
    registerObstacle(world, obstacle);
  }

  maybeCreateArches(ctx, chunk, anchors, chunkRng);
}

function generateAnchors(rng, count, cfg, centerX = 0, centerY = 24) {
  const anchors = [];
  const maxAttempts = 12;
  const halfSpanX = cfg.spanX * 0.5;
  const halfSpanY = cfg.spanY * 0.5;

  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = rng.nextRange(centerX - halfSpanX, centerX + halfSpanX);
      const y = rng.nextRange(centerY - halfSpanY, centerY + halfSpanY);
      const z = rng.nextRange(0, cfg.chunkLength);

      let tooClose = false;
      for (const anchor of anchors) {
        const dist = Math.hypot(anchor.x - x, anchor.y - y, (anchor.z - z) * 0.7);
        if (dist < cfg.minRockGap) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      anchors.push({ x, y, z });
      placed = true;
      break;
    }
    if (!placed) {
      anchors.push({
        x: rng.nextRange(centerX - halfSpanX, centerX + halfSpanX),
        y: rng.nextRange(centerY - halfSpanY, centerY + halfSpanY),
        z: rng.nextRange(0, cfg.chunkLength),
      });
    }
  }
  return anchors;
}

function createRock(ctx, chunk, anchor, rng) {
  const cfg = ctx.config.world;
  const scale = rng.nextRange(cfg.rockScale[0], cfg.rockScale[1]);
  const geometries = buildRockGeometries(scale, rng);
  const material = ctx.world.materials[rng.nextInt(0, ctx.world.materials.length - 1)];

  const lod = new THREE.LOD();
  lod.addLevel(new THREE.Mesh(geometries.high, material), ctx.config.world.lodDistances[0]);
  lod.addLevel(new THREE.Mesh(geometries.mid, material), ctx.config.world.lodDistances[1]);
  lod.addLevel(new THREE.Mesh(geometries.low, material), ctx.config.world.lodDistances[2]);

  lod.position.set(anchor.x, anchor.y, anchor.z);
  chunk.group.add(lod);

  const worldPosition = new THREE.Vector3(anchor.x, anchor.y, chunk.origin + anchor.z);

  const obstacle = {
    lod,
    position: worldPosition,
    radius: scale * 0.6,
    type: 'rock',
    cells: [],
  };
  return obstacle;
}

function buildRockGeometries(scale, rng) {
  const applyNoise = (geometry, amount) => {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const normal = new THREE.Vector3(x, y, z).normalize();
      const noise = (rng.next() - 0.5) * amount;
      position.setXYZ(i, x + normal.x * noise, y + normal.y * noise, z + normal.z * noise);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  };

  const high = new THREE.IcosahedronGeometry(scale, 2);
  applyNoise(high, scale * 0.35);

  const mid = new THREE.IcosahedronGeometry(scale, 1);
  applyNoise(mid, scale * 0.28);

  const low = new THREE.IcosahedronGeometry(scale * 0.95, 0);
  applyNoise(low, scale * 0.2);

  return { high, mid, low };
}

function maybeCreateArches(ctx, chunk, anchors, rng) {
  const cfg = ctx.config.world;
  const archChance = cfg.archChance;
  if (anchors.length < 2) return;
  for (let i = 0; i < anchors.length - 1; i++) {
    if (rng.next() > archChance) continue;

    const a = anchors[i];
    const b = anchors[(i + 1 + rng.nextInt(0, anchors.length - 2)) % anchors.length];
    const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (distance < cfg.minRockGap * 1.2 || distance > cfg.minRockGap * 3) continue;

    const arch = createArch(ctx, chunk, a, b, rng);
    if (arch) {
      chunk.obstacles.push(arch);
      registerObstacle(ctx.world, arch);
    }
  }
}

function createArch(ctx, chunk, a, b, rng) {
  const midpointLocal = new THREE.Vector3((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
  const span = tmpVec.subVectors(new THREE.Vector3(b.x, b.y, b.z), new THREE.Vector3(a.x, a.y, a.z));

  const length = span.length();
  if (length < 8) return null;

  const tube = Math.max(3, Math.min(8, length * 0.12));
  const geometry = new THREE.TorusGeometry(length * 0.5, tube, 6, 24, Math.PI);
  const material = ctx.world.materials[rng.nextInt(0, ctx.world.materials.length - 1)];
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(midpointLocal);

  const axis = span.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis);
  mesh.quaternion.copy(quaternion);
  mesh.rotateZ(Math.PI / 2);
  chunk.group.add(mesh);

  const worldMidpoint = midpointLocal.clone();
  worldMidpoint.z += chunk.origin;

  return {
    lod: {
      update() {
        /* noop for arch */
      },
    },
    position: worldMidpoint,
    radius: length * 0.5,
    type: 'arch',
    mesh,
    cells: [],
  };
}

function registerObstacle(world, obstacle) {
  const cellSize = world.cellSize;
  const pos = obstacle.position;
  const minX = Math.floor((pos.x - obstacle.radius) / cellSize);
  const maxX = Math.floor((pos.x + obstacle.radius) / cellSize);
  const minY = Math.floor((pos.y - obstacle.radius) / cellSize);
  const maxY = Math.floor((pos.y + obstacle.radius) / cellSize);
  const minZ = Math.floor((pos.z - obstacle.radius) / cellSize);
  const maxZ = Math.floor((pos.z + obstacle.radius) / cellSize);

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const key = `${x}|${y}|${z}`;
        const cell = world.cells.get(key);
        if (cell) {
          cell.push(obstacle);
        } else {
          world.cells.set(key, [obstacle]);
        }
        obstacle.cells.push(key);
      }
    }
  }
}

function unregisterObstacle(world, obstacle) {
  for (const key of obstacle.cells) {
    const cell = world.cells.get(key);
    if (!cell) continue;
    const index = cell.indexOf(obstacle);
    if (index !== -1) cell.splice(index, 1);
    if (!cell.length) world.cells.delete(key);
  }
  obstacle.cells.length = 0;
}

export function getNearestDistance(ctx) {
  const world = ctx.world;
  if (!world) return Infinity;
  const playerPos = ctx.player.object.position;
  const cellSize = world.cellSize;
  const px = Math.floor(playerPos.x / cellSize);
  const py = Math.floor(playerPos.y / cellSize);
  const pz = Math.floor(playerPos.z / cellSize);

  let minD = Infinity;
  const visited = new Set();

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${px + dx}|${py + dy}|${pz + dz}`;
        if (!world.cells.has(key)) continue;
        const cell = world.cells.get(key);
        for (const obstacle of cell) {
          if (visited.has(obstacle)) continue;
          visited.add(obstacle);
          const d = playerPos.distanceTo(obstacle.position) - obstacle.radius;
          if (d < minD) {
            minD = d;
          }
        }
      }
    }
  }
  return minD;
}

export function setWorldQuality(ctx, step) {
  const world = ctx.world;
  if (!world) return;
  world.qualityStep = step;
  const baseDraw = ctx.config.world.drawDistance;
  world.drawDistance = Math.max(220, baseDraw - step * 80);
}
