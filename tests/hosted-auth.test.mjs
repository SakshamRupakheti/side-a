import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, generateKeyPairSync, sign } from "node:crypto";
import { createTestHarness } from "wrangler";

test("HTTPS configuration uses secure OAuth cookies, a fixed callback and no password routes", async (t) => {
  const origin = "https://suni-fixture.example";
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const signed =
    encode({ alg: "RS256", kid: "fixture" }) +
    "." +
    encode({
      iss: "https://accounts.google.com",
      aud: "fixture",
      sub: "fixture-listener",
      email: "listener@example.invalid",
      email_verified: true,
      name: "Test listener",
      iat: now,
      exp: now + 3600,
    });
  const token =
    signed +
    "." +
    sign("RSA-SHA256", Buffer.from(signed), privateKey).toString("base64url");
  const harness = createTestHarness({
    workers: [
      {
        configPath: "./tests/wrangler.oauth.jsonc",
        secrets: {
          FIXTURE_ID_TOKEN: token,
          FIXTURE_JWKS: JSON.stringify({
            keys: [
              {
                ...publicKey.export({ format: "jwk" }),
                kid: "fixture",
                alg: "RS256",
                use: "sig",
              },
            ],
          }),
          BETTER_AUTH_URL: origin,
          BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
          GOOGLE_CLIENT_ID: "fixture",
          GOOGLE_CLIENT_SECRET: "fixture",
          LOCAL_PASSWORD_AUTH: "true",
        },
      },
    ],
  });
  t.after(() => harness.close());
  await harness.listen();
  await harness.getWorker().applyD1Migrations("DB");
  const worker = harness.getWorker();
  assert.equal((await worker.getEnv()).BETTER_AUTH_URL, origin);
  const post = (path, body, from = origin) =>
    worker.fetch(origin + "/api/auth/" + path, {
      method: "POST",
      headers: { Origin: from, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const session = await worker.fetch(origin + "/api/session");
  assert.match(session.headers.get("Cache-Control"), /no-store/);
  assert.equal((await session.json()).methods.local, false);
  const denied = await post("sign-up/email", {});
  assert.equal(denied.status, 404, (await denied.text()).slice(0, 500));
  const begin = { provider: "google", callbackURL: "/", disableRedirect: true };
  assert.equal(
    (await post("sign-in/social", begin, "http://127.0.0.1:8787")).status,
    403,
  );
  assert.equal(
    (
      await post("sign-in/social", {
        ...begin,
        callbackURL: "https://elsewhere.example",
      })
    ).status,
    400,
  );
  const start = await post("sign-in/social", begin);
  assert.equal(start.status, 200);
  const cookie = start.headers.getSetCookie().join(" ");
  for (const flag of [/HttpOnly/i, /SameSite=Lax/i, /; Secure/i])
    assert.match(cookie, flag);
  const cookies = (res) =>
    res.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
  async function complete(start) {
    const approval = new URL((await start.json()).url);
    assert.equal(
      approval.searchParams.get("redirect_uri"),
      origin + "/api/auth/callback/google",
    );
    const url = new URL(approval.searchParams.get("redirect_uri"));
    url.search = new URLSearchParams({
      code: "issued-in-fixture",
      state: approval.searchParams.get("state"),
    });
    const res = await worker.fetch(url.href, {
      redirect: "manual",
      headers: { Cookie: cookies(start) },
    });
    assert.equal(res.status, 302);
    assert.equal(new URL(res.headers.get("location"), origin).pathname, "/");
    return cookies(res);
  }
  const call = (path, cookie, method = "GET", body) =>
    worker.fetch(origin + "/api" + path, {
      method,
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: body && JSON.stringify(body),
    });
  const first = await complete(start);
  const me = await (await call("/session", first)).json();
  assert.deepEqual(me.linkedProviders, ["google"]);
  assert.equal(me.profile, null);
  const profile = {
    username: "fixture",
    display_name: "Test",
    bio: "",
    published: false,
    show_finished: false,
    show_shows: false,
    show_replays: false,
    show_badges: false,
  };
  assert.equal((await call("/me/profile", first, "PUT", profile)).status, 200);
  assert.equal((await worker.fetch(origin + "/api/u/fixture")).status, 404);
  const draft = {
    kind: "podcast",
    url: "",
    title: "A saved listen",
    creator: "",
    show_name: "",
    artwork: "",
    status: "finished",
    replays: 0,
    rating: null,
    note: "private",
    takeaway: "",
    shared: false,
  };
  assert.equal((await call("/me/entries", first, "POST", draft)).status, 201);
  assert.equal((await call("/auth/sign-out", first, "POST", {})).status, 200);
  assert.equal((await call("/me/diary", first)).status, 401);
  const again = await complete(await post("sign-in/social", begin));
  assert.equal(
    (await (await call("/me/diary", again)).json()).entries[0].title,
    draft.title,
  );
  assert.equal(
    (await call("/me/account", again, "DELETE", { confirmation: "DELETE" }))
      .status,
    200,
  );
});
