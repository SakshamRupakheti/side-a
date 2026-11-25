-- social_listing already tracks the profile, entry, post and moderation gates.
-- Keep one reversible contribution per public post, including on cascading deletes.
ALTER TABLE profile ADD COLUMN leaderboard_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(leaderboard_opt_in IN(0,1));
ALTER TABLE profile ADD COLUMN wall_recent TEXT;
ALTER TABLE profile ADD COLUMN wall_podcasts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile ADD COLUMN wall_reflections INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile ADD COLUMN wall_shows INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile ADD COLUMN wall_show_max INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profile ADD COLUMN first_signal INTEGER AS (wall_podcasts>=1);
ALTER TABLE profile ADD COLUMN deep_dive INTEGER AS (wall_show_max>=3);
ALTER TABLE profile ADD COLUMN explorer INTEGER AS (wall_shows>=3);
ALTER TABLE profile ADD COLUMN thought_collector INTEGER AS (wall_reflections>=3);
ALTER TABLE profile ADD COLUMN sound_collector INTEGER AS (wall_podcasts>=10);
ALTER TABLE profile ADD COLUMN wall_order INTEGER AS (-(first_signal+deep_dive+explorer+thought_collector+sound_collector));
CREATE INDEX wall_rank ON profile(wall_order,username) WHERE leaderboard_opt_in=1 AND published=1 AND social_hidden=0 AND wall_recent IS NOT NULL;
CREATE INDEX wall_fresh ON profile(wall_recent DESC,username DESC) WHERE published=1 AND social_hidden=0 AND wall_recent IS NOT NULL;

CREATE TABLE wall_item(
 id TEXT PRIMARY KEY REFERENCES social_listing(id) ON DELETE CASCADE,
 owner TEXT NOT NULL, published_at TEXT NOT NULL, podcast INTEGER NOT NULL,
 show_key TEXT, reflected INTEGER NOT NULL
);
CREATE INDEX wall_activity ON wall_item(owner,published_at DESC,id DESC);
CREATE INDEX wall_podcast_preview ON wall_item(owner,published_at DESC,id DESC) WHERE podcast=1;
CREATE TABLE wall_show(owner TEXT NOT NULL, show_key TEXT NOT NULL, episodes INTEGER NOT NULL, PRIMARY KEY(owner,show_key));
CREATE INDEX wall_biggest_show ON wall_show(owner,episodes DESC);
CREATE VIEW wall_input AS SELECT id,owner,published_at,kind='podcast' AS podcast,
 CASE WHEN kind='podcast' THEN nullif(lower(trim(show_name)),'') END AS show_key,
 (kind='podcast' AND (trim(caption)<>'' OR trim(takeaway)<>'')) AS reflected FROM social_public;

CREATE TRIGGER wall_added AFTER INSERT ON wall_item BEGIN
 INSERT INTO wall_show SELECT NEW.owner,NEW.show_key,1 WHERE NEW.show_key IS NOT NULL
 ON CONFLICT(owner,show_key) DO UPDATE SET episodes=episodes+1;
 UPDATE profile SET wall_recent=max(coalesce(wall_recent,''),NEW.published_at),
 wall_podcasts=wall_podcasts+NEW.podcast,wall_reflections=wall_reflections+NEW.reflected,
 wall_shows=wall_shows+EXISTS(SELECT 1 FROM wall_show WHERE owner=NEW.owner AND show_key=NEW.show_key AND episodes=1),
 wall_show_max=coalesce((SELECT max(episodes) FROM wall_show WHERE owner=NEW.owner),0)
 WHERE user_id=NEW.owner;
END;
CREATE TRIGGER wall_removed AFTER DELETE ON wall_item BEGIN
 UPDATE wall_show SET episodes=episodes-1 WHERE owner=OLD.owner AND show_key=OLD.show_key;
 UPDATE profile SET wall_recent=(SELECT published_at FROM wall_item WHERE owner=OLD.owner ORDER BY published_at DESC,id DESC LIMIT 1),
 wall_podcasts=wall_podcasts-OLD.podcast,wall_reflections=wall_reflections-OLD.reflected,
 wall_shows=wall_shows-EXISTS(SELECT 1 FROM wall_show WHERE owner=OLD.owner AND show_key=OLD.show_key AND episodes=0),
 wall_show_max=coalesce((SELECT max(episodes) FROM wall_show WHERE owner=OLD.owner),0)
 WHERE user_id=OLD.owner;
 DELETE FROM wall_show WHERE owner=OLD.owner AND show_key=OLD.show_key AND episodes=0;
END;
CREATE TRIGGER wall_listed AFTER INSERT ON social_listing BEGIN
 INSERT INTO wall_item SELECT * FROM wall_input WHERE id=NEW.id;
END;
-- Entry/post edits can change disclosed text without changing publication.
CREATE TRIGGER wall_reflection_change AFTER UPDATE OF reflected ON wall_item WHEN NEW.reflected<>OLD.reflected BEGIN
 UPDATE profile SET wall_reflections=wall_reflections+NEW.reflected-OLD.reflected WHERE user_id=NEW.owner;
END;
CREATE TRIGGER wall_caption AFTER UPDATE OF caption,include_takeaway ON social_post BEGIN
 UPDATE wall_item SET reflected=coalesce((SELECT reflected FROM wall_input WHERE id=NEW.id),0) WHERE id=NEW.id;
END;
CREATE TRIGGER wall_takeaway AFTER UPDATE OF takeaway ON entry WHEN OLD.takeaway<>NEW.takeaway BEGIN
 UPDATE wall_item SET reflected=coalesce((SELECT reflected FROM wall_input WHERE id=wall_item.id),0)
 WHERE id=(SELECT id FROM social_post WHERE entry_id=NEW.id);
END;
INSERT INTO wall_item SELECT * FROM wall_input;
