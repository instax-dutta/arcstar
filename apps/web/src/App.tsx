import { useEffect, useRef, useState } from "react";
import Sigma from "sigma";
import Graph from "graphology";

interface WebNode { id: string; type: string; label: string; props: Record<string, unknown>; }
interface WebEdge { from: string; to: string; relation: string; weight: number; asOf: string; }
interface BlastResult { node: string; hops: number; impactScore: number; path: string[]; }
interface GraphSnapshot { id: string; asOf: string; nodeCount: number; edgeCount: number; }

interface GraphPayload { nodes: WebNode[]; edges: WebEdge[]; }
interface ClaimPayload { claim: { id: string; text: string }; evidence: Array<{ sourceId: string; stance: string; passage?: string; status: string }>; assessment: { score: { value: number; methodVersion: string }; inputSnapshotRef: string } | null; }

interface ClaimCandidate { id: string; sentence: string; trigger: string; start: number; end: number; }
interface EntitySpan { termId: string; matchedAlias: string; start: number; end: number; }
interface EvidenceExtraction { normalizedText: string; candidates: ClaimCandidate[]; entitySpans: EntitySpan[]; }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown request failure";
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<GraphPayload | null>(null);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [results, setResults] = useState<BlastResult[]>([]);
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [claim, setClaim] = useState<ClaimPayload | null>(null);
  const [draftText, setDraftText] = useState("Strait of Hormuz transit halts. European Union confirms rerouting.");
  const [evidence, setEvidence] = useState<EvidenceExtraction | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/graph")
      .then((r) => {
        if (!r.ok) throw new Error(`graph request failed with HTTP ${r.status}`);
        return r.json();
      })
      .then((data: GraphPayload) => {
        setGraphData(data);
        setGraphError(null);
      })
      .catch((error: unknown) => setGraphError(errorMessage(error)));
  }, []);

  useEffect(() => {
    void fetch("/api/claims/claim-hormuz-1")
      .then((r) => {
        if (!r.ok) throw new Error(`claim request failed with HTTP ${r.status}`);
        return r.json();
      })
      .then((data: ClaimPayload) => setClaim(data))
      .catch(() => setClaim(null));
  }, []);

  async function extractEvidence() {
    if (!graphData) return;
    setEvidenceError(null);
    try {
      const response = await fetch("/api/evidence/candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: draftText, nodes: graphData.nodes }),
      });
      if (!response.ok) throw new Error(`evidence request failed with HTTP ${response.status}`);
      const body = (await response.json()) as EvidenceExtraction;
      setEvidence(body);
    } catch (error: unknown) {
      setEvidence(null);
      setEvidenceError(errorMessage(error));
    }
  }

  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    const graph = new Graph();
    for (const node of graphData.nodes) {
      graph.addNode(node.id, { label: node.label, size: 8, color: "#4f46e5" });
    }
    for (const edge of graphData.edges) {
      if (edge.from !== edge.to && graph.hasNode(edge.from) && graph.hasNode(edge.to)) {
        graph.addEdge(edge.from, edge.to, { label: edge.relation });
      }
    }

    const sigma = new Sigma(graph, containerRef.current);
    sigma.on("clickNode", ({ node }) => {
      setSelected(node);
      setSnapshot(null);
      setResults([]);
      void fetch(`/api/scenarios/${node}`)
        .then((r) => {
          if (!r.ok) throw new Error(`scenario request failed with HTTP ${r.status}`);
          return r.json();
        })
        .then((body: { snapshot: GraphSnapshot; results: BlastResult[] }) => {
          setSnapshot(body.snapshot);
          setResults(body.results);
        })
        .catch(() => {
          setSnapshot(null);
          setResults([]);
        });
    });

    return () => {
      sigma.kill();
    };
  }, [graphData]);

  return (
    <div className="layout">
      <div id="graph" ref={containerRef} />
      <div className="panel">
        <h2>Arcstar</h2>
        {graphError ? <p className="error">Could not load graph: {graphError}</p> : null}
        {selected ? <p>Disrupted: {selected}</p> : <p>Click a node to compute blast radius.</p>}
        {snapshot ? (
          <p className="snapshot">
            Snapshot {snapshot.id.slice(0, 12)}: {snapshot.edgeCount} edges at {snapshot.asOf}
          </p>
        ) : null}
        {results.map((result) => (
          <div className="node-item" key={result.node}>
            <strong>{result.node}</strong> - {result.impactScore.toFixed(3)} (hop {result.hops})
          </div>
        ))}

        {claim ? (
          <section className="claim">
            <h3>Persisted claim</h3>
            <p>{claim.claim.text}</p>
            {claim.assessment ? (
              <p>
                Score {claim.assessment.score.value.toFixed(3)} by {claim.assessment.score.methodVersion}
              </p>
            ) : (
              <p>No stored assessment yet.</p>
            )}
            <h4>Evidence</h4>
            {claim.evidence.map((item) => (
              <div className="node-item" key={`${item.sourceId}-${item.stance}`}>
                <strong>{item.sourceId}</strong> - {item.stance}
                {item.passage ? `: ${item.passage}` : ""} ({item.status})
              </div>
            ))}
          </section>
        ) : null}

        <section className="evidence">
          <h3>Evidence extraction</h3>
          <textarea
            aria-label="Evidence text"
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            rows={4}
          />
          <button type="button" onClick={() => void extractEvidence()} disabled={!graphData}>
            Extract claim candidates
          </button>
          {evidenceError ? <p className="error">Evidence request failed: {evidenceError}</p> : null}

          {evidence ? (
            <div>
              <h4>Claim candidates</h4>
              {evidence.candidates.map((candidate) => (
                <div className="node-item" key={candidate.id}>
                  <strong>{candidate.trigger}</strong> - {candidate.sentence}
                </div>
              ))}

              <h4>Entity matches</h4>
              {evidence.entitySpans.map((span) => (
                <div className="node-item" key={`${span.termId}-${span.start}-${span.end}-${span.matchedAlias}`}>
                  <strong>{span.termId}</strong> - {span.matchedAlias}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
