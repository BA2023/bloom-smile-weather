import { clamp, collideEllipse } from './geometry.js';

export const PALETTES = {
  gold: { name: '鎏金', colors: ['#fff1cb', '#edc78c', '#d39454', '#f0b3a4', '#b6d0d3'], rain: '#d2d9eb' },
  rose: { name: '绯樱', colors: ['#fff0e8', '#f4b2c8', '#d77cad', '#c5b8f0', '#efccad'], rain: '#e7c2e3' },
  aurora: { name: '极光', colors: ['#e5fff2', '#a2e7cb', '#77bfc5', '#aaa1ec', '#d7c6f2'], rain: '#aadce3' }
};
const hexRGB = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const random = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const fields = ['x', 'y', 'px', 'py', 'vx', 'vy', 'life', 'total', 'size', 'color', 'kind', 'phase', 'drag', 'cooldown', 'depth'];

// A moving depth plane gives the foreground an accelerating, lens-facing trajectory.
export function projectSpark(spark, age) {
  const t = clamp(age / spark.duration, 0, 1);
  const scale = 430 / (1050 - 925 * t);
  return { x: spark.x + spark.dx * age * scale, y: spark.y + (spark.dy * age + 18 * age * age) * scale, scale };
}

export class ParticleEngine {
  constructor(canvas, foreground = null) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: true });
    this.foreground = foreground; this.frontCtx = foreground?.getContext('2d', { alpha: true });
    this.flybys = []; this.ripples = []; this.rainEnvelope = 0;
    this.capacity = 1800; this.limit = innerWidth < 740 ? 850 : 1350; this.count = 0;
    for (const key of fields) this[key] = new Float32Array(this.capacity);
    this.trailLength = 20; this.trailHead = 0; this.trailTimer = 0;
    this.trailX = new Float32Array(this.capacity * this.trailLength);
    this.trailY = new Float32Array(this.capacity * this.trailLength);
    this.time = 0; this.rockets = []; this.flashes = []; this.impacts = []; this.events = [];
    this.collisions = 0; this.rainAccumulator = 0; this.rainStrength = 0; this.lightMotion = false;
    this.width = 1; this.height = 1; this.preview = true; this.debug = false;
    this.stars = Array.from({ length: 55 }, () => ({ x: Math.random(), y: Math.random(), phase: random(0, TAU), r: random(.35, 1.1) }));
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
        for(let j=0;j<this.trailLength;j++){this.trailX[i*this.trailLength+j]*=sx;this.trailY[i*this.trailLength+j]*=sy;}
      }
      for (const r of this.rockets) { r.x0 *= sx; r.x *= sx; r.tx *= sx; r.y0 *= sy; r.y *= sy; r.ty *= sy; }
    }
    this.width = width; this.height = height;
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
    if (this.count >= Math.min(this.limit, this.capacity)) return;
    const i = this.count++;
    this.x[i] = this.px[i] = x; this.y[i] = this.py[i] = y;
    this.trailX.fill(x, i * this.trailLength, (i + 1) * this.trailLength);
    this.trailY.fill(y, i * this.trailLength, (i + 1) * this.trailLength);
    this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = this.total[i] = options.life || random(1.5, 2.8);
    this.size[i] = options.size || random(1.5, 3.5);
    this.color[i] = options.color ?? Math.floor(random(0, 5)); this.kind[i] = options.kind ?? 1;
    this.phase[i] = random(0, TAU); this.drag[i] = options.drag ?? .48; this.cooldown[i] = 0;
    this.depth[i] = options.depth ?? 0;
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
    const startX = x + (variant % 2 ? -1 : 1) * Math.min(this.width * .17, 110);
    this.rockets.push({ x0: startX, y0: this.height + 15, x: startX, y: this.height + 15,
      tx: x, ty: y, life: 0, duration: random(.67, .83), scale, variant });
  }
  burst(x, y, scale, variant = 0) {
    // Art direction is calibrated to a phone portrait, not a wide desktop canvas.
    scale *= clamp(Math.min(this.width / 480, this.height / 760), .72, 1.28) * (this.lightMotion ? .78 : 1);
    const spokes = this.lightMotion ? 40 : 76;
    const rotation = random(0, TAU);
    for (let i = 0; i < spokes; i++) {
      const a = i / spokes * TAU + rotation;
      const petal = 1 + .10 * Math.cos(a * 5);
      const speed = random(175, 230) * scale * petal;
      const color = i % 9 === 0 ? 3 : i % 5 === 0 ? 0 : 1;
      for (let j = 0; j < (this.lightMotion ? 1 : 3); j++) {
        const angle = a + random(-.012, .012), v = speed * (1 - j * .14);
        this.spawn(x, y, Math.cos(angle) * v, Math.sin(angle) * v * .88, { color, life: random(2.1, 2.9) - j * .15, size: random(3.3, 5.4) * scale, drag: .36 + j * .1 });
      }
    }
    // A cool inner corona makes the warm outer peony read as volume, not confetti.
    const innerCount = this.lightMotion ? 24 : 56;
    for (let i = 0; i < innerCount; i++) {
      const a = i / innerCount * TAU - rotation;
      const speed = random(70, 122) * scale;
      this.spawn(x, y, Math.cos(a) * speed, Math.sin(a) * speed, { color: variant === 2 ? 4 : 3, life: random(1.5, 2.3), size: random(3, 4.8) * scale, drag: .57 });
    }
    for (let i = 0; i < (this.lightMotion ? 12 : 36); i++) {
      const a = random(0, TAU), speed = random(30, 170) * scale;
      this.spawn(x, y, Math.cos(a) * speed, Math.sin(a) * speed, { color: i % 4 ? 0 : 2, life: random(2.4, 3.7), size: random(1.8, 3.1) * scale, kind: 2, drag: .94 });
    }
    this.flashes.push({ x, y, life: 0, radius: 150 * scale });
    if (this.foreground && !this.lightMotion) {
      const count = variant === 0 ? 34 : 16;
      for (let i = 0; i < count && this.flybys.length < 100; i++) {
        // Most rays travel upward and sideways, leaving face and controls readable.
        const angle = Math.PI * (.94 + i / count * 1.12) + random(-.04, .04);
        // A few nearly axial rays stay visible as they grow close to the lens.
        const towardLens = i % 7 === 0;
        const speed = (towardLens ? random(25, 55) : random(145, 245)) * scale;
        this.flybys.push({ x, y, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed * .8,
          age: -.10 - random(0, .14), duration: random(1.55, 1.95), size: random(1.5, 3), color: i % 7 === 0 ? 3 : i % 3 === 0 ? 0 : 1 });
      }
    }
  }
  update(dt, head) {
    this.time += dt;
    this.rainEnvelope += (this.rainStrength - this.rainEnvelope) * (1 - Math.exp(-dt * 3));
    for (let i = this.flybys.length - 1; i >= 0; i--) {
      this.flybys[i].age += dt;
      if (this.lightMotion || this.flybys[i].age > this.flybys[i].duration) this.flybys.splice(i, 1);
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].age += dt; if (this.ripples[i].age > 1.05) this.ripples.splice(i, 1);
    }
    this.trailTimer += dt;
    const recordTrail = this.trailTimer >= 1 / 30;
    if(recordTrail){this.trailTimer %= 1/30;this.trailHead=(this.trailHead+1)%this.trailLength;}
    for (let i = this.events.length - 1; i >= 0; i--) if (this.time >= this.events[i].at) {
      const e = this.events.splice(i, 1)[0]; this.launch(e.x, e.y, e.scale, e.variant);
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]; r.life += dt;
      const t = Math.min(r.life / r.duration, 1), ease = 1 - (1 - t) ** 1.8;
      const oldX = r.x, oldY = r.y;
      r.x = r.x0 + (r.tx - r.x0) * ease + Math.sin(t * Math.PI) * 17;
      r.y = r.y0 + (r.ty - r.y0) * ease;
      if (Math.random() < .8) this.spawn(r.x, r.y, (oldX - r.x) * 7 + random(-8, 8), random(12, 45), { color: 1, life: random(.20, .46), size: random(1.7, 3), kind: 2, drag: 1.4 });
      if (t >= 1) { this.burst(r.tx, r.ty, r.scale, r.variant); this.rockets.splice(i, 1); }
    }
    this.rainAccumulator += dt * this.rainStrength * (this.lightMotion ? 45 : 145) * clamp(this.width / 420, .8, 1.25);
    while (this.rainAccumulator >= 1) {
      this.rainAccumulator--;
      const depth = this.lightMotion ? 1 : Math.random() < .16 ? 2 : Math.random() < .35 ? 0 : 1;
      const speed = depth === 2 ? random(560, 740) : depth === 1 ? random(340, 480) : random(170, 260);
      this.spawn(random(-40, this.width + 5), -90, random(22, 42), speed, { kind: 0, life: this.height / speed + 1, color: 4,
        size: depth === 2 ? random(2.7, 4.2) : depth === 1 ? random(1.1, 1.8) : random(.5, .9), depth, drag: 0 });
    }
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.kind[i] === 0 && this.y[i] >= this.height * (.70 + Math.sin(this.phase[i]) * .045)) {
        if (this.ripples.length < (this.lightMotion ? 10 : 30) && this.depth[i] > 0 && Math.random() < .65) {
          this.ripples.push({ x: this.x[i], y: this.y[i], age: 0, size: this.size[i], color: i % 3 });
        }
        this.life[i] = 0;
      }
      if (this.life[i] <= 0 || this.y[i] > this.height + 80 || this.x[i] < -100 || this.x[i] > this.width + 100) {
        this.count--; for (const key of fields) this[key][i] = this[key][this.count];
        this.trailX.copyWithin(i*this.trailLength,this.count*this.trailLength,(this.count+1)*this.trailLength);
        this.trailY.copyWithin(i*this.trailLength,this.count*this.trailLength,(this.count+1)*this.trailLength);
        i--; continue;
      }
      this.px[i] = this.x[i]; this.py[i] = this.y[i];
      this.vx[i] *= Math.exp(-this.drag[i] * dt);
      this.vy[i] = this.vy[i] * Math.exp(-this.drag[i] * dt) + (this.kind[i] === 0 ? 3 : 38) * dt;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      if(recordTrail){this.trailX[i*this.trailLength+this.trailHead]=this.x[i];this.trailY[i*this.trailLength+this.trailHead]=this.y[i];}
      this.cooldown[i] -= dt;
      if (head && this.kind[i] !== 0 && this.cooldown[i] <= 0) {
        const hit = collideEllipse(this.px[i], this.py[i], this.x[i], this.y[i], this.vx[i], this.vy[i], head);
        if (hit) {
          this.x[i] = hit.x; this.y[i] = hit.y; this.vx[i] = hit.vx; this.vy[i] = hit.vy;
          this.px[i] = hit.x; this.py[i] = hit.y; this.cooldown[i] = .09; this.collisions++;
          if (this.impacts.length < 26 && Math.random() < .28) this.impacts.push({ x: hit.x, y: hit.y, life: 0 });
        }
      }
    }
    for (const list of [this.flashes, this.impacts]) for (let i = list.length - 1; i >= 0; i--) {
      list[i].life += dt; if (list[i].life > (list === this.flashes ? .45 : .32)) list.splice(i, 1);
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
    ctx.globalCompositeOperation = 'lighter';
    this.drawRain();
    for (const flash of this.flashes) {
      const progress = flash.life / .45;
      const radius = flash.radius * (.6 + progress * .8);
      const glow = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, radius);
      glow.addColorStop(0, `rgba(255,234,201,${.20 * (1 - progress) ** 2})`);
      glow.addColorStop(1, 'rgba(255,220,180,0)'); ctx.fillStyle = glow;
      ctx.fillRect(flash.x - radius, flash.y - radius, radius * 2, radius * 2);
    }
    // Bounded history keeps the luminous filaments curved after collisions.
    // Batch by color and age segment instead of allocating a gradient per spark.
    for (let color = 0; color < 5; color++) for(let j=1;j<this.trailLength;j++) {
      ctx.beginPath();
      const a=(this.trailHead+j)%this.trailLength,b=(a+1)%this.trailLength;
      for (let i = 0; i < this.count; i++) if (this.color[i] === color && this.kind[i] !== 0) {
        const base=i*this.trailLength;
        ctx.moveTo(this.trailX[base+a],this.trailY[base+a]);
        ctx.lineTo(this.trailX[base+b],this.trailY[base+b]);
      }
      const alpha = .08 + j / this.trailLength * .58;
      if (!this.lightMotion && this.limit > 450) {
        ctx.strokeStyle = `rgba(${this.rgbs[color]},${(alpha * .28).toFixed(3)})`;
        ctx.lineWidth = 4.6; ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${this.rgbs[color]},${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.5 + j / this.trailLength * .8; ctx.stroke();
    }
    for (let i = 0; i < this.count; i++) if (this.kind[i] !== 0) {
      const age = 1 - this.life[i] / this.total[i];
      const twinkle = this.kind[i] === 2 ? .55 + .45 * Math.sin(this.time * 20 + this.phase[i]) ** 2 : .8 + .2 * Math.sin(this.time * 9 + this.phase[i]);
      ctx.globalAlpha = Math.min(1, (1 - age) * 2.3) * twinkle;
      const size = this.size[i] * (1 - age * .35);
      ctx.drawImage(this.sprites[this.color[i]], this.x[i] - size * 3, this.y[i] - size * 3, size * 6, size * 6);
      if (i % 13 === 0 && age < .8) {
        ctx.beginPath(); ctx.moveTo(this.x[i] - size * 1.5, this.y[i]); ctx.lineTo(this.x[i] + size * 1.5, this.y[i]);
        ctx.moveTo(this.x[i], this.y[i] - size * 2); ctx.lineTo(this.x[i], this.y[i] + size * 2);
        ctx.strokeStyle = `rgba(${this.rgbs[this.color[i]]},.55)`; ctx.lineWidth = .8; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const r of this.rockets) {
      ctx.beginPath(); ctx.moveTo(r.x, r.y + 50); ctx.lineTo(r.x, r.y); ctx.strokeStyle = 'rgba(242,209,161,.6)'; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.drawImage(this.sprites[0], r.x - 7, r.y - 7, 14, 14);
    }
    for (const hit of this.impacts) {
      const t = hit.life / .32;
      ctx.beginPath(); ctx.arc(hit.x, hit.y, 2 + t * 11, 0, TAU);
      ctx.strokeStyle = `rgba(${this.rgbs[0]},${(1 - t) * .4})`; ctx.lineWidth = .7; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (head && this.debug) {
      ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(head.angle || 0);
      ctx.strokeStyle = '#a5dec4b0'; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.ellipse(0, 0, head.rx, head.ry, 0, 0, TAU); ctx.stroke(); ctx.restore();
    }
    this.drawForeground();
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
    ctx.clearRect(0, 0, this.frontWidth, this.frontHeight);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, this.frontWidth, h * .72); ctx.clip();
    for (const spark of this.flybys) {
      if (spark.age <= 0) continue;
      const t = spark.age / spark.duration, point = projectSpark(spark, spark.age);
      const fade = Math.min(1, spark.age * 5) * Math.min(1, (1 - t) * 4);
      const size = spark.size * point.scale * (1 + t * 1.5);
      for (let segment = 0; segment < 6; segment++) {
        const a = projectSpark(spark, Math.max(0, spark.age - (6 - segment) * .032));
        const b = projectSpark(spark, Math.max(0, spark.age - (5 - segment) * .032));
        ctx.globalAlpha = fade * (.13 + segment * .10);
        ctx.strokeStyle = this.palette.colors[spark.color]; ctx.lineWidth = Math.max(1.1, size * .62 * (segment + 1) / 6);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.globalAlpha = fade * .85;
      ctx.drawImage(this.sprites[spark.color], point.x - size * 4, point.y - size * 4, size * 8, size * 8);
      if (t > .4) {
        ctx.globalAlpha = fade * .7; ctx.lineWidth = 1.1; ctx.strokeStyle = '#fff7df';
        ctx.beginPath(); ctx.moveTo(point.x - size * 1.8, point.y); ctx.lineTo(point.x + size * 1.8, point.y);
        ctx.moveTo(point.x, point.y - size * 2.6); ctx.lineTo(point.x, point.y + size * 2.6); ctx.stroke();
      }
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
