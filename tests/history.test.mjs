import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BlobWriter,
  TextReader,
  ZipWriter,
} from "@zip.js/zip.js/index-native.js";
import { organizeFiles } from "../src/history-files.ts";
import {
  initialProgress,
  ImportFailure,
  runHistory,
} from "../src/history-job.ts";

const sid = "0".repeat(21) + "1",
  vid = "abcDEF_1234";
const track = {
  episode_name: "A real episode",
  episode_show_name: "Field Notes",
  spotify_episode_uri: "spotify:episode:" + sid,
  ms_played: 3000,
  ts: "2024-02-03T10:00:00Z",
  ip_addr: "sensitive-placeholder",
};
const watch = (title, id = vid, channel = "Raj Shamani") => ({
  title: "Watched " + title,
  titleUrl: "https://www.youtube.com/watch?v=" + id,
  subtitles: [{ name: channel }],
  time: "2024-06-02T09:00:00Z",
});
const json = (name, rows) => new File([JSON.stringify(rows)], name);
async function zip(entries) {
  const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false });
  for (const [name, s] of entries) await writer.add(name, new TextReader(s));
  return new File([await writer.close()], "history.zip");
}

test("organizes Spotify extended exports and multiple files without retaining raw fields", async () => {
  assert.deepEqual(await organizeFiles([json("StreamingHistory.json", [])]), {
    scanned: 0,
    other: 0,
    unknown: 0,
    items: [],
  });
  const archive = await zip([
    [
      "Spotify Extended Streaming History/Streaming_History_Audio_2024_1.json",
      JSON.stringify([
        track,
        { spotify_track_uri: "spotify:track:music" },
        null,
      ]),
    ],
    ["account.json", "private account data"],
  ]);
  const r = await organizeFiles([
    archive,
    json("endsong_0.json", [track, { ...track, ts: "2024-02-04T10:00:00Z" }]),
  ]);
  assert.equal(r.scanned, 5);
  assert.equal(r.other, 1);
  assert.equal(r.unknown, 1);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].confidence, "recognized");
  assert.equal(r.items[0].evidence.stream, 2);
  assert.equal(r.items[0].evidence.playedMs, 6000);
  assert.doesNotMatch(
    JSON.stringify(r),
    /sensitive-placeholder|ip_addr|account data/,
  );
});
test("distinguishes Takeout watch, playlist and saved evidence across HTML, JSON and CSV", async () => {
  const html =
    '<html><body><div class="content-cell">Watched <a href="https://www.youtube.com/watch?v=' +
    vid +
    '">Figuring Out Episode 10</a><br><a href="https://www.youtube.com/channel/a">Raj Shamani</a><br>Jun 2, 2024, 9:00:00 AM UTC</div><script type="text/plain">unrelated private text</script></body></html>';
  const file = await zip([
    ["Takeout/YouTube and YouTube Music/history/watch-history.html", html],
    [
      "Takeout/YouTube and YouTube Music/playlists/Watch later-videos.csv",
      "Video ID,Time Added\r\n" + vid + ",2024-06-10T00:00:00Z",
    ],
    [
      "Takeout/YouTube and YouTube Music/playlists/Science-videos.csv",
      "Video ID,Time Added\n" + vid + ",2024-06-10T00:00:00Z",
    ],
  ]);
  const r = await organizeFiles([
    file,
    json("watch-history.json", [watch("Figuring Out Episode 10")]),
  ]);
  assert.equal(r.scanned, 4);
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.items[0].evidence, {
    stream: 0,
    watch: 1,
    playlist: 1,
    saved: 1,
    first: "2024-06-02T09:00:00.000Z",
    last: "2024-06-10T00:00:00.000Z",
    playedMs: null,
    durationMs: null,
  });
  assert.doesNotMatch(JSON.stringify(r), /unrelated private text/);
});
test("creator aliases, learned channels, ordinary videos and missing identifiers", async () => {
  const rows = [
    "Figuring Out",
    "BeerBiceps",
    "The Ranveer Show",
    "Sushant Pradhan Podcast",
    "ON AIR",
    "Sanjay Silwal Gupta",
  ].map((n, i) =>
    watch("Podcast episode 5", "A" + String(i).padStart(10, "0"), n),
  );
  const extra = [
    "Episode 14",
    "Episode 15",
    "History of transit",
    "Official music video",
  ].map((t, i) => watch(t, "B" + String(i).padStart(10, "0"), "Local creator"));
  rows.push(
    ...extra,
    watch("Normal outing", "C0000000000", "Family"),
    watch("Deleted video", "D0000000000"),
    { title: "Missing ID" },
  );
  const r = await organizeFiles([json("watch-history.json", rows)]);
  assert.equal(r.items.filter((i) => i.confidence === "recognized").length, 6);
  assert.equal(r.items.filter((i) => i.confidence === "review").length, 3);
  assert.equal(r.other, 2);
  assert.equal(r.unknown, 2);
});
test("rejects malformed, oversized, unsafe, unrelated and over-expanding inputs", async () => {
  for (const f of [
    new File(["example"], "irrelevant.txt"),
    new File(["incomplete"], "google.zip"),
    new File(["[{},]"], "watch-history.json"),
    json("watch-history.json", [{ title: "x".repeat(70000) }]),
    await zip([["../endsong.json", "[]"]]),
    await zip([["other/file.txt", "ordinary"]]),
    await zip([["endsong.json", " ".repeat(1024 * 1024)]]),
  ])
    await assert.rejects(() => organizeFiles([f]));
});
test("organizes ten thousand activity records", async (t) => {
  const f = json(
    "endsong_0.json",
    Array.from({ length: 10000 }, (_, i) => ({
      ...track,
      spotify_episode_uri: "spotify:episode:" + String(i).padStart(22, "0"),
    })),
  );
  const start = performance.now();
  const r = await organizeFiles([f]);
  assert.equal(r.items.length, 10000);
  t.diagnostic(
    "10,000 unique Spotify episodes / " +
      f.size +
      " bytes organized in " +
      Math.round(performance.now() - start) +
      " ms",
  );
});
test("retries with backoff, checkpoints only confirmed batches and resumes at a batch boundary", async () => {
  const job = {
    run: crypto.randomUUID(),
    items: Array.from({ length: 36 }, (_, i) => i),
    status: "want",
    scope: "test",
  };
  let fail = true;
  const offsets = [],
    delays = [],
    batches = [];
  const send = async ({ items }) => {
    batches.push(items[0]);
    if (fail) {
      fail = false;
      throw new ImportFailure("rate limited", 429, 2);
    }
    return {
      outcomes: items.map((i) =>
        i === 19 ? "invalid" : i === 20 ? "existing" : "added",
      ),
    };
  };
  const opts = {
    send,
    wait: async (ms) => {
      delays.push(ms);
    },
    paused: () => offsets.length === 1,
    checkpoint: async (p) => {
      offsets.push(p.offset);
    },
  };
  const first = await runHistory(job, initialProgress, opts);
  assert.equal(first.offset, 16);
  const end = await runHistory(job, first, { ...opts, paused: () => false });
  assert.deepEqual(batches, [0, 0, 16, 32]);
  assert.deepEqual(delays, [2000]);
  assert.deepEqual(end, { offset: 36, added: 34, existing: 1, invalid: 1 });
  await assert.rejects(
    () =>
      runHistory(job, initialProgress, {
        ...opts,
        paused: () => false,
        send: async () => ({ outcomes: [] }),
      }),
    /Unconfirmed/,
  );
});
