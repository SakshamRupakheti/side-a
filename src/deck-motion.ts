export function wrapSlot(slot: number, count: number) {
  return ((slot % count) + count) % count;
}

export function deckFrame(position: number, count: number) {
  // At an exact midpoint the higher logical slot wins, including across the seam.
  const nearest = Math.floor(position + 0.5);
  const active = wrapSlot(nearest, count);
  const cards = Array.from({ length: count }, (_, index) => {
    let offset = wrapSlot(index - active, count) - (position - nearest);
    if (offset > count / 2) offset -= count;
    const depth = Math.abs(offset);
    // Guide only the inner pair past each other's edges at the handoff.
    // Integer slots retain the original fan geometry at both breakpoints.
    const t = depth < 0.5 ? 2 * depth : Math.min(1, 2 * depth - 1);
    const eased = t * t * (3 - 2 * t);
    const side = Math.sign(offset);
    const stride = depth >= 1 ? offset : depth < 0.5 ? 0 : side * eased;
    const clearance = depth >= 1 ? 0 : side * (depth < 0.5 ? eased : 1 - eased);
    return { index, offset, depth, stride, clearance, layer: 0 };
  });
  const ordered = [...cards].sort(
    (a, b) => a.depth - b.depth || b.offset - a.offset,
  );
  ordered.forEach((card, rank) => {
    card.layer = count - rank;
  });
  return { active, cards };
}

export function releaseTarget(
  position: number,
  velocity: number,
  count: number,
) {
  // Velocity is measured in slots per millisecond. Keep a flick shorter than a lap.
  const limit = Math.floor(count / 2);
  const coast = Math.max(-limit, Math.min(limit, velocity * 155));
  return Math.floor(position + coast + 0.5);
}

// CSS cubic-bezier(.2, .88, .22, 1.07), sampled on the shared position clock.
export function sleeveEase(time: number) {
  if (time <= 0 || time >= 1) return time;
  function cubic(t: number, a: number, b: number) {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  }
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (cubic(mid, 0.2, 0.22) < time) lo = mid;
    else hi = mid;
  }
  return cubic((lo + hi) / 2, 0.88, 1.07);
}
