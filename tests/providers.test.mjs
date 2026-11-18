import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { metadata, searchShows } from "../server/providers.ts";

test("Spotify lookup uses a fixed endpoint and the canonical episode URL", async (t) => {
  const canonical = "https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5";
  const http = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.origin + url.pathname, "https://open.spotify.com/oembed");
    assert.equal(url.searchParams.get("url"), canonical);
    assert.equal(options.redirect, "manual");
    return Response.json({
      title: "Episode",
      thumbnail_url: "https://i.scdn.co/image/example",
    });
  });
  const item = await metadata(canonical + "?si=example");
  assert.equal(item.url, canonical);
  assert.equal(item.title, "Episode");
  assert.equal(item.artwork, "https://i.scdn.co/image/example");
  assert.equal(item.creator, "");
  assert.equal(
    (await metadata("https://publisher.example/episode")).available,
    false,
  );
  assert.equal(http.mock.callCount(), 1);
});

test("unavailable metadata preserves the source for manual entry", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://publisher.example" },
      }),
  );
  const item = await metadata("https://youtu.be/jfKfPfyJRdk");
  assert.equal(item.available, false);
  assert.equal(item.url, "https://www.youtube.com/watch?v=jfKfPfyJRdk");
});

test("Podcast Index signs search and switches to a keyless directory if needed", async (t) => {
  const env = {
    PODCAST_INDEX_KEY: "test-key",
    PODCAST_INDEX_SECRET: "test-secret",
  };
  let upstreamAvailable = true;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.hostname === "api.podcastindex.org") {
      assert.equal(url.pathname, "/api/1.0/search/byterm");
      assert.equal(url.searchParams.get("q"), "music");
      const expected = createHash("sha1")
        .update("test-keytest-secret" + options.headers["X-Auth-Date"])
        .digest("hex");
      assert.equal(options.headers.Authorization, expected);
      assert.equal(options.headers["X-Auth-Key"], "test-key");
      return upstreamAvailable
        ? Response.json({
            feeds: [
              {
                title: "Show",
                author: "Creator",
                link: "https://publisher.example/show",
              },
            ],
          })
        : new Response(null, { status: 429 });
    }
    assert.equal(url.hostname, "itunes.apple.com");
    assert.equal(options.headers, undefined);
    return Response.json({
      results: [
        {
          collectionName: "Show",
          artistName: "Creator",
          collectionViewUrl: "https://podcasts.apple.com/us/podcast/id123",
        },
      ],
    });
  });
  const primary = await searchShows("music", env);
  assert.equal(primary.source, "Podcast Index");
  assert.equal(primary.results[0].title, "Show");
  upstreamAvailable = false;
  const fallback = await searchShows("music", env);
  assert.equal(fallback.source, "Apple Podcasts");
  assert.equal(fallback.results[0].creator, "Creator");
});
