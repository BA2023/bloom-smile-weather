// Original BLOOM implementation. See FIREWORKS_REFERENCES.md for research sources.
const clamp01 = x => Math.max(0, Math.min(1, x));
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Exact integration for dv/dt = acceleration - drag * velocity.
export function motionCoefficients(drag, dt, out = {}) {
  if (!Number.isFinite(drag) || !Number.isFinite(dt) || drag < 0 || dt < 0) throw new RangeError('Invalid motion step');
  const q = drag * dt;
  out.decay = Math.exp(-q);
  if (q < 1e-4) {
    const q2 = q * q, q3 = q2 * q, q4 = q3 * q;
    out.travel = dt * (1 - q / 2 + q2 / 6 - q3 / 24 + q4 / 120);
    out.acceleration = dt * dt * (.5 - q / 6 + q2 / 24 - q3 / 120 + q4 / 720);
  } else {
    out.travel = -Math.expm1(-q) / drag;
    out.acceleration = (dt - out.travel) / drag;
  }
  return out;
}

export function advanceAxis(position, velocity, acceleration, drag, dt) {
  const c = motionCoefficients(drag, dt);
  return { position: position + velocity * c.travel + acceleration * c.acceleration,
    velocity: velocity * c.decay + acceleration * c.travel };
}

export function solveLaunchToApex(height, horizontalDistance, gravity, drag = 2.6, wind = 0) {
  if (![height, horizontalDistance, gravity, drag, wind].every(Number.isFinite) || height < 0 || gravity <= 0 || drag < 0) throw new RangeError('Invalid launch');
  if (height === 0) return { duration: 0, vx: 0, vy: 0 };
  if (drag === 0) {
    const duration = Math.sqrt(2 * height / gravity);
    return { duration, vx: (horizontalDistance - wind * duration * duration / 2) / duration, vy: -gravity * duration };
  }
  const apexHeight = t => {
    const q = drag * t;
    if (q < 1e-3) return gravity * t * t * (.5 + q / 6 + q * q / 24 + q ** 3 / 120 + q ** 4 / 720);
    return gravity * (Math.expm1(q) - q) / (drag * drag);
  };
  let lo = 0, hi = Math.sqrt(2 * height / gravity);
  for (let i = 0; i < 52; i++) {
    const mid = (lo + hi) / 2;
    if (apexHeight(mid) < height) lo = mid; else hi = mid;
  }
  const duration = (lo + hi) / 2, c = motionCoefficients(drag, duration);
  return { duration, vx: (horizontalDistance - wind * c.acceleration) / c.travel,
    vy: -gravity * Math.expm1(drag * duration) / drag };
}

// Uniform directions over a sphere, projected to x/y for the mobile main shell.
export function sphereDirection(index, count, rotation = 0) {
  if (count <= 0 || index < 0 || index >= count) throw new RangeError('Invalid sphere sample');
  const z = 1 - 2 * (index + .5) / count, radius = Math.sqrt(Math.max(0, 1 - z * z));
  const angle = index * GOLDEN_ANGLE + rotation;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z };
}

export function burnIntensity(age, duration) {
  if (duration <= 0 || age <= 0 || age >= duration) return 0;
  return Math.min(1, age / .04) * Math.pow(1 - age / duration, .62);
}

// Foreground embers have real x/y/z velocity and drag. Screen acceleration comes
// from perspective, not from growing a sprite or forcing a depth tween.
export function projectSpark(spark, age) {
  const camera = spark.camera || { x: 180, y: 250, focal: 700, near: 110 };
  if (!Number.isFinite(age) || !(camera.focal > camera.near && camera.near > 0)) throw new RangeError('Invalid projection');
  const duration = spark.duration || 2.2, t = Math.max(0, Math.min(duration, age));
  const c = motionCoefficients(spark.drag ?? .28, t), gravity = spark.gravity ?? 100, wind = spark.wind ?? 0;
  const worldX = spark.x + spark.dx * c.travel + wind * c.acceleration;
  const worldY = spark.y + spark.dy * c.travel + gravity * c.acceleration;
  const z = (spark.z ?? -70) + (spark.dz ?? 0) * c.travel;
  const distance = camera.focal - z, scale = camera.focal / Math.max(camera.near, distance);
  const fade = clamp01((distance - camera.near) / 160);
  return { x: camera.x + (worldX - camera.x) * scale,
    y: camera.y + (worldY - camera.y) * scale, z, distance, scale,
    vx: spark.dx * c.decay + wind * c.travel,
    vy: spark.dy * c.decay + gravity * c.travel, vz: (spark.dz ?? 0) * c.decay,
    depthFade: fade * fade * (3 - 2 * fade), visible: age >= 0 && age < duration && distance > camera.near };
}
