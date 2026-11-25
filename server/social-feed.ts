export function allowedPerson(column: string) {
  return `NOT EXISTS(SELECT 1 FROM social_block WHERE (blocker=?1 AND blocked=${column}) OR (blocker=${column} AND blocked=?1))`;
}
// Both indexes use a unique public handle as the last ordering column.
export function wallQuery(fresh: boolean, after: boolean) {
  const key = fresh ? "wall_recent" : "wall_order";
  const direction = fresh ? "DESC" : "ASC";
  return `SELECT username,display_name,${key} AS sort_key,
    first_signal,deep_dive,explorer,thought_collector,sound_collector,
    EXISTS(SELECT 1 FROM social_follow WHERE follower=?1 AND followed=p.user_id) AS following,
    (SELECT json_group_array(json_object('artwork',artwork,'title',title,'url',url))
     FROM (SELECT v.artwork,v.title,v.url FROM wall_item w CROSS JOIN social_public v ON v.id=w.id
       WHERE w.owner=p.user_id AND w.podcast=1 ORDER BY w.published_at DESC,w.id DESC LIMIT 3)) AS covers
    FROM profile p INDEXED BY ${fresh ? "wall_fresh" : "wall_rank"}
    WHERE published=1 AND social_hidden=0 AND wall_recent IS NOT NULL
    ${fresh ? "" : "AND leaderboard_opt_in=1"} AND user_id<>?1 AND ${allowedPerson("p.user_id")}
    ${after ? "AND (" + key + ",username)" + (fresh ? "<" : ">") + "(?2,?3)" : ""}
    ORDER BY ${key} ${direction},username ${direction} LIMIT 13`;
}
export const momentJson = (entry: string) =>
  `(SELECT json_group_array(json_object('title',title,'reflection',reflection,'position_seconds',position_seconds)) FROM (SELECT title,reflection,position_seconds FROM favorite_moment WHERE entry_id=${entry} AND shared=1 ORDER BY display_order))`;
export const postFields = `v.id,v.username,v.display_name,v.title,v.creator,v.show_name,v.artwork,v.url,v.kind,v.caption,v.takeaway,v.published_at,
 CASE WHEN v.include_moments THEN ${momentJson("v.entry_id")} ELSE '[]' END AS moment_json,
 (SELECT count(*) FROM social_like WHERE post=v.id) AS likes,
 EXISTS(SELECT 1 FROM social_like WHERE post=v.id AND actor=?1) AS liked,
 EXISTS(SELECT 1 FROM social_bookmark WHERE post=v.id AND actor=?1) AS bookmarked,
 EXISTS(SELECT 1 FROM social_follow WHERE followed=v.owner AND follower=?1) AS following,
 v.owner=?1 AS mine`;

// Select small candidate sets before joining source data, moments and engagement.
// Following merges at most one page from each followed timeline, including ties.
export function feedQuery({
  actor,
  scope,
  cursor,
  author,
  match,
}: {
  actor: string;
  scope: string;
  cursor?: [string, string] | null;
  author?: string;
  match?: string;
}) {
  const bindings = [actor];
  const param = (s: string) => {
    bindings.push(s);
    return "?" + bindings.length;
  };
  const where = [allowedPerson("l.owner")];
  if (author)
    where.push(
      "l.owner=(SELECT user_id FROM profile WHERE username=" +
        param(author) +
        ")",
    );
  if (match)
    where.push(
      "l.rowid IN (SELECT rowid FROM social_search WHERE social_search MATCH " +
        param(match) +
        ")",
    );
  if (cursor)
    where.push(
      "(l.published_at,l.id)<(" +
        param(cursor[0]) +
        "," +
        param(cursor[1]) +
        ")",
    );
  const order = " ORDER BY l.published_at DESC,l.id DESC LIMIT 17";
  let candidates: string;
  if (scope === "following") {
    const perAuthor =
      "SELECT l.id FROM social_listing l INDEXED BY social_author_timeline WHERE l.owner=f.followed AND " +
      where.join(" AND ") +
      order;
    candidates =
      "SELECT l.id,l.published_at FROM social_follow f CROSS JOIN json_each((SELECT json_group_array(id) FROM (" +
      perAuthor +
      "))) items CROSS JOIN social_listing l ON l.id=items.value WHERE f.follower=?1" +
      order;
  } else {
    if (scope === "saved")
      where.push("l.id IN (SELECT post FROM social_bookmark WHERE actor=?1)");
    const index =
      scope === "discover" && !match
        ? author
          ? " INDEXED BY social_author_timeline"
          : " INDEXED BY social_timeline"
        : "";
    candidates =
      "SELECT l.id,l.published_at FROM social_listing l" +
      index +
      " WHERE " +
      where.join(" AND ") +
      order;
  }
  const sql = `WITH candidates AS MATERIALIZED (${candidates}) SELECT ${postFields} FROM candidates l CROSS JOIN social_public v ON v.id=l.id ORDER BY l.published_at DESC,l.id DESC`;
  return { sql, bindings };
}
