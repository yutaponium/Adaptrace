// Health check of the dependency graph (ADR-033): what validate does not
// treat as wrong, but a person may want to tidy. Nothing here is an error;
// each finding is a suggestion for a person to decide on.
import type { Bundle } from "./bundle";
import type { Edge, Graph } from "./graph";
import { findConcept, propagates } from "./impact";

export type HealthCode =
  | "deprecated-target"
  | "redundant-dependency"
  | "orphan";

export interface HealthFinding {
  code: HealthCode;
  file: string;
  line?: number;
  message: string;
  // deprecated-target and redundant-dependency: the edge in question.
  edge?: Edge;
  // deprecated-target: the live documents that supersede the target,
  // directly or through other deprecated ones.
  replacedBy?: string[];
  // redundant-dependency: the longer path that reaches the same document.
  via?: Edge[];
}

function isDeprecated(bundle: Bundle, path: string): boolean {
  return bundle.concepts.get(path)?.frontmatter.status === "deprecated";
}

// The live documents that replace `path`: follow supersedes backwards
// through deprecated replacements until live ones.
function replacements(bundle: Bundle, graph: Graph, path: string): string[] {
  const found = new Set<string>();
  const seen = new Set([path]);
  const queue = [path];
  for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
    for (const edge of graph.backlinks.get(node) ?? []) {
      if (edge.kind !== "supersedes" || seen.has(edge.from)) continue;
      seen.add(edge.from);
      if (isDeprecated(bundle, edge.from)) queue.push(edge.from);
      else found.add(edge.from);
    }
  }
  return [...found].sort();
}

// Live documents that still point at a deprecated one. supersedes is left
// out: pointing at what it replaces is what it is for. So is changes: what a
// change request was about is its history, and the adaptrace-supersede
// skill leaves it to a person (ADR-032).
function dependsOnDeprecated(bundle: Bundle, graph: Graph): HealthFinding[] {
  const findings: HealthFinding[] = [];
  for (const edge of graph.edges) {
    if (
      edge.kind === "references" ||
      edge.kind === "supersedes" ||
      edge.kind === "changes"
    ) {
      continue;
    }
    if (isDeprecated(bundle, edge.from) || !isDeprecated(bundle, edge.to)) {
      continue;
    }
    // Not the document itself: it would be told to point at itself.
    const all = replacements(bundle, graph, edge.to);
    const replacedBy = all.filter((p) => p !== edge.from);
    const others =
      replacedBy.length > 0
        ? ` (also superseded by ${replacedBy.join(", ")})`
        : "";
    const instead = all.includes(edge.from)
      ? `. This document replaces it${others}: remove the entry, or keep it as history`
      : replacedBy.length > 0
        ? `. Superseded by ${replacedBy.join(", ")}: point there, remove the entry, or keep it as history`
        : ". Remove the entry, point at what replaced it, or keep it as history";
    findings.push({
      code: "deprecated-target",
      file: edge.from,
      line: edge.line,
      message: `${edge.kind} ${edge.to}, which is deprecated${instead}`,
      edge,
      replacedBy,
    });
  }
  return findings;
}

// A propagating edge A -> C is redundant when A reaches C anyway through a
// longer path of the same key, over live documents: impact and stale
// already reach A from C, and the key says the same along the way. A path
// of other keys does not count: "satisfies" next to "depends_on, then
// derived_from" is traceability, not repetition. Paths through deprecated
// documents do not count either, since removing the direct edge would then
// leave only a dependency on them. An edge from or to a document inside a
// cycle of the key is left out: validate reports the cycle, and two edges
// could each be called redundant because of the other. Outside cycles the
// redundant edges can all be removed together. The same target listed twice
// under one key is redundant too, with no path.
function redundant(bundle: Bundle, graph: Graph): HealthFinding[] {
  const live = (p: string) => !isDeprecated(bundle, p);
  // key -> from -> its edges of that key.
  const byKind = new Map<string, Map<string, Edge[]>>();
  for (const edge of graph.edges) {
    if (!propagates(edge) || edge.from === edge.to) continue;
    if (!live(edge.from) || !live(edge.to)) continue;
    const out = byKind.get(edge.kind) ?? new Map<string, Edge[]>();
    const edges = out.get(edge.from) ?? [];
    edges.push(edge);
    out.set(edge.from, edges);
    byKind.set(edge.kind, out);
  }
  const findings: HealthFinding[] = [];
  for (const out of byKind.values()) {
    for (const [from, edges] of out) {
      const listed = new Set<string>();
      const reported = new Set<string>();
      for (const direct of edges) {
        if (listed.has(direct.to)) {
          findings.push({
            code: "redundant-dependency",
            file: from,
            line: direct.line,
            message: `${direct.kind} ${direct.to} is listed more than once. Remove the repeated entry`,
            edge: direct,
            via: [],
          });
          continue;
        }
        listed.add(direct.to);
        if (reported.has(direct.to)) continue;
        if (inCycle(out, from) || inCycle(out, direct.to)) continue;
        const via = longerPath(out, from, direct.to);
        if (via === null) continue;
        reported.add(direct.to);
        const steps = via.map((e) => e.to).join(" -> ");
        findings.push({
          code: "redundant-dependency",
          file: from,
          line: direct.line,
          message: `${direct.kind} ${direct.to} is also reached through ${direct.kind} ${steps}. Remove the entry if the longer path says the same, or keep it to state the link directly`,
          edge: direct,
          via,
        });
      }
    }
  }
  return findings;
}

// Whether `node` reaches itself through the edges in `out`.
function inCycle(out: Map<string, Edge[]>, node: string): boolean {
  const seen = new Set<string>();
  const queue = [node];
  for (let head = 0; head < queue.length; head++) {
    for (const edge of out.get(queue[head] as string) ?? []) {
      if (edge.to === node) return true;
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      queue.push(edge.to);
    }
  }
  return false;
}

// The shortest path of two or more edges from `from` to `to` that does not
// pass through `from` again (BFS over the first hop's other targets).
function longerPath(
  out: Map<string, Edge[]>,
  from: string,
  to: string,
): Edge[] | null {
  const previous = new Map<string, Edge>();
  const queue: string[] = [];
  for (const edge of out.get(from) ?? []) {
    if (edge.to === to || previous.has(edge.to)) continue;
    previous.set(edge.to, edge);
    queue.push(edge.to);
  }
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head] as string;
    for (const edge of out.get(node) ?? []) {
      if (edge.to === from || previous.has(edge.to)) continue;
      previous.set(edge.to, edge);
      if (edge.to === to) {
        const path: Edge[] = [];
        for (let e = previous.get(to); e !== undefined; ) {
          path.unshift(e);
          e = e.from === from ? undefined : previous.get(e.from);
        }
        return path;
      }
      queue.push(edge.to);
    }
  }
  return null;
}

// The live Stakeholder document a value of owner or requested_by names: by
// its path ("/" first), or by its title when exactly one live Stakeholder
// document (or one with side) has it, as meeting reads them (ADR-025).
function stakeholder(bundle: Bundle, value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const v = value.trim();
  const isPerson = (fm: Record<string, unknown>) =>
    fm.side !== undefined || /^stakeholder$/i.test(String(fm.type ?? ""));
  const live = [...bundle.concepts.values()].filter(
    (c) => c.frontmatter.status !== "deprecated" && isPerson(c.frontmatter),
  );
  if (v.startsWith("/")) {
    const path = findConcept(bundle, v);
    return live.some((c) => c.path === path) ? path : null;
  }
  const matches = live.filter((c) => c.frontmatter.title === v);
  return matches.length === 1 ? (matches[0]?.path ?? null) : null;
}

// Live documents with no dependency to or from another live document. Body
// links (references) do not count: they are not dependencies. Two links
// that are not dependencies keep a document out too, since they are what it
// is for: a live document that supersedes a deprecated one or a change
// request about one, and a
// Stakeholder document named in a live document's owner or requested_by.
function orphans(bundle: Bundle, graph: Graph): HealthFinding[] {
  const live = (p: string) => !isDeprecated(bundle, p);
  const linked = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind === "references" || edge.from === edge.to) continue;
    // What it replaces, or what a change request was about (ADR-032).
    if (
      (edge.kind === "supersedes" || edge.kind === "changes") &&
      live(edge.from)
    ) {
      linked.add(edge.from);
    }
    if (!live(edge.from) || !live(edge.to)) continue;
    linked.add(edge.from);
    linked.add(edge.to);
  }
  for (const concept of bundle.concepts.values()) {
    if (!live(concept.path)) continue;
    for (const key of ["owner", "requested_by"]) {
      const value = concept.frontmatter[key];
      for (const v of Array.isArray(value) ? value : [value]) {
        const path = stakeholder(bundle, v);
        if (path !== null && path !== concept.path) linked.add(path);
      }
    }
  }
  return [...bundle.concepts.keys()]
    .filter((p) => live(p) && !linked.has(p))
    .map((file) => ({
      code: "orphan" as const,
      file,
      message:
        "no dependency to or from another live document. Add the dependency it has, or deprecate it if it is no longer needed",
    }));
}

export function health(bundle: Bundle, graph: Graph): HealthFinding[] {
  return [
    ...dependsOnDeprecated(bundle, graph),
    ...redundant(bundle, graph),
    ...orphans(bundle, graph),
  ].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.code.localeCompare(b.code),
  );
}
