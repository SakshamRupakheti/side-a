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
  experience: z
    .object({
      source_description: line(8000),
      duration_seconds: z.number().int().positive().max(35999999).nullable(),
      personal_description: line(8000),
      reflection: line(8000),
      moments: z
        .array(
          z.object({
            timestamp: line(10),
            title: line(140),
            description: line(1500),
          }),
        )
        .max(24),
    })
    .superRefine((value, ctx) => {
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
export async function entries(db: D1Database, owner: string) {
  const { results } = await db
    .prepare(
      "SELECT " +
        publicColumns +
        ",e.id,e.note,e.replays,e.shared,e.finished_at,e.revision,e.experience" +
        sourceJoin +
        "WHERE e.owner=? ORDER BY e.updated_at DESC,e.id",
    )
    .bind(owner)
    .all<Omit<Entry, "experience"> & { experience: string | null }>();
  return results.map((e) => ({
    ...e,
    shared: !!e.shared,
    experience: e.experience
      ? (JSON.parse(e.experience) as Experience)
      : emptyExperience,
  }));
}
export async function statistics(
  db: D1Database,
  owner: string,
  publicOnly = false,
): Promise<Stats> {
  return (await db
    .prepare(
      `SELECT count(CASE WHEN kind='podcast' AND finished_at IS NOT NULL THEN 1 END) AS finished,
    count(DISTINCT CASE WHEN kind='podcast' AND (status='listening' OR finished_at IS NOT NULL) THEN nullif(lower(trim(show_name)),'') END) AS shows,
    coalesce(sum(replays),0) AS replays FROM entry WHERE owner=?` +
        (publicOnly ? " AND shared=1" : ""),
    )
    .bind(owner)
    .first<Stats>())!;
}
export async function publicPage(db: D1Database, username: string) {
  const p = await db
    .prepare(
      "SELECT user_id," +
        fields +
        " FROM profile WHERE username=? AND published=1",
    )
    .bind(username.toLowerCase())
    .first<Profile & { user_id: string }>();
  if (!p) throw missing();
  const stats = await statistics(db, p.user_id, true);
  const { results } = await db
    .prepare(
      "SELECT " +
        publicColumns +
        sourceJoin +
        "WHERE e.owner=? AND e.shared=1 ORDER BY e.updated_at DESC,e.id",
    )
    .bind(p.user_id)
    .all<PublicEntry>();
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
    entries: results,
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
            ",experience,finished_at,created_at,updated_at) SELECT ?,?,media_id,provider,external_id,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM source WHERE provider=? AND external_id=?",
        )
        .bind(
          id,
          owner,
          ...attributes(e),
          e.experience ? JSON.stringify(e.experience) : null,
          e.status === "finished" ? now : null,
          now,
          now,
          source.provider,
          source.external_id,
        ),
    ]);
  } catch (err) {
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
