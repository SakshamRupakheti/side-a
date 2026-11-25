import { feedQuery, wallQuery } from "../server/social-feed.ts";
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
              DISABLE_LOOKUPS: "true",
            },
          },
        ],
      });
    t.after(() => server.close());
    await server.listen();
    await server.getWorker().applyD1Migrations("DB");
    const req = client((u, o) => server.fetch(u, o), origin),
      db = (await server.getWorker().getEnv()).DB;
    const start = performance.now();
    await req("/session");
    t.diagnostic(
      "first cookie-free /session local harness round trip " +
        (performance.now() - start).toFixed(1) +
        " ms",
    );
    const [a, b, c] = await Promise.all(
      ["alice", "bob", "charlie"].map((n) =>
        account(req, n, randomBytes(24).toString("hex")),
      ),
    );
    for (const cookie of ["", a]) {
      const samples = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await req("/session", cookie);
        samples.push(performance.now() - start);
      }
      samples.sort((x, y) => x - y);
      t.diagnostic(
        `local /session ${cookie ? "signed-in" : "guest"} 10 sequential requests median ${samples[5].toFixed(1)} ms, max ${samples[9].toFixed(1)} ms elapsed`,
      );
    }
    const wall = async (section = "ranked", cookie = "", after = "") =>
      (
        await req(
          "/wall/" +
            section +
            (after ? "?after=" + encodeURIComponent(after) : ""),
          cookie,
        )
      ).data;
    assert.deepEqual(await wall(), { people: [], next: null });
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
    assert.deepEqual((await wall()).people, []);
    const fresh = await wall("fresh");
    assert.deepEqual(
      fresh.people.map((p) => p.badges),
      [["first_signal"]],
    );
    assert.doesNotMatch(
      JSON.stringify(fresh),
      /TEST PRIVATE|social-preview.invalid|history_evidence|entry_id|user_id/,
    );
    await req("/me/profile", a, "PUT", {
      ...profile("alice", true),
      leaderboard_opt_in: true,
    });
    assert.deepEqual(
      (await wall()).people.map((p) => p.username),
      ["alice"],
    );
    assert.equal((await wall("ranked", a)).people.length, 0);
    await req("/me/profile", a, "PUT", {
      ...profile("alice", true),
      leaderboard_opt_in: false,
    });
    assert.equal((await wall()).people.length, 0);
    assert.equal((await wall("fresh")).people.length, 1);
    await req("/me/profile", a, "PUT", {
      ...profile("alice", true),
      leaderboard_opt_in: true,
    });
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
      assert.equal((await wall()).people.length, 0);
      assert.equal((await wall("fresh")).people.length, 0);
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
    assert.equal((await req("/me/export", b)).data.social.reports[0].post, id);
    assert.equal((await req("/me/export", a)).data.social.reports.length, 0);
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
    for (const section of ["ranked", "fresh"]) {
      assert.equal((await wall(section, b)).people.length, 0);
      await req("/me/profile", b, "PUT", {
        ...profile("bob", true),
        leaderboard_opt_in: true,
      });
      await req("/me/posts/" + bobEntry, b, "PUT", postcard(1, 0, true));
      assert.equal((await wall(section, a)).people.length, 0);
      await req("/me/posts/" + bobEntry, b, "DELETE", { revision: 1 });
    }
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
          "INSERT INTO source(provider,external_id,url,media_id) SELECT 'manual','bulk-'||n,'','bulk-'||n FROM seq",
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
    // The 500 published podcast cards per author share no show or caption yet.
    const aliceBadges = async () =>
      (await wall()).people.find((p) => p.username === "alice").badges;
    assert.deepEqual(await aliceBadges(), ["first_signal", "sound_collector"]);
    const changeEntry = (n, set) =>
      db
        .prepare("UPDATE entry SET " + set + " WHERE id=?")
        .bind("bulk-" + n)
        .run();
    for (const n of [2, 4]) await changeEntry(n, "show_name='Signal'");
    assert.ok(!(await aliceBadges()).includes("deep_dive"));
    await changeEntry(6, "show_name=' signal '");
    assert.ok((await aliceBadges()).includes("deep_dive"));
    await changeEntry(8, "show_name='Two'");
    assert.ok(!(await aliceBadges()).includes("explorer"));
    await changeEntry(10, "show_name='Three'");
    assert.ok((await aliceBadges()).includes("explorer"));
    for (const n of [2, 4, 6]) await changeEntry(n, "takeaway='Public text'");
    assert.ok(!(await aliceBadges()).includes("thought_collector"));
    await db
      .prepare(
        "UPDATE social_post SET include_takeaway=1 WHERE id IN ('bulk-2','bulk-4')",
      )
      .run();
    assert.ok(!(await aliceBadges()).includes("thought_collector"));
    await db
      .prepare("UPDATE social_post SET caption='Shared' WHERE id='bulk-6'")
      .run();
    assert.equal((await aliceBadges()).length, 5);
    await changeEntry(2, "takeaway=''");
    assert.ok(!(await aliceBadges()).includes("thought_collector"));
    await changeEntry(6, "kind='audiobook'");
    assert.ok(!(await aliceBadges()).includes("deep_dive"));
    await db
      .prepare(
        "UPDATE social_post SET published=0 WHERE owner=? AND id NOT IN ('bulk-2','bulk-4','bulk-8','bulk-10','bulk-12','bulk-14','bulk-16','bulk-18','bulk-20','bulk-22')",
      )
      .bind(ids.alice)
      .run();
    assert.ok((await aliceBadges()).includes("sound_collector"));
    await db.prepare("DELETE FROM social_post WHERE id='bulk-22'").run();
    assert.ok(!(await aliceBadges()).includes("sound_collector"));
    await req("/me/account", a, "DELETE", { confirmation: "DELETE" });
    assert.equal(
      await db.prepare("SELECT count(*) AS n FROM social_listing").first("n"),
      500,
    );
    await req("/me/profile", b, "PUT", {
      ...profile("bob", true),
      leaderboard_opt_in: false,
    });
    const seed = async (start, end) => {
      const seq = `WITH RECURSIVE seq(n) AS(VALUES(${start}) UNION ALL SELECT n+1 FROM seq WHERE n<${end}),
        fixture AS (SELECT printf('voice%04d',n) AS id FROM seq) `;
      // Share one real media identity across synthetic diaries; each owner publishes once.
      const statements = [
        "INSERT INTO user SELECT id,id,id||'@fixture.invalid',1,NULL,1,1 FROM fixture",
        "INSERT INTO profile(user_id,username,display_name,published,leaderboard_opt_in) SELECT id,id,id,1,1 FROM fixture",
        "INSERT INTO entry(id,owner,media_id,provider,external_id,kind,title,creator,show_name,artwork,status,shared,created_at,updated_at) SELECT id,id,'bulk-1','manual','bulk-1','podcast','Fixture','Fixture','Show','','want',1,'x','x' FROM fixture",
        "INSERT INTO social_post(id,owner,entry_id,created_at,updated_at,published_at,published) SELECT id,id,id,'x','x','2026-01-01T00:00:00.000Z',1 FROM fixture",
      ];
      await db.batch(statements.map((s) => db.prepare(seq + s)));
    };
    await seed(1, 10);
    assert.equal((await wall()).people.length, 10);
    await seed(11, 1001);
    await req("/wall/ranked?after=invalid", "", "GET", undefined, 400);
    for (const section of ["ranked", "fresh"]) {
      let after = "",
        names = [];
      do {
        const page = await wall(section, c, after);
        assert.ok(page.people.length <= 12);
        names.push(...page.people.map((p) => p.username));
        after = page.next;
      } while (after);
      assert.equal(new Set(names).size, section === "ranked" ? 1001 : 1002);
      if (section === "ranked")
        assert.deepEqual(names, [...new Set(names)].sort());
      for (const cursor of [
        [],
        section === "ranked"
          ? [-1, "voice0900"]
          : ["2026-01-01T00:00:00.000Z", "voice0100"],
      ]) {
        const sql = wallQuery(section === "fresh", !!cursor.length);
        const bindings = [ids.charlie, ...cursor];
        const plan = (
          await db
            .prepare("EXPLAIN QUERY PLAN " + sql)
            .bind(...bindings)
            .all()
        ).results
          .map((r) => r.detail)
          .join(" ");
        assert.match(plan, section === "ranked" ? /wall_rank/ : /wall_fresh/);
        const { meta, results } = await db
          .prepare(sql)
          .bind(...bindings)
          .all();
        assert.ok(meta.rows_read < 350, section + " rows " + meta.rows_read);
        t.diagnostic(
          `${section} ${cursor.length ? "deep" : "first"} SQL: ${meta.rows_read} read, ${meta.rows_written} written, ${JSON.stringify(results).length} raw JSON characters`,
        );
      }
    }
    const write = await db
      .prepare("UPDATE social_post SET caption='Shared' WHERE id='voice0001'")
      .run();
    t.diagnostic(
      `caption edit SQL: ${write.meta.rows_read} read, ${write.meta.rows_written} written`,
    );
    assert.deepEqual(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
      [],
    );
    assert.equal(
      await db
        .prepare("SELECT count(*) n FROM wall_show WHERE owner=?")
        .bind(ids.alice)
        .first("n"),
      0,
    );
  },
);
