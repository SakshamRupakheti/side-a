import assert from "node:assert/strict";
import test from "node:test";
import { retryAfter } from "../server/throttle.ts";
import { providerJson } from "../server/provider-json.ts";
import { metadata, searchShows } from "../server/providers.ts";

test("limiter separates keys, bounds memory and expires the window", () => {
  assert.equal(retryAfter("one", 1, 1000), 0);
  assert.equal(retryAfter("one", 1, 1000), 59);
  for (let i = 0; i < 4095; i++) assert.equal(retryAfter("k" + i, 1, 2000), 0);
  assert.equal(retryAfter("extra", 10, 59000), 1);
  assert.equal(retryAfter("one", 1, 60000), 0);
});

test("oversized upstream data and directory outages leave manual entry available", async (t) => {
  await assert.rejects(
    providerJson(new Response("x".repeat(256 * 1024 + 1))),
    /too large/,
  );
  const http = t.mock.method(globalThis, "fetch", async (_url, opts) => {
    assert.ok(opts.signal instanceof AbortSignal);
    throw new Error("provider timeout");
  });
  const item = await metadata("https://youtu.be/jfKfPfyJRdk");
  assert.equal(item.available, false);
  assert.equal(item.duration_seconds, null);
  await assert.rejects(searchShows("music", {}), (e) => e.status === 503);
  assert.equal(http.mock.callCount(), 2);
});

test("an unapproved publisher remains a manual link on the hosted origin", async (t) => {
  const http = t.mock.method(globalThis, "fetch", () => {
    throw Error("unexpected outbound request");
  });
  const item = await metadata("https://songexploder.net/lorde", {
    BETTER_AUTH_URL: "https://fixture.example",
  });
  assert.equal(item.available, false);
  assert.equal(http.mock.callCount(), 0);
});
