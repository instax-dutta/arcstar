export interface Span {
  start: number;
  end: number;
}

export interface ClaimCandidate extends Span {
  id: string;
  sentence: string;
  trigger: string;
  confidence: number;
}

export interface EntityTerm {
  id: string;
  label: string;
  aliases?: string[];
}

export interface EntitySpan extends Span {
  termId: string;
  matchedAlias: string;
}

const CLAIM_TRIGGERS = [
  "will",
  "expects",
  "plans to",
  "announces",
  "reports",
  "confirms",
  "denies",
  "halt",
  "halts",
  "shortage",
  "disruption",
  "spike",
  "surge",
] as const;

/**
 * Unicode NFC plus whitespace normalization. Consumers that need span-accurate
 * offsets must run `sentenceSpans` and `extractEntitySpans` on the original text.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Offset-safe sentence spans. A terminator followed by whitespace or end-of-input
 * ends a sentence; abbreviations are out of scope for this identifier layer.
 */
export function sentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  const sentenceEnd = /[.!?]+(?=\s|$)/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = sentenceEnd.exec(text)) !== null) {
    const end = match.index + match[0].length;
    spans.push({ start, end });
    start = end;
    while (start < text.length && /\s/.test(text.charAt(start))) {
      start += 1;
    }
  }
  if (start < text.length) {
    spans.push({ start, end: text.length });
  }
  return spans.filter((span) => text.slice(span.start, span.end).trim().length > 0);
}

export function extractClaimCandidates(text: string): ClaimCandidate[] {
  return sentenceSpans(text)
    .map((span) => ({
      span,
      sentence: text.slice(span.start, span.end),
    }))
    .filter(({ sentence }) => findClaimTrigger(sentence) !== undefined)
    .map(({ span, sentence }) => ({
      id: `candidate-${span.start}-${span.end}`,
      start: span.start,
      end: span.end,
      sentence,
      trigger: findClaimTrigger(sentence)!,
      confidence: 0.5,
    }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findClaimTrigger(sentence: string): string | undefined {
  const lower = sentence.toLowerCase();
  return CLAIM_TRIGGERS.find((trigger) => lower.includes(trigger));
}

export function extractEntitySpans(text: string, terms: EntityTerm[]): EntitySpan[] {
  const spans: EntitySpan[] = [];
  for (const term of terms) {
    const variants = [term.label, ...(term.aliases ?? [])];
    for (const variant of variants) {
      if (variant.trim().length === 0) continue;
      const pattern = new RegExp(`\\b${escapeRegExp(variant)}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        spans.push({
          termId: term.id,
          start: match.index,
          end: match.index + match[0].length,
          matchedAlias: variant,
        });
      }
    }
  }
  return spans.sort((a, b) => (a.start === b.start ? a.end - b.end : a.start - b.start));
}
