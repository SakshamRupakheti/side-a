import test from "node:test";
import assert from "node:assert/strict";
import { deckFrame } from "../src/deck-motion.ts";
import { anchorForChange, extendWindow } from "../src/collection-window.ts";
import {
  advance,
  boundMotion,
  defaults,
  reducedDestination,
  released,
  stopped,
} from "../src/swipe-physics.ts";

function page(start, length, total = 1025) {
  return {
    start,
    total,
    revision: 7,
    entries: Array.from({ length }, (_, i) => ({
      id: String(start + i),
      created_at: "2026-01-01T00:00:00.000Z",
    })),
  };
}
test("finite fans have distinct real covers and a single front at every tested size", () => {
  for (const size of [0, 1, 2, 3, 4, 5, 7, 20, 100, 1025]) {
    for (let pos = -0.15; pos < size + 0.2; pos += 0.25) {
      const { active, cards } = deckFrame(pos, size, {
        first: 0,
        last: size - 1,
      });
      assert.ok(cards.length <= 7);
      if (!size) {
        assert.equal(active, -1);
        assert.equal(cards.length, 0);
        continue;
      }
      assert.equal(new Set(cards.map((c) => c.index)).size, cards.length);
      assert.equal(cards.find((c) => c.layer === size).index, active);
      assert.ok(
        cards.every(
          (c) => Number.isFinite(c.clearance) && c.index >= 0 && c.index < size,
        ),
      );
    }
  }
  const [one] = deckFrame(0, 1, { first: 0, last: 0 }).cards;
  assert.equal(one.offset, 0);
  for (const c of deckFrame(3, 7, { first: 0, last: 6 }).cards) {
    const original = deckFrame(3, 7).cards[c.index];
    assert.deepEqual(c, original);
  }
});
test("older and newer keyset windows preserve absolute slots during a flick or reversal", () => {
  let window = page(1000, 25);
  for (let start = 975; start >= 0; start -= 25) {
    const selected = window.start + 2;
    const cover = window.entries[2];
    window = extendWindow(window, page(start, 25), true, selected);
    assert.equal(window.entries[selected - window.start].id, cover.id);
    assert.ok(window.entries.length <= 75);
  }
  const selected = window.start + window.entries.length - 2;
  const t = selected + 0.32;
  const before = deckFrame(t, 1025, {
    first: window.start,
    last: window.start + window.entries.length - 1,
  });
  const next = extendWindow(
    window,
    page(window.start + window.entries.length, 25),
    false,
    selected,
  );
  const after = deckFrame(t, 1025, {
    first: next.start,
    last: next.start + next.entries.length - 1,
  });
  assert.equal(before.active, after.active);
  const front = (f) => f.cards.find((c) => c.index === f.active);
  assert.deepEqual(front(before), front(after));
  assert.equal(
    extendWindow(next, { ...page(0, 25), revision: 8 }, true, selected),
    null,
  );
});
test("a finite flick crosses intermediate cards, can be caught and never wraps", () => {
  const bounds = { first: 975, last: 999 };
  let m = released(979.4, -12, defaults);
  let prior = 979;
  for (let i = 0; i < 160; i++) {
    m = boundMotion(advance(m, 1 / 60, defaults.damping), bounds);
    const current = deckFrame(m.position, 1025, bounds).active;
    assert.ok(Math.abs(current - prior) <= 1);
    prior = current;
  }
  assert.ok(prior < 979);
  const caught = stopped(m.position);
  const back = boundMotion(
    { ...caught, phase: "drag", position: caught.position + 0.2 },
    bounds,
  );
  assert.ok(back.position > caught.position);
  assert.equal(boundMotion(released(1005, 12, defaults), bounds).position, 999);
  assert.equal(
    boundMotion(
      { ...caught, phase: "drag", position: 5 },
      { first: 0, last: 0 },
    ).position,
    0,
  );
  assert.equal(reducedDestination(released(10.23, 10, defaults)), 10);
  assert.equal(
    reducedDestination({ ...stopped(10), phase: "snap", target: 11 }),
    11,
  );
});

test("edits keep the selected ID and deletion prefers the nearest surviving cover", () => {
  const recent = page(1000, 25);
  assert.equal(
    anchorForChange(recent, 1011, { kind: "edited", id: "1000" }),
    "1011",
  );
  assert.equal(
    anchorForChange(recent, 1011, { kind: "deleted", id: "1011" }),
    "1012",
  );
  assert.equal(
    anchorForChange(recent, 1024, { kind: "deleted", id: "1024" }),
    "1023",
  );
  assert.equal(
    anchorForChange(page(0, 1), 0, { kind: "deleted", id: "0" }),
    undefined,
  );
  assert.equal(
    anchorForChange(recent, 1011, { kind: "created", id: "1025" }),
    "1025",
  );
});
