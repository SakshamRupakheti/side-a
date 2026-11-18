export const statuses = {
  want: "Want to Listen",
  listening: "Listening",
  finished: "Finished",
} as const;
export type Status = keyof typeof statuses;
export interface Draft {
  url: string;
  title: string;
  creator: string;
  show_name: string;
  artwork: string;
  kind: "podcast" | "audiobook";
  status: Status;
  note: string;
  takeaway: string;
  shared: boolean;
  rating: number | null;
  replays: number;
}
export interface Entry extends Draft {
  id: string;
  finished_at: string | null;
  updated_at: string;
  revision: number;
}
export interface Profile {
  username: string;
  display_name: string;
  bio: string;
  published: boolean;
  show_finished: boolean;
  show_shows: boolean;
  show_replays: boolean;
  show_badges: boolean;
}
export const emptyProfile: Profile = {
  username: "",
  display_name: "",
  bio: "",
  published: false,
  show_finished: false,
  show_shows: false,
  show_replays: false,
  show_badges: false,
};
export const blank: Draft = {
  url: "",
  title: "",
  creator: "",
  show_name: "",
  artwork: "",
  kind: "podcast",
  status: "want",
  note: "",
  takeaway: "",
  shared: false,
  rating: null,
  replays: 0,
};
export const milestones = [1, 5, 10, 50, 100];
export interface Stats {
  finished: number;
  shows: number;
  replays: number;
}
export type PublicEntry = Pick<
  Entry,
  | "title"
  | "creator"
  | "show_name"
  | "artwork"
  | "status"
  | "kind"
  | "takeaway"
  | "rating"
  | "url"
  | "updated_at"
>;
export interface PublicPage {
  name: string;
  username: string;
  bio: string;
  stats: Partial<Stats>;
  badges: number[] | null;
  entries: PublicEntry[];
}
