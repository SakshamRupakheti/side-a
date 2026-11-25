import { feedQuery } from "../server/social-feed.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createTestHarness } from "wrangler";
import {
  account,
  client,
  listen,
  postcard,
  profile,
} from "./social-fixtures.mjs";
test(
  "three diaries: opt-in disclosure, social controls, moderation, deletion and timeline costs",
  { timeout: 180000 },
  async (t) => {
    const origin = "http://127.0.0.1:8787",
      server = createTestHarness({
        workers: [
          {
            configPath: "./wrangler.jsonc",
            secrets: {
              BETTER_AUTH_URL: origin,
              BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
              LOCAL_PASSWORD_AUTH: "true",
              SOCIAL_READ_LIMIT: "600",
            },
          },
        ],
      });
    t.after(() => server.close());
    await server.listen();
    await server.getWorker().applyD1Migrations("DB");
    const req = client((u, o) => server.fetch(u, o), origin),
      db = (await server.getWorker().getEnv()).DB;
    const [a, b, c] = await Promise.all(
      ["alice", "bob", "charlie"].map((n) =>
        account(req, n, randomBytes(24).toString("hex")),
      ),
    );
    const make = async (cookie, body) =>
      (await req("/me/entries", cookie, "POST", body, 201)).data.id;
    const entry = await make(a, listen),
      postPath = "/me/posts/" + entry;
    const bobEntry = await make(b, {
      ...listen,
      title: "Bob's test entry",
      shared: true,
    });
    await make(c, { ...listen, title: "Charlie's private test entry" });
    for (let i = 1; i < 20; i++)
      await make(a, { ...listen, url: "", title: "TEST DATA " + i });
    const feed = async (cookie = "", scope = "discover") =>
      (await req("/feed?scope=" + scope, cookie)).data.posts;
    assert.equal((await feed()).length, 0);
    const guard = (await req("/me/import/identities", a)).data.scope;
    const run = crypto.randomUUID();
    for (let i = 0; i < 100; i += 16) {
      const items = Array.from({ length: Math.min(16, 100 - i) }, (_, j) => ({
        provider: "youtube",
        id: String(i + j).padStart(11, "0"),
        creator: "TEST DATA",
        title: "Private import " + (i + j),
        evidence: {
          watch: 1,
          playlist: 0,
          saved: 0,
          stream: 0,
          first: null,
          last: null,
          playedMs: null,
          durationMs: null,
        },
      }));
      const batch = await req(
        "/me/import",
        a,
        "POST",
        { run, status: "want", items },
        200,
        { "X-Suni-Import-Scope": guard },
      );
      assert.ok(batch.data.outcomes.every((o) => o === "added"));
    }
    assert.equal((await req("/me/deck", a)).data.total, 120);
    assert.equal((await feed()).length, 0);
    await req("/me/profile", a, "PUT", profile("alice", true));
    await req("/me/profile", b, "PUT", profile("bob", true));
    await req(postPath, a, "PUT", postcard(1, 0, true), 409);
    let rev = 1;
    const update = async (shared, showMoment) => {
      await req("/me/entries/" + entry, a, "PUT", {
        ...listen,
        shared,
        revision: rev,
        experience: {
          ...listen.experience,
          moments: listen.experience.moments.map((m, i) => ({
            ...m,
            shared: i === 0 && showMoment,
          })),
        },
      });
      rev++;
    };
    await update(true, true);
    assert.equal((await feed()).length, 0);
    const draft = (await req(postPath, a, "PUT", postcard(rev))).data;
    assert.equal((await feed()).length, 0);
    const published = (
      await req(postPath, a, "PUT", postcard(rev, draft.revision, true))
    ).data;
    const id = published.id,
      direct = "/p/" + id;
    const visit = async (cookie = "", expected = 200) =>
      (await req(direct, cookie, "GET", undefined, expected)).data;
    assert.equal((await feed()).length, 1);
    assert.equal((await visit(b)).moments.length, 1);
    for (const result of [
      await feed(),
      await visit(),
      (await req("/people")).data,
    ])
      assert.doesNotMatch(
        JSON.stringify(result),
        /TEST PRIVATE|social-preview.invalid|history_evidence|entry_id/,
      );
    const preview = await server.fetch(origin + direct);
    assert.equal(preview.status, 200);
    assert.match(await preview.text(), /og:title/);
    assert.match(preview.headers.get("cache-control"), /no-store/);
    const toggle = async (
      cookie,
      action,
      target,
      active = true,
      expected = 200,
    ) =>
      req(
        "/me/social/" + action + "/" + target,
        cookie,
        "PUT",
        { active },
        expected,
      );
    for (let i = 0; i < 2; i++) {
      await toggle(b, "follow", "alice");
      await toggle(b, "like", id);
      await toggle(b, "bookmark", id);
    }
    assert.equal((await visit()).likes, 1);
    assert.equal((await feed(b, "following")).length, 1);
    assert.equal((await feed(b, "saved")).length, 1);
    assert.equal((await feed(c, "saved")).length, 0);
    await req("/feed?scope=saved", "", "GET", undefined, 401);
    await toggle("", "like", id, true, 401);
    await toggle(a, "follow", "alice", true, 404);
    await req("/me/social/like/" + id, b, "PUT", { active: true }, 403, {
      origin: "http://example.org",
    });
    await toggle(b, "like", id, false);
    await toggle(b, "bookmark", id, false);
    await toggle(b, "follow", "alice", false);
    assert.equal((await visit()).likes, 0);
    assert.equal((await feed(b, "following")).length, 0);
    assert.equal((await feed(b, "saved")).length, 0);
    await toggle(b, "like", id);
    await toggle(b, "bookmark", id);
    await toggle(b, "follow", "alice");
    assert.deepEqual(
      (await req("/people?q=ali")).data.people.map((p) => p.username),
      ["alice"],
    );
    assert.equal((await req("/people?q=Charlie")).data.people.length, 0);
    await req("/me/posts/" + bobEntry, a, "PUT", postcard(1, 0, true), 409);
    await req("/me/posts/" + bobEntry, a, "GET", undefined, 404);
    await req(postPath, a, "PUT", postcard(rev, 1, true), 409);
    await update(true, false);
    for (const r of [
      await visit(),
      (await feed())[0],
      (await feed(b, "following"))[0],
      (await req("/u/alice")).data.entries[0],
    ])
      assert.equal(r.moments.length, 0);
    assert.equal(
      (await req("/me/entries/" + entry, a)).data.experience.moments.length,
      2,
    );
    const hidden = async () => {
      await visit("", 404);
      assert.equal((await feed()).length, 0);
      assert.equal((await feed(b, "following")).length, 0);
      assert.equal((await feed(b, "saved")).length, 0);
      assert.equal((await req("/feed?q=Thousand")).data.posts.length, 0);
      const res = await server.fetch(origin + direct);
      assert.equal(res.status, 404);
      assert.doesNotMatch(await res.text(), /Ten Thousand Years/);
    };
    await update(false, false);
    await hidden();
    await update(true, true);
    await req("/me/profile", a, "PUT", profile("alice"));
    await hidden();
    await req("/me/profile", a, "PUT", profile("alice", true));
    await req(postPath, a, "PUT", postcard(rev, 2, false));
    await hidden();
    await req(postPath, a, "PUT", postcard(rev, 3, true));
    for (let i = 0; i < 2; i++)
      await req("/me/social/report", b, "POST", {
        kind: "post",
        target: id,
        reason: "TEST DATA moderation",
      });
    assert.equal(
      await db.prepare("SELECT count(*) FROM social_report").first("count(*)"),
      1,
    );
    await db
      .prepare("UPDATE social_post SET hidden=1 WHERE id=?")
      .bind(id)
      .run();
    await hidden();
    await db
      .prepare("UPDATE social_post SET hidden=0 WHERE id=?")
      .bind(id)
      .run();
    await toggle(b, "block", "alice");
    await visit(b, 404);
    await toggle(b, "like", id, true, 404);
    await toggle(b, "follow", "alice", true, 404);
    await req("/u/alice", b, "GET", undefined, 404);
    assert.equal((await feed(b)).length, 0);
    assert.equal((await req("/people?q=ali", b)).data.people.length, 0);
    assert.equal((await visit()).likes, 0);
    await toggle(b, "block", "alice", false);
    assert.equal((await visit(b)).bookmarked, 0);
    await req(postPath, b, "DELETE", { revision: 4 }, 409);
    await toggle(b, "like", id);
    await toggle(b, "bookmark", id);
    await req("/me/entries/" + entry, a, "DELETE", { revision: rev });
    await hidden();
    assert.equal((await req("/me/export", b)).data.social.bookmarks.length, 0);
    assert.equal(
      await db.prepare("SELECT count(*) AS n FROM social_like").first("n"),
      0,
    );
    await req("/me/posts/" + bobEntry, b, "PUT", postcard(1, 0, true));
    await req("/me/posts/" + bobEntry, b, "DELETE", { revision: 1 });
    assert.equal((await feed()).length, 0);
    // Large fixture lives only in this harness. It uses real FK relationships and listing triggers.
    const owners = await db
      .prepare("SELECT username,user_id FROM profile")
      .all();
    const ids = Object.fromEntries(
      owners.results.map((p) => [p.username, p.user_id]),
    );
    const cte =
      "WITH RECURSIVE seq(n) AS(VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<1000) ";
    await db
      .prepare(cte + "INSERT INTO media SELECT 'bulk-'||n FROM seq")
      .run();
    await db
      .prepare(
        cte +
          "INSERT INTO source SELECT 'manual','bulk-'||n,'','bulk-'||n FROM seq",
      )
      .run();
    await db
      .prepare(
        cte +
          "INSERT INTO entry(id,owner,media_id,provider,external_id,kind,title,creator,show_name,artwork,status,shared,created_at,updated_at) SELECT 'bulk-'||n,CASE WHEN n%2=0 THEN ? ELSE ? END,'bulk-'||n,'manual','bulk-'||n,'podcast','TEST DATA '||n,'Fixture','','','want',1,'2026-01-01','2026-01-01' FROM seq",
      )
      .bind(ids.alice, ids.bob)
      .run();
    await db
      .prepare(
        "INSERT INTO social_post(id,owner,entry_id,created_at,updated_at,published_at,published) SELECT id,owner,id,'2026-01-01','2026-01-01','2026-01-01T00:00:00.000Z',1 FROM entry WHERE id GLOB 'bulk-*'",
      )
      .run();
    await toggle(c, "follow", "alice");
    await toggle(c, "follow", "bob");
    for (const scope of ["discover", "following"]) {
      const seen = new Set();
      let cursor = "";
      do {
        const page = (
          await req(
            "/feed?scope=" +
              scope +
              (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
            c,
          )
        ).data;
        assert.ok(page.posts.length <= 16);
        for (const p of page.posts) {
          assert.ok(!seen.has(p.id));
          seen.add(p.id);
        }
        cursor = page.next_cursor;
      } while (cursor);
      assert.equal(seen.size, 1000);
    }
    for (const scope of ["discover", "following"]) {
      const { sql, bindings } = feedQuery({ actor: ids.charlie, scope });
      const plan = (
        await db
          .prepare("EXPLAIN QUERY PLAN " + sql)
          .bind(...bindings)
          .all()
      ).results.map((r) => r.detail);
      assert.match(
        plan.join(" "),
        scope === "discover" ? /social_timeline/ : /social_author_timeline/,
      );
      const cost = await db
        .prepare(sql)
        .bind(...bindings)
        .all();
      assert.ok(cost.meta.rows_read < 600, scope + ": " + cost.meta.rows_read);
      t.diagnostic(
        scope +
          " full page SQL rows_read=" +
          cost.meta.rows_read +
          ", rows_written=" +
          cost.meta.rows_written +
          "; " +
          plan.filter((p) => p.includes("timeline")).join(" / "),
      );
    }
    await req("/me/account", a, "DELETE", { confirmation: "DELETE" });
    assert.equal(
      await db.prepare("SELECT count(*) AS n FROM social_listing").first("n"),
      500,
    );
  },
);
