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
    db.exec(
      "UPDATE entry SET shared=1,status='finished',finished_at='2020-01-01' WHERE kind='podcast'",
    );
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
    db.exec(
      readFileSync(
        new URL("../migrations/0003_entry_experience.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(
      db
        .prepare("SELECT * FROM entry ORDER BY id")
        .all()
        .map(({ experience, ...row }) => {
          assert.equal(experience, null);
          return { ...row };
        }),
      before.map((row) => ({ ...row })),
    );
    assert.equal(db.prepare("SELECT count(*) AS n FROM source").get().n, 2);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    const moment = {
      timestamp: "125:01:04",
      title: "Legacy",
      description: "Private memory",
    };
    db.prepare("UPDATE entry SET experience=? WHERE id='podcast'").run(
      JSON.stringify({ moments: [moment] }),
    );
    db.exec(
      readFileSync(
        new URL("../migrations/0004_public_moments.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(db.prepare("SELECT count(*) AS n FROM entry").get().n, 2);
    assert.deepEqual(
      { ...db.prepare("SELECT * FROM favorite_moment").get() },
      {
        entry_id: "podcast",
        id: "legacy-0",
        display_order: 0,
        position_seconds: 450064,
        title: "Legacy",
        reflection: "Private memory",
        shared: 0,
      },
    );
    const duplicate = { ...moment, id: "same" };
    assert.throws(() =>
      db
        .prepare("UPDATE entry SET revision=2,experience=? WHERE id='podcast'")
        .run(JSON.stringify({ moments: [duplicate, duplicate] })),
    );
    assert.equal(
      db.prepare("SELECT revision FROM entry WHERE id='podcast'").get()
        .revision,
      1,
    );
    assert.equal(
      db.prepare("SELECT id FROM favorite_moment").get().id,
      "legacy-0",
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.exec(
      readFileSync(
        new URL("../migrations/0005_listener_statistics.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(
      db
        .prepare("SELECT finished FROM listener_total ORDER BY public_only")
        .all()
        .map((r) => r.finished),
      [1, 1],
    );
    db.exec("DELETE FROM user WHERE id='u'");
    assert.equal(db.prepare("SELECT count(*) AS n FROM media").get().n, 0);
  } finally {
    db.close();
  }
});
