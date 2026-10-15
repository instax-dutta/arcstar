CREATE TABLE IF NOT EXISTS claim_evidence_review (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claim(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES source_pool(id),
  stance TEXT NOT NULL CHECK (stance IN ('supports', 'contradicts', 'qualifies', 'mentions')),
  from_status TEXT CHECK (from_status IN ('resolved', 'unresolved', 'disputed')),
  to_status TEXT NOT NULL CHECK (to_status IN ('resolved', 'unresolved', 'disputed')),
  actor TEXT NOT NULL,
  reason TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_evidence_review_claim
  ON claim_evidence_review(claim_id, reviewed_at);

CREATE INDEX IF NOT EXISTS idx_claim_evidence_review_evidence
  ON claim_evidence_review(claim_id, source_id, stance, reviewed_at);
