import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { importBatch } from "../server/history.ts";
import { createTestHarness } from "wrangler";

test(
  "bulk import with authenticated sessions, D1 deduplication, privacy, quotas and paginated collection",
  { timeout: 150000 },
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
            },
          },
        ],
      });
    t.after(() => server.close());
    await server.listen();
    await server.getWorker().applyD1Migrations("DB");
    async function request(
      path,
      cookie = "",
      body,
      scope = "",
      method = body === undefined ? "GET" : "POST",
      status = 200,
      from = origin,
    ) {
      const response = await server.fetch(origin + "/api" + path, {
        method,
        headers: {
          origin: from,
          cookie,
          "content-type": "application/json",
          "x-suni-import-scope": scope,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await response.json();
      assert.equal(
        response.status,
        status,
        JSON.stringify(result).slice(0, 1200),
      );
      return {
        result,
        cookie: response.headers
          .getSetCookie()
          .map((c) => c.split(";")[0])
          .join("; "),
      };
    }
    async function signup(name) {
      return (
        await request("/auth/sign-up/email", "", {
          email: name + "@example.com",
          name,
          password: randomBytes(18).toString("hex"),
        })
      ).cookie;
    }
    const a = await signup("archivist"),
      b = await signup("reader");
    await request(
      "/me/profile",
      a,
      {
        username: "archivist",
        display_name: "Archivist",
        bio: "",
        published: true,
        show_finished: true,
        show_shows: true,
        show_replays: true,
        show_badges: true,
      },
      "",
      "PUT",
    );
    const scope = (await request("/me/import/identities", a)).result.scope,
      other = (await request("/me/import/identities", b)).result.scope;
    const item = (i) => ({
      provider: "youtube",
      id: String(i).padStart(11, "0"),
      title: "Imported episode " + i,
      creator: "Field recordings",
      evidence: {
        stream: 0,
        watch: 1,
        playlist: 0,
        saved: 0,
        first: null,
        last: null,
        durationMs: null,
        playedMs: null,
      },
    });
    const manual = {
      url: "https://youtu.be/" + item(0).id,
      title: "My title",
      creator: "My creator",
      artwork: "",
      kind: "podcast",
      show_name: "",
      status: "finished",
      rating: 5,
      replays: 2,
      note: "Private earlier thoughts",
      takeaway: "",
      shared: false,
    };
    await request("/me/entries", a, manual, "", "POST", 201);
    const first = (await request("/me/export", a)).result.entries[0];
    const body = {
      run: crypto.randomUUID(),
      status: "want",
      items: [item(0), item(1), { ...item(3), unrelated: "discard" }, item(2)],
    };
    const post = (c, data, s, expected = 200) =>
      request("/me/import", c, data, s, "POST", expected);
    await post("", body, scope, 401);
    await post(b, body, scope, 409);
    await post(a, { ...body, owner: "x" }, scope, 400);
    await post(a, { ...body, items: Array(17).fill(item(1)) }, scope, 400);
    await post(a, { ...body, padding: "x".repeat(70000) }, scope, 413);
    await request(
      "/me/import",
      a,
      body,
      scope,
      "POST",
      403,
      "https://example.org",
    );
    for (let n = 0; n < 2; n++)
      assert.deepEqual((await post(a, body, scope)).result.outcomes, [
        "existing",
        "added",
        "invalid",
        "added",
      ]);
    const race = await Promise.all(
      [1, 2].map(() =>
        post(
          a,
          { ...body, run: crypto.randomUUID(), items: [item(35)] },
          scope,
        ),
      ),
    );
    assert.deepEqual(race.map((x) => x.result.outcomes[0]).sort(), [
      "added",
      "existing",
    ]);
    assert.deepEqual(
      (await post(a, { ...body, run: crypto.randomUUID() }, scope)).result
        .outcomes,
      ["existing", "existing", "invalid", "existing"],
    );
    assert.deepEqual(
      (await post(b, { ...body, items: [item(1)] }, other)).result.outcomes,
      ["added"],
    );
    const archive = (await request("/me/export", a)).result;
    assert.ok(
      archive.entries.every((e) =>
        e.artwork.startsWith("https://i.ytimg.com/vi/"),
      ),
    );
    assert.deepEqual(
      archive.entries.find((e) => e.id === first.id),
      first,
    );
    assert.deepEqual(
      archive.sources.find((s) => s.external_id === item(1).id)
        .history_evidence,
      item(1).evidence,
    );
    assert.ok(
      archive.entries
        .filter((e) => e.id !== first.id)
        .every((e) => !e.shared && e.status === "want" && !e.finished_at),
    );
    assert.equal((await request("/u/archivist")).result.entries.length, 0);
    const start = performance.now(),
      count = 1000,
      run = crypto.randomUUID();
    for (let i = 0; i < count; i += 16) {
      const items = Array.from({ length: Math.min(16, count - i) }, (_, j) =>
        item(100 + i + j),
      );
      assert.deepEqual(
        (await post(a, { run, items, status: "listening" }, scope)).result
          .outcomes,
        items.map(() => "added"),
      );
    }
    t.diagnostic(
      "1,000 new private episodes confirmed in 63 local Worker/D1 requests in " +
        Math.round(performance.now() - start) +
        " ms",
    );
    const deck = (await request("/me/deck", a)).result;
    assert.equal(deck.total, 1004);
    assert.ok(deck.entries.length < 50);
    let cursor = "",
      keys = [];
    do {
      const r = (
        await request(
          "/me/import/identities" +
            (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
          a,
        )
      ).result;
      keys.push(...r.keys);
      cursor = r.next;
    } while (cursor);
    assert.equal(new Set(keys).size, 1004);
    assert.equal(keys.length, 1004);
    const { DB } = await server.getWorker().getEnv();
    const owner = await DB.prepare("SELECT id FROM user WHERE email=?")
      .bind("archivist@example.com")
      .first("id");
    await DB.prepare(
      "UPDATE entry SET artwork='',cover_auto=0 WHERE owner=? AND external_id=?",
    )
      .bind(owner, item(2).id)
      .run();
    await request("/me/covers", "", { automatic: false }, "", "POST", 401);
    await request(
      "/me/covers",
      a,
      { automatic: false, owner: "someone-else" },
      "",
      "POST",
      400,
    );
    await request(
      "/me/covers",
      a,
      { automatic: false },
      "",
      "POST",
      403,
      "https://evil.invalid",
    );
    assert.equal((await request("/me/covers", b)).result.missing, 0);
    assert.equal(
      (await request("/me/covers", b, { automatic: false })).result.restored,
      0,
    );
    assert.equal((await request("/me/covers", a)).result.missing, 1);
    const repairId = await DB.prepare(
      "SELECT id FROM entry WHERE owner=? AND external_id=?",
    )
      .bind(owner, item(2).id)
      .first("id");
    const openDraft = (await request("/me/entries/" + repairId, a)).result;
    assert.equal(
      (await request("/me/covers", a, { automatic: false })).result.restored,
      1,
    );
    assert.equal((await request("/me/covers", a)).result.missing, 0);
    const repaired = (await request("/me/entries/" + repairId, a)).result;
    assert.equal(repaired.revision, openDraft.revision);
    assert.equal(repaired.updated_at, openDraft.updated_at);
    await request(
      "/me/entries/" + repairId,
      a,
      { ...openDraft, note: "A concurrent thought" },
      "",
      "PUT",
    );
    const edited = (await request("/me/entries/" + repairId, a)).result;
    assert.equal(edited.artwork, repaired.artwork);
    assert.equal(edited.note, "A concurrent thought");
    const measured = {
      prepare: (s) => DB.prepare(s),
      batch: async (statements) => {
        const result = await DB.batch(statements);
        assert.equal(result.length, 4);
        const total = (key) =>
          result.reduce((acc, row) => acc + row.meta[key], 0);
        t.diagnostic(
          "16-item D1 sample: rows_read=" +
            total("rows_read") +
            ", rows_written=" +
            total("rows_written"),
        );
        return result;
      },
    };
    const sample = {
      run: crypto.randomUUID(),
      status: "want",
      items: Array.from({ length: 16 }, (_, i) => item(9000 + i)),
    };
    for (let n = 0; n < 2; n++)
      assert.ok(
        (await importBatch(measured, owner, scope, sample)).outcomes.every(
          (v) => v === "added",
        ),
      );
    await request("/me/account", a, { confirmation: "DELETE" }, "", "DELETE");
    assert.deepEqual((await request("/me/import/identities", b)).result.keys, [
      "youtube:" + item(1).id,
    ]);
    const remaining = await DB.prepare(
      "SELECT count(*) AS n FROM entry WHERE history_evidence IS NOT NULL",
    ).first();
    assert.equal(remaining.n, 1);
  },
);
