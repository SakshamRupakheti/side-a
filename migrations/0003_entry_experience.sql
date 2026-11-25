-- The owner-only composer payload is updated with the entry's revision.
-- NULL identifies entries saved before the composer was introduced.
ALTER TABLE entry ADD COLUMN experience TEXT CHECK (experience IS NULL OR json_valid(experience));
