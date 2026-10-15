CREATE TABLE IF NOT EXISTS claim_source_link (
  claim_id TEXT NOT NULL REFERENCES claim(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES source_pool(id),
  stance TEXT NOT NULL CHECK (stance IN ('supports', 'contradicts')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (claim_id, source_id, stance)
);

INSERT INTO claim_source_link (claim_id, source_id, stance, created_at, updated_at)
SELECT DISTINCT claim_id, source_id, stance, now(), now()
FROM claim_evidence
WHERE stance IN ('supports', 'contradicts')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_claim_source_link_claim
  ON claim_source_link(claim_id, stance);
