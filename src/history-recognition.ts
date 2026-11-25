import {
  historyKey,
  validId,
  type Candidate,
  type Confidence,
  type EvidenceKind,
  type Provider,
  type Review,
} from "../shared/history.ts";

type Row = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const field = (r: Row, ...keys: string[]) =>
  keys.map((k) => text(r[k])).find(Boolean) ?? "";
const milliseconds = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 604800000
    ? v
    : null;
const channelAliases =
  /(?:\braj shamani\b|\bfiguring out\b|\branveer allahbadia\b|\bbeerbiceps\b|\bthe ranveer show\b|\bsushant pradhan\b|\bsanjay silwal gupta\b|^on air(?:\s+with\b|$))/i;
const episodeCue =
  /\b(?:podcast|episode|ep\.?\s*#?\s*\d+|fo\s*#?\d+|trs\s*#?\d+)\b/i;
const interview =
  /\b(interview|in conversation|full conversation|guest|talks with)\b/i;
const negative =
  /\b(?:official (?:music |lyric )?video|official audio|music video|lyrics video|shorts)\b/i;
function date(value: unknown) {
  const s = text(value);
  if (s.length > 100 || !/(?:19|20)\d{2}/.test(s)) return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}
function video(raw: string) {
  try {
    const u = new URL(raw);
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.port
    )
      return "";
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    if (
      ![
        "www.youtube.com",
        "youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(u.hostname)
    )
      return "";
    return u.pathname === "/watch"
      ? (u.searchParams.get("v") ?? "")
      : (u.pathname.match(/^\/(?:shorts|live)\/([\w-]+)\/?$/)?.[1] ?? "");
  } catch {
    return "";
  }
}

export class Organizer {
  scanned = 0;
  other = 0;
  unknown = 0;
  items = new Map<string, Candidate>();
  events = new Set<string>();
  private channels = new Map<string, Set<string>>();
  accept(raw: unknown, source: EvidenceKind | "auto") {
    if (++this.scanned > 500000)
      throw Error(
        "Choose fewer files at once (500,000 activity rows per review).",
      );
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      this.unknown++;
      return;
    }
    const r = raw as Row;
    const spotify =
      source === "stream" ||
      (source === "auto" &&
        ("spotify_episode_uri" in r ||
          "spotify_track_uri" in r ||
          "episodeName" in r ||
          "ms_played" in r ||
          "msPlayed" in r));
    const provider: Provider = spotify ? "spotify" : "youtube";
    const kind: EvidenceKind = spotify
      ? "stream"
      : source === "auto"
        ? "watch"
        : source;
    const link = field(r, "titleUrl", "url", "Video URL");
    const uri = field(r, "spotify_episode_uri", "episode_uri", "episodeUri");
    const id = spotify
      ? (uri.match(/^spotify:episode:([A-Za-z0-9]{22})$/)?.[1] ?? "")
      : field(r, "videoId", "Video ID", "video_id") || video(link);
    const rawTitle = (
      spotify
        ? field(r, "episode_name", "episodeName")
        : field(r, "title", "Video Title", "Title", "videoTitle").replace(
            /^Watched\s+/i,
            "",
          )
    ).slice(0, 300);
    const title = /^(?:https?:\/\/\S+|\[?(?:deleted|private) video\]?)$/i.test(
      rawTitle,
    )
      ? ""
      : rawTitle;
    const subs = Array.isArray(r.subtitles) ? r.subtitles[0] : null;
    const creator = (
      spotify
        ? field(r, "episode_show_name", "podcastName", "showName")
        : text(subs?.name) ||
          field(r, "channelTitle", "Channel Title", "channel", "Channel Name")
    ).slice(0, 160);
    if (!validId(provider, id)) {
      if (
        spotify &&
        (r.spotify_track_uri || r.master_metadata_track_name || r.trackName)
      )
        this.other++;
      else this.unknown++;
      return;
    }
    const when = date(
      r.ts ??
        r.endTime ??
        r.time ??
        r["Time Added"] ??
        r.timeAdded ??
        r.publishedAt,
    );
    const played = spotify ? milliseconds(r.ms_played ?? r.msPlayed) : null;
    const duration = milliseconds(r.duration_ms ?? r["Approx Duration (ms)"]);
    const key = historyKey({ provider, id });
    const event = JSON.stringify([key, kind, when, played]);
    const repeat = this.events.has(event);
    this.events.add(event);
    let item = this.items.get(key);
    if (!item) {
      if (this.items.size >= 50000)
        throw Error(
          "Choose fewer files at once (50,000 unique items per review).",
        );
      item = {
        provider,
        id,
        title,
        creator,
        confidence: "unknown",
        reason: "Missing episode information",
        evidence: {
          stream: 0,
          watch: 0,
          playlist: 0,
          saved: 0,
          first: null,
          last: null,
          playedMs: null,
          durationMs: null,
        },
      };
      this.items.set(key, item);
    }
    if (!item.title) item.title = title;
    if (!item.creator) item.creator = creator;
    const e = item.evidence;
    if (!repeat) {
      e[kind]++;
      if (played !== null) e.playedMs = (e.playedMs ?? 0) + played;
    }
    if (when) {
      if (!e.first || when < e.first) e.first = when;
      if (!e.last || when > e.last) e.last = when;
    }
    if (duration !== null) e.durationMs = duration;
    const channel = item.creator.toLocaleLowerCase();
    let confidence: Confidence = "other",
      reason = "No podcast signal";
    if (!item.title) {
      confidence = "unknown";
      reason = "No exported video title";
    } else if (spotify) {
      confidence = "recognized";
      reason = "Spotify episode URI";
    } else if (
      r.header === "YouTube Music" ||
      /\/shorts\/|music\.youtube\.com\//i.test(link) ||
      negative.test(item.title)
    ) {
      reason = "Music or short-form video";
      item.reason = reason;
      item.confidence = "other";
      return;
    } else if (
      channelAliases.test(item.creator) &&
      (episodeCue.test(item.title) ||
        interview.test(item.title) ||
        channelAliases.test(item.title))
    ) {
      confidence = "recognized";
      reason = "Podcast creator and episode title";
    } else if (
      /\bpodcast\b/i.test(item.title) &&
      episodeCue.test(item.creator)
    ) {
      confidence = "recognized";
      reason = "Podcast title and channel";
    } else if (
      channelAliases.test(item.creator) ||
      episodeCue.test(item.title) ||
      episodeCue.test(item.creator) ||
      interview.test(item.title)
    ) {
      confidence = "review";
      reason =
        duration !== null && duration >= 1800000
          ? "Podcast signal and long duration"
          : "Possible podcast creator or title";
    }
    if (item.reason === "Music or short-form video") return;
    item.confidence = confidence;
    item.reason = reason;
    if (channel && episodeCue.test(item.title) && confidence !== "other") {
      const examples = this.channels.get(channel) ?? new Set();
      examples.add(id);
      this.channels.set(channel, examples);
    }
  }
  result(): Review {
    const items: Candidate[] = [];
    let other = this.other,
      unknown = this.unknown;
    for (const item of this.items.values()) {
      if (
        item.provider === "youtube" &&
        item.confidence === "other" &&
        item.reason === "No podcast signal" &&
        (this.channels.get(item.creator.toLocaleLowerCase())?.size ?? 0) >= 2
      ) {
        item.confidence = "review";
        item.reason = "Channel with multiple episode titles in this export";
      }
      if (item.confidence === "other") other++;
      else if (item.confidence === "unknown") unknown++;
      else items.push(item);
    }
    return {
      scanned: this.scanned,
      other,
      unknown,
      items: items.sort(
        (a, b) =>
          (a.evidence.last ?? "").localeCompare(b.evidence.last ?? "") ||
          historyKey(a).localeCompare(historyKey(b)),
      ),
    };
  }
}
