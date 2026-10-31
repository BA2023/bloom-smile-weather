export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// object-fit: cover + CSS mirror, in stage CSS pixels (not backing-store pixels).
export function projectLandmark(point, videoWidth, videoHeight, width, height, mirror = true) {
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const x = point.x * videoWidth * scale - (videoWidth * scale - width) / 2;
  const y = point.y * videoHeight * scale - (videoHeight * scale - height) / 2;
  return { x: mirror ? width - x : x, y };
}

export function headEllipse(points, videoWidth, videoHeight, width, height) {
  const [top, bottom, left, right] = points.map(p => projectLandmark(p, videoWidth, videoHeight, width, height));
  const dx = right.x - left.x, dy = right.y - left.y;
  const roll = Math.atan2(dy, dx);
  // The mirrored left/right landmarks may invert the axis by pi; an ellipse is pi-periodic.
  return { x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 - Math.hypot(bottom.x - top.x, bottom.y - top.y) * .035,
    rx: Math.max(16, Math.hypot(dx, dy) * .59), ry: Math.max(22, Math.hypot(bottom.x - top.x, bottom.y - top.y) * .64), angle: roll };
}

export function collideEllipse(x0, y0, x1, y1, vx, vy, head, restitution = .62) {
  if (!head || head.rx <= 0 || head.ry <= 0) return null;
  const c = Math.cos(head.angle || 0), s = Math.sin(head.angle || 0);
  const local = (x, y) => ({ x: ((x - head.x) * c + (y - head.y) * s) / head.rx,
    y: (-(x - head.x) * s + (y - head.y) * c) / head.ry });
  const a = local(x0, y0), b = local(x1, y1), dx = b.x - a.x, dy = b.y - a.y;
  const qa = dx * dx + dy * dy, qb = 2 * (a.x * dx + a.y * dy), qc = a.x * a.x + a.y * a.y - 1;
  let t;
  if (qc < 0) t = 0; // Collider moved onto a particle: project it out safely.
  else {
    if (qa < 1e-12) return null;
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) return null;
    t = (-qb - Math.sqrt(disc)) / (2 * qa);
    if (t < 0 || t > 1) return null;
  }
  let px = a.x + dx * t, py = a.y + dy * t;
  const len = Math.hypot(px, py);
  if (len < 1e-6) { px = 0; py = -1; } else { px /= len; py /= len; }
  const lx = px * head.rx, ly = py * head.ry;
  let nx = px / head.rx, ny = py / head.ry;
  const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
  const worldNx = nx * c - ny * s, worldNy = nx * s + ny * c;
  const hvx = clamp(head.vx || 0, -260, 260), hvy = clamp(head.vy || 0, -260, 260);
  const dot = (vx - hvx) * worldNx + (vy - hvy) * worldNy;
  return { x: head.x + lx * c - ly * s + worldNx * 2,
    y: head.y + lx * s + ly * c + worldNy * 2,
    vx: dot < 0 ? vx - (1 + restitution) * dot * worldNx : vx,
    vy: dot < 0 ? vy - (1 + restitution) * dot * worldNy : vy,
    nx: worldNx, ny: worldNy };
}
