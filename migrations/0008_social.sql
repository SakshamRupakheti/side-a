ALTER TABLE profile ADD COLUMN social_hidden INTEGER NOT NULL DEFAULT 0 CHECK(social_hidden IN(0,1));
CREATE INDEX published_handles ON profile(username) WHERE published=1 AND social_hidden=0;

CREATE TABLE social_post(
 id TEXT PRIMARY KEY,
 owner TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 entry_id TEXT NOT NULL UNIQUE REFERENCES entry(id) ON DELETE CASCADE,
 caption TEXT NOT NULL DEFAULT '' CHECK(length(caption)<=400),
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN(0,1)),
 include_takeaway INTEGER NOT NULL DEFAULT 0 CHECK(include_takeaway IN(0,1)),
 include_moments INTEGER NOT NULL DEFAULT 0 CHECK(include_moments IN(0,1)),
 hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN(0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT,
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX social_owner ON social_post(owner,entry_id);
CREATE TRIGGER social_entry_owner BEFORE INSERT ON social_post
WHEN NOT EXISTS(SELECT 1 FROM entry WHERE id=NEW.entry_id AND owner=NEW.owner)
BEGIN SELECT RAISE(ABORT,'Invalid social entry'); END;

CREATE TABLE social_follow(follower TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, followed TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(follower,followed), CHECK(follower<>followed));
CREATE INDEX following_target ON social_follow(followed,follower);
CREATE TABLE social_block(blocker TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, blocked TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(blocker,blocked),CHECK(blocker<>blocked));
CREATE INDEX blocked_target ON social_block(blocked,blocker);
CREATE TABLE social_like(actor TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, post TEXT NOT NULL REFERENCES social_post(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(actor,post));
CREATE INDEX post_likes ON social_like(post,actor);
CREATE TABLE social_bookmark(actor TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, post TEXT NOT NULL REFERENCES social_post(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(actor,post));
CREATE INDEX post_bookmarks ON social_bookmark(post,actor);
CREATE TABLE social_report(id TEXT PRIMARY KEY, reporter TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, post TEXT REFERENCES social_post(id) ON DELETE CASCADE, person TEXT REFERENCES user(id) ON DELETE CASCADE, reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 300), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','closed')), CHECK((post IS NULL)<>(person IS NULL)), UNIQUE(reporter,person), UNIQUE(reporter,post));
CREATE INDEX report_queue ON social_report(status,created_at,id);

-- Only eligible IDs enter timeline indexes. The read view independently rechecks consent.
CREATE TABLE social_listing(id TEXT PRIMARY KEY REFERENCES social_post(id) ON DELETE CASCADE, owner TEXT NOT NULL, published_at TEXT NOT NULL);
CREATE INDEX social_timeline ON social_listing(published_at DESC,id DESC);
CREATE INDEX social_author_timeline ON social_listing(owner,published_at DESC,id DESC);
CREATE VIEW social_public AS SELECT p.id,p.owner,p.entry_id,p.published_at,p.caption,p.include_moments,
 g.username,g.display_name,e.kind,e.title,e.creator,e.show_name,e.artwork,s.url,
 CASE WHEN p.include_takeaway=1 THEN e.takeaway ELSE '' END AS takeaway
 FROM social_post p JOIN profile g ON g.user_id=p.owner JOIN entry e ON e.id=p.entry_id AND e.owner=p.owner
 JOIN source s ON s.provider=e.provider AND s.external_id=e.external_id
 WHERE p.published=1 AND p.hidden=0 AND e.shared=1 AND g.published=1 AND g.social_hidden=0;
CREATE VIRTUAL TABLE social_search USING fts5(title,creator,show_name,kind);
CREATE TRIGGER listing_search_insert AFTER INSERT ON social_listing BEGIN
 INSERT INTO social_search(rowid,title,creator,show_name,kind) SELECT NEW.rowid,title,creator,show_name,kind FROM social_public WHERE id=NEW.id;
END;
CREATE TRIGGER listing_search_remove AFTER DELETE ON social_listing BEGIN DELETE FROM social_search WHERE rowid=OLD.rowid; END;
CREATE TRIGGER social_post_created AFTER INSERT ON social_post BEGIN
 INSERT INTO social_listing SELECT id,owner,published_at FROM social_public WHERE id=NEW.id;
END;
CREATE TRIGGER social_post_edited AFTER UPDATE OF published,published_at,hidden ON social_post BEGIN
 DELETE FROM social_listing WHERE id=NEW.id;
 INSERT INTO social_listing SELECT id,owner,published_at FROM social_public WHERE id=NEW.id;
END;
CREATE TRIGGER social_entry_edited AFTER UPDATE OF shared,title,creator,show_name,kind ON entry
WHEN EXISTS(SELECT 1 FROM social_post WHERE entry_id=NEW.id) BEGIN
 DELETE FROM social_listing WHERE id=(SELECT id FROM social_post WHERE entry_id=NEW.id);
 INSERT INTO social_listing SELECT id,owner,published_at FROM social_public WHERE entry_id=NEW.id;
END;
CREATE TRIGGER social_profile_gate AFTER UPDATE OF published,social_hidden ON profile
WHEN NEW.published<>OLD.published OR NEW.social_hidden<>OLD.social_hidden BEGIN
 DELETE FROM social_listing WHERE owner=NEW.user_id;
 INSERT INTO social_listing SELECT id,owner,published_at FROM social_public WHERE owner=NEW.user_id;
END;
CREATE VIRTUAL TABLE social_names USING fts5(username,display_name);
INSERT INTO social_names(rowid,username,display_name) SELECT rowid,username,display_name FROM profile WHERE published=1 AND social_hidden=0;
CREATE TRIGGER social_name_created AFTER INSERT ON profile WHEN NEW.published=1 AND NEW.social_hidden=0 BEGIN
 INSERT INTO social_names(rowid,username,display_name) VALUES(NEW.rowid,NEW.username,NEW.display_name); END;
CREATE TRIGGER social_name_updated AFTER UPDATE OF published,social_hidden,username,display_name ON profile BEGIN
 DELETE FROM social_names WHERE rowid=OLD.rowid;
 INSERT INTO social_names(rowid,username,display_name) SELECT NEW.rowid,NEW.username,NEW.display_name WHERE NEW.published=1 AND NEW.social_hidden=0; END;
CREATE TRIGGER social_name_removed AFTER DELETE ON profile BEGIN DELETE FROM social_names WHERE rowid=OLD.rowid; END;
CREATE TRIGGER social_block_cleanup AFTER INSERT ON social_block BEGIN
 DELETE FROM social_follow WHERE (follower,followed) IN ((NEW.blocker,NEW.blocked),(NEW.blocked,NEW.blocker));
 DELETE FROM social_like WHERE actor=NEW.blocker AND post IN(SELECT id FROM social_post WHERE owner=NEW.blocked);
 DELETE FROM social_like WHERE actor=NEW.blocked AND post IN(SELECT id FROM social_post WHERE owner=NEW.blocker);
 DELETE FROM social_bookmark WHERE actor=NEW.blocker AND post IN(SELECT id FROM social_post WHERE owner=NEW.blocked);
 DELETE FROM social_bookmark WHERE actor=NEW.blocked AND post IN(SELECT id FROM social_post WHERE owner=NEW.blocker);
END;
