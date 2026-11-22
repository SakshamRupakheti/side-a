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
        data,
        cookie: res.headers
          .getSetCookie()
          .map((x) => x.split(";")[0])
          .join("; "),
      };
    }
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
    const documentary = {
      ...base,
      url: "https://www.nfb.ca/film/universe/",
      title: "Universe",
      kind: "documentary",
      show_name: "",
      status: "finished",
      shared: true,
    };
    const film = await request("/me/entries", "POST", documentary, a, 201);
    const privateFilm = (
      await request("/me/diary", "GET", undefined, a)
    ).data.entries.find((e) => e.id === film.data.id);
    assert.equal(privateFilm.kind, "documentary");
    assert.equal(privateFilm.note, base.note);
    const publishedFilm = (await request("/u/mira")).data.entries.find(
      (e) => e.title === "Universe",
    );
    assert.equal(publishedFilm.kind, "documentary");
    assert.ok(!Object.hasOwn(publishedFilm, "note"));
    await request(
      "/me/entries/" + film.data.id,
      "PUT",
      { ...documentary, revision: 1, shared: false },
      a,
    );
    assert.ok(
      !(await request("/u/mira")).data.entries.some(
        (e) => e.title === "Universe",
      ),
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
    await request("/me/account", "DELETE", { confirmation: "DELETE" }, a);
    await request("/u/mira", "GET", undefined, "", 404);
    await request("/me/diary", "GET", undefined, a, 401);
    assert.equal(
      (await request("/me/diary", "GET", undefined, b)).data.entries.length,
      1,
    );
    await request("/auth/sign-out", "POST", {}, b);
    const login = await request("/auth/sign-in/email", "POST", {
      email: "noel@example.com",
      password,
    });
    assert.ok(login.cookie);
  },
);
