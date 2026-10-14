import type { Node } from "@arcstar/contracts";
import {
  type ClaimCandidate,
  type EntitySpan,
  type EntityTerm,
  extractClaimCandidates,
  extractEntitySpans,
  normalizeText,
} from "@arcstar/extraction";

export interface EvidenceExtraction {
  normalizedText: string;
  candidates: ClaimCandidate[];
  entitySpans: EntitySpan[];
}

export function entityTermsFromNodes(nodes: Node[]): EntityTerm[] {
  return nodes.map((node) => ({
    id: node.id,
    label: node.label,
    aliases: typeof node.props?.["aliases"] === "object" && node.props["aliases"] !== null
      ? Object.values(node.props["aliases"] as Record<string, unknown>).filter((value): value is string => typeof value === "string")
      : undefined,
  }));
}

export function extractEvidence(text: string, nodes: Node[]): EvidenceExtraction {
  return {
    normalizedText: normalizeText(text),
    candidates: extractClaimCandidates(text),
    entitySpans: extractEntitySpans(text, entityTermsFromNodes(nodes)),
  };
}
