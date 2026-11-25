CREATE TABLE entry_next (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id), provider TEXT NOT NULL, external_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('podcast','audiobook','documentary')), title TEXT NOT NULL, creator TEXT NOT NULL, show_name TEXT NOT NULL, artwork TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('want','listening','finished')), finished_at TEXT,
  replays INTEGER NOT NULL DEFAULT 0 CHECK(replays >= 0), rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  note TEXT NOT NULL DEFAULT '', takeaway TEXT NOT NULL DEFAULT '', shared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  provenance TEXT NOT NULL DEFAULT 'manual', import_key TEXT,
  UNIQUE(owner,media_id), UNIQUE(owner,provenance,import_key),
  FOREIGN KEY(provider,external_id,media_id) REFERENCES source(provider,external_id,media_id)
);

INSERT INTO entry_next (id,owner,media_id,provider,external_id,kind,title,creator,show_name,artwork,status,finished_at,replays,note,takeaway,shared,rating,created_at,updated_at,revision,provenance,import_key)
SELECT id,owner,media_id,provider,external_id,kind,title,creator,show_name,artwork,status,finished_at,replays,note,takeaway,shared,rating,created_at,updated_at,revision,provenance,import_key FROM entry;
DROP TRIGGER prune_media;
DROP TABLE entry;
ALTER TABLE entry_next RENAME TO entry;
CREATE INDEX entry_history ON entry(owner,updated_at DESC);
CREATE INDEX public_history ON entry(owner,shared,updated_at DESC);
CREATE INDEX entry_media ON entry(media_id);
-- Remove only identities whose final diary reference was removed, including during account deletion.
CREATE TRIGGER prune_media AFTER DELETE ON entry BEGIN
  DELETE FROM media WHERE id=OLD.media_id AND NOT EXISTS (SELECT 1 FROM entry WHERE media_id=OLD.media_id);
END;

