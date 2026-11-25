-- Read statistics by owner and visibility in constant time. A show contributes
-- once while any qualifying episode remains in that scope.
CREATE TABLE listener_total (
 owner TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 public_only INTEGER NOT NULL, finished INTEGER NOT NULL, shows INTEGER NOT NULL, replays INTEGER NOT NULL,
 PRIMARY KEY(owner,public_only)
);
CREATE TABLE listener_show (
 owner TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
 public_only INTEGER NOT NULL, show_key TEXT NOT NULL, episodes INTEGER NOT NULL,
 PRIMARY KEY(owner,public_only,show_key)
);
CREATE VIEW entry_stat_input AS
 SELECT e.id,e.owner,s.public_only,
   (e.kind='podcast' AND e.finished_at IS NOT NULL) AS finished,
   CASE WHEN e.kind='podcast' AND (e.status='listening' OR e.finished_at IS NOT NULL)
        THEN nullif(lower(trim(e.show_name)),'') END AS show_key,e.replays
 FROM entry e CROSS JOIN (SELECT 0 AS public_only UNION ALL SELECT 1) s
 WHERE s.public_only=0 OR e.shared=1;
INSERT INTO listener_total SELECT owner,public_only,sum(finished),count(DISTINCT show_key),sum(replays)
 FROM entry_stat_input GROUP BY owner,public_only;
INSERT INTO listener_show SELECT owner,public_only,show_key,count(*)
 FROM entry_stat_input WHERE show_key IS NOT NULL GROUP BY owner,public_only,show_key;
-- Keep triggers attached to tables. Wrangler exports triggers before views.
CREATE TRIGGER count_new_show AFTER INSERT ON listener_show BEGIN
 UPDATE listener_total SET shows=shows+1 WHERE owner=NEW.owner AND public_only=NEW.public_only;
END;
CREATE TRIGGER count_removed_show AFTER DELETE ON listener_show BEGIN
 UPDATE listener_total SET shows=shows-1 WHERE owner=OLD.owner AND public_only=OLD.public_only;
END;

CREATE TRIGGER stat_insert AFTER INSERT ON entry BEGIN
 INSERT INTO listener_total(owner,public_only,finished,shows,replays)
 SELECT owner,public_only,finished,0,replays FROM entry_stat_input WHERE id=NEW.id
 ON CONFLICT(owner,public_only) DO UPDATE SET finished=finished+excluded.finished,replays=replays+excluded.replays;
 INSERT INTO listener_show SELECT owner,public_only,show_key,1 FROM entry_stat_input WHERE id=NEW.id AND show_key IS NOT NULL
 ON CONFLICT(owner,public_only,show_key) DO UPDATE SET episodes=episodes+1;
END;

CREATE TRIGGER stat_delete BEFORE DELETE ON entry BEGIN
 UPDATE listener_total SET finished=finished-(OLD.kind='podcast' AND OLD.finished_at IS NOT NULL),replays=replays-OLD.replays
 WHERE owner=OLD.owner AND (public_only=0 OR OLD.shared=1);
 UPDATE listener_show SET episodes=episodes-1 WHERE (owner,public_only,show_key) IN
 (SELECT owner,public_only,show_key FROM entry_stat_input WHERE id=OLD.id AND show_key IS NOT NULL);
 DELETE FROM listener_show WHERE owner=OLD.owner AND show_key=lower(trim(OLD.show_name)) AND public_only IN (0,1) AND episodes=0;
END;

CREATE TRIGGER stat_before_edit BEFORE UPDATE OF kind,status,show_name,finished_at,replays,shared ON entry
 WHEN OLD.kind IS NOT NEW.kind OR OLD.status IS NOT NEW.status OR OLD.show_name IS NOT NEW.show_name OR OLD.finished_at IS NOT NEW.finished_at OR OLD.replays IS NOT NEW.replays OR OLD.shared IS NOT NEW.shared BEGIN
 UPDATE listener_total SET finished=finished-(OLD.kind='podcast' AND OLD.finished_at IS NOT NULL),replays=replays-OLD.replays
 WHERE owner=OLD.owner AND (public_only=0 OR OLD.shared=1);
 UPDATE listener_show SET episodes=episodes-1 WHERE (owner,public_only,show_key) IN
 (SELECT owner,public_only,show_key FROM entry_stat_input WHERE id=OLD.id AND show_key IS NOT NULL);
 DELETE FROM listener_show WHERE owner=OLD.owner AND show_key=lower(trim(OLD.show_name)) AND public_only IN (0,1) AND episodes=0;
END;

CREATE TRIGGER stat_after_edit AFTER UPDATE OF kind,status,show_name,finished_at,replays,shared ON entry
 WHEN OLD.kind IS NOT NEW.kind OR OLD.status IS NOT NEW.status OR OLD.show_name IS NOT NEW.show_name OR OLD.finished_at IS NOT NEW.finished_at OR OLD.replays IS NOT NEW.replays OR OLD.shared IS NOT NEW.shared BEGIN
 INSERT INTO listener_total(owner,public_only,finished,shows,replays)
 SELECT owner,public_only,finished,0,replays FROM entry_stat_input WHERE id=NEW.id
 ON CONFLICT(owner,public_only) DO UPDATE SET finished=finished+excluded.finished,replays=replays+excluded.replays;
 INSERT INTO listener_show SELECT owner,public_only,show_key,1 FROM entry_stat_input WHERE id=NEW.id AND show_key IS NOT NULL
 ON CONFLICT(owner,public_only,show_key) DO UPDATE SET episodes=episodes+1;
END;

