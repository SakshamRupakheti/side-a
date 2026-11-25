-- Keep legacy writers compatible. A trigger maintains a relational projection from
-- the validated owner document in the same transaction as its revision update.
ALTER TABLE entry ADD COLUMN request_hash TEXT;
CREATE TABLE favorite_moment (
 entry_id TEXT NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
 id TEXT NOT NULL, display_order INTEGER NOT NULL CHECK(display_order BETWEEN 0 AND 23),
 position_seconds INTEGER CHECK(position_seconds BETWEEN 0 AND 35999999),
 title TEXT NOT NULL CHECK(length(title)<=140), reflection TEXT NOT NULL CHECK(length(reflection)<=1500),
 shared INTEGER NOT NULL DEFAULT 0 CHECK(shared IN (0,1)),
 PRIMARY KEY(entry_id,display_order), UNIQUE(entry_id,id)
);
CREATE VIEW entry_moment_input AS
 SELECT e.id AS entry_id,coalesce(m.value->>'$.id',printf('legacy-%d',m.key)) AS id,m.key AS display_order,
 CASE WHEN m.value->>'$.timestamp' <> '' THEN
 cast(substr(m.value->>'$.timestamp',1,length(m.value->>'$.timestamp')-6) AS INTEGER)*3600+
 cast(substr(m.value->>'$.timestamp',-5,2) AS INTEGER)*60+cast(substr(m.value->>'$.timestamp',-2) AS INTEGER) END AS position_seconds,
 m.value->>'$.title' AS title,m.value->>'$.description' AS reflection,coalesce(m.value->>'$.shared',0) AS shared
 FROM entry e,json_each(e.experience,'$.moments') m;
INSERT INTO favorite_moment SELECT * FROM entry_moment_input;
CREATE TRIGGER insert_entry_moments AFTER INSERT ON entry WHEN NEW.experience IS NOT NULL BEGIN
 INSERT INTO favorite_moment SELECT * FROM entry_moment_input WHERE entry_id=NEW.id;
END;
CREATE TRIGGER sync_entry_moments AFTER UPDATE OF experience ON entry WHEN OLD.experience IS NOT NEW.experience BEGIN
 DELETE FROM favorite_moment WHERE entry_id=NEW.id;
 INSERT INTO favorite_moment SELECT * FROM entry_moment_input WHERE entry_id=NEW.id;
END;
DROP INDEX entry_history;
DROP INDEX public_history;
CREATE INDEX entry_history ON entry(owner,updated_at DESC,id DESC);
CREATE INDEX public_history ON entry(owner,shared,updated_at DESC,id DESC);
