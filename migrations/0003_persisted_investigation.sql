CREATE TABLE IF NOT EXISTS source_lineage_gap (
  id TEXT PRIMARY KEY,
  from_source_id TEXT NOT NULL REFERENCES source_pool(id) ON DELETE CASCADE,
  unresolved_source_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('unknown', 'inferred')),
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_source_lineage_gap_ref
  ON source_lineage_gap(from_source_id, unresolved_source_ref);

ALTER TABLE assessment
  ADD COLUMN IF NOT EXISTS input_snapshot JSONB NOT NULL DEFAULT 'null'::jsonb;

CREATE INDEX IF NOT EXISTS idx_source_lineage_gap_source
  ON source_lineage_gap(from_source_id, updated_at);
