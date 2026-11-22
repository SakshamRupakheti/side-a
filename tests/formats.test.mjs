import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

test("documentary migration preserves legacy records, sources, privacy and cleanup", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      readFileSync(
        new URL("../migrations/0001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    db.exec(
      "INSERT INTO user VALUES ('u','Listener','listener@example.com',1,NULL,1,1)",
    );
    for (const kind of ["podcast", "audiobook"]) {
      db.prepare("INSERT INTO media VALUES (?)").run(kind);
      db.prepare("INSERT INTO source VALUES ('publisher',?,'',?)").run(
        kind,
        kind,
      );
      db.prepare(
        "INSERT INTO entry(id,owner,media_id,provider,external_id,kind,title,creator,show_name,artwork,status,replays,note,takeaway,shared,rating,created_at,updated_at) VALUES (?,'u',?,'publisher',?,?,?,'','','','want',0,'private','',0,NULL,'x','x')",
      ).run(kind, kind, kind, kind, kind);
    }
    const before = db.prepare("SELECT * FROM entry ORDER BY id").all();
    db.exec(
      readFileSync(
        new URL("../migrations/0002_documentaries.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(
      db.prepare("SELECT * FROM entry ORDER BY id").all(),
      before,
    );
    assert.equal(db.prepare("SELECT count(*) AS n FROM source").get().n, 2);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.exec("DELETE FROM user WHERE id='u'");
    assert.equal(db.prepare("SELECT count(*) AS n FROM media").get().n, 0);
  } finally {
    db.close();
  }
});
