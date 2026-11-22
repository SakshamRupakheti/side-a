import type { Env } from "./auth";
import { HTTPException } from "hono/http-exception";

const bad = (message: string) => new HTTPException(400, { message });
export function parseSource(raw: string) {
  if (!raw)
    return { provider: "manual", external_id: crypto.randomUUID(), url: "" };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw bad("Enter a complete HTTPS source link.");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(u.hostname) ||
    /(?:^|\.)(?:local|localhost|internal|test|invalid)$/.test(u.hostname)
  )
    throw bad("Use a public HTTPS source link.");
  if (u.hostname === "open.spotify.com") {
    const id = u.pathname.match(
      /^\/(?:intl-[a-z-]+\/)?(episode|audiobook)\/([a-zA-Z0-9]{22})\/?$/,
    );
    if (!id) throw bad("Use a Spotify episode or audiobook link.");
    return {
      provider: "spotify",
      external_id: id[2],
      url: "https://open.spotify.com/" + id[1] + "/" + id[2],
    };
  }
  if (
    [
      "youtu.be",
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
    ].includes(u.hostname)
  ) {
    const id =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : u.pathname === "/watch"
          ? u.searchParams.get("v")
          : u.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)\/?$/)?.[1];
    if (!id || !/^[\w-]{11}$/.test(id)) throw bad("Use a YouTube video link.");
    return {
      provider: "youtube",
      external_id: id,
      url: "https://www.youtube.com/watch?v=" + id,
    };
  }
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (key.startsWith("utm_")) u.searchParams.delete(key);
  u.searchParams.sort();
  return { provider: "publisher", external_id: u.href, url: u.href };
}
export function safeArt(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      /\.(scdn\.co|spotifycdn\.com|ytimg\.com)$/.test(u.hostname)
      ? u.href
      : "";
  } catch {
    return "";
  }
}
async function json(url: URL, headers?: Record<string, string>) {
  const res = await fetch(url, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error("Provider unavailable");
  return res.json();
}
export async function metadata(raw: string) {
  const src = parseSource(raw);
  const fallback = {
    url: src.url,
    title: "",
    creator: "",
    artwork: "",
    available: false,
  };
  if (!["spotify", "youtube"].includes(src.provider)) return fallback;
  const endpoint = new URL(
    src.provider === "spotify"
      ? "https://open.spotify.com/oembed"
      : "https://www.youtube.com/oembed",
  );
  endpoint.searchParams.set("url", src.url);
  if (src.provider === "youtube") endpoint.searchParams.set("format", "json");
  try {
    const data = (await json(endpoint)) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
      html?: string;
    };
    let title = data.title || "";
    // Some YouTube responses supply the title only as the iframe's accessible name.
    if (!title && src.provider === "youtube" && typeof data.html === "string") {
      await new HTMLRewriter()
        .on("iframe[title]", {
          element(el) {
            title ||= el.getAttribute("title") || "";
          },
        })
        .transform(new Response(data.html.slice(0, 8192)))
        .text();
    }
    return {
      ...fallback,
      title: title.slice(0, 250),
      creator: String(data.author_name || "").slice(0, 180),
      artwork: safeArt(data.thumbnail_url || ""),
      available: Boolean(title),
    };
  } catch {
    return fallback;
  }
}
type Show = { title: string; creator: string; url: string };
function link(raw: string) {
  try {
    return parseSource(raw).url;
  } catch {
    return "";
  }
}
export async function searchShows(term: string, env: Env) {
  if (env.PODCAST_INDEX_KEY && env.PODCAST_INDEX_SECRET) {
    try {
      const time = String(Math.floor(Date.now() / 1000));
      const bytes = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-1",
          new TextEncoder().encode(
            env.PODCAST_INDEX_KEY + env.PODCAST_INDEX_SECRET + time,
          ),
        ),
      );
      const token = Array.from(bytes, (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
      const endpoint = new URL(
        "https://api.podcastindex.org/api/1.0/search/byterm",
      );
      endpoint.search = new URLSearchParams({ q: term, max: "12" }).toString();
      const data = (await json(endpoint, {
        "X-Auth-Key": env.PODCAST_INDEX_KEY,
        "X-Auth-Date": time,
        Authorization: token,
        "User-Agent": "PoFolio-Diary/1.0",
      })) as { feeds: { title: string; author: string; link: string }[] };
      return {
        source: "Podcast Index",
        results: data.feeds
          .map((f) => ({
            title: f.title,
            creator: f.author,
            url: link(f.link),
          }))
          .filter((f) => f.url && f.title),
      };
    } catch {
      /* The keyless catalog is available independently. */
    }
  }
  try {
    const url = new URL("https://itunes.apple.com/search");
    url.search = new URLSearchParams({
      media: "podcast",
      entity: "podcast",
      limit: "12",
      term,
    }).toString();
    const data = (await json(url)) as {
      results: {
        collectionName: string;
        artistName: string;
        collectionViewUrl: string;
      }[];
    };
    const results: Show[] = data.results
      .map((s) => ({
        title: s.collectionName,
        creator: s.artistName,
        url: link(s.collectionViewUrl),
      }))
      .filter((s) => s.url && s.title);
    return { source: "Apple Podcasts", results };
  } catch {
    throw new HTTPException(503, {
      message:
        "Podcast search is unavailable. You can still log a source link or a title.",
    });
  }
}
