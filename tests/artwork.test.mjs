import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { importBatch, importScope } from "../server/history.ts";
import { repairCover, coverStatus } from "../server/artwork.ts";
import { youtubeCover } from "../shared/artwork.ts";

function database(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync("migrations/" + f, "utf8"));
  for (const id of ["alice", "bob"])
    sqlite
      .prepare(
        "INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,0,0)",
      )
      .run(id, id, id + "@example.invalid");
  const db = {
    prepare(sql) {
      let args = [];
      const query = {
        bind(...values) {
          args = values;
          return query;
        },
        async first(key) {
          const row = sqlite.prepare(sql).get(...args);
          return (key ? row?.[key] : row) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...args) };
        },
        async run() {
          return { meta: sqlite.prepare(sql).run(...args) };
        },
      };
      return query;
    },
    async batch(queries) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const q of queries) results.push(await q.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db, sqlite };
}
const item = (provider, id) => ({
  provider,
  id,
  title: "Synthetic podcast",
  creator: "Fixture",
  evidence: {
    stream: provider === "spotify" ? 1 : 0,
    watch: provider === "youtube" ? 1 : 0,
    saved: 0,
    playlist: 0,
    first: null,
    last: null,
    playedMs: null,
    durationMs: null,
  },
});
async function save(db, owner, items) {
  return importBatch(db, owner, await importScope(owner), {
    run: crypto.randomUUID(),
    status: "want",
    items,
  });
}
test("YouTube imports construct validated covers once, repair legacy blanks, and preserve privacy/order", async (t) => {
  const { db, sqlite } = database(t);
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw Error("No upstream allowed");
  });
  await save(db, "alice", [
    item("youtube", "abcdefghijk"),
    item("youtube", "ABCDEFGHIJK"),
  ]);
  const rows = sqlite.prepare("SELECT * FROM entry ORDER BY id").all();
  assert.ok(
    rows.every(
      (r) =>
        r.artwork === youtubeCover(r.provider, r.external_id) &&
        !r.shared &&
        r.status === "want",
    ),
  );
  sqlite
    .prepare("UPDATE entry SET artwork='',cover_auto=0 WHERE id=?")
    .run(rows[0].id);
  const before = sqlite
    .prepare("SELECT * FROM entry WHERE id=?")
    .get(rows[0].id);
  assert.equal((await coverStatus(db, "alice", {})).missing, 1);
  assert.equal(
    (await repairCover(db, "bob", {}, false, rows[0].id)).processed,
    0,
  );
  assert.equal((await repairCover(db, "alice", {}, true)).processed, 0);
  assert.equal((await repairCover(db, "alice", {})).restored, 1);
  const after = sqlite
    .prepare("SELECT * FROM entry WHERE id=?")
    .get(rows[0].id);
  for (const key of Object.keys(before).filter(
    (k) => !["artwork", "artwork_auto"].includes(k),
  ))
    assert.equal(after[key], before[key], key);
  assert.equal((await repairCover(db, "alice", {})).done, true);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(youtubeCover("youtube", "../bad"), "");
  assert.equal(youtubeCover("publisher", "abcdefghijk"), "");
  assert.deepEqual(
    (await save(db, "alice", [item("youtube", "bad")])).outcomes,
    ["invalid"],
  );
  const plan = sqlite
    .prepare(
      "EXPLAIN QUERY PLAN SELECT id FROM entry WHERE owner=? AND cover_auto IN (0,1) AND artwork='' AND cover_after<=? ORDER BY cover_auto,cover_after,id LIMIT 1",
    )
    .all("alice", Date.now());
  assert.match(JSON.stringify(plan), /entry_missing_cover/);
  assert.doesNotMatch(JSON.stringify(plan), /TEMP B-TREE/);
});
test("Spotify shared cache deduplicates episodes across imports/accounts and keeps custom covers", async (t) => {
  const { db, sqlite } = database(t);
  const row = item("spotify", "0123456789012345678901");
  await save(db, "alice", [row]);
  await save(db, "bob", [row]);
  const fetch = t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url.origin + url.pathname, "https://open.spotify.com/oembed");
    return Response.json({
      title: "Fixture",
      thumbnail_url: "https://i.scdn.co/image/fixture",
    });
  });
  assert.equal((await repairCover(db, "alice", {}, true)).restored, 1);
  assert.equal((await repairCover(db, "bob", {}, true)).restored, 1);
  await save(db, "alice", [row]);
  sqlite
    .prepare(
      "UPDATE entry SET artwork='https://i.scdn.co/image/custom' WHERE owner='alice'",
    )
    .run();
  assert.equal((await repairCover(db, "alice", {})).processed, 0);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(
    sqlite.prepare("SELECT artwork FROM entry WHERE owner='alice'").get()
      .artwork,
    "https://i.scdn.co/image/custom",
  );
});
test("provider failures cool down, unsafe artwork stays blank, and retries resume without duplicates", async (t) => {
  const { db, sqlite } = database(t);
  await save(db, "alice", [item("spotify", "1123456789012345678901")]);
  let valid = false;
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      title: "Fixture",
      thumbnail_url: valid
        ? "https://i.scdn.co/image/restored"
        : "https://evil.invalid/private",
    }),
  );
  assert.equal((await repairCover(db, "alice", {})).unresolved, 1);
  assert.equal((await repairCover(db, "alice", {})).done, true);
  assert.equal((await coverStatus(db, "alice", {})).ready, 0);
  assert.equal(fetch.mock.callCount(), 1);
  valid = true;
  sqlite.exec(
    "UPDATE entry SET cover_after=0; UPDATE source SET cover_after=0; UPDATE cover_provider SET next_at=0",
  );
  assert.equal((await repairCover(db, "alice", {}, true)).restored, 1);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM entry").get().n, 1);
});
test("in-flight concurrent edits win; source cache is still reusable", async (t) => {
  const { db, sqlite } = database(t);
  await save(db, "alice", [item("spotify", "2123456789012345678901")]);
  t.mock.method(globalThis, "fetch", async () => {
    sqlite.exec(
      "UPDATE entry SET artwork='https://i.scdn.co/image/custom',note='new thought',revision=revision+1 WHERE owner='alice'",
    );
    return Response.json({
      title: "Fixture",
      thumbnail_url: "https://i.scdn.co/image/provider",
    });
  });
  assert.equal((await repairCover(db, "alice", {})).restored, 0);
  const row = sqlite.prepare("SELECT artwork,note FROM entry").get();
  assert.equal(row.artwork, "https://i.scdn.co/image/custom");
  assert.equal(row.note, "new thought");
  assert.equal((await coverStatus(db, "bob", {})).missing, 0);
});
test("publisher repair respects the production allowlist and never fetches arbitrary hosts", async (t) => {
  const { db, sqlite } = database(t);
  for (const [id, url] of [
    ["approved", "https://songexploder.net/fixture"],
    ["unapproved", "https://songexploder.net.evil.invalid/fixture"],
  ]) {
    sqlite.prepare("INSERT INTO media(id) VALUES(?)").run(id);
    sqlite
      .prepare(
        "INSERT INTO source(provider,external_id,url,media_id,cover_art) VALUES('publisher',?,?,?,?)",
      )
      .run(url, url, id, "https://songexploder.net/fixture.jpg");
    sqlite
      .prepare(
        "INSERT INTO entry(id,owner,media_id,provider,external_id,kind,title,creator,show_name,artwork,status,created_at,updated_at) VALUES(?,'alice',?,'publisher',?,'podcast','Fixture','','','','want','2026-01-01','2026-01-01')",
      )
      .run(id, id, url);
  }
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw Error("No arbitrary fetch");
  });
  const env = { BETTER_AUTH_URL: "https://suni-fixture.example" };
  assert.equal((await coverStatus(db, "alice", env)).missing, 0);
  env.PUBLISHER_METADATA_HOSTS = "songexploder.net";
  assert.equal((await coverStatus(db, "alice", env)).missing, 1);
  assert.equal((await repairCover(db, "alice", env)).restored, 1);
  assert.equal(
    sqlite.prepare("SELECT artwork FROM entry WHERE id='unapproved'").get()
      .artwork,
    "",
  );
  assert.equal(fetch.mock.callCount(), 0);
});
test("deleted Spotify media leaves the fallback and persists a failure cooldown", async (t) => {
  const { db, sqlite } = database(t);
  await save(db, "alice", [item("spotify", "4123456789012345678901")]);
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 }),
  );
  assert.equal((await repairCover(db, "alice", {})).unresolved, 1);
  assert.equal((await repairCover(db, "alice", {})).done, true);
  assert.equal(sqlite.prepare("SELECT artwork FROM entry").get().artwork, "");
  assert.equal(fetch.mock.callCount(), 1);
});
test("provider kill switch and persistent lease prevent duplicate remote calls", async (t) => {
  const { db, sqlite } = database(t);
  await save(db, "alice", [item("spotify", "3123456789012345678901")]);
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw Error("not expected");
  });
  assert.equal(
    (await repairCover(db, "alice", { DISABLE_LOOKUPS: "true" })).paused,
    true,
  );
  sqlite.prepare("UPDATE source SET cover_after=?").run(Date.now() + 20000);
  assert.equal((await repairCover(db, "alice", {})).wait, 2);
  assert.equal(fetch.mock.callCount(), 0);
});
