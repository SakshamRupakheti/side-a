-- Shared public provider metadata only; no personal data or private reflections.
ALTER TABLE source ADD COLUMN cover_art TEXT NOT NULL DEFAULT '';
ALTER TABLE source ADD COLUMN cover_after INTEGER NOT NULL DEFAULT 0;
CREATE TABLE cover_provider (provider TEXT PRIMARY KEY, next_at INTEGER NOT NULL);
ALTER TABLE entry ADD COLUMN cover_auto INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entry ADD COLUMN cover_after INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entry ADD COLUMN artwork_auto INTEGER NOT NULL DEFAULT 0;
-- Seek a bounded account-owned batch, including automatic work after interruption.
CREATE INDEX entry_missing_cover ON entry(owner,cover_auto,cover_after,id) WHERE artwork='';
