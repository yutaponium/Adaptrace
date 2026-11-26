import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json";
import { run } from "../src/cli";

const VALID = "tests/fixtures/valid";
const INVALID = "tests/fixtures/invalid";

afterEach(() => {
  mock.restore();
});

function captureLog() {
  return spyOn(console, "log").mockImplementation(() => {});
}

test("--version prints the package version", async () => {
  const log = captureLog();
  expect(await run(["--version"])).toBe(0);
  expect(log).toHaveBeenCalledWith(pkg.version);
});

test("--help and no arguments print usage and succeed", async () => {
  const log = captureLog();
  expect(await run(["--help"])).toBe(0);
  expect(await run([])).toBe(0);
  expect(log.mock.calls[0]?.[0]).toContain("Usage: adaptrace");
});

test("unknown commands and bad options are usage errors", async () => {
  const error = spyOn(console, "error").mockImplementation(() => {});
  expect(await run(["frobnicate"])).toBe(2);
  expect(error.mock.calls[0]?.[0]).toContain("unknown command 'frobnicate'");
  expect(await run(["validate", VALID, "--format", "xml"])).toBe(2);
  expect(await run(["validate", "no/such/dir"])).toBe(2);
});

test("validate exits 0 for a valid bundle and 1 when there are errors", async () => {
  const log = captureLog();
  // A copy outside this repository: validate reads git for the dates.
  const copy = await mkdtemp(join(tmpdir(), "adaptrace-valid-"));
  try {
    await cp(VALID, copy, { recursive: true });
    expect(await run(["validate", copy])).toBe(0);
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
  expect(log.mock.calls[0]?.[0]).toContain("0 errors, 0 warnings");
  expect(await run(["validate", INVALID])).toBe(1);
});

test("validate --format json prints the issues", async () => {
  const log = captureLog();
  await run(["validate", INVALID, "--format", "json"]);
  const issues = JSON.parse(String(log.mock.calls[0]?.[0]));
  expect(issues.length).toBeGreaterThan(0);
  expect(issues[0]).toHaveProperty("code");
});

test("graph prints mermaid and json", async () => {
  const log = captureLog();
  expect(await run(["graph", VALID])).toBe(0);
  const mermaid = String(log.mock.calls[0]?.[0]);
  expect(mermaid).toStartWith("graph LR");
  expect(mermaid).toContain("-->|satisfies|");
  expect(mermaid).not.toContain("references");

  await run(["graph", VALID, "--format", "json"]);
  const json = JSON.parse(String(log.mock.calls[1]?.[0]));
  expect(json.nodes).toHaveLength(3);
  expect(json.backlinks["requirements/security-mfa.md"]).toContainEqual({
    from: "tasks/task-042-mfa-login.md",
    kind: "satisfies",
  });
});

test("graph resolves concept-ID body links and flattens multi-line titles", async () => {
  const log = captureLog();
  await run(["graph", "tests/fixtures/edge", "--references"]);
  const mermaid = String(log.mock.calls[0]?.[0]);
  expect(mermaid).toContain('["see /t/zz.md and a second line"]');
  expect(mermaid).toContain("-.->|references|");
});

test("impact and stale print text and json", async () => {
  const log = captureLog();
  expect(
    await run([
      "impact",
      "requirements/r.md",
      "--bundle",
      "tests/fixtures/history",
    ]),
  ).toBe(0);
  const text = String(log.mock.calls[0]?.[0]);
  expect(text).toContain("Direct (3)");
  expect(text).toContain("decisions/d.md  derived_from");
  expect(text).toContain("needs review");

  await run([
    "impact",
    "requirements/r",
    "--bundle",
    "tests/fixtures/history",
    "--format",
    "json",
  ]);
  const json = JSON.parse(String(log.mock.calls[1]?.[0]));
  expect(json.target).toBe("requirements/r.md");
  expect(json.affected).toHaveLength(5);

  expect(
    await run(["stale", "tests/fixtures/history", "--format", "json"]),
  ).toBe(0);
  const report = JSON.parse(String(log.mock.calls[2]?.[0]));
  expect(report.stale.map((d: { path: string }) => d.path)).toContain(
    "decisions/d.md",
  );
});

test("impact without a known document is a usage error", async () => {
  spyOn(console, "error").mockImplementation(() => {});
  expect(await run(["impact"])).toBe(2);
  expect(
    await run(["impact", "nope.md", "--bundle", "tests/fixtures/history"]),
  ).toBe(2);
});

test("--bundle works for every command, but not together with [bundle]", async () => {
  const log = captureLog();
  spyOn(console, "error").mockImplementation(() => {});
  expect(
    await run([
      "stale",
      "--bundle",
      "tests/fixtures/history",
      "--format",
      "json",
    ]),
  ).toBe(0);
  const report = JSON.parse(String(log.mock.calls[0]?.[0]));
  expect(report.stale.map((d: { path: string }) => d.path)).toContain(
    "decisions/d.md",
  );
  expect(await run(["validate", "--bundle", "tests/fixtures/valid"])).toBe(0);
  expect(
    await run([
      "stale",
      "tests/fixtures/history",
      "--bundle",
      "tests/fixtures/valid",
    ]),
  ).toBe(2);
});

test("sync needs a Backlog.md directory; board prints columns", async () => {
  const log = captureLog();
  spyOn(console, "error").mockImplementation(() => {});
  expect(await run(["sync", VALID, "--backlog", "no/such/dir"])).toBe(2);
  expect(await run(["sync", VALID, "--direction", "sideways"])).toBe(2);
  expect(await run(["board", VALID, "--backlog", "no/such/dir"])).toBe(0);
  expect(String(log.mock.calls[0]?.[0])).toContain("in_progress (1)");
  expect(await run(["board", VALID, "--format", "json"])).toBe(0);
  const json = JSON.parse(String(log.mock.calls[1]?.[0]));
  expect(json.columns[0].tasks[0].path).toBe("tasks/task-042-mfa-login.md");
});

test("board markdown shows paths as code unless --link-base is given", async () => {
  const log = captureLog();
  expect(await run(["board", VALID, "--format", "markdown"])).toBe(0);
  const plain = String(log.mock.calls[0]?.[0]);
  expect(plain).toMatch(/^- .+ \(`tasks\/task-042-mfa-login\.md`\)$/m);
  expect(plain).not.toContain("](");
  await run([
    "board",
    VALID,
    "--format",
    "markdown",
    "--link-base",
    "https://example.com/repo/blob/main/.adaptrace",
  ]);
  expect(String(log.mock.calls[1]?.[0])).toContain(
    "](https://example.com/repo/blob/main/.adaptrace/tasks/task-042-mfa-login.md)",
  );
});

test("assess without --llm shows the material; bad --timeout is a usage error", async () => {
  const log = captureLog();
  const error = spyOn(console, "error").mockImplementation(() => {});
  const saved = process.env.ADAPTRACE_LLM;
  delete process.env.ADAPTRACE_LLM;
  try {
    expect(
      await run([
        "assess",
        "requirements/security-mfa",
        "--bundle",
        VALID,
        "--all",
      ]),
    ).toBe(0);
    expect(String(log.mock.calls[0]?.[0])).toContain("--llm <command>");
    expect(
      await run([
        "assess",
        "requirements/security-mfa",
        "--bundle",
        VALID,
        "--timeout",
        "0",
      ]),
    ).toBe(2);
    expect(
      await run([
        "assess",
        "requirements/security-mfa",
        "--bundle",
        VALID,
        "--timeout",
        "3000000",
      ]),
    ).toBe(2);
    expect(await run(["assess", "--bundle", VALID])).toBe(2);
    expect(error.mock.calls.length).toBe(3);
  } finally {
    if (saved !== undefined) process.env.ADAPTRACE_LLM = saved;
  }
});

test("coverage: options, the milestone and usage errors", async () => {
  const log = captureLog();
  const error = spyOn(console, "error").mockImplementation(() => {});
  const COVERAGE = "tests/fixtures/requirement-coverage";
  expect(
    await run([
      "coverage",
      COVERAGE,
      "--milestone",
      "milestones/m1-release.md",
      "--done",
      " done , in_progress ,",
      "--format",
      "json",
    ]),
  ).toBe(0);
  const report = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
  expect(report.done).toEqual(["done", "in_progress"]);
  expect(report.milestone.path).toBe("milestones/m1-release.md");
  expect(
    await run(["coverage", COVERAGE, "--type", "Decision", "--format", "json"]),
  ).toBe(0);
  expect(JSON.parse(String(log.mock.calls.at(-1)?.[0])).types).toEqual([
    "Decision",
  ]);
  expect(await run(["coverage", COVERAGE, "--milestone", "nope.md"])).toBe(2);
  expect(await run(["coverage", COVERAGE, "--done", " , "])).toBe(2);
  expect(await run(["board", COVERAGE, "--milestone", "x.md"])).toBe(2);
  expect(await run(["board", COVERAGE, "--done", "done"])).toBe(2);
  expect(await run(["board", COVERAGE, "--type", "Task"])).toBe(2);
  expect(String(error.mock.calls.at(-1)?.[0])).toContain(
    "--type is only for list and coverage",
  );
});

test("coverage: --milestone must be a live Milestone, --type not empty", async () => {
  captureLog();
  const error = spyOn(console, "error").mockImplementation(() => {});
  const COVERAGE = "tests/fixtures/requirement-coverage";
  expect(
    await run(["coverage", COVERAGE, "--milestone", "tasks/t-a-login.md"]),
  ).toBe(2);
  expect(String(error.mock.calls.at(-1)?.[0])).toContain(
    "is not a live Milestone",
  );
  expect(await run(["coverage", COVERAGE, "--type", " "])).toBe(2);
  expect(await run(["coverage", COVERAGE, "--type", "Task"])).toBe(2);
});

test("sync --resolve: per task, and usage errors", async () => {
  const log = captureLog();
  const error = spyOn(console, "error").mockImplementation(() => {});
  const parent = await mkdtemp(join(tmpdir(), "adaptrace-cli-sync-"));
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const put = async (path: string, text: string) => {
    await mkdir(join(parent, path, ".."), { recursive: true });
    await writeFile(join(parent, path), text);
  };
  const edit = async (path: string, from: string, to: string) => {
    const file = join(parent, path);
    await writeFile(file, (await readFile(file, "utf8")).replace(from, to));
  };
  try {
    await put("b/index.md", "# B\n");
    await put("b/tasks/a.md", "---\ntype: Task\ntitle: A\n---\n");
    await put("b/requirements/r.md", "---\ntype: Requirement\ntitle: R\n---\n");
    await put(
      "backlog/config.yml",
      'statuses: ["To Do", "Done"]\ntask_prefix: "back"\n',
    );
    const args = [
      "sync",
      join(parent, "b"),
      "--backlog",
      join(parent, "backlog"),
    ];
    expect(await run([...args, "--write"])).toBe(0);
    // The same task changed on both sides: a conflict.
    await edit("b/tasks/a.md", "title: A", "title: Mine");
    const backlogFile = "backlog/tasks/back-1 - A.md";
    await edit(backlogFile, "title: A", "title: Theirs");
    expect(await run(args)).toBe(1);
    // Settled by its Backlog.md id, in another case.
    expect(await run([...args, "--resolve", "BACK-1=backlog", "--write"])).toBe(
      0,
    );
    expect(await readFile(join(parent, "b/tasks/a.md"), "utf8")).toContain(
      "title: Theirs",
    );
    // A path with the bundle directory in front reads as the bundle path.
    await edit("b/tasks/a.md", "title: Theirs", "title: Mine again");
    await edit(backlogFile, "title: Theirs", "title: Theirs again");
    expect(
      await run([
        ...args,
        "--resolve",
        `${join(parent, "b")}/tasks/a.md=adaptrace`,
        "--write",
      ]),
    ).toBe(0);
    expect(await readFile(join(parent, backlogFile), "utf8")).toContain(
      "title: Mine again",
    );
    // Not a linked task, or one task given both sides, or both global sides.
    expect(await run([...args, "--resolve", "requirements/r.md=backlog"])).toBe(
      2,
    );
    expect(String(error.mock.calls.at(-1)?.[0])).toContain(
      "not a Task linked to a Backlog.md task",
    );
    expect(
      await run([
        ...args,
        "--resolve",
        "tasks/a.md=adaptrace",
        "--resolve",
        "back-1=backlog",
      ]),
    ).toBe(2);
    expect(String(error.mock.calls.at(-1)?.[0])).toContain("is already given");
    expect(
      await run([...args, "--resolve", "adaptrace", "--resolve", "backlog"]),
    ).toBe(2);
    // A task archived in Backlog.md is reported but is not a problem.
    await mkdir(join(parent, "backlog/archive/tasks"), { recursive: true });
    const { rename } = await import("node:fs/promises");
    await rename(
      join(parent, backlogFile),
      join(parent, "backlog/archive/tasks/back-1 - A.md"),
    );
    expect(await run(args)).toBe(0);
    expect(String(log.mock.calls.at(-1)?.[0])).toContain("1 archived");
    // The same global side twice is fine.
    expect(
      await run([...args, "--resolve", "adaptrace", "--resolve", " adaptrace"]),
    ).toBe(0);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
