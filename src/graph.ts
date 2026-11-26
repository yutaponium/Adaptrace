import { type Bundle, type Concept, findLine } from "./bundle";
import { type BodyLink, resolvePath } from "./links";
import {
  DEPENDENCY_KEY_NAMES,
  DEPENDENCY_KEYS,
  type DependencyKey,
} from "./schema";

export type EdgeKind = DependencyKey | "references";

export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  line?: number;
}

export interface Unresolved {
  from: string;
  kind: EdgeKind;
  target: string;
  line?: number;
  reason: "missing" | "not-a-concept" | "outside-bundle" | "invalid-value";
}

export interface Graph {
  edges: Edge[];
  unresolved: Unresolved[];
  // Incoming edges per concept path.
  backlinks: Map<string, Edge[]>;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Normalizes a dependency key's value to a list. Returns null when the value
// is neither a string nor a list of strings.
export function dependencyTargets(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value;
  }
  return null;
}

// The concept a resolved path names, accepting a concept ID ("tasks/mfa") as
// well as a file path ("tasks/mfa.md").
export function conceptAt(bundle: Bundle, resolved: string): string | null {
  return (
    [resolved, `${resolved}.md`].find((p) => bundle.concepts.has(p)) ?? null
  );
}

function resolveConcept(
  bundle: Bundle,
  target: string,
  from: string,
): { path: string } | { reason: Unresolved["reason"] } {
  const resolved = resolvePath(target, from);
  if (resolved === null) return { reason: "outside-bundle" };
  const path = conceptAt(bundle, resolved);
  if (path !== null) return { path };
  return bundle.files.has(resolved)
    ? { reason: "not-a-concept" }
    : { reason: "missing" };
}

// 1-based line of `target` within the block of frontmatter key `key`: the key
// line itself and the indented or list lines under it.
function valueLine(
  concept: Concept,
  key: string,
  target: string,
  used: Set<number> = new Set(),
): number | undefined {
  const keyLine = findLine(concept, new RegExp(`^${key}\\s*:`));
  if (keyLine === undefined) return undefined;
  const lines = concept.frontmatterLines;
  const start = keyLine - 1;
  const value = new RegExp(
    `(^|[\\s\\-:\\[,"'])${escapeRegExp(target)}($|[\\s,\\]"'])`,
  );
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (i > start && /^\S/.test(line) && !/^-/.test(line)) break;
    // A target written twice gets the line of each entry in turn.
    if (
      !used.has(i + 1) &&
      value.test(i === start ? line.replace(/^[^:]*:/, "") : line)
    ) {
      return i + 1;
    }
  }
  return start + 1;
}

function addDependencyEdges(bundle: Bundle, concept: Concept, graph: Graph) {
  for (const kind of DEPENDENCY_KEY_NAMES) {
    const targets = dependencyTargets(concept.frontmatter[kind]);
    if (targets === null) {
      graph.unresolved.push({
        from: concept.path,
        kind,
        target: String(concept.frontmatter[kind]),
        line: findLine(concept, new RegExp(`^${kind}\\s*:`)),
        reason: "invalid-value",
      });
      continue;
    }
    const used = new Set<number>();
    for (const target of targets) {
      const line = valueLine(concept, kind, target, used);
      if (line !== undefined) used.add(line);
      const result = resolveConcept(bundle, target, concept.path);
      if ("path" in result) {
        graph.edges.push({ from: concept.path, to: result.path, kind, line });
      } else {
        graph.unresolved.push({
          from: concept.path,
          kind,
          target,
          line,
          reason: result.reason,
        });
      }
    }
  }
}

// Follows body links from concepts (adding reference edges) and from index.md
// and log.md (checking only that the target exists).
function addReferenceEdges(
  bundle: Bundle,
  from: string,
  links: BodyLink[],
  graph: Graph,
  addEdges: boolean,
) {
  for (const link of links) {
    const resolved = resolvePath(link.target, from);
    if (resolved === null) continue;
    const concept = conceptAt(bundle, resolved);
    if (concept !== null) {
      if (addEdges) {
        graph.edges.push({
          from,
          to: concept,
          kind: "references",
          line: link.line,
        });
      }
    } else if (!bundle.files.has(resolved) && !isDirectory(bundle, resolved)) {
      graph.unresolved.push({
        from,
        kind: "references",
        target: link.target,
        line: link.line,
        reason: "missing",
      });
    }
  }
}

function isDirectory(bundle: Bundle, path: string): boolean {
  const prefix = path === "" || path.endsWith("/") ? path : `${path}/`;
  for (const file of bundle.files) if (file.startsWith(prefix)) return true;
  return false;
}

export function buildGraph(bundle: Bundle): Graph {
  const graph: Graph = { edges: [], unresolved: [], backlinks: new Map() };
  for (const concept of bundle.concepts.values()) {
    addDependencyEdges(bundle, concept, graph);
    addReferenceEdges(bundle, concept.path, concept.links, graph, true);
  }
  for (const file of bundle.reserved) {
    addReferenceEdges(bundle, file.path, file.links, graph, false);
  }
  for (const edge of graph.edges) {
    const incoming = graph.backlinks.get(edge.to) ?? [];
    incoming.push(edge);
    graph.backlinks.set(edge.to, incoming);
  }
  return graph;
}

// A cycle is reported per group:
// - review: through the propagating kinds. A change would loop forever, so
//   validate reports it as an error.
// - supersedes: documents replacing each other. An error.
// - deadlock: documents waiting on each other. `blocks` points from the
//   blocker to the waiter and `depends_on` from the waiter to what it waits
//   for, so `blocks` is reversed to build a single "waits for" graph. Only
//   cycles that contain a `blocks` edge are reported here (a pure depends_on
//   cycle is already a review cycle), and validate reports them as warnings.
export type CycleGroup = "review" | "supersedes" | "deadlock";

export interface Cycle {
  group: CycleGroup;
  nodes: string[];
  // The dependency edges along one concrete cycle, in order.
  edges: Edge[];
}

interface Arc {
  to: string;
  edge: Edge;
}

type Adjacency = Map<string, Arc[]>;

function arcsFor(graph: Graph, group: CycleGroup): Adjacency {
  const adjacency: Adjacency = new Map();
  const add = (from: string, to: string, edge: Edge) => {
    const arcs = adjacency.get(from) ?? [];
    arcs.push({ to, edge });
    adjacency.set(from, arcs);
  };
  for (const edge of graph.edges) {
    if (edge.kind === "references") continue;
    if (group === "review" && DEPENDENCY_KEYS[edge.kind].propagates) {
      add(edge.from, edge.to, edge);
    } else if (group === "supersedes" && edge.kind === "supersedes") {
      add(edge.from, edge.to, edge);
    } else if (group === "deadlock") {
      if (edge.kind === "depends_on") add(edge.from, edge.to, edge);
      if (edge.kind === "blocks") add(edge.to, edge.from, edge);
    }
  }
  return adjacency;
}

// Strongly connected components with more than one node or a self loop
// (Tarjan's algorithm, iterative so long chains do not overflow the stack).
function components(adjacency: Adjacency): string[][] {
  const found: string[][] = [];
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let index = 0;
  for (const root of [...adjacency.keys()].sort()) {
    if (indices.has(root)) continue;
    const work: { node: string; next: number }[] = [{ node: root, next: 0 }];
    indices.set(root, index);
    lowlinks.set(root, index++);
    stack.push(root);
    onStack.add(root);
    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (frame === undefined) break;
      const v = frame.node;
      const arcs = adjacency.get(v) ?? [];
      const arc = arcs[frame.next++];
      if (arc !== undefined) {
        const w = arc.to;
        if (!indices.has(w)) {
          indices.set(w, index);
          lowlinks.set(w, index++);
          stack.push(w);
          onStack.add(w);
          work.push({ node: w, next: 0 });
        } else if (onStack.has(w)) {
          lowlinks.set(v, Math.min(lowlinks.get(v) ?? 0, indices.get(w) ?? 0));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent !== undefined) {
        const p = parent.node;
        lowlinks.set(p, Math.min(lowlinks.get(p) ?? 0, lowlinks.get(v) ?? 0));
      }
      if (lowlinks.get(v) !== indices.get(v)) continue;
      const component: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w === undefined) break;
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1 || arcs.some((a) => a.to === v)) {
        found.push(component.sort());
      }
    }
  }
  return found;
}

// Shortest path of arcs from `from` to `to` inside `members` (BFS).
function pathWithin(
  adjacency: Adjacency,
  members: Set<string>,
  from: string,
  to: string,
): Arc[] | null {
  if (from === to) return [];
  const previous = new Map<string, { node: string; arc: Arc }>();
  const queue = [from];
  const seen = new Set([from]);
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    if (v === undefined) break;
    for (const arc of adjacency.get(v) ?? []) {
      if (!members.has(arc.to) || seen.has(arc.to)) continue;
      seen.add(arc.to);
      previous.set(arc.to, { node: v, arc });
      if (arc.to === to) {
        const path: Arc[] = [];
        for (let n = to; n !== from; ) {
          const step = previous.get(n);
          if (step === undefined) return null;
          path.unshift(step.arc);
          n = step.node;
        }
        return path;
      }
      queue.push(arc.to);
    }
  }
  return null;
}

// One concrete cycle through `component`. For deadlocks the cycle starts with
// a `blocks` edge, so the report always shows the edge that makes it a
// deadlock.
function cycleThrough(
  adjacency: Adjacency,
  component: string[],
  group: CycleGroup,
): Edge[] | null {
  const members = new Set(component);
  for (const node of component) {
    for (const arc of adjacency.get(node) ?? []) {
      if (!members.has(arc.to)) continue;
      // A self loop inside a larger component would hide the real cycle.
      if (arc.to === node && component.length > 1) continue;
      if (group === "deadlock" && arc.edge.kind !== "blocks") continue;
      const back = pathWithin(adjacency, members, arc.to, node);
      if (back !== null) return [arc, ...back].map((a) => a.edge);
    }
  }
  // No cycle through other documents qualified (for example a deadlock group
  // whose only blocks edge is a self loop): fall back to a self loop.
  for (const node of component) {
    const self = (adjacency.get(node) ?? []).find(
      (a) =>
        a.to === node && (group !== "deadlock" || a.edge.kind === "blocks"),
    );
    if (self !== undefined) return [self.edge];
  }
  return null;
}

export function findCycles(graph: Graph): Cycle[] {
  const cycles: Cycle[] = [];
  for (const group of ["review", "supersedes", "deadlock"] as const) {
    const adjacency = arcsFor(graph, group);
    for (const nodes of components(adjacency)) {
      const edges = cycleThrough(adjacency, nodes, group);
      if (edges !== null) cycles.push({ group, nodes, edges });
    }
  }
  return cycles;
}
