import { projectLandmark } from './geometry.js';

// Head mesh, synthetic glass avatar and impact arcs from the user-provided Gemini prototype.
export class GeminiHeadCollider {
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

export function geminiHeadEllipse(points, videoWidth, videoHeight, width, height) {
  const [forehead, chin, left, right] = points.map(p => projectLandmark(p, videoWidth, videoHeight, width, height));
  const upX = forehead.x - chin.x, upY = forehead.y - chin.y;
  let angle = Math.atan2(right.y - left.y, right.x - left.x);
  if (angle > Math.PI * .5) angle -= Math.PI;
  if (angle < -Math.PI * .5) angle += Math.PI;
  return { x: (forehead.x + chin.x + left.x + right.x) * .25 + upX * .08,
    y: (forehead.y + chin.y) * .5 + upY * .08,
    rx: Math.max(36, Math.hypot(right.x - left.x, right.y - left.y) * .58),
    ry: Math.max(46, Math.hypot(chin.x - forehead.x, chin.y - forehead.y) * .64), angle };
}
