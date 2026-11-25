import {
  advance,
  defaults,
  inputSpeed,
  recordSample,
  released,
} from "../src/swipe-physics.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { deckFrame, wrapSlot } from "../src/deck-motion.ts";

const count = 7;
function checkFrame(position) {
  const { active, cards } = deckFrame(position, count);
  const front = cards[active];
  assert.equal(front.layer, count);
  assert.equal(front.depth, Math.min(...cards.map((card) => card.depth)));
  assert.equal(new Set(cards.map((card) => card.layer)).size, count);
  return active;
}

test("every drag frame has one nearest foreground, including reverse and seam crossings", () => {
  for (let tick = -2048; tick <= 2048; tick++) {
    const position = tick / 128;
    checkFrame(position);
    checkFrame(-position);
  }
  for (let slot = -count; slot <= count; slot++) {
    assert.equal(checkFrame(slot + 0.5 - 1e-8), wrapSlot(slot, count));
    assert.equal(checkFrame(slot + 0.5), wrapSlot(slot + 1, count));
    assert.equal(checkFrame(slot + 0.5 + 1e-8), wrapSlot(slot + 1, count));
    for (const card of deckFrame(slot, count).cards) {
      assert.equal(card.stride, card.offset);
      assert.equal(Math.abs(card.clearance), 0);
    }
  }
});

test("glides cross intermediate slots in order at different frame rates", () => {
  for (const hz of [30, 60, 120]) {
    for (const sign of [-1, 1]) {
      let m = released(6.4, sign * 10, defaults),
        changes = 0,
        front = checkFrame(m.position);
      for (let i = 0; i < 3 * hz && m.phase !== "rest"; i++) {
        m = advance(m, 1 / hz, defaults.damping);
        const next = checkFrame(m.position);
        if (next !== front) {
          assert.equal(next, wrapSlot(front + sign, count));
          changes++;
          front = next;
        }
      }
      assert.equal(m.phase, "rest");
      assert.ok(changes >= 2);
      assert.equal(
        m.position,
        Math.round(6.4 + (sign * 10) / defaults.damping),
      );
    }
  }
});
test("tiny drags translate the front cover immediately and both surfaces clear the midpoint", () => {
  const front = deckFrame(0.01, count).cards[0];
  assert.ok(Math.abs(front.clearance) > 0.019);
  const pair = deckFrame(0.5, count).cards;
  assert.equal(pair[0].clearance, -1);
  assert.equal(pair[1].clearance, 1);
});
test("pause, reversal and release settings affect the actual physical state", () => {
  const samples = [];
  for (const [x, t] of [
    [80, 0],
    [60, 10],
    [40, 20],
    [50, 30],
  ])
    recordSample(samples, x, t);
  assert.equal(inputSpeed(samples, 30, 100), -10);
  assert.equal(inputSpeed(samples, 120, 100), 0);
  assert.equal(released(0.2, 10, { ...defaults, momentum: 0 }).phase, "snap");
  const start = released(0.2, 6, defaults);
  assert.ok(advance(start, 0.1, 3).position > advance(start, 0.1, 8).position);
  const once = advance(start, 0.65, 4),
    twice = advance(advance(start, 0.4, 4), 0.25, 4);
  assert.ok(Math.abs(once.position - twice.position) < 1e-9);
});
