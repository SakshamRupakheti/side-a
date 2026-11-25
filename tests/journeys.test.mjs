import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createTestHarness } from "wrangler";

test(
  "local Worker, Better Auth and D1 complete the diary lifecycle",
  { timeout: 120000 },
  async (t) => {
    const origin = "http://127.0.0.1:8787";
    const server = createTestHarness({
      workers: [
        {
          configPath: "./wrangler.jsonc",
          secrets: {
            BETTER_AUTH_URL: origin,
            BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
            LOCAL_PASSWORD_AUTH: "true",
            GITHUB_CLIENT_ID: "test-client",
            GITHUB_CLIENT_SECRET: "test-only",
            GOOGLE_CLIENT_ID: "test-google",
            GOOGLE_CLIENT_SECRET: "test-only",
            FACEBOOK_CLIENT_ID: "test-facebook",
            FACEBOOK_CLIENT_SECRET: "test-only",
          },
        },
      ],
    });
    t.after(() => server.close());
    await server.listen();
    await server.getWorker().applyD1Migrations("DB");
    const privacyPage = await server.fetch(origin + "/privacy/");
    assert.equal(privacyPage.status, 200);
    assert.match(await privacyPage.text(), /id="delete-account"/);
    async function request(
      path,
      method = "GET",
      body,
      cookie = "",
      expected = 200,
      from = origin,
    ) {
      const res = await server.fetch(origin + "/api" + path, {
        method,
        headers: {
          Origin: from,
          Cookie: cookie,
          "Content-Type": "application/json",
          "CF-Connecting-IP": "192.0.2.100",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      assert.equal(res.status, expected, path + " " + JSON.stringify(data));
      return {
        headers: res.headers,
        data,
        cookie: res.headers
          .getSetCookie()
          .map((x) => x.split(";")[0])
          .join("; "),
      };
    }
    await request("/search?q=music", "GET", undefined, "", 401);
    await request("/me/export", "GET", undefined, "", 401);
    const password = randomBytes(20).toString("hex");
    const signup = async (name) =>
      (
        await request("/auth/sign-up/email", "POST", {
          name,
          email: name + "@example.com",
          password,
        })
      ).cookie;
    const a = await signup("mira"),
      b = await signup("noel");
    assert.ok(a);
    assert.ok(b);
    const profile = {
      username: "mira",
      display_name: "Mira",
      bio: "Listening notes",
      published: false,
      show_finished: true,
      show_shows: true,
      show_replays: true,
      show_badges: true,
    };
    await request("/me/profile", "PUT", profile, a);
    await request("/me/profile", "PUT", profile, b, 409);
    await request("/me/profile", "PUT", { ...profile, username: "noel" }, b);
    await request("/u/mira", "GET", undefined, "", 404);
    const deck = async (cookie = a, query = "") =>
      (await request("/me/deck" + query, "GET", undefined, cookie)).data;
    await request("/me/deck", "GET", undefined, "", 401);
    assert.deepEqual((await deck()).entries, []);
    assert.equal((await deck()).total, 0);
    const base = {
      url: "https://youtu.be/jfKfPfyJRdk?t=12",
      title: "A listening test",
      creator: "Fixture creator",
      artwork: "",
      kind: "podcast",
      show_name: "The show",
      status: "want",
      rating: null,
      replays: 0,
      note: "only the listener sees this",
      takeaway: "A shared idea",
      shared: false,
    };
    const {
      data: { id },
    } = await request("/me/entries", "POST", base, a, 201);
    await request(
      "/me/entries",
      "POST",
      { ...base, url: "https://www.youtube.com/watch?v=jfKfPfyJRdk" },
      a,
      409,
    );
    await request(
      "/me/entries",
      "POST",
      { ...base, title: "Noel’s private title" },
      b,
      201,
    );
    const one = await deck();
    assert.equal(one.total, 1);
    assert.equal(one.entries[0].id, id);
    assert.equal(one.entries[0].status, "want");
    assert.equal((await deck(b)).entries[0].title, "Noel’s private title");
    for (const field of [
      "experience",
      "note",
      "takeaway",
      "owner",
      "email",
      "shared",
    ])
      assert.ok(!(field in one.entries[0]));
    assert.equal(
      (await request("/me/entries/" + id, "GET", undefined, a)).data.note,
      base.note,
    );
    await request("/me/entries/" + id, "GET", undefined, b, 404);
    await request("/me/deck?anchor=" + id, "GET", undefined, b, 404);
    await request("/me/deck?direction=newer", "GET", undefined, a, 400);
    await request("/me/deck?cursor=bad", "GET", undefined, a, 400);
    const retryDraft = {
      ...base,
      url: "",
      title: "Manual retry",
      import_key: crypto.randomUUID(),
    };
    const [first, retried] = await Promise.all(
      [1, 2].map(() => request("/me/entries", "POST", retryDraft, a, 201)),
    );
    assert.equal(retried.data.id, first.data.id);
    assert.equal((await deck()).total, 2);
    assert.deepEqual(
      (await deck()).entries.map((e) => e.id),
      [id, first.data.id],
    );
    await request(
      "/me/entries",
      "POST",
      { ...retryDraft, title: "Changed" },
      a,
      409,
    );
    const separate = await request("/me/entries", "POST", retryDraft, b, 201);
    assert.notEqual(first.data.id, separate.data.id);
    await request(
      "/me/entries/" + first.data.id,
      "DELETE",
      { revision: 1 },
      b,
      409,
    );
    await request(
      "/me/entries/" + separate.data.id,
      "DELETE",
      { revision: 1 },
      b,
    );
    await request("/me/entries/" + first.data.id, "DELETE", { revision: 1 }, a);
    for (const invalid of [
      { kind: "radio" },
      { note: "a".repeat(8001) },
      { artwork: "https://example.com/art.png" },
    ]) {
      await request("/me/entries", "POST", { ...base, ...invalid }, a, 400);
    }
    const source = "https://www.youtube.com/watch?v=jfKfPfyJRdk";
    const edit = {
      ...base,
      url: source,
      status: "finished",
      revision: 1,
      shared: true,
      rating: 4,
      replays: 2,
    };
    await request("/me/entries/" + id, "PUT", edit, b, 404);
    await request(
      "/me/entries/" + id,
      "PUT",
      edit,
      a,
      403,
      "https://unrelated.example",
    );
    await request("/me/entries/" + id, "PUT", edit, a);
    await request("/me/entries/" + id, "PUT", edit, a, 409);
    await request(
      "/me/entries",
      "POST",
      { ...base, url: "", title: "Private episode", status: "finished" },
      a,
      201,
    );
    await request(
      "/me/entries",
      "POST",
      {
        ...base,
        url: "",
        title: "Private book",
        kind: "audiobook",
        status: "finished",
      },
      a,
      201,
    );
    const { data: diary } = await request("/me/diary", "GET", undefined, a);
    assert.deepEqual(diary.stats, { finished: 2, shows: 1, replays: 2 });
    assert.equal(diary.entries.find((e) => e.id === id).note, base.note);
    await request(
      "/me/profile",
      "PUT",
      { ...profile, published: true, show_replays: false },
      a,
    );
    const { data: page } = await request("/u/mira");
    assert.deepEqual(page.stats, { finished: 1, shows: 1 });
    assert.deepEqual(page.badges, [1]);
    assert.equal(page.entries.length, 1);
    assert.equal(page.entries[0].takeaway, base.takeaway);
    assert.ok(!JSON.stringify(page).includes("Private episode"));
    assert.ok(!JSON.stringify(page).includes(base.note));
    assert.ok(!Object.hasOwn(page.entries[0], "note"));
    assert.equal(page.entries[0].url, source);
    const publicHtml = await server.fetch(origin + "/u/mira", {
      headers: { Accept: "text/html", "Sec-Fetch-Mode": "navigate" },
    });
    assert.equal(publicHtml.status, 200);
    assert.match(await publicHtml.text(), /<div id="root">/);
    const exportData = (await request("/me/export", "GET", undefined, a)).data;
    assert.equal(exportData.entries.length, 3);
    assert.ok(!JSON.stringify(exportData).includes(password));
    await request(
      "/me/metadata",
      "POST",
      { url: "http://127.0.0.1/no" },
      a,
      400,
    );
    await request(
      "/me/entries",
      "POST",
      { ...base, url: "javascript:alert(1)" },
      a,
      400,
    );
    await request(
      "/me/entries",
      "POST",
      { ...base, url: "https://open.spotify.com/playlist/other" },
      a,
      400,
    );
    await request("/me/diary", "GET", undefined, "", 401);
    const oauth = await request("/auth/sign-in/social", "POST", {
      provider: "github",
      callbackURL: "/",
      disableRedirect: true,
    });
    assert.equal(new URL(oauth.data.url).hostname, "github.com");
    assert.equal(
      new URL(oauth.data.url).searchParams.get("scope"),
      "user:email",
    );
    const methods = (await request("/session")).data.methods;
    const linkGoogle = {
      provider: "google",
      callbackURL: "/",
      disableRedirect: true,
    };
    await request("/auth/link-social", "POST", linkGoogle, "", 401);
    const link = await request("/auth/link-social", "POST", linkGoogle, a);
    assert.equal(new URL(link.data.url).hostname, "accounts.google.com");
    assert.deepEqual(
      (await request("/session", "GET", undefined, a)).data.linkedProviders,
      ["credential"],
    );
    for (const [provider, host, scopes] of [
      ["google", "accounts.google.com", ["email", "openid", "profile"]],
      ["facebook", "www.facebook.com", ["email", "public_profile"]],
    ]) {
      assert.equal(methods[provider], true);
      const start = await request("/auth/sign-in/social", "POST", {
        provider,
        callbackURL: "/",
        disableRedirect: true,
      });
      const consent = new URL(start.data.url);
      assert.equal(consent.hostname, host);
      assert.equal(consent.searchParams.get("client_id"), "test-" + provider);
      assert.deepEqual(
        consent.searchParams.get("scope").split(" ").sort(),
        scopes,
      );
      const callback = new URL(consent.searchParams.get("redirect_uri"));
      assert.equal(callback.href, origin + "/api/auth/callback/" + provider);
      const state = consent.searchParams.get("state");
      assert.ok(state);
      callback.search = new URLSearchParams({
        error: "access_denied",
        state,
      }).toString();
      const canceled = await server.fetch(callback.href, {
        redirect: "manual",
        headers: { Cookie: start.cookie },
      });
      assert.equal(canceled.status, 302);
      const retry = new URL(canceled.headers.get("location"));
      assert.equal(retry.origin, origin);
      assert.equal(retry.pathname, "/");
      assert.ok(retry.searchParams.has("signin"));
      assert.equal(retry.searchParams.get("error"), "access_denied");
      assert.equal(
        (await request("/session", "GET", undefined, start.cookie)).data.user,
        null,
      );
    }
    const experience = {
      source_description: "The original synopsis.",
      duration_seconds: 10800,
      duration_origin: "manual",
      personal_description: "My private summary.\nSecond line.",
      reflection: "The thought that followed me home.",
      moments: [
        {
          timestamp: "01:24:30",
          title: "Learning",
          description: "My timestamped reflection.",
        },
        {
          timestamp: "02:00:03",
          title: "The ending",
          description: "Shared on purpose",
          shared: true,
        },
      ],
    };
    const documentary = {
      experience,
      ...base,
      url: "https://www.nfb.ca/film/universe/",
      title: "Universe",
      kind: "documentary",
      show_name: "",
      status: "finished",
      shared: true,
    };
    for (const timestamp of ["3:00", "00:61:00", "03:00:01"]) {
      await request(
        "/me/entries",
        "POST",
        {
          ...documentary,
          experience: {
            ...experience,
            moments: [{ ...experience.moments[0], timestamp }],
          },
        },
        a,
        400,
      );
    }
    await request(
      "/me/entries",
      "POST",
      { ...documentary, experience: { ...experience, duration_seconds: 0 } },
      a,
      400,
    );
    const film = await request("/me/entries", "POST", documentary, a, 201);
    const privateFilm = (
      await request("/me/diary", "GET", undefined, a)
    ).data.entries.find((e) => e.id === film.data.id);
    assert.equal(privateFilm.kind, "documentary");
    assert.equal(privateFilm.note, base.note);
    assert.deepEqual(privateFilm.experience, experience);
    const exportFilm = (
      await request("/me/export", "GET", undefined, a)
    ).data.entries.find((e) => e.id === film.data.id);
    assert.deepEqual(exportFilm.experience, experience);
    assert.ok(
      !(await request("/me/diary", "GET", undefined, b)).data.entries.some(
        (e) => e.id === film.data.id,
      ),
    );
    const publishedFilm = (await request("/u/mira")).data.entries.find(
      (e) => e.title === "Universe",
    );
    assert.deepEqual(publishedFilm.moments, [
      {
        position_seconds: 7203,
        title: "The ending",
        reflection: "Shared on purpose",
      },
    ]);
    const publicText = JSON.stringify(publishedFilm);
    for (const privateValue of [
      experience.reflection,
      experience.personal_description,
      "example.com",
      base.note,
    ])
      assert.ok(!publicText.includes(privateValue));
    assert.equal(publishedFilm.kind, "documentary");
    assert.ok(!Object.hasOwn(publishedFilm, "note"));
    assert.ok(!Object.hasOwn(publishedFilm, "experience"));
    assert.ok(
      !JSON.stringify(publishedFilm).includes(
        experience.moments[0].description,
      ),
    );
    const consentOff = {
      ...experience,
      moments: experience.moments.map((m) => ({ ...m, shared: false })),
    };
    await request(
      "/me/entries/" + film.data.id,
      "PUT",
      { ...documentary, revision: 1, experience: consentOff },
      a,
    );
    assert.deepEqual(
      (await request("/u/mira")).data.entries.find(
        (e) => e.title === documentary.title,
      ).moments,
      [],
    );
    await request(
      "/me/entries/" + film.data.id,
      "PUT",
      { ...documentary, revision: 2 },
      a,
    );
    const legacy = { ...documentary };
    delete legacy.experience;
    await request(
      "/me/entries/" + film.data.id,
      "PUT",
      { ...legacy, revision: 3, shared: false },
      a,
    );
    assert.ok(
      !(await request("/u/mira")).data.entries.some(
        (e) => e.title === "Universe",
      ),
    );
    const path = "/me/entries/" + film.data.id;
    const preserved = (
      await request("/me/diary", "GET", undefined, a)
    ).data.entries.find((e) => e.id === film.data.id);
    assert.deepEqual(preserved.experience, experience);
    const revised = {
      ...experience,
      reflection: "An updated thought.",
      moments: [experience.moments[1]],
    };
    await request(
      path,
      "PUT",
      { ...documentary, experience: revised, revision: 4 },
      b,
      404,
    );
    await request(
      path,
      "PUT",
      { ...documentary, experience: revised, revision: 4, shared: false },
      a,
    );
    assert.deepEqual(
      (await request("/me/diary", "GET", undefined, a)).data.entries.find(
        (e) => e.id === film.data.id,
      ).experience,
      revised,
    );
    const thresholds = [1, 5, 10, 50, 100];
    for (let count = 2; count <= 100; count++) {
      await request(
        "/me/entries",
        "POST",
        {
          ...base,
          url: "",
          title: "Public episode " + count,
          status: "finished",
          shared: true,
        },
        a,
        201,
      );
      if (thresholds.includes(count) || thresholds.includes(count + 1)) {
        const { data: latest } = await request("/u/mira");
        assert.equal(latest.stats.finished, count);
        assert.deepEqual(
          latest.badges,
          thresholds.filter((n) => n <= count),
        );
      }
    }
    const latestDeck = await deck();
    assert.equal(latestDeck.total, 103);
    assert.equal(latestDeck.entries.length, 25);
    assert.equal(latestDeck.start, 78);
    const allCovers = [...latestDeck.entries];
    let earlier = latestDeck;
    while (earlier.next_cursor) {
      earlier = await deck(
        a,
        "?cursor=" + encodeURIComponent(earlier.next_cursor),
      );
      allCovers.unshift(...earlier.entries);
    }
    assert.equal(allCovers.length, 103);
    assert.equal(new Set(allCovers.map((e) => e.id)).size, 103);
    assert.deepEqual(
      allCovers.map((e) => e.created_at),
      allCovers.map((e) => e.created_at).sort(),
    );
    assert.equal(allCovers[0].id, id);
    assert.equal(allCovers[0].created_at, one.entries[0].created_at);
    const next = await deck(
      a,
      "?direction=newer&cursor=" + encodeURIComponent(earlier.newer_cursor),
    );
    assert.equal(next.start, earlier.entries.length);
    assert.equal(next.entries[0].id, allCovers[next.start].id);
    const middle = await deck(a, "?anchor=" + allCovers[45].id);
    assert.equal(middle.start, 33);
    assert.equal(middle.entries[12].id, allCovers[45].id);
    assert.deepEqual((await deck()).entries, latestDeck.entries);
    const ownerPage = (await request("/me/diary", "GET", undefined, a)).data;
    assert.equal(ownerPage.entries.length, 25);
    const hiddenOnFirst = await request(
      "/me/diary?featured=" + encodeURIComponent(source),
      "GET",
      undefined,
      a,
    );
    assert.equal(hiddenOnFirst.data.featured[0].id, id);
    assert.ok(!ownerPage.entries.some((e) => e.id === id));
    const otherShelf = await request(
      "/me/diary?featured=" + encodeURIComponent(source),
      "GET",
      undefined,
      b,
    );
    assert.notEqual(otherShelf.data.featured[0].id, id);
    const page2 = (
      await request(
        "/me/diary?cursor=" + encodeURIComponent(ownerPage.next_cursor),
        "GET",
        undefined,
        a,
      )
    ).data;
    assert.ok(
      page2.entries.every(
        (e) => !ownerPage.entries.some((prev) => prev.id === e.id),
      ),
    );
    let publicCount = 0,
      cursor = null;
    const titles = new Set();
    do {
      const page = (
        await request(
          "/u/mira" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
        )
      ).data;
      assert.ok(page.entries.length <= 25);
      for (const e of page.entries) {
        assert.ok(!titles.has(e.title));
        titles.add(e.title);
      }
      publicCount += page.entries.length;
      cursor = page.next_cursor;
    } while (cursor);
    assert.equal(publicCount, 100);
    assert.equal(
      (await request("/me/export", "GET", undefined, a)).data.entries.length,
      103,
    );
    await request("/u/mira?cursor=bad", "GET", undefined, "", 400);
    await request("/me/diary?cursor=bad", "GET", undefined, a, 400);
    await request("/me/profile", "PUT", { ...profile, published: false }, a);
    await request("/u/mira", "GET", undefined, "", 404);
    const { DB } = await server.getWorker().getEnv();
    const owner = (
      await DB.prepare("SELECT id FROM user WHERE name='mira'").first()
    ).id;
    // Large foreign collection with tied timestamps. Each API request should
    // visit one chronological index page and return only lightweight covers.
    const manyOwner = (
      await DB.prepare("SELECT id FROM user WHERE name='noel'").first()
    ).id;
    const sequence =
      "WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<1025) ";
    await DB.batch([
      DB.prepare(
        sequence + "INSERT INTO media SELECT printf('large-%04d',n) FROM seq",
      ),
      DB.prepare(
        "INSERT INTO source(provider,external_id,url,media_id) SELECT 'manual',id,'',id FROM media WHERE id GLOB 'large-*'",
      ),
      DB.prepare(
        "INSERT INTO entry(id,owner,media_id,provider,external_id,title,creator,show_name,artwork,kind,status,created_at,updated_at) SELECT media_id,?,media_id,provider,external_id,media_id,'','','',CASE cast(substr(media_id,7) as integer)%3 WHEN 0 THEN 'podcast' WHEN 1 THEN 'audiobook' ELSE 'documentary' END, 'want','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z' FROM source WHERE media_id GLOB 'large-*'",
      ).bind(manyOwner),
    ]);
    let many = await deck(b);
    const stale = many.next_cursor;
    assert.equal(many.total, 1026);
    assert.equal(many.start, 1001);
    const ids = new Set(),
      kinds = new Set();
    while (true) {
      for (const entry of many.entries) {
        assert.ok(!ids.has(entry.id));
        ids.add(entry.id);
        kinds.add(entry.kind);
      }
      if (!many.next_cursor) break;
      many = await deck(b, "?cursor=" + encodeURIComponent(many.next_cursor));
    }
    assert.equal(ids.size, 1026);
    assert.equal(kinds.size, 3);
    await DB.prepare("DELETE FROM entry WHERE id=? AND owner=?")
      .bind("large-0001", manyOwner)
      .run();
    await request(
      "/me/deck?cursor=" + encodeURIComponent(stale),
      "GET",
      undefined,
      b,
      409,
    );
    assert.equal((await deck(b)).total, 1025);
    await DB.prepare("DELETE FROM entry WHERE owner=? AND id GLOB 'large-*'")
      .bind(manyOwner)
      .run();
    for (const [filter, index] of [
      ["", "entry_history"],
      [" AND shared=1", "public_history"],
    ]) {
      const sql =
        "SELECT id FROM entry WHERE owner=?" +
        filter +
        " ORDER BY updated_at DESC,id DESC LIMIT 26";
      const plan = await DB.prepare("EXPLAIN QUERY PLAN " + sql)
        .bind(owner)
        .all();
      assert.ok(plan.results.some((r) => r.detail.includes(index)));
      const probe = await DB.prepare(sql).bind(owner).all();
      t.diagnostic(
        index +
          " page probe: " +
          probe.results.length +
          " records, D1 rows_read=" +
          probe.meta.rows_read +
          ", rows_written=" +
          probe.meta.rows_written,
      );
      assert.equal(probe.meta.rows_written, 0);
    }
    let limited;
    for (let i = 0; i < 21; i++) {
      const response = await server.fetch(origin + "/api/me/metadata", {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: b,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "bad" }),
      });
      if (response.status === 429) {
        limited = { headers: response.headers, data: await response.json() };
        break;
      }
      assert.equal(response.status, 400);
    }
    assert.ok(limited);
    assert.ok(Number(limited.headers.get("Retry-After")) > 0);
    assert.match(limited.data.error, /Try again/);
    await request("/me/account", "DELETE", { confirmation: "DELETE" }, a);
    await request("/u/mira", "GET", undefined, "", 404);
    await request("/me/diary", "GET", undefined, a, 401);
    assert.equal(
      (await request("/me/diary", "GET", undefined, b)).data.entries.length,
      1,
    );
    assert.equal(
      (await DB.prepare("SELECT count(*) AS n FROM favorite_moment").first()).n,
      0,
    );
    for (const table of ["account", "session"])
      assert.equal(
        (
          await DB.prepare(
            "SELECT count(*) AS n FROM " + table + " WHERE user_id=?",
          )
            .bind(owner)
            .first()
        ).n,
        0,
      );
    await request("/auth/sign-out", "POST", {}, b);
    const login = await request("/auth/sign-in/email", "POST", {
      email: "noel@example.com",
      password,
    });
    assert.ok(login.cookie);
  },
);
