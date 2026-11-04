// Adapted from the user-supplied Gemini/AuraFX prototype (app.js).
// Its rain, splash, layered fireworks and round ember rendering are retained.
// Physics uses fixed 60 Hz steps; original Gemini recognition updates once per rendered frame.
import { GeminiFireworkMotion } from './gemini-firework-motion.js?v=gemini-physics-92';
import { burnIntensity } from './firework-physics.js?v=responsive-live-15';
import { clamp, collideEllipse, previewHeadMotion } from './geometry.js?v=preview-center-55';
import { RAIN_COLORS, rainColorIndex } from './rain-colors.js?v=blue-cyan-rain-89';
import { GeminiHeadCollider } from './gemini-collider.js?v=gemini-complete-35';
import { GeminiExpressionState } from './gemini-expression.js?v=gemini-sensitivity-69';
const P_RAIN = 1, P_SPLASH = 2, P_ROCKET = 3, P_SPARK = 4, P_IMPACT = 5;
const POOL_CAPACITY = 750, TRAIL_LENGTH = 5;
const VIVID_RAIN_COLORS = { '#E0F2FE': '#7ad0ff', '#7DD3FC': '#47bff4', '#818CF8': '#8d93ff',
  '#BAE6FD': '#83d9ff', '#E0E7FF': '#b1b8ff' };
const FIREWORK_PALETTES = [
  ['#FDE047', '#FBBF24', '#FF2C55', '#FB7185', '#FFFBEB'],
  ['#38BDF8', '#7DD3FC', '#C084FC', '#818CF8', '#F0F9FF'],
  ['#FF2C55', '#F97316', '#FACC15', '#34D399', '#FFF1F2']
];

export class GeminiParticlePool {
  constructor(capacity = POOL_CAPACITY, { inertialFireworks = false } = {}) {
    // The raw pool remains usable for the frozen original-reference tests.
    // The live engine always enables the shared GPT motion adapter.
    this.fireworkMotion = inertialFireworks ? new GeminiFireworkMotion() : null;
    this.trailLength = this.fireworkMotion ? 18 : TRAIL_LENGTH;
    const trailMiddle = Math.floor(this.trailLength * .55);
    this.trailBands = [[0, trailMiddle, .18], [trailMiddle, this.trailLength - 1, .78]];
    this.capacity = capacity;
    this.limit = capacity;
    this.paletteIndex = null;
    this.lightMotion = false;
    this.collisionHead = {};
    this.activeCount = 0;
    this.totalCollisions = 0;
    this.rainColors = null; this.rainColorCursor = 0;
    this.cursor = 0;

    // Pre-allocate all particle slots once at startup
    this.slots = new Array(capacity);
    for (let i = 0; i < capacity; i++) {
      this.slots[i] = {
        active: false,
        type: P_RAIN,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 2,
        alpha: 1,
        life: 0,
        maxLife: 60,
        color: '#38BDF8',
        secondaryColor: '#FFFFFF',
        gravity: 0.12,
        drag: 0.99,
        zLayer: 1,
        twinklePhase: 0,
        bounceCooldown: 0,
        trailX: new Float32Array(this.trailLength),
        trailY: new Float32Array(this.trailLength),
        trailHead: 0,
      };
    }
  }

  acquire() {
    for (let i = 0; i < this.limit; i++) {
      const idx = (this.cursor + i) % this.limit;
      const slot = this.slots[idx];
      if (!slot.active) {
        this.cursor = (idx + 1) % this.limit;
        slot.active = true;
        slot.bounceCooldown = 0;
        slot.trailHead = 0;
        return slot;
      }
    }
    const fallback = this.slots[this.cursor % this.limit];
    this.cursor = (this.cursor + 1) % this.limit;
    fallback.active = true;
    fallback.trailHead = 0;
    fallback.bounceCooldown = 0;
    return fallback;
  }

  initTrail(p, x, y) {
    for (let t = 0; t < this.trailLength; t++) {
      p.trailX[t] = x;
      p.trailY[t] = y;
    }
  }

  spawnRainDrop(width, height, intensity = 1.0, natural = false) {
    const p = this.acquire();
    const z = 0.45 + Math.random() * 0.75;
    p.type = P_RAIN;
    p.x = Math.random() * (width + 120) - 60;
    p.y = -20 - Math.random() * 60;
    p.vx = (0.7 + Math.random() * 0.6) * z;
    p.vy = (9.5 + Math.random() * 5.5 + intensity * 2.5) * z;
    if (natural) {
      p.vy = (11 + Math.random() * 3 + intensity * 2) * z;
      p.vx = p.vy * .04;
    }
    p.size = (1.15 + Math.random() * 1.15) * z;
    p.alpha = (0.32 + Math.random() * 0.48) * Math.min(1, 0.55 + intensity * 0.45);
    p.life = 0;
    p.maxLife = Math.ceil((height + 80) / p.vy) + 15;
    p.color = this.rainColors ? this.rainColors[rainColorIndex(this.rainColorCursor++) % this.rainColors.length] :
      z > 0.85 ? '#E0F2FE' : z > 0.65 ? '#7DD3FC' : '#818CF8';
    p.gravity = 0.06 * z;
    p.drag = 0.999;
    p.zLayer = z;
    this.initTrail(p, p.x, p.y);
  }

  spawnRainSplash(x, y, nx, ny, headVx, headVy, color = null) {
    const count = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      const spread = (Math.random() - 0.5) * 1.4;
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const rnx = nx * cos - ny * sin;
      const rny = nx * sin + ny * cos;
      const speed = 1.8 + Math.random() * 2.8;

      p.type = P_SPLASH;
      p.x = x + nx * 3;
      p.y = y + ny * 3;
      p.vx = rnx * speed + headVx * 0.45;
      p.vy = rny * speed - 1.1 + headVy * 0.45;
      p.size = 1.5 + Math.random() * 1.5;
      p.alpha = 0.88;
      p.life = 0;
      p.maxLife = 16 + ((Math.random() * 12) | 0);
      p.color = color || (i % 2 === 0 ? '#BAE6FD' : '#E0E7FF');
      p.gravity = 0.22;
      p.drag = 0.96;
      this.initTrail(p, p.x, p.y);
    }
  }

  spawnFireworkRocket(width, height, targetX, targetY) {
    const p = this.acquire();
    const startX = width * (0.2 + Math.random() * 0.6);
    const startY = height + 10;
    const tx = targetX ?? width * (0.22 + Math.random() * 0.56);
    const ty = targetY ?? height * (0.14 + Math.random() * 0.24);

    const flightFrames = 32 + ((Math.random() * 10) | 0);
    const gravity = 0.12;

    p.type = P_ROCKET;
    p.x = startX;
    p.y = startY;
    p.vx = (tx - startX) / flightFrames;
    p.vy = (ty - startY - 0.5 * gravity * flightFrames * flightFrames) / flightFrames;
    p.size = 3.0;
    p.alpha = 1;
    p.life = 0;
    p.maxLife = flightFrames;
    p.color = '#FDE047';
    p.secondaryColor = '#FF2C55';
    p.gravity = gravity;
    p.drag = 0.998;
    if (this.fireworkMotion) this.fireworkMotion.launch(p, tx, ty);
    this.initTrail(p, p.x, p.y);
  }

  spawnFireworkExplosion(x, y, paletteIdx = this.paletteIndex) {
    const palette =
      FIREWORK_PALETTES[
        paletteIdx !== null ? paletteIdx % FIREWORK_PALETTES.length : (Math.random() * FIREWORK_PALETTES.length) | 0
      ];
    const sparkCount = this.lightMotion ? 28 : 56 + ((Math.random() * 18) | 0);
    const rotation = this.fireworkMotion ? Math.random() * Math.PI * 2 : 0;

    for (let i = 0; i < sparkCount; i++) {
      const p = this.acquire();
      const ring = i % 3;
      const baseAngle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.12;
      const ringSpeed =
        ring === 0 ? 5.2 + Math.random() * 3.4 : ring === 1 ? 3.2 + Math.random() * 2.2 : 1.6 + Math.random() * 1.5;

      p.type = P_SPARK;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(baseAngle) * ringSpeed;
      p.vy = Math.sin(baseAngle) * ringSpeed - 0.7;
      p.size = ring === 0 ? 2.6 + Math.random() * 1.2 : 1.9 + Math.random() * 1.0;
      p.alpha = 1.0;
      p.life = 0;
      p.maxLife = 58 + ((Math.random() * 34) | 0);
      p.color = palette[i % palette.length];
      p.secondaryColor = '#FFFFFF';
      p.gravity = 0.135;
      p.drag = 0.978;
      p.twinklePhase = Math.random() * Math.PI * 2;
      if (this.fireworkMotion) this.fireworkMotion.configureSpark(p, i, sparkCount, rotation);
      this.initTrail(p, x, y);
    }
    this.fireworkMotion?.addFlybys(x, y, palette, this.lightMotion);
  }

  spawnHeadCollisionBurst(x, y, nx, ny, headSpeed) {
    const count = 4 + Math.min(5, (headSpeed * 0.5) | 0);
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      const spread = (Math.random() - 0.5) * 1.5;
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const rnx = nx * cos - ny * sin;
      const rny = nx * sin + ny * cos;
      const speed = 2.4 + Math.random() * 3.8 + headSpeed * 0.25;

      p.type = P_IMPACT;
      p.x = x + nx * 2;
      p.y = y + ny * 2;
      p.vx = rnx * speed;
      p.vy = rny * speed;
      p.size = 1.7 + Math.random() * 1.4;
      p.alpha = 1.0;
      p.life = 0;
      p.maxLife = 14 + ((Math.random() * 10) | 0);
      p.color = i % 2 === 0 ? '#FEF08A' : '#FF2C55';
      p.gravity = 0.12;
      p.drag = 0.94;
      if (this.fireworkMotion) this.fireworkMotion.configureImpact(p);
      this.initTrail(p, p.x, p.y);
    }
  }

  updateAndCollide(width, height, collider, elasticity = .85) {
    this.fireworkMotion?.stepFlybys(this.lightMotion);
    const hasCollider = collider?.active;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.slots[i];
      if (!p.active) continue;
      if (i >= this.limit) { p.active = false; continue; }
      p.life++;
      if (this.fireworkMotion && p.type === P_ROCKET) {
        p.trailHead = (p.trailHead + 1) % this.trailLength;
        this.fireworkMotion.stepRocket(p);
        p.trailX[p.trailHead] = p.x; p.trailY[p.trailHead] = p.y;
        if (p.life >= p.maxLife) {
          const x = p.targetX, y = p.targetY; p.active = false;
          this.spawnFireworkExplosion(x, y);
        }
        continue;
      }
      if (p.life >= p.maxLife) {
        const rocket = p.type === P_ROCKET, x = p.x, y = p.y;
        p.active = false;
        if (rocket) this.spawnFireworkExplosion(x, y);
        continue;
      }
      const previousX = p.x, previousY = p.y;
      p.trailHead = (p.trailHead + 1) % this.trailLength;
      p.trailX[p.trailHead] = p.x; p.trailY[p.trailHead] = p.y;
      const inertial = this.fireworkMotion && (p.type === P_SPARK || p.type === P_IMPACT);
      if (inertial) {
        this.fireworkMotion.stepSpark(p);
        p.trailX[p.trailHead] = p.x; p.trailY[p.trailHead] = p.y;
      } else {
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity;
        p.x += p.vx; p.y += p.vy;
      }
      if (p.bounceCooldown > 0) p.bounceCooldown--;
      if (p.x < -80 || p.x > width + 80 || p.y > height + 60) { p.active = false; continue; }
      if (!hasCollider || p.bounceCooldown || (p.type !== P_SPARK && p.type !== P_RAIN)) continue;
      if (inertial && (p.vy <= 0 || p.life < 10)) continue;
      const hit = geminiContact(previousX, previousY, p, collider);
      if (!hit) continue;
      p.x = hit.x; p.y = hit.y;
      const rainColor = this.rainColors && p.type === P_RAIN ? p.color : null;
      collider.registerImpact(hit.angle, p.type === P_SPARK ? '#FDE047' : rainColor || '#38BDF8');
      this.totalCollisions++;
      if (p.type === P_RAIN) {
        p.active = false;
        this.spawnRainSplash(p.x, p.y, hit.nx, hit.ny, collider.vx, collider.vy, rainColor);
      } else {
        if (inertial) {
          this.fireworkMotion.reflect(p, hit, collider);
          this.initTrail(p, p.x, p.y);
          continue;
        }
        const dot = p.vx * hit.nx + p.vy * hit.ny;
        if (dot < 0) {
          p.vx = p.vx - (1 + elasticity) * dot * hit.nx + collider.vx * 1.25;
          p.vy = p.vy - (1 + elasticity) * dot * hit.ny + collider.vy * 1.25 - .9;
        } else {
          p.vx += hit.nx * 3 + collider.vx; p.vy += hit.ny * 3 + collider.vy;
        }
        p.bounceCooldown = 6; p.life = Math.max(0, p.life - 10); p.color = '#FEF08A';
        if (!this.lightMotion) this.spawnHeadCollisionBurst(p.x, p.y, hit.nx, hit.ny, collider.speed);
      }
    }
    this.activeCount = 0;
    for (const slot of this.slots) if (slot.active) this.activeCount++;
  }

  render(ctx, sizeScale = 1, rainScale = sizeScale, natural = false, vividRain = false) {
    ctx.save();
    ctx.lineCap = 'round';

    for (let i = 0; i < this.capacity; i++) {
      const p = this.slots[i];
      if (!p.active) continue;

      const progress = p.life / p.maxLife;
      const tailIdx = this.fireworkMotion && p.type === P_ROCKET ?
        (p.trailHead + this.trailLength - 4) % this.trailLength : (p.trailHead + 1) % this.trailLength;
      const tx = p.trailX[tailIdx];
      const ty = p.trailY[tailIdx];

      if (p.type === P_RAIN) {
        ctx.globalCompositeOperation = 'source-over';
        const fade = Math.sin(progress * Math.PI);
        ctx.strokeStyle = vividRain ? VIVID_RAIN_COLORS[p.color] || p.color : p.color;
        ctx.globalAlpha = Math.min(1, p.alpha * (0.5 + 0.5 * fade) * (vividRain ? 1.15 : 1));
        ctx.lineWidth = p.size * rainScale;
        ctx.beginPath();
        const shutter = natural ? 1.6 * (1 + (rainScale - 1) * .15) : 1.8 * rainScale;
        ctx.moveTo(p.x - p.vx * shutter, p.y - p.vy * shutter);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if (p.type === P_SPLASH) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = vividRain ? VIVID_RAIN_COLORS[p.color] || p.color : p.color;
        ctx.globalAlpha = (1 - progress) * p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * rainScale * (1 - progress * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === P_ROCKET) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = p.size * sizeScale;
        ctx.beginPath();
        const dx = p.x - tx, dy = p.y - ty;
        const cap = this.fireworkMotion ? Math.min(1, 90 / Math.max(1, Math.hypot(dx, dy))) : 1;
        ctx.moveTo(p.x - dx * cap, p.y - dy * cap);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 1.15 * sizeScale, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === P_SPARK || p.type === P_IMPACT) {
        ctx.globalCompositeOperation = 'lighter';
        const easeOut = this.fireworkMotion ? burnIntensity(p.life / 60, p.maxLife / 60) : 1 - progress * progress;
        const twinkle = p.type === P_SPARK ? 0.72 + 0.28 * Math.sin(p.life * 0.45 + p.twinklePhase) : 1;
        const alpha = easeOut * p.alpha * twinkle;

        ctx.strokeStyle = p.color;
        ctx.globalAlpha = alpha * 0.78;
        ctx.lineWidth = p.size * sizeScale;
        if (this.fireworkMotion && p.type === P_SPARK) {
          for (const [start, end, opacity] of this.trailBands) {
            let index = (p.trailHead + 1 + start) % this.trailLength;
            ctx.beginPath(); ctx.moveTo(p.trailX[index], p.trailY[index]);
            for (let t = start + 1; t <= end; t++) {
              index = (p.trailHead + 1 + t) % this.trailLength;
              ctx.lineTo(p.trailX[index], p.trailY[index]);
            }
            ctx.globalAlpha = alpha * opacity; ctx.stroke();
          }
        } else {
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
        }

        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha * 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.4 * sizeScale, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = alpha * 0.95;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.65 * sizeScale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

// Preserve Gemini's endpoint projection, normal and momentum. Swept fallback only prevents tunnelling.
function geminiContact(x0, y0, particle, head) {
  const c = Math.cos(head.angle), s = Math.sin(head.angle), rx = Math.max(24, head.rx), ry = Math.max(28, head.ry);
  const dx = particle.x - head.x, dy = particle.y - head.y;
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  const distance = (lx / rx) ** 2 + (ly / ry) ** 2;
  if (distance <= 1 && distance > .0001) {
    const inv = 1 / Math.sqrt(distance), x = lx * inv * 1.02, y = ly * inv * 1.02;
    let nx = x / (rx * rx), ny = y / (ry * ry); const length = Math.hypot(nx, ny) || 1; nx /= length; ny /= length;
    return { x: head.x + (x * c - y * s), y: head.y + (x * s + y * c),
      nx: nx * c - ny * s, ny: nx * s + ny * c, angle: Math.atan2(y / ry, x / rx) };
  }
  const hit = collideEllipse(x0, y0, particle.x, particle.y, particle.vx, particle.vy, head);
  if (!hit) return null;
  const hx = hit.x - head.x, hy = hit.y - head.y;
  return { ...hit, angle: Math.atan2((-hx * s + hy * c) / ry, (hx * c + hy * s) / rx) };
}

export class GeminiParticleEngine {
  constructor(canvas, foreground = null) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: true });
    this.foreground = foreground; this.frontCtx = foreground?.getContext('2d', { alpha: true });
    this.pool = new GeminiParticlePool(POOL_CAPACITY, { inertialFireworks: true }); this.collider = new GeminiHeadCollider(); this.head = this.collider;
    this.expressionState = new GeminiExpressionState(); this.expressionResult = this.expressionState.result(false);
    this.width = 360; this.height = this.worldHeight = 640; this.scale = 1; this.time = this.accumulator = 0;
    this.rainStrength = this.rainEnvelope = 0; this.rainOverride = null; this.signal = null;
    this.celebrations = []; this.flybys = this.pool.fireworkMotion.flybys; this.nextCelebration = 0;
    this.preview = true; this.particleScale = 1.25; this.naturalRain = true; this.suspended = false; this.debug = false; this.lightMotion = false;
    this.showColliderMesh = true; this.elasticity = .85;
    this.paletteKey = 'auto'; this.manualMood = null; this.syntheticMood = 'fireworks'; this.mood = 'neutral';
    this.pointerMoved = false; this.showcaseSeeded = false; this.needsHeadReset = true;
    this.renderTime = 0; this.pendingExpressionBurst = false; this.lastRenderedBurst = -Infinity;
    this.suppressExpressionBursts = false;
    this.collider.resetCenter(this.width, this.height);
    this.setPalette(this.paletteKey);
  }
  get count() { return this.pool.slots.reduce((sum, p) => sum + Number(p.active), 0); }
  get impacts() { return this.collider.impacts; }
  get collisions() { return this.pool.totalCollisions; }
  set collisions(value) { this.pool.totalCollisions = value; }
  get limit() { return this.pool.limit; }
  set limit(value) { this.pool.limit = clamp(Math.floor(value), 1, this.pool.capacity); }
  get rainScale() { return 1 + (this.particleScale - 1) * 3; }
  get fireworksActive() { return this.celebrations.length > 0 || this.flybys.length > 0 || this.pool.slots.some(p => p.active && p.type >= P_ROCKET); }
  setPalette(key) {
    const previousColors = this.pool.rainColors;
    const colors = RAIN_COLORS[key] || RAIN_COLORS.auto;
    // Existing drops, their splashes and contact arcs change together without
    // restarting the rain or touching the independent firework colors.
    if (previousColors && previousColors !== colors) {
      const recolor = particle => {
        const index = previousColors.indexOf(particle.color);
        if (index >= 0) particle.color = colors[index % colors.length];
      };
      for (const p of this.pool.slots) if (p.active && (p.type === P_RAIN || p.type === P_SPLASH)) recolor(p);
      for (const impact of this.collider.impacts) if (impact.active) recolor(impact);
    }
    this.paletteKey = key;
    this.pool.paletteIndex = key === 'auto' ? null : ({ gold: 0, rose: 2, aurora: 1 }[key] ?? null);
    this.pool.rainColors = colors;
  }
  clearVisualEffects() {
    for (const p of this.pool.slots) p.active = false;
    for (const impact of this.collider.impacts) impact.active = false;
    this.pool.activeCount = this.pool.cursor = 0; this.celebrations.length = this.flybys.length = 0;
    this.rainStrength = this.rainEnvelope = this.accumulator = 0; this.rainOverride = null;
    this.nextCelebration = this.time; this.pendingExpressionBurst = false;
    this.ctx.clearRect(0, 0, this.width, this.height); this.frontCtx?.clearRect(0, 0, this.width, this.height);
  }
  clear() {
    this.clearVisualEffects(); this.signal = null;
    this.expressionState.reset(); this.expressionResult = this.expressionState.result(false);
    this.manualMood = null; this.mood = 'neutral'; this.pointerMoved = false; this.showcaseSeeded = false; this.needsHeadReset = true;
    this.suppressExpressionBursts = false;
    this.collider.active = false;
  }
  resize(width, height) {
    const sx = Math.max(1, width) / this.width, sy = Math.max(1, height) / this.height;
    for (const p of this.pool.slots) if (p.active) {
      p.x *= sx; p.y *= sy; p.vx *= sx; p.vy *= sy;
      if (p.type === P_ROCKET) {
        p.launchX *= sx; p.launchY *= sy; p.targetX *= sx; p.targetY *= sy;
        p.initialVx *= sx; p.initialVy *= sy;
      }
      if (p.type >= P_ROCKET) { p.wind *= sx; p.gravity *= sy; }
      for (let i = 0; i < p.trailX.length; i++) { p.trailX[i] *= sx; p.trailY[i] *= sy; }
    }
    this.width = Math.max(1, width); this.height = this.worldHeight = Math.max(1, height);
    this.pool.fireworkMotion.resize(this.width, this.height);
    if (this.needsHeadReset) this.collider.resetCenter(this.width, this.height);
    else {
      for (const key of ['x', 'targetX', 'rx', 'targetRx']) this.collider[key] *= sx;
      for (const key of ['y', 'targetY', 'ry', 'targetRy']) this.collider[key] *= sy;
    }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr); this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.foreground) {
      this.foreground.width = this.canvas.width; this.foreground.height = this.canvas.height;
      this.frontCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  setManualMood(mood) {
    this.manualMood = this.manualMood === mood ? null : mood;
    this.syntheticMood = this.manualMood || 'neutral';
    if (this.manualMood === 'fireworks') this.celebrate(null, 1, 2);
  }
  movePointer(x, y) {
    if (!this.preview || this.suspended || x < 0 || x > this.width || y < 0 || y > this.height) return;
    const dx = x - this.collider.targetX;
    this.pointerMoved = true; this.collider.targetX = x; this.collider.targetY = y;
    this.collider.targetAngle = clamp(dx * .008, -.35, .35);
  }
  releasePointer() { this.pointerMoved = false; }
  tap(x, y) {
    this.movePointer(x, y);
    if (this.preview && !this.suspended) this.pool.spawnFireworkRocket(this.width, this.height, x, Math.min(y, this.height * .45));
  }
  celebrate(head, strength = 1, count = 3) {
    if (this.celebrations.length >= 10) return false;
    this.celebrations.push({ x: head?.x ?? this.collider.x, y: head?.y ?? this.collider.y,
      ry: head?.ry ?? this.collider.ry, count: this.lightMotion ? 1 : count });
    this.drainCelebrations(); return true;
  }
  drainCelebrations() {
    if (!this.celebrations.length || this.time + 1e-9 < this.nextCelebration) return;
    const rockets = this.pool.slots.reduce((sum, p) => sum + Number(p.active && p.type === P_ROCKET), 0);
    if (rockets >= 6) return;
    const request = this.celebrations.shift(), count = Math.min(request.count, 6 - rockets);
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) * .5) * 75 + (Math.random() - .5) * 40;
      const x = clamp(request.x + offset, 60, this.width - 60);
      const y = Math.max(60, request.y - request.ry * 1.4 - Math.random() * 45);
      this.pool.spawnFireworkRocket(this.width, this.height, x, y);
    }
    this.nextCelebration = this.time + (this.lightMotion ? .6 : .2);
  }
  seedShowcase() {
    this.celebrate(null, 1, this.lightMotion ? 1 : 2);
    this.showcaseSeeded = true;
  }
  update(dt, head, nowMs = null) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.pool.lightMotion = this.lightMotion; this.accumulator += Math.min(dt, .1);
    this.renderTime = nowMs ?? this.renderTime + dt * 1000;
    const c = this.collider;
    c.active = !this.suspended && (this.preview || Boolean(head));
    if (this.preview) {
      const base = Math.min(this.width * .19, this.height * .115);
      c.targetRx = base; c.targetRy = base * 1.38;
      if (this.needsHeadReset) { c.rx = c.targetRx; c.ry = c.targetRy; c.y = c.targetY = this.height * .48; }
    }
    if (head && !this.preview) {
      c.targetX = clamp(head.x, -this.width * .5, this.width * 1.5);
      c.targetY = clamp(head.y, -this.height * .5, this.height * 1.5);
      c.targetRx = Math.max(3, head.rx); c.targetRy = Math.max(3, head.ry);
      c.targetAngle = head.angle || 0;
      if (this.needsHeadReset) { c.x = c.targetX; c.y = c.targetY; c.rx = c.targetRx; c.ry = c.targetRy; c.angle = c.targetAngle; c.vx = c.vy = 0; }
    }
    this.needsHeadReset = !c.active;
    const initialMood = this.manualMood || this.syntheticMood;
    if (this.preview && c.active && !this.showcaseSeeded && initialMood === 'fireworks' && !this.lightMotion && !this.suppressExpressionBursts) {
      this.expressionState.smile = .72; this.expressionState.jaw = .52;
      this.expressionState.label = 'laugh'; this.expressionState.lastBurst = 0;
      this.seedShowcase();
    }
    const desired = this.manualMood || (this.preview ? this.syntheticMood : null);
    const raw = desired === 'rain' ? { smile: .44, jaw: .10 } :
        desired === 'fireworks' ? { smile: .78, jaw: .56 } : desired === 'neutral' || this.preview ? { smile: .08, jaw: .03 } : this.signal;
    if (!this.suspended) this.expressionResult = this.expressionState.update(raw, this.renderTime);
    this.pendingExpressionBurst ||= !this.suspended && !this.suppressExpressionBursts && this.manualMood !== 'neutral' && this.expressionResult.burst;
    this.mood = this.expressionResult.label === 'laugh' ? 'fireworks' : this.expressionResult.label === 'smile' ? 'rain' : 'neutral';
    while (this.accumulator + 1e-9 >= 1 / 60) {
      this.accumulator -= 1 / 60; this.time += 1 / 60;
      if (this.preview && c.active && !this.pointerMoved) {
        const pose = previewHeadMotion(this.width, this.height, this.time);
        c.targetX = pose.x; c.targetY = pose.y; c.targetAngle = pose.angle;
      }
      c.stepInterpolation(.28);
      this.rainStrength = this.rainEnvelope = this.manualMood === 'neutral' ? 0 : this.rainOverride ?? this.expressionResult.rain;
      if (!this.suspended && this.rainStrength > 0) {
        const drops = 2 + Math.floor(Math.min(1, this.rainStrength) * 3);
        for (let i = 0; i < (this.lightMotion ? 1 : drops); i++) this.pool.spawnRainDrop(this.width, this.height, this.rainStrength, this.naturalRain);
      }
      if (this.pendingExpressionBurst) {
        if (c.active && (!this.lightMotion || this.renderTime - this.lastRenderedBurst >= 900)) {
          const x = clamp(c.x + (Math.random() - .5) * c.rx * 2.4, 50, this.width - 50);
          const y = Math.max(55, c.y - c.ry * (1.15 + Math.random() * .6));
          this.pool.spawnFireworkRocket(this.width, this.height, x, y); this.lastRenderedBurst = this.renderTime;
        }
        this.pendingExpressionBurst = false;
      }
      this.drainCelebrations(); this.pool.updateAndCollide(this.width, this.height, c, this.elasticity);
    }
  }
  drawBackground() {
    const ctx = this.ctx, w = this.width, h = this.height;
    // Keep the real camera image unaltered, as in the GPT style. The vignette
    // belongs to the synthetic preview only, not the live video layer.
    if (!this.preview) return;
    if (this.preview) {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0A0D18'); bg.addColorStop(.55, '#0F1322'); bg.addColorStop(1, '#070910');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    }
    const vig = ctx.createRadialGradient(w * .5, h * .45, w * .25, w * .5, h * .5, Math.max(w, h) * .78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, this.mood === 'rain' ? 'rgba(8,35,62,.55)' : this.mood === 'fireworks' ? 'rgba(48,10,26,.52)' : 'rgba(4,5,10,.58)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
  }
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height); this.frontCtx?.clearRect(0, 0, this.width, this.height);
    this.drawBackground();
    if (this.collider.active) this.collider.renderColliderMesh(ctx, this.mood, this.showColliderMesh || this.debug,
      this.preview, this.expressionResult.smile, this.expressionResult.jaw);
    this.pool.render(ctx, this.particleScale, this.rainScale, this.naturalRain, true);
    this.pool.fireworkMotion.drawForeground(this.frontCtx || ctx, this.particleScale);
  }
}
