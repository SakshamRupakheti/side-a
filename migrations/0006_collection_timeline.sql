CREATE INDEX entry_timeline ON entry(owner, created_at, id);

CREATE TABLE collection_size (
  owner TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  total INTEGER NOT NULL,
  revision INTEGER NOT NULL
);
INSERT INTO collection_size SELECT owner,count(*),1 FROM entry GROUP BY owner;
CREATE TRIGGER collection_added AFTER INSERT ON entry BEGIN
  INSERT INTO collection_size(owner,total,revision) VALUES(NEW.owner,1,1)
  ON CONFLICT(owner) DO UPDATE SET total=total+1, revision=revision+1;
END;
CREATE TRIGGER collection_removed AFTER DELETE ON entry BEGIN
  UPDATE collection_size SET total=total-1,revision=revision+1 WHERE owner=OLD.owner;
END;
