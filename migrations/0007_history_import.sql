-- Private import provenance. Existing entries and the public projection are untouched.
ALTER TABLE entry ADD COLUMN history_evidence TEXT CHECK (history_evidence IS NULL OR json_valid(history_evidence));
ALTER TABLE entry ADD COLUMN history_run TEXT;
