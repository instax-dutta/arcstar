ALTER TABLE source_pool ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

UPDATE source_pool
SET published_at = created_at
WHERE published_at IS NULL;

ALTER TABLE source_pool
ALTER COLUMN published_at SET NOT NULL;
