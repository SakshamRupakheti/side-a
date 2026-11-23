import assert from "node:assert/strict";
import test from "node:test";
import {
  deckFrame,
  releaseTarget,
  sleeveEase,
  wrapSlot,
} from "../src/deck-motion.ts";

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

test("fast flicks coast across several slots and each animation frame uses the same depth clock", () => {
  for (const direction of [-1, 1]) {
    const start = 6 + direction * 0.4;
    const end = releaseTarget(start, direction * 0.025, count);
    assert.ok((end - start) * direction > 2);
    for (let frame = 0; frame <= 128; frame++) {
      checkFrame(start + (end - start) * sleeveEase(frame / 128));
    }
    assert.equal(checkFrame(end), wrapSlot(end, count));
  }
  assert.equal(releaseTarget(0.48, 0, count), 0);
  assert.equal(releaseTarget(0.52, 0, count), 1);
});
