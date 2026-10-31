import { clamp, collideEllipse } from './geometry.js';
import { motionCoefficients, advanceAxis, solveLaunchToApex, sphereDirection, burnIntensity, projectSpark } from './firework-physics.js';
export { projectSpark } from './firework-physics.js';

export const PALETTES = {
  gold: { name: '鎏金', colors: ['#fff1cb', '#edc78c', '#d39454', '#f0b3a4', '#b6d0d3'], rain: '#d2d9eb' },
  rose: { name: '绯樱', colors: ['#fff0e8', '#f4b2c8', '#d77cad', '#c5b8f0', '#efccad'], rain: '#e7c2e3' },
  aurora: { name: '极光', colors: ['#e5fff2', '#a2e7cb', '#77bfc5', '#aaa1ec', '#d7c6f2'], rain: '#aadce3' }
};
const hexRGB = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const random = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const fields = ['x', 'y', 'px', 'py', 'vx', 'vy', 'life', 'total', 'size', 'color', 'kind', 'phase', 'drag', 'cooldown', 'depth', 'heat', 'emits', 'sparkTimer'];

export class ParticleEngine {
  constructor(canvas, foreground = null) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: true });
    this.foreground = foreground; this.frontCtx = foreground?.getContext('2d', { alpha: true });
    this.flybys = []; this.ripples = []; this.rainEnvelope = 0;
    this.capacity = 1800; this.limit = innerWidth < 740 ? 850 : 1350; this.count = 0;
    for (const key of fields) this[key] = new Float32Array(this.capacity);
    this.trailLength = 20; this.trailHead = 0; this.tick = 0; this.accumulator = 0; this.coefficients = {};
    this.trailX = new Float32Array(this.capacity * this.trailLength);
    this.trailY = new Float32Array(this.capacity * this.trailLength);
    this.drawMask = new Uint8Array(5);
    this.time = 0; this.rockets = []; this.flashes = []; this.impacts = []; this.events = [];
    this.collisions = 0; this.rainAccumulator = 0; this.rainStrength = 0; this.lightMotion = false;
    this.width = 1; this.height = 1; this.preview = true; this.debug = false;
    this.stars = Array.from({ length: 55 }, () => ({ x: Math.random(), y: Math.random(), phase: random(0, TAU), r: random(.35, 1.1) }));
    this.camera = { x: 180, y: 250, focal: 700, near: 110 }; this.gravity = 105;
    this.setPalette('gold');
  }
  setPalette(name) {
    this.palette = PALETTES[name]; this.paletteKey = name;
    this.rgbs = this.palette.colors.map(hexRGB);
    this.sprites = this.rgbs.map(rgb => {
      const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
      const ctx = sprite.getContext('2d');
      const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      glow.addColorStop(0, 'rgba(255,255,245,1)');
      glow.addColorStop(.09, `rgba(${rgb},.96)`);
      glow.addColorStop(.23, `rgba(${rgb},.46)`);
      glow.addColorStop(.53, `rgba(${rgb},.10)`);
      glow.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 64, 64); return sprite;
    });
    const amber = [232, 124, 48];
    this.heatColors = this.rgbs.map(rgb => Array.from({ length: 8 }, (_, band) => {
      const hot = band === 0 ? .5 : band === 1 ? .12 : 0, warm = Math.max(0, (band - 3) / 4) * .88;
      return rgb.map((v, j) => Math.round((v * (1 - hot) + [255, 248, 219][j] * hot) * (1 - warm) + amber[j] * warm)).join(',');
    }));
    this.emberSprite = document.createElement('canvas'); this.emberSprite.width = this.emberSprite.height = 64;
    const emberCtx = this.emberSprite.getContext('2d'), emberGlow = emberCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    emberGlow.addColorStop(0, 'rgba(255,190,100,.9)'); emberGlow.addColorStop(.12, 'rgba(242,135,44,.5)'); emberGlow.addColorStop(.45, 'rgba(200,84,22,.08)'); emberGlow.addColorStop(1, 'rgba(180,65,10,0)');
    emberCtx.fillStyle = emberGlow; emberCtx.fillRect(0, 0, 64, 64);
    this.dropSprites = [this.palette.rain, this.palette.colors[3], this.palette.colors[0]].map(color => {
      const sprite = document.createElement('canvas'); sprite.width = 48; sprite.height = 128;
      const ctx = sprite.getContext('2d'), rgb = hexRGB(color);
      const glow = ctx.createRadialGradient(24, 92, 0, 24, 92, 23);
      glow.addColorStop(0, `rgba(${rgb},.65)`); glow.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 48, 128);
      const core = ctx.createLinearGradient(0, 5, 0, 112);
      core.addColorStop(0, `rgba(${rgb},0)`); core.addColorStop(.7, `rgba(${rgb},.55)`); core.addColorStop(1, 'rgba(245,250,255,.95)');
      ctx.fillStyle = core; ctx.beginPath(); ctx.moveTo(24, 3);
      ctx.bezierCurveTo(22, 60, 15, 89, 21, 105); ctx.quadraticCurveTo(29, 117, 29, 100); ctx.quadraticCurveTo(26, 48, 24, 3); ctx.fill();
      return sprite;
    });
  }
  resize(width, height) {
    const sx = width / this.width, sy = height / this.height;
    if (this.width > 1) {
      for (let i = 0; i < this.count; i++) {
        this.x[i] *= sx; this.y[i] *= sy; this.px[i] *= sx; this.py[i] *= sy;
        this.vx[i] *= sx; this.vy[i] *= sy;
        for(let j=0;j<this.trailLength;j++){this.trailX[i*this.trailLength+j]*=sx;this.trailY[i*this.trailLength+j]*=sy;}
      }
      for (const r of this.rockets) {
        r.x0 *= sx; r.x *= sx; r.tx *= sx; r.y0 *= sy; r.y *= sy; r.ty *= sy;
        r.initialVx *= sx; r.vx *= sx; r.wind *= sx;
        r.initialVy *= sy; r.vy *= sy; r.gravity *= sy;
      }
      for (const event of this.events) { event.x *= sx; event.y *= sy; }
      for (const flash of this.flashes) { flash.x *= sx; flash.y *= sy; flash.radius *= Math.min(sx, sy); }
      for (const impact of this.impacts) { impact.x *= sx; impact.y *= sy; }
    }
    this.width = width; this.height = height;
    this.sceneScale = clamp(width / 360, .7, 1.25); this.gravity = 105 * this.sceneScale;
    this.camera = { x: width * .5, y: height * .40, focal: width * 2, near: Math.max(80, width * .28) };
    const dpr = Math.min(devicePixelRatio || 1, 1.6);
    this.canvas.width = Math.round(width * dpr); this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.flybys.length = 0; this.ripples.length = 0;
    if (this.foreground) {
      this.frontWidth = width; this.frontHeight = height;
      this.foreground.width = Math.round(this.frontWidth * dpr); this.foreground.height = Math.round(this.frontHeight * dpr);
      this.frontCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  spawn(x, y, vx, vy, options = {}) {
    if (this.count >= Math.min(this.limit, this.capacity)) return -1;
    const i = this.count++;
    this.x[i] = this.px[i] = x; this.y[i] = this.py[i] = y;
    this.trailX.fill(x, i * this.trailLength, (i + 1) * this.trailLength);
    this.trailY.fill(y, i * this.trailLength, (i + 1) * this.trailLength);
    this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = this.total[i] = options.life || random(1.5, 2.8);
    this.size[i] = options.size || random(1.5, 3.5);
    this.color[i] = options.color ?? Math.floor(random(0, 5)); this.kind[i] = options.kind ?? 1;
    this.phase[i] = random(0, TAU); this.drag[i] = options.drag ?? .48; this.cooldown[i] = 0;
    this.depth[i] = options.depth ?? 0; this.heat[i] = 0;
    this.emits[i] = options.emit ? 1 : 0; this.sparkTimer[i] = random(0, 1);
    return i;
  }
  celebrate(head, strength = 1) {
    if (this.rockets.length || this.events.length > 2) return false;
    const w = this.width, h = this.height;
    const cx = clamp(head?.x ?? w * .52, w * .27, w * .73);
    const cy = clamp(head ? head.y - head.ry - h * .12 : h * .28, h * .22, h * .42);
    const spread = Math.min(w * .22, 145);
    this.launch(cx, cy, 1.12 * strength, 0);
    if (!this.lightMotion) {
      this.events.push({ at: this.time + .32, x: clamp(cx - spread, 60, w - 60), y: cy + h * .10, scale: .74 * strength, variant: 1 });
      this.events.push({ at: this.time + .57, x: clamp(cx + spread, 60, w - 60), y: cy + h * .06, scale: .84 * strength, variant: 2 });
    }
    return true;
  }
  launch(x, y, scale, variant) {
    if (this.rockets.length > 4) return;
    const x0 = x + (variant % 2 ? -1 : 1) * Math.min(this.width * .17, 100), y0 = this.height + 12;
    const drag = 2.6, wind = 3 * Math.sin(this.time * .35);
    const shot = solveLaunchToApex(Math.max(1, y0 - y), x - x0, this.gravity, drag, wind);
    this.rockets.push({ x0, y0, x: x0, y: y0, vx: shot.vx, vy: shot.vy,
      initialVx: shot.vx, initialVy: shot.vy, tx: x, ty: y, life: 0, duration: shot.duration,
      scale, variant, drag, wind, gravity: this.gravity, emission: 0 });
  }
  burst(x, y, scale, variant = 0) {
    scale *= clamp(Math.min(this.width / 480, this.height / 760), .72, 1.28) * (this.lightMotion ? .78 : 1);
    const count = this.lightMotion ? 56 : Math.round((this.limit <= 850 ? 140 : 180) * clamp(this.limit / 850, .55, 1));
    const rotation = random(0, TAU), outerColor = variant === 2 ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const d = sphereDirection(i, count, rotation), speed = random(230, 285) * scale;
      const streamer = i % 11 === 0;
      this.spawn(x, y, d.x * speed, d.y * speed * .94, {
        color: i % 13 === 0 ? 0 : i % 9 === 0 ? 4 : outerColor,
        life: streamer ? random(2.9, 3.5) : random(2.15, 2.95), size: random(1.2, 1.9) * Math.max(.8, scale),
        drag: streamer ? .62 : random(.78, 1.05), emit: !this.lightMotion && i % 5 === 0 });
    }
    const innerCount = this.lightMotion ? 14 : Math.round(28 * clamp(this.limit / 850, .6, 1));
    for (let i = 0; i < innerCount; i++) {
      const d = sphereDirection(i, innerCount, -rotation), speed = random(75, 120) * scale;
      this.spawn(x, y, d.x * speed, d.y * speed, { color: variant === 2 ? 4 : 3,
        life: random(1.65, 2.35), size: random(.8, 1.2), drag: 1.1 });
    }
    this.flashes.push({ x, y, life: 0, radius: 95 * scale });
    if (this.foreground && !this.lightMotion) {
      const frontCount = variant === 0 ? 16 : 8, frontRotation = random(0, TAU);
      for (let i = 0; i < frontCount && this.flybys.length < 48; i++) {
        const zDirection = .96 + .035 * (i + .5) / frontCount;
        const lateral = Math.sqrt(1 - zDirection * zDirection), angle = i * 2.3999632297 + frontRotation;
        const speed = random(430, 650) * this.sceneScale;
        this.flybys.push({ x, y, z: -60, dx: Math.cos(angle) * lateral * speed,
          dy: Math.sin(angle) * lateral * speed, dz: zDirection * speed,
          drag: random(.25, .38), gravity: this.gravity, wind: 3, camera: this.camera,
          age: -random(.04, .15), duration: random(1.9, 2.5), size: random(.75, 1.15),
          color: i % 7 === 0 ? 3 : 1 });
      }
    }
  }
  update(dt, head) {
    // A bounded 120 Hz simulation keeps emission, collision and trail sampling
    // consistent across render frame rates. Hidden-page pauses are handled by main.
    this.accumulator = Math.min(.125, this.accumulator + Math.max(0, dt));
    const step = 1 / 120;
    while (this.accumulator + 1e-10 >= step) {
      this.step(step, head); this.accumulator = Math.max(0, this.accumulator - step);
    }
  }
  step(dt, head) {
    this.time += dt; this.tick++;
    const recordTrail = this.tick % 2 === 0;
    if (recordTrail) this.trailHead = (this.trailHead + 1) % this.trailLength;
    this.rainEnvelope += (this.rainStrength - this.rainEnvelope) * (1 - Math.exp(-dt * 3));
    for (let i = this.flybys.length - 1; i >= 0; i--) {
      const spark = this.flybys[i]; spark.age += dt;
      if (this.lightMotion || spark.age >= spark.duration || (spark.age > 0 && !projectSpark(spark, spark.age).visible)) this.flybys.splice(i, 1);
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].age += dt; if (this.ripples[i].age > 1.05) this.ripples.splice(i, 1);
    }
    for (let i = this.events.length - 1; i >= 0; i--) if (this.time >= this.events[i].at) {
      const e = this.events.splice(i, 1)[0]; this.launch(e.x, e.y, e.scale, e.variant);
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]; r.life += dt;
      const t = Math.min(r.life, r.duration);
      const x = advanceAxis(r.x0, r.initialVx, r.wind, r.drag, t);
      const y = advanceAxis(r.y0, r.initialVy, r.gravity, r.drag, t);
      r.x = x.position; r.y = y.position; r.vx = x.velocity; r.vy = y.velocity;
      r.emission += dt * (this.lightMotion ? 20 : 55);
      let emitted = 0;
      while (r.emission >= 1 && emitted++ < 3) {
        r.emission--;
        this.spawn(r.x, r.y, random(-10, 10), random(20, 65), {
          color: 1, life: random(.22, .46), size: random(.6, 1), kind: 2, drag: 1.5 });
      }
      if (r.life >= r.duration) {
        // Evaluate the exact apex even when a step crosses it.
        this.burst(r.tx, r.ty, r.scale, r.variant); this.rockets.splice(i, 1);
      }
    }
    this.rainAccumulator += dt * this.rainStrength * (this.lightMotion ? 45 : 145) * clamp(this.width / 420, .8, 1.25);
    while (this.rainAccumulator >= 1) {
      this.rainAccumulator--;
      const depth = this.lightMotion ? 1 : Math.random() < .16 ? 2 : Math.random() < .35 ? 0 : 1;
      const speed = depth === 2 ? random(560, 740) : depth === 1 ? random(340, 480) : random(170, 260);
      this.spawn(random(-40, this.width + 5), -90, random(22, 42), speed, { kind: 0,
        life: this.height / speed + 1, color: 4, size: depth === 2 ? random(2.7, 4.2) : depth === 1 ? random(1.1, 1.8) : random(.5, .9), depth, drag: 0 });
    }
    const wind = Math.sin(this.time * .42) * 4;
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.kind[i] === 0 && this.y[i] >= this.height * (.70 + Math.sin(this.phase[i]) * .045)) {
        if (this.ripples.length < (this.lightMotion ? 10 : 30) && this.depth[i] > 0 && Math.random() < .65) this.ripples.push({ x: this.x[i], y: this.y[i], age: 0, size: this.size[i], color: i % 3 });
        this.life[i] = 0;
      }
      if (this.life[i] <= 0 || this.y[i] > this.height + 80 || this.x[i] < -100 || this.x[i] > this.width + 100) {
        this.count--; for (const key of fields) this[key][i] = this[key][this.count];
        this.trailX.copyWithin(i * this.trailLength, this.count * this.trailLength, (this.count + 1) * this.trailLength);
        this.trailY.copyWithin(i * this.trailLength, this.count * this.trailLength, (this.count + 1) * this.trailLength);
        i--; continue;
      }
      this.px[i] = this.x[i]; this.py[i] = this.y[i];
      const rain = this.kind[i] === 0, ax = rain ? 0 : wind, ay = rain ? 3 : this.gravity;
      const c = motionCoefficients(this.drag[i], dt, this.coefficients), vx = this.vx[i], vy = this.vy[i];
      this.x[i] += vx * c.travel + ax * c.acceleration; this.y[i] += vy * c.travel + ay * c.acceleration;
      this.vx[i] = vx * c.decay + ax * c.travel; this.vy[i] = vy * c.decay + ay * c.travel;
      this.cooldown[i] -= dt;
      const age = this.total[i] - this.life[i];
      this.heat[i] = Math.min(7, Math.floor(age / this.total[i] * 8));
      if (head && !rain && this.vy[i] > 0 && age > .16 && this.cooldown[i] <= 0) {
        const hit = collideEllipse(this.px[i], this.py[i], this.x[i], this.y[i], this.vx[i], this.vy[i], head, .34);
        if (hit) {
          const dx = this.px[i] - head.x, dy = this.py[i] - head.y, ca = Math.cos(head.angle || 0), sa = Math.sin(head.angle || 0);
          const trapped = ((dx * ca + dy * sa) / head.rx) ** 2 + ((-dx * sa + dy * ca) / head.ry) ** 2 < 1;
          this.x[i] = hit.x; this.y[i] = hit.y; this.vx[i] = hit.vx * .96; this.vy[i] = hit.vy * .96;
          this.px[i] = hit.x; this.py[i] = hit.y; this.cooldown[i] = .18; this.collisions++;
          this.life[i] = Math.min(this.life[i], random(.45, .85)); this.drag[i] = Math.max(this.drag[i], 1.2); this.emits[i] = 0;
          this.heat[i] = Math.min(7, Math.floor((1 - this.life[i] / this.total[i]) * 8));
          if (trapped) {
            this.trailX.fill(hit.x, i * this.trailLength, (i + 1) * this.trailLength);
            this.trailY.fill(hit.y, i * this.trailLength, (i + 1) * this.trailLength);
          }
          if (this.impacts.length < 18 && Math.random() < .2) this.impacts.push({ x: hit.x, y: hit.y, life: 0 });
        }
      }
      // Sample only the resolved position, never the point that penetrated the head.
      if (recordTrail) { this.trailX[i * this.trailLength + this.trailHead] = this.x[i]; this.trailY[i * this.trailLength + this.trailHead] = this.y[i]; }
      if (!rain && this.emits[i] && age > .08 && this.life[i] / this.total[i] > .2) {
        this.sparkTimer[i] += dt * 7;
        if (this.sparkTimer[i] >= 1) {
          this.sparkTimer[i]--;
          this.spawn(this.x[i], this.y[i], this.vx[i] * .12 + random(-14, 14), this.vy[i] * .12 + random(0, 24), {
            color: 2, life: random(.24, .55), size: random(.55, .95), kind: 2, drag: 1.35 });
        }
      }
    }
    for (const list of [this.flashes, this.impacts]) for (let i = list.length - 1; i >= 0; i--) {
      list[i].life += dt; if (list[i].life > (list === this.flashes ? .35 : .25)) list.splice(i, 1);
    }
  }
  draw(head) {
    const ctx = this.ctx, w = this.width, h = this.height;
    ctx.clearRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.lineCap = 'round';
    if (this.preview) {
      for (const star of this.stars) {
        ctx.fillStyle = `rgba(219,220,218,${.13 + .14 * Math.sin(this.time * .55 + star.phase) ** 2})`;
        ctx.beginPath(); ctx.arc(star.x * w, star.y * h, star.r, 0, TAU); ctx.fill();
      }
      if (head) this.drawGhost(head);
    }
    ctx.globalCompositeOperation = 'lighter'; this.drawRain();
    for (const flash of this.flashes) {
      const progress = flash.life / .35, radius = flash.radius * (.65 + progress * .65);
      const glow = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius);
      glow.addColorStop(0, `rgba(255,226,178,${.10 * (1 - progress) ** 2})`); glow.addColorStop(1, 'rgba(255,220,180,0)');
      ctx.fillStyle = glow; ctx.fillRect(flash.x - radius, flash.y - radius, radius * 2, radius * 2);
    }
    this.drawFireworkTrails();
    for (let i = 0; i < this.count; i++) if (this.kind[i] !== 0) {
      const age = this.total[i] - this.life[i], intensity = burnIntensity(age, this.total[i]);
      const flicker = .84 + .16 * Math.sin(this.time * 23 + this.phase[i]) ** 2, band = this.heat[i];
      const size = Math.max(.5, this.size[i] * (1 - age / this.total[i] * .25));
      if (this.kind[i] === 1 || i % 3 === 0) {
        ctx.globalAlpha = intensity * flicker * .60;
        ctx.drawImage(band < 4 ? this.sprites[this.color[i]] : this.emberSprite,
          this.x[i] - size * 4, this.y[i] - size * 4, size * 8, size * 8);
      }
      ctx.globalAlpha = intensity * flicker * .92;
      ctx.fillStyle = `rgb(${this.heatColors[this.color[i]][band]})`;
      ctx.beginPath(); ctx.arc(this.x[i], this.y[i], Math.max(.35, size * .55), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const r of this.rockets) {
      ctx.beginPath(); ctx.moveTo(r.x - r.vx * .055, r.y - r.vy * .055); ctx.lineTo(r.x, r.y);
      ctx.strokeStyle = 'rgba(255,204,135,.75)'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.drawImage(this.sprites[0], r.x - 5, r.y - 5, 10, 10);
    }
    for (const hit of this.impacts) {
      const t = hit.life / .25; ctx.beginPath(); ctx.arc(hit.x, hit.y, 1 + t * 7, 0, TAU);
      ctx.strokeStyle = `rgba(${this.rgbs[0]},${(1 - t) * .22})`; ctx.lineWidth = .7; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (head && this.debug) {
      ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(head.angle || 0); ctx.strokeStyle = '#a5dec4b0';
      ctx.lineWidth = 1; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.ellipse(0, 0, head.rx, head.ry, 0, 0, TAU); ctx.stroke(); ctx.restore();
    }
    this.drawForeground();
  }
  drawFireworkTrails() {
    const ctx = this.ctx, sections = 3;
    this.drawMask.fill(0); let emberMask = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.kind[i] === 1) this.drawMask[this.color[i]] |= 1 << this.heat[i];
      else if (this.kind[i] === 2) emberMask |= 1 << this.heat[i];
    }
    for (let color = 0; color < 5; color++) for (let band = 0; band < 8; band++) {
      if (!(this.drawMask[color] & (1 << band))) continue;
      const brightness = Math.pow(1 - (band + .5) / 8, .62);
      for (let section = 0; section < sections; section++) {
        const start = 1 + Math.floor(section * (this.trailLength - 1) / sections);
        const end = 1 + Math.floor((section + 1) * (this.trailLength - 1) / sections);
        ctx.beginPath();
        for (let i = 0; i < this.count; i++) if (this.kind[i] === 1 && this.color[i] === color && this.heat[i] === band) {
          const base = i * this.trailLength, first = (this.trailHead + start) % this.trailLength;
          ctx.moveTo(this.trailX[base + first], this.trailY[base + first]);
          for (let j = start; j < end; j++) { const a = (this.trailHead + j + 1) % this.trailLength; ctx.lineTo(this.trailX[base + a], this.trailY[base + a]); }
        }
        const alpha = brightness * [.10, .35, .95][section];
        if (section === 2 && !this.lightMotion && this.limit > 450) {
          ctx.strokeStyle = `rgba(${this.heatColors[color][band]},${alpha * .16})`; ctx.lineWidth = 4.4; ctx.stroke();
        }
        ctx.strokeStyle = `rgba(${this.heatColors[color][band]},${alpha})`; ctx.lineWidth = [.8, 1.45, 2.2][section]; ctx.stroke();
        if (section === 2) { ctx.strokeStyle = band < 4 ? `rgba(255,242,205,${alpha * .7})` : `rgba(255,165,70,${alpha * .45})`; ctx.lineWidth = .75; ctx.stroke(); }
      }
    }
    for (let band = 0; band < 8; band++) {
      if (!(emberMask & (1 << band))) continue;
      ctx.beginPath();
      for (let i = 0; i < this.count; i++) if (this.kind[i] === 2 && this.heat[i] === band) {
        ctx.moveTo(this.x[i] - this.vx[i] * .04, this.y[i] - this.vy[i] * .04); ctx.lineTo(this.x[i], this.y[i]);
      }
      ctx.strokeStyle = `rgba(255,175,85,${Math.pow(1 - (band + .5) / 8, .62) * .72})`; ctx.lineWidth = 1.1; ctx.stroke();
    }
  }
  drawRain() {
    const ctx = this.ctx, w = this.width, h = this.height, amount = this.rainEnvelope;
    const rgb = hexRGB(this.palette.rain);
    if (amount > .005) {
      const mist = ctx.createRadialGradient(w * .55, h * .24, 0, w * .55, h * .24, w * .85);
      mist.addColorStop(0, `rgba(${rgb},${amount * .10})`); mist.addColorStop(.6, `rgba(${this.rgbs[3]},${amount * .045})`); mist.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = mist; ctx.fillRect(0, 0, w, h * .75);
      ctx.save(); ctx.translate(w * .5, h * .72); ctx.scale(1, .15);
      const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, w * .64);
      pool.addColorStop(0, `rgba(${this.rgbs[3]},${amount * .15})`); pool.addColorStop(.55, `rgba(${rgb},${amount * .07})`); pool.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = pool; ctx.fillRect(-w, -w, w * 2, w * 2); ctx.restore();
    }
    for (let depth = 0; depth < 2; depth++) {
      ctx.beginPath();
      for (let i = 0; i < this.count; i++) if (this.kind[i] === 0 && this.depth[i] === depth) {
        ctx.moveTo(this.x[i] - this.vx[i] * .09, this.y[i] - 28 * this.size[i]); ctx.lineTo(this.x[i], this.y[i]);
      }
      ctx.strokeStyle = `rgba(${rgb},${depth ? .16 : .19})`; ctx.lineWidth = depth ? 4 : .7; ctx.stroke();
      if (depth) { ctx.strokeStyle = `rgba(${rgb},.77)`; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    for (let i = 0; i < this.count; i++) if (this.kind[i] === 0 && this.depth[i] === 2) {
      const size = this.size[i]; ctx.save(); ctx.translate(this.x[i], this.y[i]); ctx.rotate(-.065);
      ctx.globalAlpha = .80;
      ctx.drawImage(this.dropSprites[i % 3], -size * 3, -size * 23, size * 6, size * 25);
      ctx.restore();
    }
    for (const ripple of this.ripples) {
      const t = ripple.age / 1.05, radius = (5 + t * 28) * Math.min(ripple.size, 2);
      ctx.strokeStyle = `rgba(${ripple.color ? this.rgbs[3] : rgb},${(1 - t) ** 1.5 * .55})`; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.ellipse(ripple.x, ripple.y, radius, radius * .22, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(ripple.x, ripple.y, radius * .65, radius * .14, 0, 0, TAU); ctx.stroke();
      if (t < .25) { ctx.globalAlpha = (1 - t * 4) * .55; ctx.drawImage(this.sprites[ripple.color ? 3 : 4], ripple.x - 12, ripple.y - 12, 24, 24); ctx.globalAlpha = 1; }
    }
  }
  drawForeground() {
    if (!this.frontCtx) return;
    const ctx = this.frontCtx, w = this.width, h = this.height;
    ctx.clearRect(0, 0, this.frontWidth, this.frontHeight); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h * .72); ctx.clip();
    for (const spark of this.flybys) {
      if (spark.age <= 0) continue;
      const point = projectSpark(spark, spark.age);
      if (!point.visible || point.x < -80 || point.x > w + 80 || point.y < -80 || point.y > h * .76) continue;
      const tail = projectSpark(spark, Math.max(0, spark.age - .065));
      if (!tail.visible) continue;
      let dx = point.x - tail.x, dy = point.y - tail.y, length = Math.hypot(dx, dy);
      const cap = Math.min(1, 90 / Math.max(1, length)); dx *= cap; dy *= cap;
      const band = Math.min(7, Math.floor(spark.age / spark.duration * 8));
      const intensity = burnIntensity(spark.age, spark.duration) * point.depthFade;
      const width = Math.min(2.5, 1.1 + point.scale * .23), defocus = clamp((point.scale - 1) * 1.2, 0, 5);
      // A tapered capsule and a small round hot core; never a cross/star sprite.
      ctx.beginPath(); ctx.moveTo(point.x - dx, point.y - dy); ctx.lineTo(point.x, point.y);
      ctx.globalAlpha = intensity * .14; ctx.strokeStyle = `rgb(${this.heatColors[spark.color][band]})`; ctx.lineWidth = width + 3 + defocus; ctx.stroke();
      ctx.globalAlpha = intensity * .95; ctx.lineWidth = width; ctx.stroke();
      ctx.globalAlpha = intensity * .9; ctx.strokeStyle = '#fff2d4'; ctx.lineWidth = .65;
      ctx.beginPath(); ctx.moveTo(point.x - dx * .48, point.y - dy * .48); ctx.lineTo(point.x, point.y); ctx.stroke();
      const glowSize = Math.min(14, 6 + defocus);
      ctx.globalAlpha = intensity * .20;
      ctx.drawImage(band < 4 ? this.sprites[spark.color] : this.emberSprite,
        point.x - glowSize, point.y - glowSize, glowSize * 2, glowSize * 2);
      ctx.globalAlpha = intensity * .9; ctx.fillStyle = '#fff1d3';
      ctx.beginPath(); ctx.arc(point.x, point.y, Math.min(1.3, .6 + point.scale * .1), 0, TAU); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  drawGhost(head) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(head.angle || 0);
    const halo = ctx.createRadialGradient(-head.rx * .1, -head.ry * .2, 0, 0, 0, head.ry * 1.7);
    halo.addColorStop(0, 'rgba(141,160,189,.07)'); halo.addColorStop(.65, 'rgba(80,105,155,.025)'); halo.addColorStop(1, 'rgba(80,100,130,0)');
    ctx.fillStyle = halo; ctx.fillRect(-head.ry * 1.8, -head.ry * 1.8, head.ry * 3.6, head.ry * 3.6);
    const line = ctx.createLinearGradient(-head.rx, -head.ry, head.rx, head.ry);
    line.addColorStop(0, '#d4c09e66'); line.addColorStop(.40, '#b6bed235'); line.addColorStop(1, '#707c9a12');
    ctx.strokeStyle = line; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.ellipse(0, 0, head.rx, head.ry, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, head.rx * 1.12, head.ry * 1.07, -.14, Math.PI * .85, Math.PI * 1.75); ctx.strokeStyle = '#b8bec51a'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-head.rx * .18, -head.ry * .05); ctx.lineTo(head.rx * .18, -head.ry * .05);
    ctx.moveTo(0, -head.ry * .20); ctx.lineTo(0, head.ry * .10); ctx.strokeStyle = '#cecac329'; ctx.lineWidth = .6; ctx.stroke();
    ctx.restore();
  }
}
