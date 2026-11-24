export const historyBatchSize = 16;
export type Provider = "spotify" | "youtube";
export type EvidenceKind = "stream" | "watch" | "playlist" | "saved";
export type Confidence = "recognized" | "review" | "other" | "unknown";
export interface HistoryItem {
  provider: Provider;
  id: string;
  title: string;
  creator: string;
  evidence: {
    stream: number;
    watch: number;
    playlist: number;
    saved: number;
    first: string | null;
    last: string | null;
    playedMs: number | null;
    durationMs: number | null;
  };
}
export interface Candidate extends HistoryItem {
  confidence: Confidence;
  reason: string;
}
export interface Review {
  scanned: number;
  other: number;
  unknown: number;
  items: Candidate[];
}
export const historyKey = (row: Pick<HistoryItem, "provider" | "id">) =>
  row.provider + ":" + row.id;
export const validId = (provider: Provider, id: string) =>
  (provider === "spotify" ? /^[A-Za-z0-9]{22}$/ : /^[\w-]{11}$/).test(id);
export const historyUrl = (provider: Provider, id: string) =>
  (provider === "spotify"
    ? "https://open.spotify.com/episode/"
    : "https://www.youtube.com/watch?v=") + id;
