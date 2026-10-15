ALTER TABLE source_pool
  ADD COLUMN IF NOT EXISTS primary_evidence TEXT;

CREATE TABLE IF NOT EXISTS schema_migration (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
