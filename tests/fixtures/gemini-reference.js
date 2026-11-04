// Frozen effects-only excerpt of the user-supplied Gemini app.js. No DOM, camera or network startup.
const P_RAIN=1,P_SPLASH=2,P_ROCKET=3,P_SPARK=4,P_IMPACT=5,POOL_CAPACITY=750,TRAIL_LENGTH=5;
const FIREWORK_PALETTES=[['#FDE047','#FBBF24','#FF2C55','#FB7185','#FFFBEB'],['#38BDF8','#7DD3FC','#C084FC','#818CF8','#F0F9FF'],['#FF2C55','#F97316','#FACC15','#34D399','#FFF1F2']];
export class ReferenceParticlePool {
  constructor(capacity = POOL_CAPACITY) {
    this.capacity = capacity;
    this.activeCount = 0;
    this.totalCollisions = 0;
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
        trailX: new Float32Array(TRAIL_LENGTH),
        trailY: new Float32Array(TRAIL_LENGTH),
        trailHead: 0,
      };
    }
  }

  acquire() {
    for (let i = 0; i < this.capacity; i++) {
      const idx = (this.cursor + i) % this.capacity;
      const slot = this.slots[idx];
      if (!slot.active) {
        this.cursor = (idx + 1) % this.capacity;
        slot.active = true;
        slot.bounceCooldown = 0;
        slot.trailHead = 0;
        return slot;
      }
    }
    const fallback = this.slots[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    fallback.bounceCooldown = 0;
    return fallback;
  }

  initTrail(p, x, y) {
    for (let t = 0; t < TRAIL_LENGTH; t++) {
      p.trailX[t] = x;
      p.trailY[t] = y;
    }
  }

  spawnRainDrop(width, height, intensity = 1.0) {
    const p = this.acquire();
    const z = 0.45 + Math.random() * 0.75;
    p.type = P_RAIN;
    p.x = Math.random() * (width + 120) - 60;
    p.y = -20 - Math.random() * 60;
    p.vx = (0.7 + Math.random() * 0.6) * z;
    p.vy = (9.5 + Math.random() * 5.5 + intensity * 2.5) * z;
    p.size = (1.15 + Math.random() * 1.15) * z;
    p.alpha = (0.32 + Math.random() * 0.48) * Math.min(1, 0.55 + intensity * 0.45);
    p.life = 0;
    p.maxLife = Math.ceil((height + 80) / p.vy) + 15;
    p.color = z > 0.85 ? '#E0F2FE' : z > 0.65 ? '#7DD3FC' : '#818CF8';
    p.gravity = 0.06 * z;
    p.drag = 0.999;
    p.zLayer = z;
    this.initTrail(p, p.x, p.y);
  }

  spawnRainSplash(x, y, nx, ny, headVx, headVy) {
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
      p.color = i % 2 === 0 ? '#BAE6FD' : '#E0E7FF';
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
    this.initTrail(p, p.x, p.y);
  }

  spawnFireworkExplosion(x, y, paletteIdx = null) {
    const palette =
      FIREWORK_PALETTES[
        paletteIdx !== null ? paletteIdx % FIREWORK_PALETTES.length : (Math.random() * FIREWORK_PALETTES.length) | 0
      ];
    const sparkCount = 56 + ((Math.random() * 18) | 0);

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
      this.initTrail(p, x, y);
    }
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
      this.initTrail(p, p.x, p.y);
    }
  }

  updateAndCollide(width, height, collider, elasticity) {
    let active = 0;
    const hasCollider = collider && collider.active;

    let cosA = 1;
    let sinA = 0;
    let rx = 1;
    let ry = 1;
    let maxRadiusSq = 0;
    if (hasCollider) {
      cosA = Math.cos(collider.angle);
      sinA = Math.sin(collider.angle);
      rx = Math.max(24, collider.rx);
      ry = Math.max(28, collider.ry);
      const maxR = Math.max(rx, ry) + 8;
      maxRadiusSq = maxR * maxR;
    }

    for (let i = 0; i < this.capacity; i++) {
      const p = this.slots[i];
      if (!p.active) continue;

      p.life++;
      if (p.life >= p.maxLife) {
        if (p.type === P_ROCKET) {
          this.spawnFireworkExplosion(p.x, p.y);
        }
        p.active = false;
        continue;
      }

      p.trailHead = (p.trailHead + 1) % TRAIL_LENGTH;
      p.trailX[p.trailHead] = p.x;
      p.trailY[p.trailHead] = p.y;

      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity;
      p.x += p.vx;
      p.y += p.vy;

      if (p.bounceCooldown > 0) p.bounceCooldown--;

      if (p.x < -80 || p.x > width + 80 || p.y > height + 60) {
        p.active = false;
        continue;
      }

      if (hasCollider && p.bounceCooldown === 0 && (p.type === P_SPARK || p.type === P_RAIN)) {
        const dx = p.x - collider.x;
        const dy = p.y - collider.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < maxRadiusSq) {
          const localX = dx * cosA + dy * sinA;
          const localY = -dx * sinA + dy * cosA;

          const normX = localX / rx;
          const normY = localY / ry;
          const ellipseDistSq = normX * normX + normY * normY;

          if (ellipseDistSq <= 1.0 && ellipseDistSq > 0.0001) {
            const invDist = 1 / Math.sqrt(ellipseDistSq);
            const surfLocalX = localX * invDist * 1.02;
            const surfLocalY = localY * invDist * 1.02;

            p.x = collider.x + (surfLocalX * cosA - surfLocalY * sinA);
            p.y = collider.y + (surfLocalX * sinA + surfLocalY * cosA);

            let lnx = surfLocalX / (rx * rx);
            let lny = surfLocalY / (ry * ry);
            const nLen = Math.hypot(lnx, lny) || 1;
            lnx /= nLen;
            lny /= nLen;

            const nx = lnx * cosA - lny * sinA;
            const ny = lnx * sinA + lny * cosA;

            const impactAngle = Math.atan2(surfLocalY / ry, surfLocalX / rx);
            collider.registerImpact(impactAngle, p.type === P_SPARK ? '#FDE047' : '#38BDF8');

            if (p.type === P_RAIN) {
              this.spawnRainSplash(p.x, p.y, nx, ny, collider.vx, collider.vy);
              p.active = false;
              this.totalCollisions++;
              continue;
            } else if (p.type === P_SPARK) {
              const vDotN = p.vx * nx + p.vy * ny;
              if (vDotN < 0) {
                const restitution = elasticity;
                p.vx = p.vx - (1 + restitution) * vDotN * nx + collider.vx * 1.25;
                p.vy = p.vy - (1 + restitution) * vDotN * ny + collider.vy * 1.25 - 0.9;
              } else {
                p.vx += nx * 3.0 + collider.vx;
                p.vy += ny * 3.0 + collider.vy;
              }

              p.bounceCooldown = 6;
              p.life = Math.max(0, p.life - 10);
              p.color = '#FEF08A';
              this.totalCollisions++;

              this.spawnHeadCollisionBurst(p.x, p.y, nx, ny, collider.speed);
            }
          }
        }
      }

      active++;
    }

    this.activeCount = active;
  }

  render(ctx) {
    ctx.save();
    ctx.lineCap = 'round';

    for (let i = 0; i < this.capacity; i++) {
      const p = this.slots[i];
      if (!p.active) continue;

      const progress = p.life / p.maxLife;
      const tailIdx = (p.trailHead + 1) % TRAIL_LENGTH;
      const tx = p.trailX[tailIdx];
      const ty = p.trailY[tailIdx];

      if (p.type === P_RAIN) {
        ctx.globalCompositeOperation = 'source-over';
        const fade = Math.sin(progress * Math.PI);
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = p.alpha * (0.5 + 0.5 * fade);
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * 1.8, p.y - p.vy * 1.8);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if (p.type === P_SPLASH) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.color;
        ctx.globalAlpha = (1 - progress) * p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - progress * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === P_ROCKET) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 1.15, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === P_SPARK || p.type === P_IMPACT) {
        ctx.globalCompositeOperation = 'lighter';
        const easeOut = 1 - progress * progress;
        const twinkle = p.type === P_SPARK ? 0.72 + 0.28 * Math.sin(p.life * 0.45 + p.twinklePhase) : 1;
        const alpha = easeOut * p.alpha * twinkle;

        ctx.strokeStyle = p.color;
        ctx.globalAlpha = alpha * 0.78;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha * 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = alpha * 0.95;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

// ============================================================================
// 2. SPATIAL HEAD COLLIDER (WITH LERP INTERPOLATION & IMPACT SHOCKWAVE RING)
// ============================================================================
export class ReferenceHeadCollider {
  constructor() {
    this.active = true;
    this.targetX = 0;
    this.targetY = 0;
    this.targetRx = 78;
    this.targetRy = 98;
    this.targetAngle = 0;

    this.x = 0;
    this.y = 0;
    this.rx = 78;
    this.ry = 98;
    this.angle = 0;

    this.vx = 0;
    this.vy = 0;
    this.speed = 0;

    this.impacts = new Array(16);
    for (let i = 0; i < 16; i++) {
      this.impacts[i] = { active: false, angle: 0, life: 0, maxLife: 20, color: '#FDE047' };
    }
    this.impactCursor = 0;
  }

  resetCenter(width, height) {
    this.x = this.targetX = width * 0.5;
    this.y = this.targetY = height * 0.52;
    const baseScale = Math.min(width, height);
    this.rx = this.targetRx = baseScale * 0.175;
    this.ry = this.targetRy = baseScale * 0.225;
    this.angle = this.targetAngle = 0;
  }

  updateFromLandmarks(landmarks, mapToCanvas) {
    const forehead = mapToCanvas(landmarks[10]);
    const chin = mapToCanvas(landmarks[152]);
    const leftCheek = mapToCanvas(landmarks[234]);
    const rightCheek = mapToCanvas(landmarks[454]);

    const midX = (forehead.x + chin.x + leftCheek.x + rightCheek.x) * 0.25;
    const midY = (forehead.y + chin.y) * 0.5;
    const upVecX = forehead.x - chin.x;
    const upVecY = forehead.y - chin.y;

    this.targetX = midX + upVecX * 0.08;
    this.targetY = midY + upVecY * 0.08;

    const faceWidth = Math.hypot(rightCheek.x - leftCheek.x, rightCheek.y - leftCheek.y);
    const faceHeight = Math.hypot(chin.x - forehead.x, chin.y - forehead.y);

    this.targetRx = Math.max(36, faceWidth * 0.58);
    this.targetRy = Math.max(46, faceHeight * 0.64);

    this.targetAngle = Math.atan2(rightCheek.y - leftCheek.y, rightCheek.x - leftCheek.x);
    if (this.targetAngle > Math.PI * 0.5) this.targetAngle -= Math.PI;
    if (this.targetAngle < -Math.PI * 0.5) this.targetAngle += Math.PI;
  }

  stepInterpolation(lerpFactor = 0.28) {
    const prevX = this.x;
    const prevY = this.y;

    this.x += (this.targetX - this.x) * lerpFactor;
    this.y += (this.targetY - this.y) * lerpFactor;
    this.rx += (this.targetRx - this.rx) * lerpFactor;
    this.ry += (this.targetRy - this.ry) * lerpFactor;
    this.angle += (this.targetAngle - this.angle) * lerpFactor;

    const instVx = this.x - prevX;
    const instVy = this.y - prevY;
    this.vx = this.vx * 0.65 + instVx * 0.35;
    this.vy = this.vy * 0.65 + instVy * 0.35;
    this.speed = Math.hypot(this.vx, this.vy);

    for (let i = 0; i < this.impacts.length; i++) {
      const imp = this.impacts[i];
      if (imp.active) {
        imp.life++;
        if (imp.life >= imp.maxLife) imp.active = false;
      }
    }
  }

  registerImpact(angle, color) {
    const imp = this.impacts[this.impactCursor];
    this.impactCursor = (this.impactCursor + 1) % this.impacts.length;
    imp.active = true;
    imp.angle = angle;
    imp.life = 0;
    imp.maxLife = 18;
    imp.color = color;
  }

  renderColliderMesh(ctx, mood, showWireframe, synthMode, smileScore, jawScore) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    if (synthMode) {
      this.renderSyntheticAvatar(ctx, mood, smileScore, jawScore);
    }

    if (showWireframe) {
      const accentColor =
        mood === 'fireworks'
          ? 'rgba(251, 191, 36, 0.55)'
          : mood === 'rain'
          ? 'rgba(56, 189, 248, 0.55)'
          : 'rgba(255, 255, 255, 0.28)';

      // Outer subtle orbital ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.rx + 12, this.ry + 12, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Dashed anatomical head ellipse collider
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.ellipse(0, 0, this.rx, this.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Solid top crown shield arc
      ctx.strokeStyle =
        mood === 'fireworks'
          ? 'rgba(255, 44, 85, 0.85)'
          : mood === 'rain'
          ? 'rgba(125, 211, 252, 0.85)'
          : 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.rx + 2, this.ry + 2, 0, -Math.PI * 0.82, -Math.PI * 0.18);
      ctx.stroke();

      // Cardinal anchor reticles (#10, #152, #234, #454)
      ctx.fillStyle = '#FFFFFF';
      const anchors = [
        [0, -this.ry],
        [0, this.ry],
        [-this.rx, 0],
        [this.rx, 0],
      ];
      for (let i = 0; i < anchors.length; i++) {
        ctx.beginPath();
        ctx.arc(anchors[i][0], anchors[i][1], 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Localized kinetic impact shockwave arcs
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.impacts.length; i++) {
      const imp = this.impacts[i];
      if (!imp.active) continue;
      const p = imp.life / imp.maxLife;
      const arcSpan = 0.24 + p * 0.36;
      const expand = p * 13;

      ctx.strokeStyle = imp.color;
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.lineWidth = 3.4 * (1 - p);
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        this.rx + expand,
        this.ry + expand,
        0,
        imp.angle - arcSpan,
        imp.angle + arcSpan
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  renderSyntheticAvatar(ctx, mood, smile, jaw) {
    // Neck & Shoulders silhouette for grounded portrait framing
    const shoulderGrad = ctx.createLinearGradient(0, this.ry * 0.85, 0, this.ry * 2.1);
    shoulderGrad.addColorStop(0, 'rgba(38, 43, 68, 0.46)');
    shoulderGrad.addColorStop(1, 'rgba(10, 12, 20, 0.0)');
    ctx.fillStyle = shoulderGrad;
    ctx.beginPath();
    ctx.ellipse(0, this.ry * 1.62, this.rx * 1.62, this.ry * 0.8, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // Ambient inner 3D glass head sphere glow
    const grad = ctx.createRadialGradient(-this.rx * 0.2, -this.ry * 0.25, this.rx * 0.08, 0, 0, this.ry * 1.05);
    if (mood === 'fireworks') {
      grad.addColorStop(0, 'rgba(255, 68, 108, 0.36)');
      grad.addColorStop(0.52, 'rgba(251, 191, 36, 0.16)');
      grad.addColorStop(1, 'rgba(15, 18, 32, 0.32)');
    } else if (mood === 'rain') {
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.36)');
      grad.addColorStop(0.58, 'rgba(129, 140, 248, 0.16)');
      grad.addColorStop(1, 'rgba(15, 18, 32, 0.32)');
    } else {
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
      grad.addColorStop(0.65, 'rgba(148, 163, 184, 0.08)');
      grad.addColorStop(1, 'rgba(15, 18, 32, 0.26)');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.rx, this.ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle 3D wireframe latitude/longitude arcs (VisionOS spatial mesh feel)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, this.rx * 0.52, this.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -this.ry * 0.08, this.rx * 0.98, this.ry * 0.24, 0, 0, Math.PI);
    ctx.stroke();

    // Soft reactive cheek highlights when smiling/laughing
    if (smile > 0.25) {
      const blushColor = mood === 'fireworks' ? 'rgba(255, 44, 85, 0.26)' : 'rgba(56, 189, 248, 0.24)';
      for (const dir of [-1, 1]) {
        const cx = dir * this.rx * 0.44;
        const cy = this.ry * 0.08;
        const bGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, this.rx * 0.24);
        bGrad.addColorStop(0, blushColor);
        bGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, this.rx * 0.24, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Expressive eyes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';

    const eyeY = -this.ry * 0.1;
    const eyeX = this.rx * 0.34;
    const eyeArch = smile * 5;

    for (const dir of [-1, 1]) {
      ctx.beginPath();
      if (smile > 0.3) {
        ctx.arc(dir * eyeX, eyeY + eyeArch * 0.5, this.rx * 0.13, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else {
        ctx.arc(dir * eyeX, eyeY, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Expressive Mouth Curve
    const mouthY = this.ry * 0.28;
    const mouthW = this.rx * (0.25 + smile * 0.22);
    const smileLift = smile * this.ry * 0.18;
    const jawDrop = jaw * this.ry * 0.24;

    ctx.beginPath();
    ctx.moveTo(-mouthW, mouthY - smileLift * 0.4);
    ctx.quadraticCurveTo(0, mouthY + smileLift, mouthW, mouthY - smileLift * 0.4);
    if (jaw > 0.18) {
      ctx.quadraticCurveTo(0, mouthY + smileLift + jawDrop, -mouthW, mouthY - smileLift * 0.4);
      ctx.fillStyle = 'rgba(255, 44, 85, 0.42)';
      ctx.fill();
    }
    ctx.stroke();
  }
}

// ============================================================================
// 3. EXPRESSION STATE MACHINE (EMA SMOOTHING + SCHMITT-TRIGGER HYSTERESIS)
// ============================================================================
export class ReferenceExpressionState {
  constructor() {
    this.smoothSmile = 0.72;
    this.smoothJaw = 0.52;
    this.alpha = 0.32;
    this.state = 'fireworks';
    this.lastFireworkTime = 0;
    this.fireworkCooldownMs = 340;
  }

  update(rawSmile, rawJaw, nowMs) {
    this.smoothSmile += (rawSmile - this.smoothSmile) * this.alpha;
    this.smoothJaw += (rawJaw - this.smoothJaw) * this.alpha;

    const s = this.smoothSmile;
    const j = this.smoothJaw;

    let nextState = this.state;

    if (this.state === 'fireworks') {
      if (s < 0.45 || j < 0.23) {
        nextState = s >= 0.28 ? 'rain' : 'neutral';
      }
    } else if (this.state === 'rain') {
      if (s > 0.52 && j > 0.30) {
        nextState = 'fireworks';
      } else if (s < 0.25) {
        nextState = 'neutral';
      }
    } else {
      if (s > 0.52 && j > 0.30) {
        nextState = 'fireworks';
      } else if (s > 0.32 && j <= 0.30) {
        nextState = 'rain';
      }
    }

    const stateChanged = nextState !== this.state;
    this.state = nextState;

    let shouldLaunchFirework = false;
    if (this.state === 'fireworks' && nowMs - this.lastFireworkTime > this.fireworkCooldownMs) {
      shouldLaunchFirework = true;
      this.lastFireworkTime = nowMs;
    }

    return {
      state: this.state,
      stateChanged,
      shouldLaunchFirework,
      smile: s,
      jaw: j,
    };
  }
}
