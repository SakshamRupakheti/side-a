import type { Env } from "./auth";
import { metadata, parseSource, safeArt } from "./providers.ts";
import { publisherHosts } from "./media-details.ts";
import { youtubeCover } from "../shared/artwork.ts";

const DAY = 86400000;
function eligible(env: Partial<Env>) {
  const hosts = publisherHosts.filter(
    (h) =>
      !env.BETTER_AUTH_URL?.startsWith("https://") ||
      env.PUBLISHER_METADATA_HOSTS?.split(",")
        .map((x) => x.trim())
        .includes(h),
  );
  return (
    "(e.provider IN ('youtube','spotify')" +
    hosts
      .map(
        (h) =>
          ` OR (e.provider='publisher' AND e.external_id LIKE 'https://${h}/%')`,
      )
      .join("") +
    ")"
  );
}
export async function coverStatus(
  db: D1Database,
  owner: string,
  env: Partial<Env>,
) {
  return db
    .prepare(
      `SELECT count(*) AS missing,
    coalesce(sum(e.cover_auto=1 AND e.cover_after<=?),0) AS automatic,
    coalesce(sum(e.cover_after<=?),0) AS ready
    FROM entry e WHERE e.owner=? AND e.cover_auto IN (0,1) AND e.artwork='' AND ${eligible(env)}`,
    )
    .bind(Date.now(), Date.now(), owner)
    .first<{ missing: number; automatic: number; ready: number }>();
}

// One entry and at most one upstream lookup per request. Persistent source leases
// deduplicate across users/isolates; provider gates bound upstream concurrency.
export async function repairCover(
  db: D1Database,
  owner: string,
  env: Partial<Env>,
  automatic = false,
  id?: string,
) {
  const now = Date.now();
  const row = await db
    .prepare(
      `SELECT e.id,e.revision,e.provider,e.external_id,s.url,s.cover_art,s.cover_after AS source_after
    FROM entry e JOIN source s ON s.provider=e.provider AND s.external_id=e.external_id
    WHERE e.owner=? AND e.artwork='' AND e.cover_auto ${automatic ? "=1" : "IN (0,1)"} AND e.cover_after<=?
    AND ${eligible(env)} ${id ? "AND e.id=?" : ""} ORDER BY e.cover_auto,e.cover_after,e.id LIMIT 1`,
    )
    .bind(owner, now, ...(id ? [id] : []))
    .first<{
      id: string;
      revision: number;
      provider: string;
      external_id: string;
      url: string;
      cover_art: string;
      source_after: number;
    }>();
  if (!row)
    return { done: true, processed: 0, restored: 0, unresolved: 0, wait: 0 };
  let art =
    youtubeCover(row.provider, row.external_id) || safeArt(row.cover_art);
  let retry = row.source_after;
  if (!art && retry <= now) {
    if (env.DISABLE_LOOKUPS === "true")
      return {
        done: false,
        processed: 0,
        restored: 0,
        unresolved: 0,
        wait: 60,
        paused: true,
      };
    // Canonical source identity must agree before trusting a stored destination.
    let valid = false;
    try {
      const parsed = parseSource(row.url);
      valid =
        parsed.provider === row.provider &&
        parsed.external_id === row.external_id;
    } catch {
      /* invalid legacy source */
    }
    if (valid) {
      const gate = await db
        .prepare(
          `INSERT INTO cover_provider(provider,next_at) VALUES(?,?)
        ON CONFLICT(provider) DO UPDATE SET next_at=excluded.next_at WHERE cover_provider.next_at<=? RETURNING provider`,
        )
        .bind(row.provider, now + 1200, now)
        .first();
      if (!gate) {
        const next = await db
          .prepare("SELECT next_at FROM cover_provider WHERE provider=?")
          .bind(row.provider)
          .first<number>("next_at");
        return {
          done: false,
          processed: 0,
          restored: 0,
          unresolved: 0,
          wait: Math.max(2, Math.ceil(((next ?? now + 2000) - now) / 1000)),
        };
      }
      const lease = await db
        .prepare(
          "UPDATE source SET cover_after=? WHERE provider=? AND external_id=? AND cover_art='' AND cover_after<=? RETURNING provider",
        )
        .bind(now + 30000, row.provider, row.external_id, now)
        .first();
      if (!lease)
        return {
          done: false,
          processed: 0,
          restored: 0,
          unresolved: 0,
          wait: 2,
        };
      // Keyless Spotify oEmbed: no token exchange or optional paid API path.
      art = safeArt(
        (
          await metadata(row.url, {
            BETTER_AUTH_URL: env.BETTER_AUTH_URL,
            PUBLISHER_METADATA_HOSTS: env.PUBLISHER_METADATA_HOSTS,
          }).catch(() => null)
        )?.artwork ?? "",
      );
      retry = now + DAY;
      await db
        .prepare(
          "UPDATE source SET cover_art=?,cover_after=? WHERE provider=? AND external_id=? AND cover_art='' AND cover_after=?",
        )
        .bind(art, retry, row.provider, row.external_id, now + 30000)
        .run();
      if (!art)
        await db
          .prepare(
            "UPDATE cover_provider SET next_at=max(next_at,?) WHERE provider=?",
          )
          .bind(now + 60000, row.provider)
          .run();
    } else retry = now + DAY;
  }
  if (!art && retry <= now + 30000)
    return { done: false, processed: 0, restored: 0, unresolved: 0, wait: 2 };
  const result = art
    ? await db
        .prepare(
          "UPDATE entry SET artwork=?,artwork_auto=1,cover_auto=0,cover_after=0 WHERE owner=? AND id=? AND artwork='' AND revision=? AND provider=? AND external_id=?",
        )
        .bind(art, owner, row.id, row.revision, row.provider, row.external_id)
        .run()
    : await db
        .prepare(
          "UPDATE entry SET cover_after=? WHERE owner=? AND id=? AND artwork='' AND revision=?",
        )
        .bind(retry || now + DAY, owner, row.id, row.revision)
        .run();
  return {
    done: false,
    processed: 1,
    restored: art ? result.meta.changes : 0,
    unresolved: art ? 0 : result.meta.changes,
    wait: 0,
  };
}
