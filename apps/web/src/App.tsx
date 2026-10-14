import { useEffect, useRef, useState } from "react";
import Sigma from "sigma";
import Graph from "graphology";

interface WebNode { id: string; type: string; label: string; props: Record<string, unknown>; }
interface WebEdge { from: string; to: string; relation: string; weight: number; asOf: string; }
interface BlastResult { node: string; hops: number; impactScore: number; path: string[]; }

interface GraphPayload { nodes: WebNode[]; edges: WebEdge[]; }

interface ClaimCandidate { id: string; sentence: string; trigger: string; start: number; end: number; }
interface EntitySpan { termId: string; matchedAlias: string; start: number; end: number; }
interface EvidenceExtraction { normalizedText: string; candidates: ClaimCandidate[]; entitySpans: EntitySpan[]; }

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const [graphData, setGraphData] = useState<GraphPayload | null>(null);
  const [results, setResults] = useState<BlastResult[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("Strait of Hormuz transit halts. European Union confirms rerouting.");
  const [evidence, setEvidence] = useState<EvidenceExtraction | null>(null);

  useEffect(() => {
    void fetch("/api/graph")
      .then((r) => r.json())
      .then((data: GraphPayload) => setGraphData(data));
  }, []);

  async function extractEvidence() {
    if (!graphData) return;
    const response = await fetch("/api/evidence/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: draftText, nodes: graphData.nodes }),
    });
    const body = (await response.json()) as EvidenceExtraction;
    setEvidence(body);
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
      const payload = {
        graph: { nodes: graphData.nodes, edges: graphData.edges },
        disruptedNode: node,
      };
      void fetch("/api/blast-radius", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((r) => r.json())
        .then((body: { results: BlastResult[] }) => setResults(body.results));
    });
    sigmaRef.current = sigma;
    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [graphData]);

  return (
    <div className="layout">
      <div id="graph" ref={containerRef} />
      <div className="panel">
        <h2>Arcstar</h2>
        {selected ? <p>Disrupted: {selected}</p> : <p>Click a node to compute blast radius.</p>}
        {results.map((result) => (
          <div className="node-item" key={result.node}>
            <strong>{result.node}</strong> - {result.impactScore.toFixed(3)} (hop {result.hops})
          </div>
        ))}

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

          {evidence && (
            <div>
              <h4>Claim candidates</h4>
              {evidence.candidates.map((candidate) => (
                <div className="node-item" key={candidate.id}>
                  <strong>{candidate.trigger}</strong> - {candidate.sentence}
                </div>
              ))}

              <h4>Entity matches</h4>
              {evidence.entitySpans.map((span) => (
                <div className="node-item" key={`${span.termId}-${span.start}`}>
                  <strong>{span.termId}</strong> - {span.matchedAlias}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
