import assert from "node:assert/strict";
import test from "node:test";
import {
  clockTime,
  reflectionPrompt,
  timestampSeconds,
  momentDestination,
} from "../shared/experience.ts";
import { metadata } from "../server/providers.ts";

test("reflection uses only the supplied duration and timestamps link to valid YouTube sources", () => {
  for (const [duration, expected] of [
    [null, "What stayed with you?"],
    [10800, "Of these 3 hours, what stayed with you?"],
    [2700, "Of these 45 minutes, what stayed with you?"],
    [8280, "Of these 2 hours and 18 minutes, what stayed with you?"],
  ])
    assert.equal(reflectionPrompt(duration), expected);
  assert.equal(clockTime(5070), "01:24:30");
  assert.equal(timestampSeconds("01:24:30"), 5070);
  assert.equal(timestampSeconds("01:60:30"), null);
  const url = "https://www.youtube.com/watch?v=jfKfPfyJRdk";
  assert.equal(momentDestination(url, "01:24:30"), url + "&t=5070s");
  assert.equal(momentDestination(url, ""), null);
  assert.equal(
    momentDestination("https://songexploder.net/example", "01:24:30"),
    null,
  );
});
test("authenticated YouTube metadata imports real duration and original description", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    assert.equal(url.origin, "https://www.googleapis.com");
    assert.equal(opts.headers["X-Goog-Api-Key"], "test");
    return Response.json({
      items: [
        {
          snippet: {
            title: "A documentary",
            description: "Synopsis",
            channelTitle: "Channel",
          },
          contentDetails: { duration: "PT2H18M" },
        },
      ],
    });
  });
  const r = await metadata("https://youtu.be/jfKfPfyJRdk", {
    YOUTUBE_DATA_API_KEY: "test",
  });
  assert.equal(r.source_description, "Synopsis");
  assert.equal(r.duration_seconds, 8280);
  assert.equal(r.creator, "Channel");
});
test("Spotify converts supplied milliseconds and leaves unavailable metadata blank", async (t) => {
  let available = true;
  t.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).includes("/api/token"))
      return Response.json({ access_token: "test" });
    if (String(url).includes("api.spotify.com/v1/episodes/"))
      return Response.json({
        name: "Episode",
        description: "Publisher description",
        show: { publisher: "Creator" },
        duration_ms: available ? 2700000 : undefined,
      });
    throw new Error("Unexpected destination");
  });
  const env = { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "test" };
  const url = "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5";
  const r = await metadata(url, env);
  assert.equal(r.duration_seconds, 2700);
  assert.equal(r.source_description, "Publisher description");
  assert.equal(r.creator, "Creator");
  available = false;
  assert.equal((await metadata(url, env)).duration_seconds, null);
});
