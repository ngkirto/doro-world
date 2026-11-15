// Keep these values in sync with OrangeInteraction's gravity. No rendering or DOM dependencies.
export const PRACTICE_PHYSICS = Object.freeze({
  gravity: 5.5,
  elevation: 55 * Math.PI / 180,
  aimLimit: 25 * Math.PI / 180,
  chargeSeconds: 1.2,
  minSpeed: 2,
  maxSpeed: 5,
  flightTimeout: 4,
});

export function launchVelocity(yaw, charge) {
  const p = PRACTICE_PHYSICS;
  const speed = p.minSpeed + (p.maxSpeed - p.minSpeed) * Math.max(0, Math.min(1, charge));
  const horizontal = speed * Math.cos(p.elevation);
  return { x: Math.sin(yaw) * horizontal, y: speed * Math.sin(p.elevation), z: Math.cos(yaw) * horizontal };
}

// Sweep the fruit's bottom across the heap plane; checking only the endpoint can miss a hit.
export function descendingHeapHit(previous, position, velocity, radius, bounds) {
  const plane = bounds.heapY + radius;
  if (velocity.y >= 0 || previous.y < plane || position.y > plane || previous.y <= position.y) return null;
  const t = (previous.y - plane) / (previous.y - position.y);
  const x = previous.x + (position.x - previous.x) * t;
  const z = previous.z + (position.z - previous.z) * t;
  if (x < bounds.innerMinX + radius || x > bounds.innerMaxX - radius ||
      z < bounds.innerMinZ + radius || z > bounds.innerMaxZ - radius) return null;
  return { x, y: plane, z };
}

/** Mutates position/velocity, as OrangeInteraction's physics-step callback expects.
 * Returns 'hit', 'bounce', or null. The caller owns once-per-shot scoring.
 */
export function resolvePracticeContact(previous, position, velocity, radius, bounds) {
  const hit = descendingHeapHit(previous, position, velocity, radius, bounds);
  if (hit) {
    Object.assign(position, hit);
    velocity.x = velocity.y = velocity.z = 0;
    return 'hit';
  }

  // The mound's edges are forgiving bouncy surfaces, but don't count as a score.
  const plane = bounds.heapY + radius;
  if (velocity.y < 0 && previous.y >= plane && position.y <= plane) {
    const t = (previous.y - plane) / (previous.y - position.y);
    const x = previous.x + (position.x - previous.x) * t;
    const z = previous.z + (position.z - previous.z) * t;
    if (x >= bounds.minX - radius * 0.3 && x <= bounds.maxX + radius * 0.3 &&
        z >= bounds.minZ - radius * 0.3 && z <= bounds.maxZ + radius * 0.3) {
      position.x = x; position.z = z; position.y = plane + 0.001;
      velocity.y = Math.abs(velocity.y) * 0.32;
      velocity.x *= 0.82; velocity.z *= 0.82;
      return 'bounce';
    }
  }

  // Swept expanded AABB for the planked box. It cannot be tunnelled through at low frame rates.
  const min = { x: bounds.minX - radius, y: bounds.bottomY - radius, z: bounds.minZ - radius };
  const max = { x: bounds.maxX + radius, y: bounds.topY + radius, z: bounds.maxZ + radius };
  let enter = 0, leave = 1, axis = null, normal = 0;
  const inside = ['x', 'y', 'z'].every((key) => previous[key] > min[key] && previous[key] < max[key]);
  if (inside) {
    let gap = Infinity;
    for (const key of ['x', 'y', 'z']) {
      for (const sign of [-1, 1]) {
        const distance = sign < 0 ? previous[key] - min[key] : max[key] - previous[key];
        if (distance < gap) { gap = distance; axis = key; normal = sign; }
      }
    }
    position[axis] = (normal < 0 ? min[axis] : max[axis]) + normal * 0.001;
  } else {
    for (const key of ['x', 'y', 'z']) {
      const delta = position[key] - previous[key];
      if (Math.abs(delta) < 1e-10) {
        if (previous[key] < min[key] || previous[key] > max[key]) return null;
        continue;
      }
      const a = (min[key] - previous[key]) / delta;
      const b = (max[key] - previous[key]) / delta;
      const near = Math.min(a, b), far = Math.max(a, b);
      if (near >= enter) { enter = near; axis = key; normal = delta > 0 ? -1 : 1; }
      leave = Math.min(leave, far);
      if (enter > leave) return null;
    }
    if (!axis || enter < 0 || enter > 1) return null;
    for (const key of ['x', 'y', 'z']) position[key] = previous[key] + (position[key] - previous[key]) * enter;
    position[axis] += normal * 0.001;
  }
  if (velocity[axis] * normal < 0) velocity[axis] *= -0.4;
  return 'bounce';
}
