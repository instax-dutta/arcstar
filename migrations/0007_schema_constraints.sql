DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'entity_entity_type_allowed'
  ) THEN
    ALTER TABLE entity
      ADD CONSTRAINT entity_entity_type_allowed
      CHECK (entity_type IN ('country', 'company', 'chokepoint', 'commodity', 'infrastructure', 'org'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dependency_edge_relation_type_allowed'
  ) THEN
    ALTER TABLE dependency_edge
      ADD CONSTRAINT dependency_edge_relation_type_allowed
      CHECK (relation_type IN ('depends_on', 'supplies', 'transits_through', 'sanctions', 'owns', 'located_in', 'produces', 'consumes'));
  END IF;
END $$;
