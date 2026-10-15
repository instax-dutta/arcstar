# Gates: audit remediation

OWNS: packages/**, apps/**, evals/**, migrations/**, docs/**, scripts/**, README.md, AGENTS.md, PLAN.md, IMPLEMENTATION_PLAN.md, ENGINEERING_AUDIT.md, GATES.md, docker-compose.yml, .github/workflows/ci.yml, .env.example

Scope: remediate the posted code review and ENGINEERING_AUDIT.md findings without pretending synthetic data is real benchmark performance.

- [x] G1: real benchmark gate fails closed when the adjudicated corpus is absent and smoke data is labeled synthetic
  CHECK: node scripts/verify-benchmark-gate.mjs
  EXPECT: benchmark gate verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=6829220cb9f53890dbc88aa5ec29fff4c81a4dd53d8eaf1e493346844eee0670; exit=0; EXPECT=matched; output-sha256=0f0c75c959b5fa03ebebf308d689b2e858b2312b871d4cb142cce04e23fe6cb5; output-bytes=35; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G2: sources preserve scoring-critical fields and full lineage semantics across PostgreSQL round trips
  CHECK: node scripts/verify-source-persistence.mjs
  EXPECT: source persistence verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=78467d67bdb71566326c70a3c5b7068ed0dd45ce8047d6f526f08b2df9d1753c; exit=0; EXPECT=matched; output-sha256=9e8b21c0193491909a899b9f00ce64eeab867c399bbcab326a5a841b48bac9cd; output-bytes=39; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G3: source lineage kinds and statuses survive persistence and cascade collapse still counts syndication correctly
  CHECK: node scripts/verify-source-lineage.mjs
  EXPECT: source lineage verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=190d6331d4813534ac0e00ab745c2b962733d81173f4ed1a3dc84da0aa1c864c; exit=0; EXPECT=matched; output-sha256=3fb08bb9ae9e33c7872c9b442318d72658fafb90fea2685a6d0dac95a97ca078; output-bytes=35; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G4: blast-radius exposes representative-path semantics, validates options, and has explicit work budgets
  CHECK: node scripts/verify-graph-safety.mjs
  EXPECT: graph safety verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=3e351a89f9c56868f287bf48b6f051a104ebc4cef4e938ad37527e1794f2cd79; exit=0; EXPECT=matched; output-sha256=f117dc51f73d85d5f2250d0bf09e7b3547e5e03418f1b7ba643ba82ba915d556; output-bytes=33; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G5: temporal edge semantics are explicit and memory/Postgres use the same latest-revision/tie rules
  CHECK: node scripts/verify-temporal-edges.mjs
  EXPECT: temporal edge verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=cbbdf85446e9c7f1ddff2b7b76c7ef3e627cce3950ca74b2d03c51ce29fff8c7; exit=0; EXPECT=matched; output-sha256=681fae766ed6fafd3a71588c413e9656b6baffb3e1433a9df1248e90355fe608; output-bytes=34; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G6: evidence contradictions flow into assessments and persisted snapshots reproduce score, explanation, and contradiction
  CHECK: node scripts/verify-assessment-contradictions.mjs
  EXPECT: assessment contradiction verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=f565431b18e8ad57976a4ff99c2cdc87b8b04419f23d696d81999a7468499ef0; exit=0; EXPECT=matched; output-sha256=8567b89b1db27bdd658d3086db5c122296edf5d15f44bf0eb4db771b5d802cc9; output-bytes=45; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G7: multi-record repository writes are transactional and a real PostgreSQL integration suite is wired into CI
  CHECK: node scripts/verify-atomic-persistence.mjs
  EXPECT: atomic persistence verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=8a80b8486c03cbbaf72fe24edc9d116ddf24267583523ddb05e2aa3a9b576d9e; exit=0; EXPECT=matched; output-sha256=70a8ae9f74b8bdded4def03f4d69d81574d3ea6de37b26619564aaf96b2c4bfc; output-bytes=39; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G8: client-supplied scoring and graph endpoints are labeled experimental, while product scenarios remain server-owned
  CHECK: node scripts/verify-experimental-boundaries.mjs
  EXPECT: experimental boundary verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=21d863a641ab1e270fff5f2e6d63989b26f955d9ff34f0e04f4ba5ee92a27ebb; exit=0; EXPECT=matched; output-sha256=e1bec76410e1dfcac0b5322986f457da0a6d4fd13bc78d52d310ea1e1c74df0d; output-bytes=42; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G9: RSS item identity is idempotent under documented URL normalization and does not duplicate sources
  CHECK: node scripts/verify-ingestion-identity.mjs
  EXPECT: ingestion identity verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=bb92b52b239d134672314053fedfc2826fa52b233ba938bcdff34ebc5c7eb6b8; exit=0; EXPECT=matched; output-sha256=bef5dd75ae843217682a498a0d55442f55cb0be3d86a0be6a25e82674dccd228; output-bytes=39; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G10: RSS/Atom parsing uses a maintained parser and rejects malformed or unsupported input clearly
  CHECK: node scripts/verify-rss-parser.mjs
  EXPECT: rss parser verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=4ac10ac5f1bd084267e2ce2dfd2eb3a244b4a57d27387f565df22e9c03a83f68; exit=0; EXPECT=matched; output-sha256=2cdeee5a681002999fdbe534abebeaa0b76a1181cc3df01419bea36b4e201885; output-bytes=31; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G11: evidence review changes are auditable and do not silently rewrite the basis of old assessments
  CHECK: node scripts/verify-evidence-review-history.mjs
  EXPECT: evidence review history verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=09ade8cafbb99c93747eec6e7dfe98d33f8c4041f00723657638297e98d21e4f; exit=0; EXPECT=matched; output-sha256=6ce5ab2aee4e55df62eb496e1e78aa9aa246d046a66630dcac50af8d1e172a21; output-bytes=44; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G12: rate limiting cannot be bypassed with untrusted forwarded headers and health distinguishes liveness from readiness
  CHECK: node scripts/verify-api-boundaries.mjs
  EXPECT: api boundary verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=37e2fe547981456e17ca82c6ca33f29498f013e740ad1acb7d892c33fbca93a3; exit=0; EXPECT=matched; output-sha256=ce6a48ac2ba57d2cbd57d937cfd554e416ccdb27519391bb9e25169a79778b1e; output-bytes=33; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G13: browser scenario requests are race-safe and failures are distinguishable from empty results
  CHECK: node scripts/verify-web-race-safety.mjs
  EXPECT: web race safety verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=1049da572a952d0ffce540bd2fe146144ccdc46ef6f9c962b4090d034ba8421c; exit=0; EXPECT=matched; output-sha256=c736a15c0d39de68bf7c89c287568861f86fccadb662c18baae7bffaba9fb19f; output-bytes=36; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G14: extraction documents span semantics and has labeled candidate smoke results
  CHECK: node scripts/verify-extraction-quality.mjs
  EXPECT: extraction quality verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=9e9f4a54bd5dd488b7b08ad11c5380f4554584b2aad0c07e319320b6deaccc55; exit=0; EXPECT=matched; output-sha256=e511b5214b61fe155a6a3b0e565b3e748001e1bf6940eb94ecee88b4e3b06fe1; output-bytes=39; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G15: maritime seed data marks itself unverified and does not present invented dates or weights as evidence
  CHECK: node scripts/verify-seed-disclosure.mjs
  EXPECT: seed disclosure verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=271eb51e4643647c7a99441a1f2ec1ee09a4fd7189ab670329ebb12ebdae7033; exit=0; EXPECT=matched; output-sha256=86c22e4bd14bddfd789831c1e339a33121daf4838cc36cb5ecd02032a6306904; output-bytes=36; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G16: self-hosting has repeatable migration, secure production refusal, non-root runtime, and documented restore
  CHECK: node scripts/verify-operations.mjs
  EXPECT: operations verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=b112724ff44726fac788179c6c6f23fd0acadb8826fb37c6f00a134095352f00; exit=0; EXPECT=matched; output-sha256=e1c5cc330ecda4f7c6ce5daf3f82e5bb1d96c69203ce4fdc2370804da72b6349; output-bytes=31; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G17: snapshot IDs are stable for identical content and query semantics and change only for real content changes
  CHECK: node scripts/verify-snapshot-ids.mjs
  EXPECT: snapshot id verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=542a20172939456cd18e4a628dd288dd812798d9b0cb0a802da5b2bca264ebe2; exit=0; EXPECT=matched; output-sha256=fff599e0c73d3974ec9f220b6294056c421a134da993ed6dd19ff0ba8adcf72c; output-bytes=32; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G18: database constraints align with contracts for entity and relation enums
  CHECK: node scripts/verify-schema-contracts.mjs
  EXPECT: schema contract verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=9c0041851d0f2ba8893e12a06abecbf85be9637cc99ce1e9d2f49f4f8075ddb9; exit=0; EXPECT=matched; output-sha256=93724ed0efc392ef1a4d028be48a4c2129e0876949b889d66452481a3b0e5a4e; output-bytes=36; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G19: README and plan docs do not claim unbuilt override workflows, real benchmark success, or unverified maritime evidence
  CHECK: node scripts/verify-doc-claims.mjs
  EXPECT: doc claims verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=d5a371439c5936ad1b487496dd5304b32f7924acfd7881bedecf33309dd3fced; exit=0; EXPECT=matched; output-sha256=7f30e6e53cd0da62b891bf5232dca4832360ef9237b6e1d5a709a32f999cbcd7; output-bytes=31; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G20: listed read amplification, dynamic SQL, unused review timestamp, and per-item persistence loops are cleaned up
  CHECK: node scripts/verify-scale-cleanup.mjs
  EXPECT: scale cleanup verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=e42016f86e9354fc2e177722e0e80e4ceced8eccd028af2dcdb22564f107d27a; exit=0; EXPECT=matched; output-sha256=36a8fbc5251e0e742aa381754aa4e82397dadd45a0659321f2a5d5dba2b3b08a; output-bytes=34; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G21: human adjudicated benchmark corpus protocol is recorded and the remaining corpus work is explicitly handed off
  EVIDENCE: manual: evals/BENCHMARK_PROTOCOL.md defines claim units, adjudication, leakage splits, gates, and the required product-owner handoff; adjudicated corpus remains blocked at ENGINEERING_AUDIT.md A0
