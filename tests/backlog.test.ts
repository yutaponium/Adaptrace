import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySync, loadBacklog, planSync, slug } from "../src/backlog";
import { board } from "../src/board";
import { loadBundle } from "../src/bundle";
import { buildGraph } from "../src/graph";

let dir: string;
const NOW = new Date("2026-10-29T00:00:00Z");

async function put(path: string, text: string) {
  await mkdir(join(dir, path, ".."), { recursive: true });
  await writeFile(join(dir, path), text);
}

async function plan(
  options: Parameters<typeof planSync>[2] = { generatedBy: "adaptrace/test" },
) {
  const bundle = await loadBundle(join(dir, ".adaptrace"));
  const backlog = await loadBacklog(join(dir, "backlog"));
  return {
    bundle,
    backlog,
    plan: planSync(bundle, backlog, { now: NOW, ...options }),
  };
}

async function sync(options?: Parameters<typeof planSync>[2]) {
  const p = await plan(options);
  await applySync(p.plan, p.bundle.root, p.backlog.root);
  return p.plan;
}

function kinds(p: Awaited<ReturnType<typeof plan>>["plan"]) {
  return p.actions.map((a) => `${a.kind} ${a.adaptrace}`);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "adaptrace-sync-"));
  await put(
    ".adaptrace/requirements/mfa.md",
    "---\ntype: Requirement\ntitle: MFA\n---\n",
  );
  await put(
    ".adaptrace/tasks/design.md",
    "---\ntype: Task\ntitle: 設計する\nstate: in_progress\ntags: [security]\nsatisfies: /requirements/mfa.md\n---\n\nDesign it.\n",
  );
  await put(
    ".adaptrace/tasks/build.md",
    "---\ntype: Task\ntitle: Build MFA\ndepends_on:\n  - /tasks/design.md\n  - /requirements/mfa.md\n---\n\nBuild it.\n",
  );
  await put(
    "backlog/config.yml",
    'default_status: "To Do"\nstatuses: ["To Do", "In Progress", "Done"]\ntask_prefix: "back"\n',
  );
  await put(
    "backlog/tasks/back-7 - Write-docs.md",
    "---\nid: BACK-7\ntitle: Write docs\nstatus: To Do\nassignee:\n  - '@tanaka'\nlabels: [docs]\ndependencies: []\npriority: high\n---\n\n## Description\n\nWrite the docs.\n",
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("slug maps Backlog.md statuses to states", () => {
  expect(slug("In Progress")).toBe("in_progress");
  expect(slug(" To Do ")).toBe("to_do");
  expect(slug("レビュー待ち")).toBe("レビュー待ち");
});

test("the first sync plans to create both sides and writes nothing", async () => {
  const { plan: p } = await plan();
  expect(kinds(p)).toEqual([
    "export-new tasks/build.md",
    "export-new tasks/design.md",
    "import-new tasks/back-7.md",
  ]);
  expect(
    await readFile(join(dir, ".adaptrace/tasks/design.md"), "utf8"),
  ).not.toContain("backlog:");
});

test("after writing, everything is in sync and the fields round-trip", async () => {
  await sync();
  const again = (await plan()).plan;
  expect(again.actions).toEqual([]);
  expect(again.inSync).toBe(3);

  const build = await readFile(
    join(dir, "backlog/tasks/back-8 - Build-MFA.md"),
    "utf8",
  );
  expect(build).toContain("status: To Do");
  expect(build).toContain("- BACK-9"); // depends_on /tasks/design.md
  const design = await readFile(
    join(dir, "backlog/tasks/back-9 - 設計する.md"),
    "utf8",
  );
  expect(design).toContain("status: In Progress");
  expect(design).toContain("- security");

  const imported = await readFile(
    join(dir, ".adaptrace/tasks/back-7.md"),
    "utf8",
  );
  expect(imported).toContain("type: Task");
  expect(imported).toContain("state: to_do");
  expect(imported).toContain("priority: high");
  expect(imported).toContain("## Description");

  // Adaptrace-only dependencies stay on the Adaptrace side.
  const local = await readFile(join(dir, ".adaptrace/tasks/build.md"), "utf8");
  expect(local).toContain("/requirements/mfa.md");
  expect(local).toContain("/tasks/design.md");
});

test("a change on one side flows to the other; on both sides it is a conflict", async () => {
  await sync();
  const backlogBuild = join(dir, "backlog/tasks/back-8 - Build-MFA.md");
  await writeFile(
    backlogBuild,
    (await readFile(backlogBuild, "utf8")).replace(
      "status: To Do",
      "status: Done",
    ),
  );
  const localDesign = join(dir, ".adaptrace/tasks/design.md");
  await writeFile(
    localDesign,
    (await readFile(localDesign, "utf8")).replace(
      "title: 設計する",
      "title: 設計をまとめる",
    ),
  );
  const docs = join(dir, ".adaptrace/tasks/back-7.md");
  await writeFile(
    docs,
    (await readFile(docs, "utf8")).replace(
      "title: Write docs",
      "title: Write user docs",
    ),
  );
  const backlogDocs = join(dir, "backlog/tasks/back-7 - Write-docs.md");
  await writeFile(
    backlogDocs,
    (await readFile(backlogDocs, "utf8")).replace(
      "priority: high",
      "priority: low",
    ),
  );

  const p = await sync();
  expect(kinds(p)).toEqual([
    "conflict tasks/back-7.md",
    "import tasks/build.md",
    "export tasks/design.md",
  ]);
  expect(
    await readFile(join(dir, ".adaptrace/tasks/build.md"), "utf8"),
  ).toContain("state: done");
  expect(
    await readFile(join(dir, "backlog/tasks/back-9 - 設計する.md"), "utf8"),
  ).toContain("title: 設計をまとめる");

  // --resolve settles the conflict.
  const resolved = await sync({
    generatedBy: "adaptrace/test",
    resolve: "backlog",
  });
  expect(kinds(resolved)).toEqual(["import tasks/back-7.md"]);
  expect(await readFile(docs, "utf8")).toContain("title: Write docs");
  expect((await plan()).plan.inSync).toBe(3);
});

test("direction limits the plan; unmapped states and missing tasks are reported", async () => {
  expect(
    kinds((await plan({ generatedBy: "t", direction: "export" })).plan),
  ).toEqual(["export-new tasks/build.md", "export-new tasks/design.md"]);
  expect(
    kinds((await plan({ generatedBy: "t", direction: "import" })).plan),
  ).toEqual(["import-new tasks/back-7.md"]);
  await sync();
  const design = join(dir, ".adaptrace/tasks/design.md");
  await writeFile(
    design,
    (await readFile(design, "utf8")).replace(
      "state: in_progress",
      "state: review",
    ),
  );
  await rm(join(dir, "backlog/tasks/back-8 - Build-MFA.md"));
  expect(kinds((await plan()).plan)).toEqual([
    "missing tasks/build.md",
    "unmapped-state tasks/design.md",
  ]);
});

test("board groups tasks by state and shows what they wait for", async () => {
  await sync();
  const bundle = await loadBundle(join(dir, ".adaptrace"));
  const { config } = await loadBacklog(join(dir, "backlog"));
  const columns = board(bundle, buildGraph(bundle), config);
  expect(columns.map((c) => [c.label, c.tasks.map((t) => t.path)])).toEqual([
    ["To Do", ["tasks/back-7.md", "tasks/build.md"]],
    ["In Progress", ["tasks/design.md"]],
  ]);
  expect(columns[0]?.tasks[1]?.waitingFor).toEqual(["tasks/design.md"]);
  // Without a Backlog.md config, the default order is used.
  expect(board(bundle, buildGraph(bundle)).map((c) => c.state)).toEqual([
    "to_do",
    "in_progress",
  ]);
});

async function edit(path: string, from: string, to: string) {
  const full = join(dir, path);
  await writeFile(full, (await readFile(full, "utf8")).replace(from, to));
}

test("--resolve does not write to the side --direction excludes", async () => {
  await sync();
  await edit(".adaptrace/tasks/back-7.md", "title: Write docs", "title: Mine");
  await edit(
    "backlog/tasks/back-7 - Write-docs.md",
    "title: Write docs",
    "title: Theirs",
  );
  const p = await sync({
    generatedBy: "t",
    direction: "import",
    resolve: "adaptrace",
  });
  expect(kinds(p)).toEqual(["conflict tasks/back-7.md"]);
  expect(
    await readFile(join(dir, "backlog/tasks/back-7 - Write-docs.md"), "utf8"),
  ).toContain("title: Theirs");
});

test("changes on the excluded side are shown as pending", async () => {
  await sync();
  await edit(
    "backlog/tasks/back-7 - Write-docs.md",
    "title: Write docs",
    "title: Theirs",
  );
  const p = (await plan({ generatedBy: "t", direction: "export" })).plan;
  expect(p.actions.map((a) => a.kind)).toEqual(["pending"]);
});

test("unsafe Backlog.md ids are rejected instead of written as paths", async () => {
  await put(
    "backlog/tasks/evil.md",
    "---\nid: ../../escape\ntitle: Evil\nstatus: To Do\n---\n",
  );
  const { plan: p } = await plan();
  expect(p.errors.map((e) => e.path)).toEqual(["tasks/evil.md"]);
  expect(p.writes.every((w) => !w.path.includes(".."))).toBe(true);
});

test("a concept-ID depends_on is not duplicated when synced", async () => {
  await edit(
    ".adaptrace/tasks/build.md",
    "  - /tasks/design.md",
    "  - /tasks/design",
  );
  await sync();
  await sync();
  const build = await readFile(join(dir, ".adaptrace/tasks/build.md"), "utf8");
  expect(build.match(/tasks\/design/g)).toHaveLength(1);
});

test("a task with an unmapped state gets no id, so dependents do not point at it", async () => {
  await edit(
    ".adaptrace/tasks/design.md",
    "state: in_progress",
    "state: review",
  );
  const p = await sync();
  expect(kinds(p)).toContain("unmapped-state tasks/design.md");
  const build = await readFile(
    join(dir, "backlog/tasks/back-8 - Build-MFA.md"),
    "utf8",
  );
  expect(build).toContain("dependencies: []");
});

test("two tasks with the same backlog.id are skipped and reported", async () => {
  await sync();
  await writeFile(
    join(dir, ".adaptrace/tasks/copy.md"),
    await readFile(join(dir, ".adaptrace/tasks/back-7.md"), "utf8"),
  );
  const p = (await plan()).plan;
  expect(kinds(p)).toEqual([
    "duplicate-link tasks/back-7.md",
    "duplicate-link tasks/copy.md",
  ]);
});

test("new ids skip drafts and archives; an unsafe prefix stops new exports", async () => {
  await put(
    "backlog/archive/tasks/back-12 - Old.md",
    "---\nid: BACK-12\ntitle: Old\nstatus: Done\n---\n",
  );
  const p = (await plan()).plan;
  expect(
    p.actions.filter((a) => a.kind === "export-new").map((a) => a.id),
  ).toEqual(["BACK-13", "BACK-14"]);
  await put(
    "backlog/config.yml",
    'statuses: ["To Do", "In Progress", "Done"]\ntask_prefix: "t+("\n',
  );
  const bad = (await plan()).plan;
  expect(bad.actions.some((a) => a.kind === "export-new")).toBe(false);
  expect(bad.errors.map((e) => e.path)).toEqual(["config.yml"]);
});

test("dates written to Backlog.md are quoted so YAML 1.1 parsers keep them as strings", async () => {
  await sync();
  const text = await readFile(
    join(dir, "backlog/tasks/back-8 - Build-MFA.md"),
    "utf8",
  );
  expect(text).toMatch(/^updated_date: '2026-10-29T00:00:00Z'$/m);
  expect(text).toMatch(/^created_date: '2026-10-29T00:00:00Z'$/m);
});
