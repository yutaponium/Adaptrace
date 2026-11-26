// Checks the result of running the adaptrace-adopt skill on the test
// repository (see README.md). Usage: bun check.ts <repository>
// Exits 1 when a required check fails. "should" checks only warn: they
// depend on choices the skill leaves to the user.
import { join } from "node:path";
import { type Bundle, type Concept, loadBundle } from "../../../src/bundle";
import { buildGraph, type Graph } from "../../../src/graph";
import { validate } from "../../../src/validate";

const REVIEW_KEYS = new Set(["depends_on", "derived_from", "satisfies"]);
const DERIVED = new Set(["derived_from"]);

const repo = process.argv[2];
if (repo === undefined) {
  console.error("usage: bun check.ts <repository>");
  process.exit(2);
}

let failed = 0;
function check(level: "must" | "should", ok: boolean, what: string) {
  const mark = ok ? "ok  " : level === "must" ? "FAIL" : "warn";
  if (!ok && level === "must") failed++;
  console.log(`${mark}  ${what}`);
}

function text(c: Concept | undefined): string {
  return c ? `${String(c.frontmatter.title ?? "")}\n${c.body}` : "";
}

function find(
  bundle: Bundle,
  type: RegExp,
  content: RegExp,
): Concept | undefined {
  return [...bundle.concepts.values()].find(
    (c) => type.test(String(c.frontmatter.type ?? "")) && content.test(text(c)),
  );
}

function linked(
  graph: Graph,
  from?: Concept,
  to?: Concept,
  keys = REVIEW_KEYS,
) {
  return (
    from !== undefined &&
    to !== undefined &&
    graph.edges.some(
      (e) => e.from === from.path && e.to === to.path && keys.has(e.kind),
    )
  );
}

const bundle = await loadBundle(join(repo, ".adaptrace")).catch((e) => {
  console.log(`FAIL  no bundle: ${String(e)}`);
  console.log("\n1 required checks failed");
  process.exit(1);
});
const graph = buildGraph(bundle);
const errors = validate(bundle, graph).filter((i) => i.severity === "error");
check("must", errors.length === 0, `validate: ${errors.length} errors`);

const req1 = find(bundle, /^Requirement$/i, /多要素認証|MFA/);
const req2 = find(bundle, /^Requirement$/i, /セッション/);
check("must", req1 !== undefined, "REQ-1 is a Requirement");
check(
  "must",
  req2 !== undefined && req2 !== req1,
  "REQ-2 is its own Requirement",
);
check("should", req1?.frontmatter.owner === "sato", "REQ-1 owner is sato");

// By ID: a Decision made from the minutes may also mention IdP-X.
const adr1 = find(bundle, /^Decision$/i, /ADR-0001/);
const adr2 = find(bundle, /^Decision$/i, /ADR-0002/);
check("must", linked(graph, adr1, req1), "ADR-0001 depends on REQ-1");
check("must", linked(graph, adr2, req2), "ADR-0002 depends on REQ-2");
// Moved documents were written by people: by is not the agent.
check(
  "should",
  String(
    (adr1?.frontmatter.generated as { by?: unknown } | undefined)?.by ?? "",
  ).startsWith("human:"),
  "ADR-0001's generated.by is a person",
);
// The test repository commits with this date: a moved document keeps it.
check(
  "must",
  String(
    (adr1?.frontmatter.generated as { at?: unknown } | undefined)?.at ?? "",
  ).startsWith("2026-11-10"),
  "ADR-0001 keeps the date of its last commit in generated.at",
);

const meeting = find(bundle, /^Meeting$/i, /定例/);
check("must", meeting !== undefined, "the minutes are a Meeting");
const task = find(bundle, /^Task$/i, /MFA|ログイン/);
const risk = find(bundle, /^Risk$/i, /IdP-X|乗り換え|ロックイン/);
check(
  "must",
  linked(graph, task, meeting, DERIVED),
  "a Task from the minutes, derived_from them",
);
check(
  "must",
  linked(graph, risk, meeting, DERIVED),
  "a Risk from the minutes, derived_from them",
);
check(
  "should",
  task?.frontmatter.owner === "tanaka",
  "the Task's owner is tanaka",
);
check(
  "should",
  String(task?.frontmatter.due ?? "").includes("12-15"),
  "the Task is due on 12-15",
);
check("should", task?.frontmatter.state !== undefined, "the Task has a state");
check("should", linked(graph, task, req1), "the Task depends on REQ-1");
check("should", linked(graph, risk, adr1), "the Risk depends on ADR-0001");

const schedule = [...bundle.concepts.values()].find((c) =>
  String(c.frontmatter.resource ?? "").endsWith("pm/schedule.xlsx"),
);
check("must", schedule !== undefined, "a stand-in points at pm/schedule.xlsx");
check(
  "should",
  linked(graph, schedule, task),
  "the stand-in depends on the Task",
);
check(
  "must",
  /^[0-9a-f]{64}$/i.test(String(schedule?.frontmatter.resource_sha256 ?? "")),
  "the stand-in records resource_sha256",
);

const cli = join(import.meta.dir, "../../../src/cli.ts");
const run = Bun.spawnSync(
  [process.execPath, cli, "stale", "--format", "json"],
  { cwd: repo },
);
let stale: { stale?: unknown[]; unknown?: unknown[] } = {};
try {
  stale = JSON.parse(run.stdout.toString());
} catch {
  // Reported by the check below, as one failure.
  console.log(`      stale --format json: ${run.stderr.toString().trim()}`);
}
check(
  "must",
  stale.stale?.length === 0 && (stale.unknown?.length ?? 0) === 0,
  "stale: no documents, and none it could not compare",
);

// Every document is in its folder's index.md.
const missing = [...bundle.concepts.values()].filter((c) => {
  const dir = c.path.includes("/")
    ? c.path.slice(0, c.path.lastIndexOf("/"))
    : "";
  const index = bundle.reserved.find(
    (r) => r.path === (dir ? `${dir}/index.md` : "index.md"),
  );
  const name = c.path.slice(c.path.lastIndexOf("/") + 1);
  return (
    index === undefined ||
    !index.links.some((l) => l.target.replace(/^\.\//, "") === name)
  );
});
// Every directory index is linked from the root index.md.
const root = bundle.reserved.find((r) => r.path === "index.md");
const unlinked = bundle.reserved
  .filter((r) => r.path.endsWith("/index.md"))
  .filter(
    (r) => !root?.links.some((l) => l.target.replace(/^\.\//, "") === r.path),
  );
check(
  "should",
  unlinked.length === 0,
  `the root index.md links every directory${unlinked.length ? ` (missing: ${unlinked.map((r) => r.path).join(", ")})` : ""}`,
);
check(
  "should",
  missing.length === 0,
  `index.md lists every document${missing.length ? ` (missing: ${missing.map((c) => c.path).join(", ")})` : ""}`,
);

console.log(failed === 0 ? "\nPASS" : `\n${failed} required checks failed`);
process.exit(failed === 0 ? 0 : 1);
