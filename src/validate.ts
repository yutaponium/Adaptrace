import { type Bundle, type Concept, findLine } from "./bundle";
import { buildGraph, findCycles, type Graph } from "./graph";
import { forEachProseLine } from "./links";
import { isReadableFile, localResources, SHA256 } from "./resource";
import { DATETIME, LIFECYCLE_STATUSES, OKF_VERSION } from "./schema";
import { suggestKey, suggestType } from "./spelling";

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  code: string;
  file: string;
  line?: number;
  message: string;
}

const LOG_DATE_HEADING = /^##\s+(.*)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function checkConcept(concept: Concept, issues: Issue[]) {
  const fm = concept.frontmatter;
  const at = (code: string, severity: Severity, key: string, message: string) =>
    issues.push({
      severity,
      code,
      file: concept.path,
      line: findLine(concept, new RegExp(`^${key}\\s*:`)),
      message,
    });

  const type = fm.type;
  if (typeof type !== "string" || type.trim() === "") {
    at(
      "missing-type",
      "error",
      "type",
      "frontmatter must have a non-empty 'type'",
    );
  } else {
    const known = suggestType(type);
    if (known) {
      // Only case or separators differ: the same word, written another way.
      const sameWord =
        known.toLowerCase().replace(/[\s_-]+/g, "") ===
        type.toLowerCase().replace(/[\s_-]+/g, "");
      at(
        "type-spelling",
        "warning",
        "type",
        sameWord
          ? `type '${type}' should be written '${known}'`
          : `type '${type}' looks like '${known}'; as written, it is a different type`,
      );
    }
  }

  for (const key of Object.keys(fm)) {
    const s = suggestKey(key);
    if (s === null) continue;
    let message: string;
    if (s.reverse) {
      // X blocked_by Y is also "X waits for Y", which depends_on states.
      const here = s.key === "blocks" ? ", or 'depends_on' here" : "";
      message = `key '${key}' is not read as a dependency. Adaptrace records this relation on the other document: write '${s.key}' there${here}`;
    } else if (s.dependency) {
      message = `key '${key}' looks like '${s.key}'; as written, it is not read as a dependency`;
    } else {
      message = `key '${key}' looks like '${s.key}'; as written, Adaptrace does not read it`;
    }
    // The key may be quoted in YAML.
    at("key-spelling", "warning", `["']?${escapeRegExp(key)}["']?`, message);
  }

  if (
    fm.status !== undefined &&
    !(LIFECYCLE_STATUSES as readonly unknown[]).includes(fm.status)
  ) {
    at(
      "invalid-status",
      "warning",
      "status",
      `status must be one of ${LIFECYCLE_STATUSES.join(", ")} (OKF lifecycle); use 'state' for progress`,
    );
  }

  if (fm.timestamp !== undefined) {
    at(
      "legacy-timestamp",
      "warning",
      "timestamp",
      "'timestamp' is superseded by 'generated.at' in OKF 0.2",
    );
  }

  if (fm.generated !== undefined) {
    const g = fm.generated as Record<string, unknown> | null;
    if (g === null || typeof g !== "object" || typeof g.by !== "string") {
      at(
        "invalid-generated",
        "warning",
        "generated",
        "'generated' must be a mapping with 'by'",
      );
    } else if (g.at !== undefined && !isDatetime(g.at)) {
      at(
        "invalid-datetime",
        "warning",
        "generated",
        "'generated.at' must be an ISO 8601 datetime with a UTC offset",
      );
    }
  }

  if (fm.verified !== undefined) {
    const entries = Array.isArray(fm.verified) ? fm.verified : [fm.verified];
    for (const v of entries as unknown[]) {
      const e = v as Record<string, unknown> | null;
      if (
        e === null ||
        typeof e !== "object" ||
        typeof e.by !== "string" ||
        !isDatetime(e.at)
      ) {
        at(
          "invalid-verified",
          "warning",
          "verified",
          "each 'verified' entry needs 'by' and an ISO 8601 'at' with a UTC offset",
        );
        break;
      }
    }
  }

  for (const key of ["stale_after", "received_at"]) {
    if (fm[key] !== undefined && !isDatetime(fm[key])) {
      at(
        "invalid-datetime",
        "warning",
        key,
        `'${key}' must be an ISO 8601 datetime with a UTC offset`,
      );
    }
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The form, and a real date: the last update reads it the same way.
function isDatetime(value: unknown): boolean {
  return (
    typeof value === "string" &&
    DATETIME.test(value) &&
    !Number.isNaN(new Date(value).getTime())
  );
}

// A local file named in resource or sources (ADR-022) that does not exist:
// stale cannot tell when it changed.
function checkResources(bundle: Bundle, concept: Concept, issues: Issue[]) {
  const fm = concept.frontmatter;
  if (fm.status === "deprecated") return;
  // Every recorded SHA-256, wherever it is.
  const malformed = (v: unknown) =>
    v !== undefined && (typeof v !== "string" || !SHA256.test(v.trim()));
  const recorded: { value: unknown; key: string; of: unknown }[] = [
    { value: fm.resource_sha256, key: "resource_sha256", of: fm.resource },
  ];
  if (Array.isArray(fm.sources)) {
    for (const s of fm.sources) {
      if (s !== null && typeof s === "object") {
        const e = s as Record<string, unknown>;
        recorded.push({ value: e.sha256, key: "sources", of: e.resource });
      }
    }
  }
  for (const r of recorded) {
    // A record next to a value that is not read as a local file: the file is
    // not tracked, although the user may think it is (often "/pm/..." for
    // "../pm/...").
    if (
      r.value !== undefined &&
      !malformed(r.value) &&
      !localResources(bundle, {
        ...concept,
        frontmatter: { type: fm.type, resource: r.of },
      }).length
    ) {
      issues.push({
        severity: "warning",
        code: "unlinked-sha256",
        file: concept.path,
        line: findLine(concept, new RegExp(`^${r.key}\\s*:`)),
        message: `a sha256 is recorded for '${String(r.of ?? "")}', which is not read as a local file (the document itself is never tracked): write a file from the document as ./ or ../, or as file:///`,
      });
      continue;
    }
    if (!malformed(r.value)) continue;
    issues.push({
      severity: "warning",
      code: "invalid-sha256",
      file: concept.path,
      line: findLine(concept, new RegExp(`^${r.key}\\s*:`)),
      message:
        typeof r.of === "string"
          ? `the sha256 recorded for '${r.of}' is not 64 hex digits`
          : `${r.key === "resource_sha256" ? "resource_sha256" : "a sha256 in sources"} is not 64 hex digits`,
    });
  }
  for (const r of localResources(bundle, concept)) {
    if (isReadableFile(r.file)) continue;
    issues.push({
      severity: "warning",
      code: "missing-resource",
      file: concept.path,
      line: findLine(concept, new RegExp(`^${r.key}\\s*:`)),
      message: `${r.key === "resource" ? "resource" : "sources"} names '${r.raw}', which does not exist or cannot be read, so stale cannot tell whether it changed`,
    });
  }
}

function checkReserved(bundle: Bundle, issues: Issue[]) {
  for (const file of bundle.reserved) {
    const isRoot = file.path === file.name;
    if (file.name === "index.md" && file.frontmatter !== null) {
      const keys = Object.keys(file.frontmatter);
      if (!isRoot || keys.some((k) => k !== "okf_version")) {
        issues.push({
          severity: "error",
          code: "index-frontmatter",
          file: file.path,
          line: 1,
          message: isRoot
            ? "the root index.md may only carry 'okf_version' in its frontmatter"
            : "index.md must not have frontmatter (only the root index.md may carry 'okf_version')",
        });
      } else if (
        file.frontmatter.okf_version !== undefined &&
        String(file.frontmatter.okf_version) !== OKF_VERSION
      ) {
        issues.push({
          severity: "warning",
          code: "okf-version",
          file: file.path,
          line: 2,
          message: `okf_version is '${file.frontmatter.okf_version}'; Adaptrace targets OKF ${OKF_VERSION}`,
        });
      }
    }
    if (file.name === "log.md") {
      forEachProseLine(file.body, (line, i) => {
        const heading = LOG_DATE_HEADING.exec(line);
        if (heading && !ISO_DATE.test(heading[1]?.trim() ?? "")) {
          issues.push({
            severity: "error",
            code: "log-date",
            file: file.path,
            line: file.bodyLine + i,
            message: `log.md date headings must be YYYY-MM-DD, got '${heading[1]}'`,
          });
        }
      });
    }
  }
}

function checkGraph(graph: Graph, issues: Issue[]) {
  for (const u of graph.unresolved) {
    if (u.kind === "references") {
      issues.push({
        severity: "warning",
        code: "broken-link",
        file: u.from,
        line: u.line,
        message: `link target '${u.target}' does not exist`,
      });
      continue;
    }
    const messages: Record<typeof u.reason, string> = {
      missing: `${u.kind}: '${u.target}' does not exist`,
      "not-a-concept": `${u.kind}: '${u.target}' is not a concept document`,
      "outside-bundle": `${u.kind}: '${u.target}' is a URL or outside the bundle`,
      "invalid-value": `${u.kind} must be a path or a list of paths`,
    };
    issues.push({
      severity: "error",
      code:
        u.reason === "invalid-value"
          ? "invalid-dependency"
          : "dependency-target",
      file: u.from,
      line: u.line,
      message: messages[u.reason],
    });
  }
  for (const cycle of findCycles(graph)) {
    const [first] = cycle.edges;
    if (first === undefined) continue;
    const steps = cycle.edges
      .map((e) => `${e.from} ${e.kind} ${e.to}`)
      .join(", ");
    const selfLoop = cycle.edges.length === 1 && first.from === first.to;
    // The component can be larger than the one cycle shown; name the rest so
    // one fix does not reveal the next cycle only on the next run.
    const shown = new Set(cycle.edges.flatMap((e) => [e.from, e.to]));
    const others = cycle.nodes.filter((n) => !shown.has(n));
    const tangle =
      others.length > 0
        ? `. Also caught in the same tangle: ${others.join(", ")}`
        : "";
    if (cycle.group === "deadlock") {
      const waits = cycle.edges
        .map((e) =>
          e.kind === "blocks"
            ? `${e.to} waits for ${e.from} (blocks)`
            : `${e.from} waits for ${e.to} (${e.kind})`,
        )
        .join(", ");
      issues.push({
        severity: "warning",
        code: "dependency-deadlock",
        file: first.from,
        line: first.line,
        message:
          (selfLoop
            ? `deadlock: ${first.from} blocks itself. Remove the blocks entry`
            : `deadlock: ${waits}. Remove one of these dependencies, or split a document so part of the work can start`) +
          (selfLoop ? "" : tangle),
      });
      continue;
    }
    issues.push({
      severity: "error",
      code: "dependency-cycle",
      file: first.from,
      line: first.line,
      message:
        (selfLoop
          ? `${first.from} refers to itself via ${first.kind}. Remove the entry`
          : `cycle: ${steps}`) + (selfLoop ? "" : tangle),
    });
  }
}

export function validate(bundle: Bundle, graph = buildGraph(bundle)): Issue[] {
  const issues: Issue[] = [];
  for (const e of bundle.invalid) {
    issues.push({
      severity: "error",
      code: "frontmatter",
      file: e.path,
      line: 1,
      message: e.message,
    });
  }
  for (const concept of bundle.concepts.values()) {
    checkConcept(concept, issues);
    checkResources(bundle, concept, issues);
  }
  checkReserved(bundle, issues);
  checkGraph(graph, issues);
  return issues.sort(
    (a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0),
  );
}
