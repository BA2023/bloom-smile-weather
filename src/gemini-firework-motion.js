import { solveTimedLaunch, advanceAxis, motionCoefficients, sphereDirection, burnIntensity, projectSpark } from './firework-physics.js?v=responsive-live-15';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const TAU = Math.PI * 2;

// Adapt GPT's shared motion solver to Gemini's native pixels-per-60Hz-step units.
// Rain, expression tracking, particle colors and round ember shapes stay in Gemini.
export class GeminiFireworkMotion {
  constructor() { this.flybys = []; this.coefficients = {}; this.resize(360, 640); }
  resize(width, height) {
    this.width = width; this.height = height;
    this.scale = clamp(Math.min(width / 480, height / 760), .72, 1.28) * 1.12;
    this.gravity = 105 * clamp(width / 360, .7, 1.25);
    this.camera = { x: width * .5, y: height * .4, focal: width * 2, near: Math.max(80, width * .28) };
    this.flybys.length = 0;
  }
  launch(p, targetX, targetY) {
    const duration = ( .36 + Math.random() * .07 ) * 60;
    const drag = 2.6 / 60, wind = 3 / 3600;
    const shot = solveTimedLaunch(Math.max(1, p.y - targetY), targetX - p.x, duration, drag, wind);
    Object.assign(p, { launchX: p.x, launchY: p.y, initialVx: shot.vx, initialVy: shot.vy,
      targetX, targetY, vx: shot.vx, vy: shot.vy, maxLife: shot.duration,
      gravity: shot.gravity, drag: Math.exp(-drag), dragRate: drag, wind });
  }
  stepRocket(p) {
    const t = Math.min(p.life, p.maxLife);
    const x = advanceAxis(p.launchX, p.initialVx, p.wind, p.dragRate, t);
    const y = advanceAxis(p.launchY, p.initialVy, p.gravity, p.dragRate, t);
    p.x = x.position; p.y = y.position; p.vx = x.velocity; p.vy = y.velocity;
  }
  configureSpark(p, index, count, rotation) {
    const ring = index % 3, direction = sphereDirection(index, count, rotation);
    const speed = (ring === 0 ? 230 + Math.random() * 55 : ring === 1 ? 155 + Math.random() * 50 : 75 + Math.random() * 45) * this.scale / 60;
    const streamer = ring === 0 && index % 11 === 0;
    const drag = ring === 2 ? 1.1 : streamer ? .62 : .78 + Math.random() * .27;
    p.vx = direction.x * speed; p.vy = direction.y * speed * .94;
    p.dragRate = drag / 60; p.drag = Math.exp(-p.dragRate);
    p.gravity = this.gravity / 3600; p.wind = 3 / 3600;
    p.maxLife = (streamer ? 2.9 + Math.random() * .6 : ring === 2 ? 1.65 + Math.random() * .7 : 2.15 + Math.random() * .8) * 60;
  }
  configureImpact(p) { p.dragRate = 1.35 / 60; p.drag = Math.exp(-p.dragRate); p.gravity = this.gravity / 3600; p.wind = 3 / 3600; }
  stepSpark(p) {
    const c = motionCoefficients(p.dragRate, 1, this.coefficients), vx = p.vx, vy = p.vy;
    p.x += vx * c.travel + p.wind * c.acceleration; p.y += vy * c.travel + p.gravity * c.acceleration;
    p.vx = vx * c.decay + p.wind * c.travel; p.vy = vy * c.decay + p.gravity * c.travel;
  }
  reflect(p, hit, head) {
    const vx = clamp(head.vx || 0, -260 / 60, 260 / 60), vy = clamp(head.vy || 0, -260 / 60, 260 / 60);
    const dot = (p.vx - vx) * hit.nx + (p.vy - vy) * hit.ny;
    if (dot < 0) { p.vx -= 1.34 * dot * hit.nx; p.vy -= 1.34 * dot * hit.ny; }
    p.dragRate = Math.max(p.dragRate, 1.2 / 60); p.drag = Math.exp(-p.dragRate);
    p.maxLife = Math.min(p.maxLife, p.life + 27 + Math.random() * 24);
    p.bounceCooldown = 11;
  }
  addFlybys(x, y, palette, reduced) {
    if (reduced) return;
    const count = 8, rotation = Math.random() * TAU;
    this.flybys.splice(0, Math.max(0, this.flybys.length + count - 32));
    for (let i = 0; i < count; i++) {
      const dz = .96 + .035 * (i + .5) / count, lateral = Math.sqrt(1 - dz * dz);
      const angle = i * 2.3999632297 + rotation, speed = (430 + Math.random() * 220) * this.scale;
      this.flybys.push({ x, y, z: -60, dx: Math.cos(angle) * lateral * speed,
        dy: Math.sin(angle) * lateral * speed, dz: dz * speed, drag: .25 + Math.random() * .13,
        gravity: this.gravity, wind: 3, camera: this.camera, age: -.04 - Math.random() * .11,
        duration: 1.9 + Math.random() * .6, color: palette[i % palette.length] });
    }
  }
  stepFlybys(reduced) {
    for (let i = this.flybys.length - 1; i >= 0; i--) {
      const p = this.flybys[i]; p.age += 1 / 60;
      if (reduced || p.age >= p.duration || (p.age > 0 && !projectSpark(p, p.age).visible)) this.flybys.splice(i, 1);
    }
  }
  drawForeground(ctx, sizeScale) {
    if (!ctx) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.rect(0, 0, this.width, this.height * .72); ctx.clip();
    for (const p of this.flybys) {
      if (p.age <= 0) continue;
      const point = projectSpark(p, p.age), tail = projectSpark(p, Math.max(0, p.age - .065));
      if (!point.visible || !tail.visible || point.x < -80 || point.x > this.width + 80 || point.y < -80 || point.y > this.height * .76) continue;
      let dx = point.x - tail.x, dy = point.y - tail.y;
      const cap = Math.min(1, 90 / Math.max(1, Math.hypot(dx, dy))); dx *= cap; dy *= cap;
      const intensity = burnIntensity(p.age, p.duration) * point.depthFade;
      const width = Math.min(2.5, 1.1 + point.scale * .23) * sizeScale;
      ctx.beginPath(); ctx.moveTo(point.x - dx, point.y - dy); ctx.lineTo(point.x, point.y);
      ctx.strokeStyle = p.color; ctx.globalAlpha = intensity * .14; ctx.lineWidth = width + 3; ctx.stroke();
      ctx.globalAlpha = intensity * .95; ctx.lineWidth = width; ctx.stroke();
      ctx.strokeStyle = '#fff5e4'; ctx.globalAlpha = intensity * .9; ctx.lineWidth = .65 * sizeScale;
      ctx.beginPath(); ctx.moveTo(point.x - dx * .48, point.y - dy * .48); ctx.lineTo(point.x, point.y); ctx.stroke();
      ctx.fillStyle = '#fff5e4'; ctx.beginPath();
      ctx.arc(point.x, point.y, Math.min(1.3, .6 + point.scale * .1) * sizeScale, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
