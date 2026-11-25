import {
  allowedPerson,
  momentJson,
  postFields,
  feedQuery,
  wallQuery,
} from "./social-feed";
import { socialBadges, type BadgeId } from "../shared/social";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { auth } from "./auth";
import { decodeCursor } from "./diary";
import { retryAfter } from "./throttle";
import type { AppEnv } from "./index";
import type { Context } from "hono";

type C = Context<AppEnv>;
const missing = () =>
  new HTTPException(404, { message: "This page is unavailable." });
const conflict = () =>
  new HTTPException(409, {
    message:
      "The record or its sharing settings changed. Reload before saving.",
  });
const pageSize = 16;
const handle = z.string().regex(/^[a-z0-9][a-z0-9_]{2,29}$/);
const id = z.string().uuid();
const change = z.object({ active: z.boolean() }).strict();
const revision = z.number().int().positive();
const edit = z
  .object({
    revision: z.number().int().min(0),
    entry_revision: revision,
    caption: z.string().trim().max(400),
    published: z.boolean(),
    include_takeaway: z.boolean(),
    include_moments: z.boolean(),
  })
  .strict();
export async function viewer(c: C) {
  if (!c.req.header("cookie")) return "";
  return (
    (await auth(c.env).api.getSession({ headers: c.req.raw.headers }))?.user
      .id ?? ""
  );
}
function limit(c: C, key: string, max: number) {
  const config = Number(c.env.SOCIAL_READ_LIMIT);
  const wait = retryAfter(
    key,
    Number.isInteger(config) && config > 0 && key.startsWith("social-read:")
      ? Math.min(config, 600)
      : max,
  );
  if (wait) {
    c.header("Retry-After", String(wait));
    throw new HTTPException(429, { message: "Please try again shortly." });
  }
}
function project(row: Record<string, unknown>) {
  const { moment_json, ...post } = row;
  return { ...post, moments: JSON.parse(String(moment_json)) };
}
function search(raw?: string) {
  const q = z
    .string()
    .trim()
    .max(64)
    .parse(raw ?? "");
  const terms = q.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 6) ?? [];
  return { q, match: terms.map((t) => '"' + t + '"*').join(" AND ") };
}
export async function feed(
  db: D1Database,
  actor: string,
  params: Record<string, string>,
) {
  const scope = z
    .enum(["discover", "following", "saved"])
    .parse(params.scope ?? "discover");
  if (scope !== "discover" && !actor)
    throw new HTTPException(401, {
      message: "Sign in to open this collection.",
    });
  const cursor = decodeCursor(params.cursor),
    { q, match } = search(params.q);
  const { sql, bindings } = feedQuery({
    actor,
    scope,
    cursor,
    author: params.author ? handle.parse(params.author) : undefined,
    match: q ? match || '"___nomatch___"' : undefined,
  });
  const { results } = await db
    .prepare(sql)
    .bind(...bindings)
    .all();
  const posts = results.slice(0, pageSize).map(project),
    last = results[pageSize - 1];
  return {
    posts,
    next_cursor:
      results.length > pageSize
        ? btoa(JSON.stringify([last.published_at, last.id]))
        : null,
  };
}
export const social = new Hono<AppEnv>();
social.use("*", async (c, next) => {
  limit(c, "social-read:" + (c.req.header("CF-Connecting-IP") ?? "local"), 120);
  await next();
});
social.get("/feed", async (c) =>
  c.json(await feed(c.env.DB, await viewer(c), c.req.query())),
);
social.get("/p/:id", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT ${postFields} FROM social_public v WHERE v.id=?2 AND ${allowedPerson("v.owner")}`,
  )
    .bind(await viewer(c), c.req.param("id"))
    .first();
  if (!row) throw missing();
  return c.json(project(row));
});
social.get("/wall/:section", async (c) => {
  const section = z.enum(["ranked", "fresh"]).parse(c.req.param("section"));
  const fresh = section === "fresh";
  const raw = c.req.query("after");
  let cursor: [string | number, string] | undefined;
  if (raw !== undefined) {
    try {
      const value = JSON.parse(atob(z.string().max(200).parse(raw)));
      cursor = fresh
        ? z.tuple([z.string().min(1).max(32), handle]).parse(value)
        : z.tuple([z.number().int().min(-5).max(0), handle]).parse(value);
    } catch {
      throw new HTTPException(400, { message: "Invalid wall cursor." });
    }
  }
  const { results } = await c.env.DB.prepare(wallQuery(fresh, !!cursor))
    .bind(await viewer(c), ...(cursor ?? []))
    .all();
  const last = results[11];
  return c.json({
    people: results.slice(0, 12).map((row) => ({
      username: row.username,
      display_name: row.display_name,
      following: row.following,
      badges: (Object.keys(socialBadges) as BadgeId[]).filter(
        (key) => row[key] === 1,
      ),
      covers: JSON.parse(String(row.covers)),
    })),
    next:
      results.length > 12
        ? btoa(JSON.stringify([last.sort_key, last.username]))
        : null,
  });
});
social.get("/people", async (c) => {
  const actor = await viewer(c),
    { q, match } = search(c.req.query("q"));
  const after = c.req.query("after") ?? "";
  if (after) handle.parse(after);
  // Exact handles sort first. Remaining handles have a stable alphabetical cursor.
  const { results } = await c.env.DB.prepare(
    `SELECT username,display_name,bio,user_id=?1 AS mine,
 EXISTS(SELECT 1 FROM social_follow WHERE follower=?1 AND followed=p.user_id) AS following
 FROM profile p WHERE published=1 AND social_hidden=0 AND ${allowedPerson("p.user_id")}
 ${q ? "AND p.rowid IN(SELECT rowid FROM social_names WHERE social_names MATCH ?4)" : ""}
 AND (?3='' OR ((?3=lower(?2) OR username>?3) AND username<>lower(?2)))
 ORDER BY ${q ? "(username=lower(?2)) DESC," : ""}username LIMIT 17`,
  )
    .bind(actor, q, after, ...(q ? [match || '"___nomatch___"'] : []))
    .all();
  return c.json({
    people: results.slice(0, pageSize),
    next: results.length > pageSize ? results[15].username : null,
  });
});
const editorFrom =
  " FROM entry e JOIN source s ON s.provider=e.provider AND s.external_id=e.external_id JOIN profile g ON g.user_id=e.owner LEFT JOIN social_post p ON p.entry_id=e.id WHERE e.id=? AND e.owner=?";
social.get("/me/posts/:entry", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT e.id AS entry_id,e.title,e.creator,e.show_name,e.kind,e.artwork,s.url,e.shared,e.revision AS entry_revision,e.takeaway,g.username,g.display_name,g.published AS profile_public,g.social_hidden AS profile_hidden,p.hidden, p.id,p.caption,p.published,p.revision,p.include_takeaway,p.include_moments,${momentJson("e.id")} AS moment_json${editorFrom}`,
  )
    .bind(c.req.param("entry"), c.get("owner"))
    .first();
  if (!row) throw missing();
  return c.json(project(row));
});
social.put("/me/posts/:entry", async (c) => {
  const entry = id.parse(c.req.param("entry")),
    owner = c.get("owner"),
    data = edit.parse(await c.req.json());
  const now = new Date().toISOString();
  const gate =
    " FROM entry e JOIN profile g ON g.user_id=e.owner WHERE e.id=? AND e.owner=? AND e.revision=? AND (?=0 OR (e.shared=1 AND g.published=1 AND g.social_hidden=0))";
  const values = [
      data.caption,
      +data.include_takeaway,
      +data.include_moments,
      +data.published,
    ],
    conditions = [entry, owner, data.entry_revision, +data.published];
  const stmt =
    data.revision === 0
      ? c.env.DB.prepare(
          `INSERT INTO social_post(id,owner,entry_id,caption,include_takeaway,include_moments,published,published_at,created_at,updated_at) SELECT ?,e.owner,e.id,?,?,?,?,?,?,?${gate} ON CONFLICT(entry_id) DO NOTHING RETURNING id,revision`,
        ).bind(
          crypto.randomUUID(),
          ...values,
          data.published ? now : null,
          now,
          now,
          ...conditions,
        )
      : c.env.DB.prepare(
          `UPDATE social_post SET caption=?,include_takeaway=?,include_moments=?,published=?,published_at=CASE WHEN ?=1 AND published=0 THEN ? ELSE published_at END,updated_at=?,revision=revision+1 WHERE owner=? AND entry_id=? AND revision=? AND (?=0 OR hidden=0) AND EXISTS(SELECT 1${gate}) RETURNING id,revision`,
        ).bind(
          ...values,
          +data.published,
          now,
          now,
          owner,
          entry,
          data.revision,
          +data.published,
          ...conditions,
        );
  const row = await stmt.first();
  if (!row) throw conflict();
  return c.json(row);
});
social.delete("/me/posts/:entry", async (c) => {
  const data = z
    .object({ revision })
    .strict()
    .parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "DELETE FROM social_post WHERE entry_id=? AND owner=? AND revision=? RETURNING id",
  )
    .bind(c.req.param("entry"), c.get("owner"), data.revision)
    .first();
  if (!row) throw conflict();
  return c.json({ deleted: true });
});
social.put("/me/social/:action/:target", async (c) => {
  const action = z
    .enum(["like", "bookmark", "follow", "block"])
    .parse(c.req.param("action"));
  const actor = c.get("owner"),
    target = c.req.param("target"),
    { active } = change.parse(await c.req.json());
  if (action === "follow" || action === "block") {
    handle.parse(target);
    const block = action === "block",
      table = block ? "social_block" : "social_follow",
      left = block ? "blocker" : "follower",
      right = block ? "blocked" : "followed";
    const profile = `SELECT user_id FROM profile p WHERE username=?2 AND user_id<>?1 AND published=1 AND social_hidden=0 ${block ? "" : "AND " + allowedPerson("p.user_id")}`;
    if (active) {
      const [targetRow] = await c.env.DB.batch([
        c.env.DB.prepare(profile).bind(actor, target),
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO ${table}(${left},${right}) SELECT ?1,user_id FROM (${profile})`,
        ).bind(actor, target),
      ]);
      if (!targetRow.results.length) throw missing();
    } else
      await c.env.DB.prepare(
        `DELETE FROM ${table} WHERE ${left}=? AND ${right}=(SELECT user_id FROM profile WHERE username=?)`,
      )
        .bind(actor, target)
        .run();
  } else {
    id.parse(target);
    const table = action === "like" ? "social_like" : "social_bookmark";
    const visible = `SELECT id FROM social_public v WHERE id=?2 AND ${allowedPerson("v.owner")}`;
    if (active) {
      const [targetRow] = await c.env.DB.batch([
        c.env.DB.prepare(visible).bind(actor, target),
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO ${table}(actor,post) SELECT ?1,id FROM (${visible})`,
        ).bind(actor, target),
      ]);
      if (!targetRow.results.length) throw missing();
    } else
      await c.env.DB.prepare(`DELETE FROM ${table} WHERE actor=? AND post=?`)
        .bind(actor, target)
        .run();
  }
  return c.json({ active });
});
social.get("/me/social/blocks", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT p.username FROM social_block b JOIN profile p ON p.user_id=b.blocked WHERE b.blocker=? AND p.username>? ORDER BY p.username LIMIT 17",
  )
    .bind(c.get("owner"), handle.optional().parse(c.req.query("after")) ?? "")
    .all();
  return c.json({
    people: results.slice(0, 16),
    next: results.length > 16 ? results[15].username : null,
  });
});
social.post("/me/social/report", async (c) => {
  const owner = c.get("owner"),
    data = z
      .object({
        kind: z.enum(["post", "profile"]),
        target: z.string().max(64),
        reason: z.string().trim().min(1).max(300),
      })
      .strict()
      .parse(await c.req.json());
  limit(c, "report:" + owner, 5);
  const post = data.kind === "post",
    target = post ? id.parse(data.target) : handle.parse(data.target);
  const query = post
    ? `SELECT id FROM social_public v WHERE id=?2 AND owner<>?1 AND ${allowedPerson("v.owner")}`
    : `SELECT user_id AS id FROM profile p WHERE username=?2 AND published=1 AND social_hidden=0 AND user_id<>?1 AND ${allowedPerson("p.user_id")}`;
  const [found] = await c.env.DB.batch([
    c.env.DB.prepare(query).bind(owner, target),
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO social_report(reporter,${post ? "post" : "person"},id,reason) SELECT ?1,id,?3,?4 FROM (${query})`,
    ).bind(owner, target, crypto.randomUUID(), data.reason),
  ]);
  if (!found.results.length) throw missing();
  return c.json({ received: true });
});

// Render previews from the same consent view as the JSON reader. The static SPA
// still handles navigation and authenticated interactions after the initial load.
export async function socialDocument(c: C) {
  limit(c, "social-read:" + (c.req.header("CF-Connecting-IP") ?? "local"), 120);
  const row = await c.env.DB.prepare(
    `SELECT v.title,v.display_name,v.caption FROM social_public v WHERE v.id=?2 AND ${allowedPerson("v.owner")}`,
  )
    .bind(await viewer(c), c.req.param("id"))
    .first<{ title: string; display_name: string; caption: string }>();
  const base = await c.env.ASSETS.fetch(new URL("/index.html", c.req.url));
  const headers = new Headers(base.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.delete("etag");
  headers.delete("content-length");
  const html = new Response(base.body, { status: row ? 200 : 404, headers });
  if (!row) return html;
  const title = row.title + " · " + row.display_name + " · suni.";
  const esc = (v: string) =>
    v
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  return new HTMLRewriter()
    .on("title", { element: (e) => void e.setInnerContent(title) })
    .on('meta[property="og:title"],meta[property="og:description"]', {
      element: (e) => void e.remove(),
    })
    .on("head", {
      element: (e) =>
        void e.append(
          '<meta property="og:title" content="' +
            esc(title) +
            '"><meta property="og:description" content="' +
            esc(row.caption || row.title) +
            '">',
          { html: true },
        ),
    })
    .transform(html);
}
