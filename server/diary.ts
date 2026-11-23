import { z } from "zod";
import {
  emptyExperience,
  timestampSeconds,
  type Experience,
} from "../shared/experience";
import { HTTPException } from "hono/http-exception";
import { parseSource, safeArt } from "./providers";
import {
  milestones,
  formats,
  type DeckEntry,
  type DeckPage,
  type Stats,
  type Profile,
  type Entry,
  type PublicEntry,
} from "../shared/diary";

const line = (max: number) => z.string().trim().max(max);
export const profileInput = z.object({
  username: line(30)
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9_]{2,29}$/,
      "Use 3–30 lowercase letters, numbers or underscores.",
    ),
  display_name: line(80).min(1),
  bio: line(400),
  published: z.boolean(),
  show_finished: z.boolean(),
  show_shows: z.boolean(),
  show_replays: z.boolean(),
  show_badges: z.boolean(),
});
export const entryInput = z.object({
  import_key: z.string().uuid().optional(),
  experience: z
    .object({
      source_description: line(8000),
      duration_origin: z.enum(["provider", "manual", "unknown"]).optional(),
      duration_seconds: z.number().int().positive().max(35999999).nullable(),
      personal_description: line(8000),
      reflection: line(8000),
      moments: z
        .array(
          z.object({
            id: z
              .string()
              .regex(/^(?:[a-f0-9-]{36}|legacy-\d{1,2})$/)
              .optional(),
            shared: z.boolean().optional(),
            timestamp: line(10),
            title: line(140),
            description: line(1500),
          }),
        )
        .max(24),
    })
    .superRefine((value, ctx) => {
      const ids = value.moments.flatMap((m) => (m.id ? [m.id] : []));
      if (new Set(ids).size !== ids.length)
        ctx.addIssue({
          code: "custom",
          message: "Moment identifiers must be unique.",
        });
      if (
        value.duration_seconds === null &&
        value.duration_origin &&
        value.duration_origin !== "unknown"
      )
        ctx.addIssue({
          code: "custom",
          message: "A duration is required for this provenance.",
        });
      value.moments.forEach((moment, index) => {
        const seconds = timestampSeconds(moment.timestamp);
        if (
          moment.timestamp &&
          (seconds === null ||
            (value.duration_seconds !== null &&
              seconds > value.duration_seconds))
        )
          ctx.addIssue({
            code: "custom",
            path: ["moments", index, "timestamp"],
            message: "Enter HH:MM:SS within the duration of this listen.",
          });
        if (!moment.title && !moment.description && !moment.timestamp)
          ctx.addIssue({
            code: "custom",
            path: ["moments", index],
            message: "Add a title, description, or timestamp for this moment.",
          });
      });
    })
    .optional(),
  url: line(2048),
  title: line(250).min(1, "Enter a title."),
  creator: line(180),
  show_name: line(180),
  artwork: line(2048)
    .refine(
      (s) => !s || Boolean(safeArt(s)),
      "Use artwork from a supported media provider or leave it blank.",
    )
    .transform(safeArt),
  kind: z.enum(formats),
  status: z.enum(["want", "listening", "finished"]),
  rating: z.number().int().min(1).max(5).nullable(),
  replays: z.number().int().min(0).max(100000),
  note: line(8000),
  takeaway: line(2000),
  shared: z.boolean(),
});
export type Input = z.infer<typeof entryInput>;
export const conflict = (message: string) =>
  new HTTPException(409, { message });
export const missing = () =>
  new HTTPException(404, { message: "This page or record is unavailable." });
const fields =
  "username, display_name, bio, published, show_finished, show_shows, show_replays, show_badges";
export async function getProfile(db: D1Database, owner: string) {
  const row = await db
    .prepare("SELECT " + fields + " FROM profile WHERE user_id=?")
    .bind(owner)
    .first<Profile>();
  return (
    row && {
      ...row,
      published: !!row.published,
      show_finished: !!row.show_finished,
      show_shows: !!row.show_shows,
      show_replays: !!row.show_replays,
      show_badges: !!row.show_badges,
    }
  );
}
export async function saveProfile(db: D1Database, owner: string, p: Profile) {
  const values = [
    p.username,
    p.display_name,
    p.bio,
    +p.published,
    +p.show_finished,
    +p.show_shows,
    +p.show_replays,
    +p.show_badges,
  ];
  try {
    await db
      .prepare(
        "INSERT INTO profile(user_id," +
          fields +
          ") VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET " +
          fields
            .split(", ")
            .map((f) => f + "=excluded." + f)
            .join(","),
      )
      .bind(owner, ...values)
      .run();
  } catch (err) {
    if (String(err).includes("UNIQUE constraint failed"))
      throw conflict("That username is already in use.");
    throw err;
  }
}
const sourceJoin =
  " FROM entry e JOIN source s ON e.provider=s.provider AND e.external_id=s.external_id ";
const publicColumns =
  "e.title,e.creator,e.show_name,e.artwork,e.kind,e.status,e.rating,e.takeaway,e.updated_at,s.url";
type Cursor = [string, string];
export function decodeCursor(raw?: string): Cursor | null {
  if (!raw) return null;
  try {
    if (raw.length > 180) throw Error();
    const pair = JSON.parse(atob(raw));
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      typeof pair[0] !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(pair[0]) ||
      typeof pair[1] !== "string" ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(pair[1])
    )
      throw Error();
    return [pair[0], pair[1]];
  } catch {
    throw new HTTPException(400, { message: "Invalid page cursor." });
  }
}
function pageOf<T extends { updated_at: string; id: string }>(rows: T[]) {
  const entries = rows.slice(0, 25),
    last = entries.at(-1);
  return {
    entries,
    next_cursor:
      rows.length > 25 && last
        ? btoa(JSON.stringify([last.updated_at, last.id]))
        : null,
  };
}
export async function entries(
  db: D1Database,
  owner: string,
  cursor: Cursor | null = null,
  paged = false,
  sources: ReturnType<typeof parseSource>[] = [],
  id?: string,
) {
  const mediaFilter = sources.length
    ? "AND e.media_id IN (SELECT media_id FROM source WHERE (provider,external_id) IN (" +
      sources.map(() => "(?,?)").join(",") +
      ")) "
    : "";
  const { results } = await db
    .prepare(
      "SELECT " +
        publicColumns +
        ",e.id,e.note,e.replays,e.shared,e.finished_at,e.revision,e.experience" +
        sourceJoin +
        "WHERE e.owner=? " +
        (id ? "AND e.id=? " : "") +
        mediaFilter +
        (cursor ? "AND (e.updated_at,e.id)<(?,?) " : "") +
        "ORDER BY e.updated_at DESC,e.id DESC" +
        (paged ? " LIMIT 26" : ""),
    )
    .bind(
      owner,
      ...(id ? [id] : []),
      ...sources.flatMap((s) => [s.provider, s.external_id]),
      ...(cursor ?? []),
    )
    .all<Omit<Entry, "experience"> & { experience: string | null }>();
  return results.map((e) => ({
    ...e,
    shared: !!e.shared,
    experience: e.experience
      ? (JSON.parse(e.experience) as Experience)
      : emptyExperience,
  }));
}
export function deckCursor(
  raw?: string,
): [string, string, number, number] | null {
  if (!raw) return null;
  try {
    if (raw.length > 240) throw Error();
    const values = JSON.parse(atob(raw));
    return z
      .tuple([
        z.string().datetime(),
        z.string().min(1).max(64),
        z.number().int().nonnegative(),
        z.number().int().nonnegative(),
      ])
      .parse(values);
  } catch {
    throw new HTTPException(400, { message: "Invalid collection cursor." });
  }
}
// A single D1 snapshot keeps the page, its absolute positions and its total consistent.
export async function deckPage(
  db: D1Database,
  owner: string,
  cursor: ReturnType<typeof deckCursor>,
  direction: "older" | "newer",
  anchor?: string,
): Promise<DeckPage> {
  if ((!cursor && direction === "newer") || (anchor && cursor))
    throw new HTTPException(400, { message: "Invalid collection window." });
  const key = "(e.created_at,e.id)";
  const anchorKey = "(SELECT created_at,id FROM entry WHERE owner=? AND id=?)";
  const boundary = anchor ? anchorKey : "(?,?)";
  const args = anchor ? [owner, anchor] : (cursor?.slice(0, 2) ?? []);
  const hasBoundary = !!anchor || !!cursor;
  const columns =
    "SELECT e.id,e.title,e.creator,e.show_name,e.kind,e.artwork,e.status,e.created_at,s.url" +
    sourceJoin +
    "WHERE e.owner=?";
  const page = (newer: boolean, limit: number) =>
    db
      .prepare(
        columns +
          (hasBoundary
            ? " AND " + key + (newer ? ">" : anchor ? "<=" : "<") + boundary
            : "") +
          (newer
            ? " ORDER BY e.created_at,e.id"
            : " ORDER BY e.created_at DESC,e.id DESC") +
          " LIMIT ?",
      )
      .bind(owner, ...args, limit);
  const totalQuery = db
    .prepare("SELECT total,revision FROM collection_size WHERE owner=?")
    .bind(owner);
  const queries = [
    totalQuery,
    page(!anchor && direction === "newer", anchor ? 13 : 25),
  ];
  if (anchor)
    queries.push(
      db
        .prepare(
          "SELECT count(*) AS n FROM entry e WHERE owner=? AND " +
            key +
            "<=" +
            boundary,
        )
        .bind(owner, ...args),
    );
  if (anchor) queries.push(page(true, 12));
  const [count, rows, rank, after] = await db.batch(queries);
  const size = count.results[0] as
    { total: number; revision: number } | undefined;
  const total = size?.total ?? 0,
    revision = size?.revision ?? 0;
  if (cursor && (cursor[3] !== revision || cursor[2] >= total))
    throw conflict("The collection changed. Reload its window.");
  const newer = !anchor && direction === "newer";
  const before = rows.results as unknown as DeckEntry[];
  const end = rank
    ? Number((rank.results[0] as { n: number }).n)
    : cursor
      ? cursor[2] + Number(newer)
      : total;
  const start = newer ? end : end - before.length;
  const result = newer
    ? before
    : before.reverse().concat((after?.results ?? []) as unknown as DeckEntry[]);
  if (anchor && !result.some((e) => e.id === anchor)) throw missing();
  const encode = (e: DeckEntry, index: number) =>
    btoa(JSON.stringify([e.created_at, e.id, index, revision]));
  return {
    entries: result,
    total,
    start,
    revision,
    next_cursor: start > 0 && result.length ? encode(result[0], start) : null,
    newer_cursor:
      start + result.length < total && result.length
        ? encode(result[result.length - 1], start + result.length - 1)
        : null,
  };
}
export async function diaryPage(
  db: D1Database,
  owner: string,
  cursor: Cursor | null,
) {
  return pageOf(await entries(db, owner, cursor, true));
}
export async function statistics(
  db: D1Database,
  owner: string,
  publicOnly = false,
): Promise<Stats> {
  return (
    (await db
      .prepare(
        "SELECT finished,shows,replays FROM listener_total WHERE owner=? AND public_only=?",
      )
      .bind(owner, Number(publicOnly))
      .first<Stats>()) ?? { finished: 0, shows: 0, replays: 0 }
  );
}
export async function publicPage(
  db: D1Database,
  username: string,
  cursor: Cursor | null = null,
) {
  // A D1 batch reads profile consent, statistics and entries in one snapshot.
  const handle = username.toLowerCase();
  const [profile, history] = await db.batch([
    db
      .prepare(
        "SELECT " +
          fields +
          ",coalesce(t.finished,0) AS finished,coalesce(t.shows,0) AS shows,coalesce(t.replays,0) AS replays FROM profile p LEFT JOIN listener_total t ON t.owner=p.user_id AND t.public_only=1 WHERE username=? AND published=1",
      )
      .bind(handle),
    db
      .prepare(
        "SELECT " +
          publicColumns +
          ",e.id,(SELECT json_group_array(json_object('title',title,'reflection',reflection,'position_seconds',position_seconds)) FROM (SELECT title,reflection,position_seconds FROM favorite_moment WHERE entry_id=e.id AND shared=1 ORDER BY display_order)) AS moment_json" +
          sourceJoin +
          "JOIN profile gate ON gate.user_id=e.owner WHERE gate.published=1 AND gate.username=? AND e.shared=1 " +
          (cursor ? "AND (e.updated_at,e.id)<(?,?) " : "") +
          "ORDER BY e.updated_at DESC,e.id DESC LIMIT 26",
      )
      .bind(handle, ...(cursor ?? [])),
  ]);
  const p = profile.results[0] as unknown as Profile & Stats;
  if (!p) throw missing();
  const stats = p;
  const results = history.results as unknown as (PublicEntry & {
    id: string;
    moment_json: string;
  })[];
  const page = pageOf(results);
  return {
    name: p.display_name,
    username: p.username,
    bio: p.bio,
    stats: {
      ...(p.show_finished && { finished: stats.finished }),
      ...(p.show_shows && { shows: stats.shows }),
      ...(p.show_replays && { replays: stats.replays }),
    },
    badges: p.show_badges
      ? milestones.filter((n) => n <= stats.finished)
      : null,
    next_cursor: page.next_cursor,
    entries: page.entries.map(({ id: _id, moment_json, ...row }) => {
      void _id;
      return { ...row, moments: JSON.parse(moment_json) };
    }),
  };
}
function attributes(e: Input) {
  return [
    e.kind,
    e.title,
    e.creator,
    e.show_name,
    e.artwork,
    e.status,
    e.rating,
    e.note,
    e.takeaway,
    +e.shared,
    e.replays,
  ];
}
const columns =
  "kind,title,creator,show_name,artwork,status,rating,note,takeaway,shared,replays";
export async function createEntry(db: D1Database, owner: string, e: Input) {
  const source = parseSource(e.url);
  const fingerprint = e.import_key
    ? Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify(e)),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("")
    : null;
  async function replay() {
    if (!e.import_key) return null;
    const prior = await db
      .prepare(
        "SELECT id,request_hash FROM entry WHERE owner=? AND provenance='manual' AND import_key=?",
      )
      .bind(owner, e.import_key)
      .first<{ id: string; request_hash: string }>();
    if (prior && prior.request_hash !== fingerprint)
      throw conflict("This save key already identifies a different draft.");
    return prior?.id;
  }
  const existing = await replay();
  if (existing) return existing;
  if (e.replays && e.status !== "finished")
    throw new HTTPException(400, {
      message: "Finish this item before adding replays.",
    });
  const now = new Date().toISOString();
  const media = crypto.randomUUID(),
    id = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO media(id) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM source WHERE provider=? AND external_id=?)",
        )
        .bind(media, source.provider, source.external_id),
      db
        .prepare(
          "INSERT INTO source(provider,external_id,url,media_id) VALUES(?,?,?,?) ON CONFLICT(provider,external_id) DO NOTHING",
        )
        .bind(source.provider, source.external_id, source.url, media),
      db
        .prepare(
          "INSERT INTO entry(id,owner,media_id,provider,external_id," +
            columns +
            ",import_key,request_hash,experience,finished_at,created_at,updated_at) SELECT ?,?,media_id,provider,external_id,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM source WHERE provider=? AND external_id=?",
        )
        .bind(
          id,
          owner,
          ...attributes(e),
          e.import_key ?? null,
          fingerprint,
          e.experience ? JSON.stringify(e.experience) : null,
          e.status === "finished" ? now : null,
          now,
          now,
          source.provider,
          source.external_id,
        ),
    ]);
  } catch (err) {
    const retry = await replay();
    if (retry) return retry;
    if (
      String(err).includes(
        "UNIQUE constraint failed: entry.owner, entry.media_id",
      )
    )
      throw conflict(
        "This item is already in your diary. Open its entry to edit it or log a replay.",
      );
    throw err;
  }
  return id;
}
export async function updateEntry(
  db: D1Database,
  owner: string,
  id: string,
  revision: number,
  e: Input,
) {
  const old = await db
    .prepare(
      "SELECT e.finished_at,s.url" + sourceJoin + "WHERE e.owner=? AND e.id=?",
    )
    .bind(owner, id)
    .first<{ finished_at: string | null; url: string }>();
  if (!old) throw missing();
  if (e.url !== old.url)
    throw new HTTPException(400, {
      message: "The source link identifies this entry and cannot be changed.",
    });
  if (e.replays && !old.finished_at && e.status !== "finished")
    throw new HTTPException(400, {
      message: "Finish this item before adding replays.",
    });
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      "UPDATE entry SET " +
        columns
          .split(",")
          .map((f) => f + "=?")
          .join(",") +
        ",experience=coalesce(?,experience),finished_at=coalesce(finished_at,?),updated_at=?,revision=revision+1 WHERE owner=? AND id=? AND revision=?",
    )
    .bind(
      ...attributes(e),
      e.experience ? JSON.stringify(e.experience) : null,
      e.status === "finished" ? now : null,
      now,
      owner,
      id,
      revision,
    )
    .run();
  if (!result.meta.changes)
    throw conflict(
      "This entry changed in another tab. Reload your diary before editing it.",
    );
}
