import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Bundle } from "./bundle";
import { conceptAt, type Edge, type EdgeKind, type Graph } from "./graph";
import { reviewedAt, type Updated } from "./history";
import { resolvePath } from "./links";
import type { ResourceState } from "./resource";
import { DEPENDENCY_KEYS } from "./schema";

export function propagates(edge: Edge): boolean {
  return edge.kind !== "references" && DEPENDENCY_KEYS[edge.kind].propagates;
}

function isDeprecated(bundle: Bundle, path: string): boolean {
  return bundle.concepts.get(path)?.frontmatter.status === "deprecated";
}

// The order to review what `starts` reach, upstream first: each document's
// step is after every reached document it depends on, so reviewing step by
// step never revisits a document. Steps are the longest path from a starting
// document, numbered 1, 2, ... over the documents in `listed` only (the walk
// still goes through the others, such as deprecated ones). A starting
// document that another one reaches gets a later step. The documents of a
// cycle (validate reports it as an error) share one step, and whatever
// depends on the cycle comes after it.
export function reviewSteps(
  graph: Graph,
  starts: string[],
  listed: Iterable<string>,
): Map<string, number> {
  const reached = new Set(starts);
  const queue = [...starts];
  for (let node = queue.pop(); node !== undefined; node = queue.pop()) {
    for (const edge of graph.backlinks.get(node) ?? []) {
      if (!propagates(edge) || reached.has(edge.from)) continue;
      reached.add(edge.from);
      queue.push(edge.from);
    }
  }
  // node -> the reached documents that depend on it, once each.
  const next = new Map<string, string[]>();
  for (const node of reached) {
    const after = new Set<string>();
    for (const edge of graph.backlinks.get(node) ?? []) {
      if (propagates(edge) && reached.has(edge.from)) after.add(edge.from);
    }
    next.set(node, [...after].sort());
  }
  const component = components([...reached].sort(), next);
  // Longest path over the components, which form a DAG.
  const into = new Map<number, Set<number>>();
  const waiting = new Map<number, number>();
  for (const c of component.values()) waiting.set(c, 0);
  for (const [node, after] of next) {
    const from = component.get(node) ?? 0;
    for (const n of after) {
      const to = component.get(n) ?? 0;
      if (to === from) continue;
      const set = into.get(from) ?? new Set<number>();
      if (set.has(to)) continue;
      set.add(to);
      into.set(from, set);
      waiting.set(to, (waiting.get(to) ?? 0) + 1);
    }
  }
  const level = new Map<number, number>();
  const ready = [...waiting].filter(([, w]) => w === 0).map(([c]) => c);
  for (const c of ready) level.set(c, 0);
  for (let i = 0; i < ready.length; i++) {
    const c = ready[i] as number;
    const own = level.get(c) ?? 0;
    for (const to of into.get(c) ?? []) {
      level.set(to, Math.max(level.get(to) ?? 0, own + 1));
      const left = (waiting.get(to) ?? 0) - 1;
      waiting.set(to, left);
      if (left === 0) ready.push(to);
    }
  }
  const levelOf = (p: string) => level.get(component.get(p) ?? -1) ?? 0;
  // Renumber 1, 2, ... over the listed documents, so no step is empty.
  const shown = [...new Set(listed)].filter((p) => reached.has(p));
  const levels = [...new Set(shown.map(levelOf))].sort((a, b) => a - b);
  const step = new Map(levels.map((l, i) => [l, i + 1]));
  return new Map(shown.map((p) => [p, step.get(levelOf(p)) ?? 1]));
}

// Strongly connected components (Tarjan, without recursion): node -> the
// number of its component. A node outside any cycle is a component alone.
function components(
  nodes: string[],
  next: Map<string, string[]>,
): Map<string, number> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result = new Map<string, number>();
  let counter = 0;
  let count = 0;
  for (const root of nodes) {
    if (index.has(root)) continue;
    const work: { node: string; i: number }[] = [{ node: root, i: 0 }];
    index.set(root, counter);
    low.set(root, counter++);
    stack.push(root);
    onStack.add(root);
    while (work.length > 0) {
      const frame = work[work.length - 1] as { node: string; i: number };
      const after = next.get(frame.node) ?? [];
      if (frame.i < after.length) {
        const n = after[frame.i++] as string;
        if (!index.has(n)) {
          index.set(n, counter);
          low.set(n, counter++);
          stack.push(n);
          onStack.add(n);
          work.push({ node: n, i: 0 });
        } else if (onStack.has(n)) {
          low.set(
            frame.node,
            Math.min(low.get(frame.node) ?? 0, index.get(n) ?? 0),
          );
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent !== undefined) {
        low.set(
          parent.node,
          Math.min(low.get(parent.node) ?? 0, low.get(frame.node) ?? 0),
        );
      }
      if (low.get(frame.node) === index.get(frame.node)) {
        for (let n = stack.pop(); n !== undefined; n = stack.pop()) {
          onStack.delete(n);
          result.set(n, count);
          if (n === frame.node) break;
        }
        count++;
      }
    }
  }
  return result;
}

export interface Affected {
  path: string;
  // The edge from this document toward the changed one, one step closer.
  edge: Edge;
  depth: number;
  // Its place in the review order (see reviewSteps), from 1.
  step: number;
  updated: Updated | null;
  // Older than the changed document, or its update date is unknown.
  needsReview: boolean;
}

export interface ImpactReport {
  target: string;
  updated: Updated | null;
  affected: Affected[];
}

// Resolves a CLI argument to a concept path. Accepts a bundle path
// ("requirements/r.md", "/requirements/r.md"), a concept ID, or a path on
// disk relative to the current directory ("./.adaptrace/requirements/r.md").
export function findConcept(bundle: Bundle, arg: string): string | null {
  const inBundle = resolvePath(`/${arg.replace(/^\/+/, "")}`, "");
  const found = inBundle === null ? null : conceptAt(bundle, inBundle);
  if (found !== null) return found;
  const onDisk = relative(resolve(bundle.root), resolve(arg))
    .split(sep)
    .join("/");
  if (onDisk === "" || onDisk.startsWith("..") || isAbsolute(onDisk)) {
    return null;
  }
  return conceptAt(bundle, onDisk);
}

// Documents that may need review when `target` changes: everything that
// reaches it through depends_on, derived_from or satisfies, nearest first.
// Deprecated documents are not listed, but the walk continues through them.
export function impact(
  bundle: Bundle,
  graph: Graph,
  updated: Map<string, Updated>,
  target: string,
): ImpactReport {
  const targetUpdated = updated.get(target) ?? null;
  const affected: Affected[] = [];
  const seen = new Set([target]);
  let frontier = [target];
  for (let depth = 1; frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const edge of graph.backlinks.get(node) ?? []) {
        if (!propagates(edge) || seen.has(edge.from)) continue;
        seen.add(edge.from);
        next.push(edge.from);
        if (isDeprecated(bundle, edge.from)) continue;
        const own = updated.get(edge.from) ?? null;
        affected.push({
          path: edge.from,
          edge,
          depth,
          step: 0,
          updated: own,
          // Without a date on either side the comparison cannot clear it.
          needsReview:
            own === null ||
            targetUpdated === null ||
            reviewedAt(own) < targetUpdated.at,
        });
      }
    }
    frontier = next.sort();
  }
  const steps = reviewSteps(
    graph,
    [target],
    affected.map((a) => a.path),
  );
  for (const a of affected) a.step = steps.get(a.path) ?? 1;
  return { target, updated: targetUpdated, affected };
}

// How impact and estimate list documents: by depth (nearest first, the
// default) or in review order (upstream first, by step).
export type Order = "depth" | "review";

// Upstream first (see reviewSteps), then by path.
export function byReviewOrder<T extends { path: string; step: number }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) => a.step - b.step || a.path.localeCompare(b.path),
  );
}

export interface StaleReason {
  kind:
    | "older-than-dependency"
    | "expired"
    | "resource-changed"
    | "resource-unrecorded"
    | "resource-missing";
  // For older-than-dependency: the dependency that changed after this one.
  dependency?: string;
  kinds?: EdgeKind[];
  dependencyUpdated?: Updated;
  // For resource-changed and resource-unrecorded: the file it stands in for
  // or was made from (ADR-022), as written, the SHA-256 recorded for it
  // (changed) and the one it has now.
  resource?: string;
  recorded?: string;
  current?: string;
  // For expired: the stale_after instant.
  staleAfter?: Date;
  staleAfterRaw?: string;
}

export interface StaleDocument {
  path: string;
  updated: Updated | null;
  reasons: StaleReason[];
}

export interface StaleReport {
  stale: StaleDocument[];
  // Concepts whose update date is unknown, so they could not be compared.
  unknown: string[];
}

// Documents that are older than one of their direct dependencies (through the
// propagating keys), whose files changed or have no SHA-256 recorded
// (`resources`, from resourceStates), or past their stale_after. Deprecated documents are
// skipped, both as the stale document and as the newer dependency.
export function stale(
  bundle: Bundle,
  graph: Graph,
  updated: Map<string, Updated>,
  now: Date = new Date(),
  resources: Map<string, ResourceState[]> = new Map(),
): StaleReport {
  const report: StaleReport = { stale: [], unknown: [] };
  const outgoing = new Map<string, Edge[]>();
  for (const edge of graph.edges) {
    if (!propagates(edge)) continue;
    const edges = outgoing.get(edge.from) ?? [];
    edges.push(edge);
    outgoing.set(edge.from, edges);
  }
  for (const concept of bundle.concepts.values()) {
    if (isDeprecated(bundle, concept.path)) continue;
    const own = updated.get(concept.path) ?? null;
    if (own === null) report.unknown.push(concept.path);
    const reasons: StaleReason[] = [];
    if (own !== null) {
      // One reason per dependency, even when several keys point at it.
      const byDependency = new Map<string, Edge[]>();
      for (const edge of outgoing.get(concept.path) ?? []) {
        if (isDeprecated(bundle, edge.to)) continue;
        const edges = byDependency.get(edge.to) ?? [];
        edges.push(edge);
        byDependency.set(edge.to, edges);
      }
      for (const [dependency, edges] of byDependency) {
        const dependencyUpdated = updated.get(dependency);
        if (dependencyUpdated && reviewedAt(own) < dependencyUpdated.at) {
          reasons.push({
            kind: "older-than-dependency",
            dependency,
            kinds: edges.map((e) => e.kind),
            dependencyUpdated,
          });
        }
      }
    }
    for (const r of resources.get(concept.path) ?? []) {
      if (r.current === null) {
        // Moved, renamed or deleted: the document no longer tracks it.
        reasons.push({ kind: "resource-missing", resource: r.raw });
      } else if (r.recorded === null) {
        reasons.push({
          kind: "resource-unrecorded",
          resource: r.raw,
          current: r.current,
        });
      } else if (r.recorded !== r.current) {
        reasons.push({
          kind: "resource-changed",
          resource: r.raw,
          // As written, so it can be found in the document.
          recorded: String(r.recordedRaw).trim(),
          current: r.current,
        });
      }
    }
    const raw = concept.frontmatter.stale_after;
    const staleAfter = typeof raw === "string" ? new Date(raw) : null;
    if (
      staleAfter &&
      !Number.isNaN(staleAfter.getTime()) &&
      now >= staleAfter
    ) {
      reasons.push({ kind: "expired", staleAfter, staleAfterRaw: String(raw) });
    }
    if (reasons.length > 0) {
      report.stale.push({ path: concept.path, updated: own, reasons });
    }
  }
  return report;
}
