export interface SharedMoment {
  title: string;
  reflection: string;
  position_seconds: number | null;
}
export interface Sleeve {
  title: string;
  creator: string;
  show_name: string;
  kind: string;
  artwork: string;
  caption: string;
  takeaway: string;
  moments: SharedMoment[];
  username: string;
  display_name: string;
}
export interface Post extends Sleeve {
  id: string;
  url: string;
  published_at: string;
  liked: number;
  likes: number;
  bookmarked: number;
  following: number;
  mine: number;
}
export interface Person {
  username: string;
  display_name: string;
  bio: string;
  following: number;
  mine: number;
}
export const socialBadges = {
  first_signal: "First Signal",
  deep_dive: "Deep Dive",
  explorer: "Explorer",
  thought_collector: "Thought Collector",
  sound_collector: "Sound Collector",
} as const;
export type BadgeId = keyof typeof socialBadges;
export interface WallListener {
  username: string;
  display_name: string;
  following: number;
  badges: BadgeId[];
  covers: { title: string; artwork: string; url: string }[];
}
export interface WallPage {
  people: WallListener[];
  next: string | null;
}
export interface PostDraft extends Sleeve {
  url: string;
  id: string | null;
  entry_id: string;
  entry_revision: number;
  revision: number | null;
  shared: number;
  profile_public: number;
  published: number;
  include_takeaway: number;
  include_moments: number;
  hidden: number;
  profile_hidden: number;
}
