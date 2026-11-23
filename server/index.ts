import { createMiddleware } from "hono/factory";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { auth, methods, type Env } from "./auth";
import { retryAfter } from "./throttle";
import { metadata, searchShows, parseSource } from "./providers";
import { socialProviders } from "../shared/sign-in";
import {
  getProfile,
  saveProfile,
  profileInput,
  entryInput,
  entries,
  diaryPage,
  deckPage,
  deckCursor,
  decodeCursor,
  statistics,
  createEntry,
  updateEntry,
  publicPage,
} from "./diary";

type AppEnv = {
  Bindings: Env;
  Variables: { owner: string; signedInAt: Date; email: string; name: string };
};
const app = new Hono<AppEnv>();
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("X-Content-Type-Options", "nosniff");
  if (
    !["GET", "HEAD"].includes(c.req.method) &&
    c.req.header("Origin") !== new URL(c.env.BETTER_AUTH_URL).origin
  )
    throw new HTTPException(403, {
      message: "Submit changes from the diary website.",
    });
  if (c.req.path.startsWith("/api/u/")) {
    const wait = retryAfter(
      "profile:" + (c.req.header("CF-Connecting-IP") ?? "local"),
      60,
    );
    if (wait) {
      c.header("Retry-After", String(wait));
      return c.json(
        { error: "Please wait a moment before opening more profiles." },
        429,
      );
    }
  }
  await next();
});
app.use("/api/*", (c, next) =>
  bodyLimit({
    maxSize: /^\/api\/me\/entries(?:\/[^/]+)?$/.test(c.req.path)
      ? 512 * 1024
      : 65536,
    onError: (c) => c.json({ error: "Request is too large." }, 413),
  })(c, next),
);
app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const path = c.req.path.slice("/api/auth".length);
  if (
    c.req.method === "GET" &&
    socialProviders.some((provider) => path === "/callback/" + provider)
  )
    return auth(c.env).handler(c.req.raw);
  if (
    c.req.method === "POST" &&
    ["/sign-in/social", "/link-social"].includes(path)
  ) {
    const body = z
      .object({
        provider: z.enum(socialProviders),
        callbackURL: z.literal("/"),
        disableRedirect: z.literal(true),
      })
      .strict()
      .parse(await c.req.raw.clone().json());
    if (!methods(c.env)[body.provider])
      throw new HTTPException(400, {
        message: "This sign-in provider is unavailable.",
      });
    return auth(c.env).handler(c.req.raw);
  }
  if (
    c.req.method === "POST" &&
    (path === "/sign-out" ||
      (methods(c.env).local &&
        new URL(c.req.url).origin === new URL(c.env.BETTER_AUTH_URL).origin &&
        ["/sign-up/email", "/sign-in/email"].includes(path)))
  )
    return auth(c.env).handler(c.req.raw);
  throw new HTTPException(404, {
    message: "Authentication route unavailable.",
  });
});
app.get("/api/session", async (c) => {
  const data = await auth(c.env).api.getSession({ headers: c.req.raw.headers });
  return c.json({
    methods: methods(c.env),
    linkedProviders: data
      ? (
          await c.env.DB.prepare(
            "SELECT provider_id FROM account WHERE user_id = ?",
          )
            .bind(data.user.id)
            .all<{ provider_id: string }>()
        ).results.map((row) => row.provider_id)
      : [],
    user: data ? { name: data.user.name, email: data.user.email } : null,
    profile: data ? await getProfile(c.env.DB, data.user.id) : null,
  });
});
app.get("/api/u/:username", async (c) =>
  c.json(
    await publicPage(
      c.env.DB,
      c.req.param("username"),
      decodeCursor(c.req.query("cursor")),
    ),
  ),
);
const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const data = await auth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!data)
    throw new HTTPException(401, { message: "Sign in to open your diary." });
  const upstream = ["/api/search", "/api/me/metadata"].includes(c.req.path);
  if (upstream && c.env.DISABLE_LOOKUPS === "true")
    return c.json(
      {
        error:
          "Directory and metadata lookups are paused. You can still save a title or source link.",
      },
      503,
    );
  const mutation = c.req.method !== "GET";
  const wait = upstream
    ? retryAfter("lookup:" + data.user.id, 10) ||
      (c.req.path === "/api/search" && retryAfter("directory", 18))
    : mutation
      ? retryAfter("write:" + data.user.id, 180)
      : 0;
  if (wait) {
    c.header("Retry-After", String(wait));
    return c.json(
      { error: "Too many requests. Try again in " + wait + " seconds." },
      429,
    );
  }
  c.set("owner", data.user.id);
  c.set("signedInAt", data.session.createdAt);
  c.set("email", data.user.email);
  c.set("name", data.user.name);
  await next();
});
app.use("/api/me/*", requireSession);
app.use("/api/search", requireSession);
app.get("/api/search", async (c) => {
  const term = z.string().trim().min(2).max(100).parse(c.req.query("q"));
  return c.json(await searchShows(term, c.env));
});
app.put("/api/me/profile", async (c) => {
  const p = profileInput.parse(await c.req.json());
  await saveProfile(c.env.DB, c.get("owner"), p);
  return c.json(p);
});
app.get("/api/me/deck", async (c) => {
  const cursor = deckCursor(c.req.query("cursor"));
  const direction = z
    .enum(["older", "newer"])
    .default("older")
    .parse(c.req.query("direction"));
  return c.json(
    await deckPage(
      c.env.DB,
      c.get("owner"),
      cursor,
      direction,
      c.req.query("anchor"),
    ),
  );
});
app.get("/api/me/entries/:id", async (c) => {
  const [entry] = await entries(
    c.env.DB,
    c.get("owner"),
    null,
    false,
    [],
    c.req.param("id"),
  );
  if (!entry)
    throw new HTTPException(404, { message: "This record is unavailable." });
  return c.json(entry);
});
app.get("/api/me/diary", async (c) => {
  const owner = c.get("owner");
  // The stage still offers Edit for saved shelf picks beyond the first archive page.
  const featured = z
    .array(z.string().min(1).max(2048))
    .max(8)
    .parse(c.req.queries("featured") ?? [])
    .map(parseSource);
  const [items, stats, shelf] = await Promise.all([
    diaryPage(c.env.DB, owner, decodeCursor(c.req.query("cursor"))),
    statistics(c.env.DB, owner),
    featured.length ? entries(c.env.DB, owner, null, true, featured) : [],
  ]);
  return c.json({ ...items, stats, featured: shelf });
});
app.post("/api/me/metadata", async (c) => {
  const { url } = z
    .object({ url: z.string().min(1).max(2048) })
    .parse(await c.req.json());
  return c.json(await metadata(url, c.env));
});
app.post("/api/me/entries", async (c) => {
  const e = entryInput.parse(await c.req.json());
  return c.json({ id: await createEntry(c.env.DB, c.get("owner"), e) }, 201);
});
app.put("/api/me/entries/:id", async (c) => {
  const data = entryInput
    .extend({ revision: z.number().int().positive() })
    .parse(await c.req.json());
  await updateEntry(
    c.env.DB,
    c.get("owner"),
    c.req.param("id"),
    data.revision,
    data,
  );
  return c.json({ saved: true });
});
app.delete("/api/me/entries/:id", async (c) => {
  const { revision } = z
    .object({ revision: z.number().int().positive() })
    .parse(await c.req.json());
  const result = await c.env.DB.prepare(
    "DELETE FROM entry WHERE owner=? AND id=? AND revision=?",
  )
    .bind(c.get("owner"), c.req.param("id"), revision)
    .run();
  if (!result.meta.changes)
    throw new HTTPException(409, {
      message: "The entry changed or is unavailable. Reload your diary.",
    });
  return c.json({ deleted: true });
});
app.get("/api/me/export", async (c) => {
  const owner = c.get("owner"),
    db = c.env.DB;
  const sources = await db
    .prepare(
      "SELECT e.id AS entry_id,e.media_id,e.created_at,e.provenance,e.import_key,s.provider,s.external_id,s.url FROM entry e JOIN source s ON s.media_id=e.media_id WHERE e.owner=?",
    )
    .bind(owner)
    .all();
  const accounts = await db
    .prepare(
      "SELECT provider_id,account_id,created_at FROM account WHERE user_id=?",
    )
    .bind(owner)
    .all();
  c.header("Content-Disposition", 'attachment; filename="suni-diary.json"');
  return c.json({
    version: 1,
    exported_at: new Date().toISOString(),
    user: { name: c.get("name"), email: c.get("email") },
    accounts: accounts.results,
    profile: await getProfile(db, owner),
    entries: await entries(db, owner),
    sources: sources.results,
  });
});
app.delete("/api/me/account", async (c) => {
  if (Date.now() - c.get("signedInAt").getTime() > 10 * 60 * 1000)
    throw new HTTPException(403, {
      message: "Sign out and sign in again before deleting your account.",
    });
  const { confirmation } = z
    .object({ confirmation: z.literal("DELETE") })
    .parse(await c.req.json());
  if (confirmation === "DELETE")
    await c.env.DB.prepare("DELETE FROM user WHERE id=?")
      .bind(c.get("owner"))
      .run();
  return c.json({ deleted: true });
});
app.notFound((c) => c.json({ error: "Page not found." }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException)
    return c.json({ error: err.message }, err.status);
  if (err instanceof z.ZodError)
    return c.json(
      {
        error: err.issues
          .map((i) => i.path.join(".") + " — " + i.message)
          .join(". "),
      },
      400,
    );
  if (err instanceof SyntaxError)
    return c.json({ error: "Invalid JSON request." }, 400);
  if (
    /D1.*(?:quota|limit exceeded|exceeded.{0,100}limit|daily.{0,60}limit|storage.{0,40}limit|overload|too many requests|temporarily unavailable)/i.test(
      String(err),
    )
  ) {
    c.header("Retry-After", "60");
    return c.json(
      {
        error: "The diary is temporarily at capacity. Please try again later.",
      },
      503,
    );
  }
  console.error("Request failed", c.req.method, c.req.routePath, err.name);
  return c.json(
    { error: "The diary could not complete this request. Please try again." },
    500,
  );
});
export default app;
