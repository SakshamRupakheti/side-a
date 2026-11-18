CREATE TABLE user (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL, image TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE session (
  id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL, ip_address TEXT, user_agent TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX session_owner ON session(user_id);
CREATE TABLE account (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL, provider_id TEXT NOT NULL, access_token TEXT, refresh_token TEXT, id_token TEXT,
  access_expires INTEGER, refresh_expires INTEGER, scope TEXT, password TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(provider_id,account_id)
);
CREATE INDEX account_owner ON account(user_id);
CREATE TABLE verification (
  id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX verification_identifier ON verification(identifier);
CREATE TABLE rate_limit (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, last_request INTEGER NOT NULL);
CREATE TABLE profile (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 0,
  show_finished INTEGER NOT NULL DEFAULT 0, show_shows INTEGER NOT NULL DEFAULT 0, show_replays INTEGER NOT NULL DEFAULT 0, show_badges INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE media (id TEXT PRIMARY KEY);
CREATE TABLE source (
  provider TEXT NOT NULL, external_id TEXT NOT NULL, url TEXT NOT NULL, media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  PRIMARY KEY (provider,external_id), UNIQUE(provider,external_id,media_id)
);
CREATE INDEX source_media ON source(media_id);
CREATE TABLE entry (
  id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id), provider TEXT NOT NULL, external_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('podcast','audiobook')), title TEXT NOT NULL, creator TEXT NOT NULL, show_name TEXT NOT NULL, artwork TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('want','listening','finished')), finished_at TEXT,
  replays INTEGER NOT NULL DEFAULT 0 CHECK(replays >= 0), rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  note TEXT NOT NULL DEFAULT '', takeaway TEXT NOT NULL DEFAULT '', shared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  provenance TEXT NOT NULL DEFAULT 'manual', import_key TEXT,
  UNIQUE(owner,media_id), UNIQUE(owner,provenance,import_key),
  FOREIGN KEY(provider,external_id,media_id) REFERENCES source(provider,external_id,media_id)
);
CREATE INDEX entry_history ON entry(owner,updated_at DESC);
CREATE INDEX public_history ON entry(owner,shared,updated_at DESC);
CREATE INDEX entry_media ON entry(media_id);
-- Remove only identities whose final diary reference was removed, including during account deletion.
CREATE TRIGGER prune_media AFTER DELETE ON entry BEGIN
  DELETE FROM media WHERE id=OLD.media_id AND NOT EXISTS (SELECT 1 FROM entry WHERE media_id=OLD.media_id);
END;

