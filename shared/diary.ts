import { emptyExperience, type Experience } from "./experience";
export const formats = ["podcast", "audiobook", "documentary"] as const;
export const rooms = {
  podcast: "Podcast diary",
  audiobook: "Audiobooks",
  documentary: "Documentaries",
} as const;
export const statuses = {
  want: "Saved for later",
  listening: "In progress",
  finished: "Finished",
} as const;
export type Status = keyof typeof statuses;
export interface Draft {
  import_key?: string;
  experience: Experience;
  url: string;
  title: string;
  creator: string;
  show_name: string;
  artwork: string;
  kind: (typeof formats)[number];
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
  experience: emptyExperience,
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
> & {
  moments?: {
    title: string;
    reflection: string;
    position_seconds: number | null;
  }[];
};
export interface PublicPage {
  next_cursor?: string | null;
  name: string;
  username: string;
  bio: string;
  stats: Partial<Stats>;
  badges: number[] | null;
  entries: PublicEntry[];
}
