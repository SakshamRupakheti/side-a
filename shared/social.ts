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
