import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { youtubeCover } from "../shared/artwork.ts";
import {
  historyKey,
  historyBatchSize,
  historyUrl,
  validId,
} from "../shared/history.ts";
const count = z.number().int().min(0).max(500000);
const stamp = z.string().datetime().nullable();
const item = z
  .object({
    provider: z.enum(["spotify", "youtube"]),
    id: z.string().max(22),
    title: z.string().trim().min(1).max(300),
    creator: z.string().trim().max(160),
    evidence: z
      .object({
        stream: count,
        watch: count,
        playlist: count,
        saved: count,
        first: stamp,
        last: stamp,
        playedMs: z
          .number()
          .int()
          .min(0)
          .max(500000 * 604800000)
          .nullable(),
        durationMs: z.number().int().min(0).max(604800000).nullable(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (r) =>
      validId(r.provider, r.id) &&
      (r.provider === "spotify"
        ? r.evidence.stream > 0 &&
          !(r.evidence.watch + r.evidence.playlist + r.evidence.saved)
        : r.evidence.stream === 0 &&
          r.evidence.playedMs === null &&
          r.evidence.watch + r.evidence.playlist + r.evidence.saved > 0) &&
      (!r.evidence.first ||
        !r.evidence.last ||
        r.evidence.first <= r.evidence.last),
  );
const input = z
  .object({
    run: z.string().uuid(),
    status: z.enum(["want", "listening", "finished"]),
    items: z.array(z.unknown()).min(1).max(historyBatchSize),
  })
  .strict();
export async function importScope(owner: string) {
  const hash = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("suni.history.v1/" + owner),
    ),
  );
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function savedIdentities(
  db: D1Database,
  owner: string,
  raw: string | undefined,
) {
  let cursor: [string, string] | null = null;
  if (raw)
    try {
      if (raw.length > 200) throw Error();
      cursor = z
        .tuple([z.string().datetime(), z.string().max(64)])
        .parse(JSON.parse(atob(raw)));
    } catch {
      throw new HTTPException(400, { message: "Invalid history cursor." });
    }
  const { results } = await db
    .prepare(
      "SELECT id,created_at,provider,external_id FROM entry WHERE owner=? " +
        (cursor ? "AND (created_at,id)>(?,?) " : "") +
        "ORDER BY created_at,id LIMIT 251",
    )
    .bind(owner, ...(cursor ?? []))
    .all<{
      id: string;
      created_at: string;
      provider: string;
      external_id: string;
    }>();
  const page = results.slice(0, 250),
    last = page.at(-1);
  return {
    keys: page
      .filter((x) => x.provider === "spotify" || x.provider === "youtube")
      .map((x) => x.provider + ":" + x.external_id),
    next:
      results.length > 250 && last
        ? btoa(JSON.stringify([last.created_at, last.id]))
        : null,
  };
}
// No upstream requests. The four statements share a D1 transaction. Source and
// entry uniqueness also protect simultaneous manual saves and unrelated runs.
export async function importBatch(
  db: D1Database,
  owner: string,
  guard: string | undefined,
  body: unknown,
) {
  if (guard !== (await importScope(owner)))
    throw new HTTPException(409, {
      message: "Your account changed. Reopen the importer.",
    });
  const batch = input.parse(body);
  const rows: {
    item: z.infer<typeof item>;
    media: string;
    entry: string;
    url: string;
  }[] = [];
  const seen = new Set<string>();
  const outcomes: ("added" | "existing" | "invalid")[] = batch.items.map(
    (raw) => {
      const valid = item.safeParse(raw);
      if (!valid.success) return "invalid";
      const key = historyKey(valid.data);
      if (seen.has(key)) return "invalid";
      seen.add(key);
      rows.push({
        item: valid.data,
        media: crypto.randomUUID(),
        entry: crypto.randomUUID(),
        url: historyUrl(valid.data.provider, valid.data.id),
      });
      return "existing";
    },
  );
  if (!rows.length) return { outcomes };
  const data = JSON.stringify(
    rows.map((r) => ({
      ...r.item,
      media: r.media,
      entry: r.entry,
      url: r.url,
      artwork: youtubeCover(r.item.provider, r.item.id),
    })),
  );
  const from = " FROM json_each(?) j ";
  const join =
    " JOIN source s ON s.provider=j.value->>'$.provider' AND s.external_id=j.value->>'$.id' ";
  const now = new Date().toISOString();
  const response = await db.batch([
    db
      .prepare(
        "INSERT INTO media(id) SELECT j.value->>'$.media'" +
          from +
          "WHERE NOT EXISTS (SELECT 1 FROM source s WHERE s.provider=j.value->>'$.provider' AND s.external_id=j.value->>'$.id')",
      )
      .bind(data),
    db
      .prepare(
        "INSERT INTO source(provider,external_id,url,media_id) SELECT j.value->>'$.provider',j.value->>'$.id',j.value->>'$.url',j.value->>'$.media'" +
          from +
          "WHERE true ON CONFLICT(provider,external_id) DO NOTHING",
      )
      .bind(data),
    db
      .prepare(
        "INSERT INTO entry(id,owner,media_id,provider,external_id,kind,title,creator,show_name,artwork,status,finished_at,created_at,updated_at,provenance,import_key,history_evidence,history_run,cover_auto) " +
          "SELECT j.value->>'$.entry',?,s.media_id,s.provider,s.external_id,'podcast',j.value->>'$.title',j.value->>'$.creator',j.value->>'$.creator',coalesce(nullif(j.value->>'$.artwork',''),s.cover_art),?,?,?,?, 'history',s.provider||':'||s.external_id,j.value->'$.evidence',?,1" +
          from +
          join +
          "WHERE true ON CONFLICT(owner,media_id) DO NOTHING",
      )
      .bind(
        owner,
        batch.status,
        batch.status === "finished" ? now : null,
        now,
        now,
        batch.run,
        data,
      ),
    db
      .prepare(
        "SELECT e.history_run AS run" +
          from +
          join +
          "JOIN entry e ON e.owner=? AND e.media_id=s.media_id ORDER BY cast(j.key as integer)",
      )
      .bind(data, owner),
  ]);
  const confirmed = response[3].results as { run: string | null }[];
  if (confirmed.length !== rows.length) throw Error("Unconfirmed import batch");
  let n = 0;
  return {
    outcomes: outcomes.map((o) =>
      o === "invalid"
        ? o
        : confirmed[n++].run === batch.run
          ? "added"
          : "existing",
    ),
  };
}
