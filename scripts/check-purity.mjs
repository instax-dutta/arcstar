#!/usr/bin/env node
/**
 * Purity gate for the credibility engine.
 *
 * PLAN.md and the root AGENTS.md both state the load-bearing contract:
 * `packages/credibility` performs no I/O, touches no database, opens no
 * network, and never reads the clock. Time must be injected.
 *
 * This is a source-level scan rather than an ESLint rule because the forbidden
 * things are mostly ambient: a stray `fetch`, an imported `node:fs`, a call to
 * `Date.now()` buried three functions deep. Static lint rules catch the easy
 * cases; this catches the whole class by refusing to allowlist anything.
 *
 * Exit code 1 on any violation, so CI fails.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const PACKAGE_ROOT = resolve(process.argv[2] ?? "packages/credibility");
const SRC = join(PACKAGE_ROOT, "src");

/** Banned ambient capabilities, grouped so failures are self-explanatory. */
const FORBIDDEN = [
  { group: "clock (time must be injected)", patterns: [/\bDate\.now\s*\(/, /\bnew\s+Date\s*\(\s*\)/] },
  { group: "randomness (breaks determinism)", patterns: [/\bMath\.random\s*\(/] },
  {
    group: "network",
    patterns: [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bEventSource\b/],
  },
  {
    group: "node I/O",
    patterns: [
      /\brequire\s*\(\s*["']node:fs/,
      /\bfrom\s+["']node:fs/,
      /\bfrom\s+["']node:http/,
      /\bfrom\s+["']node:net/,
      /\bfrom\s+["']node:dgram/,
      /\bfrom\s+["']fs/,
    ],
  },
  { group: "process/environment", patterns: [/\bprocess\.env\b/] },
  { group: "timers", patterns: [/\bsetTimeout\s*\(/, /\bsetInterval\s*\(/, /\bsetImmediate\s*\(/] },
  {
    group: "global mutable state",
    patterns: [/\bglobalThis\.\w+\s*=/, /\blocalStorage\b/, /\bsessionStorage\b/],
  },
];

/** Only .ts sources are scanned. Tests may legitimately reach for other things. */
function collectSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSources(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

let failures = 0;
let scanned = 0;

for (const file of collectSources(SRC)) {
  scanned += 1;
  const raw = readFileSync(file, "utf8");
  // Blank out comments while preserving line structure, so a documented banned
  // call is not reported as a violation but line numbers stay accurate.
  const lines = raw
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .split("\n");
  const rel = relative(process.cwd(), file);

  lines.forEach((line, idx) => {
    const code = line.replace(/\/\/.*$/, "");
    for (const { group, patterns } of FORBIDDEN) {
      for (const pattern of patterns) {
        if (pattern.test(code)) {
          failures += 1;
          console.error(
            `  PURITY VIOLATION  ${rel}:${idx + 1}  [${group}]\n    ${line.trim()}`,
          );
        }
      }
    }
  });

  // An import of anything outside the workspace is an implicit I/O dependency.
  const content = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, "");
  for (const m of content.matchAll(/from\s+["']([^"']+)["']/g)) {
    const spec = m[1];
    if (spec.startsWith(".")) continue; // relative, fine
    if (spec.startsWith("@arcstar/")) continue; // workspace, fine
    if (spec === "zod") continue; // schema validation, pure
    if (spec.startsWith("vitest")) continue;
    failures += 1;
    console.error(`  PURITY VIOLATION  ${rel}  [external dependency]\n    imports "${spec}"`);
  }
}

if (failures > 0) {
  console.error(`\nPurity check FAILED: ${failures} violation(s) in ${scanned} file(s).`);
  console.error("The credibility engine must be deterministic and side-effect free.");
  process.exit(1);
}

const label = relative(process.cwd(), PACKAGE_ROOT) || ".";
console.log(`Purity check passed: ${scanned} file(s) in ${label} are I/O-free.`);
