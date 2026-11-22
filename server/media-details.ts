import type { Env } from "./auth";
type Source = { provider: string; external_id: string; url: string };
export interface MediaInfo {
  title: string;
  creator: string;
  artwork: string;
  source_description: string;
  duration_seconds: number | null;
}
const str = (v: unknown, n: number) =>
  typeof v === "string" ? v.trim().slice(0, n) : "";
const seconds = (n: number) =>
  Number.isFinite(n) && n >= 1 && n <= 35999999 ? Math.round(n) : null;
function isoTime(v: unknown) {
  const m =
    typeof v === "string" &&
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(v);
  return m
    ? seconds(
        Number(m[1] || 0) * 86400 +
          Number(m[2] || 0) * 3600 +
          Number(m[3] || 0) * 60 +
          Number(m[4] || 0),
      )
    : null;
}
async function get(url: URL | string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) throw new Error("Metadata unavailable");
  return res;
}
export const publisherHosts = [
  "99percentinvisible.org",
  "songexploder.net",
  "onbeing.org",
  "librivox.org",
  "www.nfb.ca",
];
export async function richDetails(
  src: Source,
  env: Partial<Env>,
): Promise<MediaInfo | null> {
  if (src.provider === "youtube" && env.YOUTUBE_DATA_API_KEY) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.search = new URLSearchParams({
      id: src.external_id,
      part: "snippet,contentDetails",
    }).toString();
    const data = (await (
      await get(url, {
        headers: { "X-Goog-Api-Key": env.YOUTUBE_DATA_API_KEY },
      })
    ).json()) as {
      items?: {
        snippet: {
          title: string;
          description: string;
          channelTitle: string;
          thumbnails?: { high?: { url: string } };
        };
        contentDetails: { duration: string };
      }[];
    };
    const v = data.items?.[0];
    if (!v) return null;
    return {
      title: str(v.snippet.title, 250),
      creator: str(v.snippet.channelTitle, 180),
      artwork: str(v.snippet.thumbnails?.high?.url, 2048),
      source_description: str(v.snippet.description, 8000),
      duration_seconds: isoTime(v.contentDetails.duration),
    };
  }
  if (
    src.provider === "spotify" &&
    env.SPOTIFY_CLIENT_ID &&
    env.SPOTIFY_CLIENT_SECRET
  ) {
    const token = (await (
      await get("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            btoa(env.SPOTIFY_CLIENT_ID + ":" + env.SPOTIFY_CLIENT_SECRET),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      })
    ).json()) as { access_token?: string };
    if (!token.access_token) return null;
    const kind = new URL(src.url).pathname.startsWith("/episode/")
      ? "episodes"
      : "audiobooks";
    const data = (await (
      await get(
        "https://api.spotify.com/v1/" +
          kind +
          "/" +
          src.external_id +
          "?market=US",
        { headers: { Authorization: "Bearer " + token.access_token } },
      )
    ).json()) as {
      name: string;
      description: string;
      duration_ms?: number;
      images?: { url: string }[];
      authors?: { name: string }[];
      show?: { publisher: string; name: string };
    };
    return {
      title: str(data.name, 250),
      creator: str(
        data.authors?.map((a) => a.name).join(", ") ||
          data.show?.publisher ||
          data.show?.name,
        180,
      ),
      artwork: str(data.images?.[0]?.url, 2048),
      source_description: str(data.description, 8000),
      duration_seconds: seconds(Number(data.duration_ms) / 1000),
    };
  }
  if (
    src.provider !== "publisher" ||
    !publisherHosts.includes(new URL(src.url).hostname)
  )
    return null;
  const res = await get(src.url);
  const info: MediaInfo = {
    title: "",
    creator: "",
    source_description: "",
    artwork: "",
    duration_seconds: null,
  };
  const reader = res.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const decoder = new TextDecoder();
  let head = "";
  try {
    while (size < 192 * 1024) {
      const chunk = await reader.read();
      if (chunk.done) break;
      head += decoder.decode(chunk.value.subarray(0, 192 * 1024 - size), {
        stream: true,
      });
      size += chunk.value.length;
      if (/<\/head>/i.test(head)) break;
    }
  } finally {
    await reader.cancel();
  }
  await new HTMLRewriter()
    .on("meta", {
      element(el) {
        const key = el.getAttribute("property") || el.getAttribute("name");
        const value = el.getAttribute("content") || "";
        if (key === "og:title") info.title = str(value, 250);
        if (
          key === "og:description" ||
          (key === "description" && !info.source_description)
        )
          info.source_description = str(value, 8000);
        if (key === "author") info.creator = str(value, 180);
        if (key === "og:image") info.artwork = str(value, 2048);
        if (key === "video:duration" || key === "music:duration")
          info.duration_seconds = seconds(Number(value));
      },
    })
    .on("meta[itemprop=duration]", {
      element(el) {
        info.duration_seconds ??= isoTime(el.getAttribute("content"));
      },
    })
    .transform(new Response(head))
    .text();
  return info;
}
