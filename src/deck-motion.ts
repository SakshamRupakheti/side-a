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
    // Keep a nonzero slope at center so a tiny drag visibly moves the cover.
    const eased = depth < 0.5 ? t * (1 + t - t * t) : t * t * (3 - 2 * t);
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
