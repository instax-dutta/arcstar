CREATE TABLE source_pool (
  id TEXT PRIMARY KEY,
  publisher TEXT NOT NULL,
  canonical_url TEXT,
  source_tier SMALLINT NOT NULL CHECK (source_tier BETWEEN 1 AND 5),
  language TEXT,
  access_policy_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source_pool(id),
  provider_id TEXT,
  canonical_url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL,
  revision_id TEXT NOT NULL,
  retrieval_status TEXT NOT NULL,
  retained_text TEXT,
  UNIQUE (source_id, content_hash, revision_id)
);

CREATE TABLE entity (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  label TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  external_ids JSONB NOT NULL DEFAULT '{}'::JSONB,
  resolution_evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claim (
  id TEXT PRIMARY KEY,
  subject_entity_id TEXT NOT NULL REFERENCES entity(id),
  text TEXT NOT NULL,
  asserted_at TIMESTAMPTZ NOT NULL,
  extraction_confidence DOUBLE PRECISION NOT NULL CHECK (extraction_confidence BETWEEN 0 AND 1),
  extraction_provider TEXT NOT NULL,
  extraction_model TEXT,
  extraction_schema_version TEXT NOT NULL,
  resolution_state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claim_evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claim(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES source_pool(id),
  stance TEXT NOT NULL CHECK (stance IN ('supports', 'contradicts', 'qualifies', 'mentions')),
  passage TEXT,
  passage_start INTEGER CHECK (passage_start IS NULL OR passage_start >= 0),
  passage_end INTEGER CHECK (passage_end IS NULL OR passage_end >= 0),
  method_version TEXT,
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('resolved', 'unresolved', 'disputed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE source_lineage (
  id TEXT PRIMARY KEY,
  from_source_id TEXT NOT NULL REFERENCES source_pool(id),
  to_source_id TEXT NOT NULL REFERENCES source_pool(id),
  kind TEXT NOT NULL CHECK (kind IN ('cites', 'syndicates', 'quotes', 'shared_release', 'inferred', 'unknown')),
  status TEXT NOT NULL CHECK (status IN ('observed', 'verified', 'disputed', 'unknown')),
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dependency_edge (
  id TEXT PRIMARY KEY,
  from_entity_id TEXT NOT NULL REFERENCES entity(id),
  to_entity_id TEXT NOT NULL REFERENCES entity(id),
  relation_type TEXT NOT NULL,
  weight DOUBLE PRECISION NOT NULL CHECK (weight BETWEEN 0 AND 1),
  valid_from TIMESTAMPTZ NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  evidence_refs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  verification_state TEXT NOT NULL CHECK (verification_state IN ('verified', 'estimated', 'disputed', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_entity_id <> to_entity_id)
);

CREATE TABLE assessment (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claim(id) ON DELETE CASCADE,
  method_version TEXT NOT NULL,
  assessed_at TIMESTAMPTZ NOT NULL,
  input_snapshot_ref TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  explanation JSONB NOT NULL,
  contradiction JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_event (
  id TEXT PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  old_value JSONB,
  new_value JSONB
);

CREATE TABLE source_policy (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES source_pool(id),
  access_method TEXT NOT NULL,
  attribution TEXT,
  retention_policy TEXT,
  redistribution_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  review_date DATE,
  restrictions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_source ON document(source_id, observed_at);
CREATE INDEX idx_claim_subject ON claim(subject_entity_id, asserted_at);
CREATE INDEX idx_claim_evidence_claim ON claim_evidence(claim_id);
CREATE INDEX idx_dependency_edge_from ON dependency_edge(from_entity_id, valid_from);
CREATE INDEX idx_dependency_edge_to ON dependency_edge(to_entity_id, valid_from);
CREATE INDEX idx_assessment_claim ON assessment(claim_id, assessed_at);
