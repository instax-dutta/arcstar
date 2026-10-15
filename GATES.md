# Gates: persisted investigation workflow

OWNS: packages/contracts/**, apps/api/**, migrations/**, scripts/**, docs/self-hosting.md, README.md, AGENTS.md, GATES.md

Scope: build a persisted claim-evidence-assessment workflow, explicit source lineage gaps, reproducible snapshots, wired repositories, server-owned scenarios, bounded rate limiting, and cleanup.

- [x] G1: claim evidence persists and reviews independently of claim upserts
  CHECK: node scripts/verify-claim-evidence.mjs
  EXPECT: claim evidence verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=129ed7de545e9fbe8fa53fcba7f75c1b3bf719ecda617f504ceb0088dffb83ee; exit=0; EXPECT=matched; output-sha256=f604154962745ea8f783c5ced80b1c44adc2409bd3c055907ba7003fef944ad3; output-bytes=35; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G2: assessments store and restore their exact input snapshot
  CHECK: node scripts/verify-assessment-snapshot.mjs
  EXPECT: assessment snapshot verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=a24e3b0af0b89a85ee8437ffa71ce05e0465eeddc8871a50fe98634219268556; exit=0; EXPECT=matched; output-sha256=df4b7598f34bb41781e1bacc561ce8011ff56429d2e0185a21987eef1c75125c; output-bytes=40; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G3: unresolvable source lineage becomes an explicit gap record
  CHECK: node scripts/verify-source-lineage-gaps.mjs
  EXPECT: source lineage gap verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=f99918e82192b3611de6575e661409bcdef293d06e4457ceb19d71ba8bb7dc57; exit=0; EXPECT=matched; output-sha256=2b5d3be9151dbccc11856f66b8f7b9c0a3ba3dd4f565a6e52378c74155182916; output-bytes=39; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G4: the API wires persisted repositories when DATABASE_URL is set
  CHECK: node scripts/verify-database-wiring.mjs
  EXPECT: database wiring verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=b668027fc94cc670c5afe6eab1e0bc84a6324a690241c0d2277e60d708314a1d; exit=0; EXPECT=matched; output-sha256=c7e0cc492f150c6784ce079e5740c82943c40e92e3dfcc1ae2f10692d8297695; output-bytes=36; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G5: scenario queries use a server-owned graph snapshot
  CHECK: node scripts/verify-scenario-snapshot.mjs
  EXPECT: scenario snapshot verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=778b93b704951a42db1e02d46eb7fd97a88757d83dd140f11e54727ecbc4e5cc; exit=0; EXPECT=matched; output-sha256=633a318f3e1f765c7042db95cf5bbd42978a66e7d5b1ecccba9b6a057c603e05; output-bytes=38; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G6: expensive endpoints enforce a bounded request rate limit
  CHECK: node scripts/verify-rate-limit.mjs
  EXPECT: rate limit verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=62536d7876c6a4b024fabfc1d359315f08f3ceecc137ba5051cf27c863be982a; exit=0; EXPECT=matched; output-sha256=034a8960dab8cc871ac8ab7387c5df9a4d8e2f717896576c0dc8e8ece1e8db70; output-bytes=31; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G7: unused local scripts and stale documentation are removed
  CHECK: node scripts/verify-cleanup.mjs
  EXPECT: cleanup verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=d88e507c263015f257a6fd70d0957c35d03f413e9aff8f22ffc8c2391a5b1b42; exit=0; EXPECT=matched; output-sha256=3491c66debf29f0c4912b6679bfcd5365607747c059f939be53610a108677030; output-bytes=28; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries

- [x] G8: full repository checks, API behavior, and benchmark smoke run pass
  CHECK: node scripts/verify-full-check.mjs
  EXPECT: full check verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=76e4919cadeb6628148692fb86dc26308bc0d2ba6eac7731246973fa6070f6e8; exit=0; EXPECT=matched; output-sha256=bacb120c4ccc7340febebbe249e9891a2202822ae7bd4ccf791b7c60fff081c6; output-bytes=31; shell=/bin/sh; cwd=/Users/saiduttaabhishekdash/arcstar; path=b93c3fbfaca3/30 entries
