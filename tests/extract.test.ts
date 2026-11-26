import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBundle } from "../src/bundle";
import { run } from "../src/cli";
import {
  buildExtractPrompt,
  draftDocuments,
  extractContext,
  writeDrafts,
} from "../src/extract";
import { init } from "../src/init";
import { formatExtract } from "../src/output";
import { validate } from "../src/validate";

let dir: string;
// The running bun, so the tests do not depend on bun being on PATH.
const FAKE = `"${process.execPath}" "${join(import.meta.dir, "fake-llm.ts")}"`;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "adaptrace-extract-"));
  await cp(join(import.meta.dir, "fixtures/meeting"), dir, { recursive: true });
});

afterEach(async () => {
  mock.restore();
  await rm(dir, { recursive: true, force: true });
});

function output() {
  return spyOn(console, "log").mockImplementation(() => {});
}

test("init creates a valid bundle and never overwrites", async () => {
  const root = join(dir, "new");
  const first = await init(root, { title: "Demo", today: "2026-10-29" });
  expect(first.created).toContain("index.md");
  expect(first.created).toContain("meetings/index.md");
  expect(first.skipped).toEqual([]);
  expect(validate(await loadBundle(root))).toEqual([]);
  expect(await readFile(join(root, "log.md"), "utf8")).toContain(
    "## 2026-10-29",
  );

  await writeFile(join(root, "index.md"), "# Mine\n");
  const second = await init(root, { title: "Other", today: "2026-10-30" });
  expect(second.created).toEqual([]);
  expect(second.skipped).toContain("index.md");
  expect(await readFile(join(root, "index.md"), "utf8")).toBe("# Mine\n");
});

test("init through the CLI; a file in the way is a usage error", async () => {
  const log = output();
  spyOn(console, "error").mockImplementation(() => {});
  expect(await run(["init", join(dir, "b"), "--title", "B"])).toBe(0);
  expect(String(log.mock.calls[0]?.[0])).toStartWith("created ");
  expect(await readFile(join(dir, "b/index.md"), "utf8")).toContain("# B");
  await writeFile(join(dir, "file"), "");
  expect(await run(["init", join(dir, "file")])).toBe(2);
});

test("the prompt holds the notes and the existing documents", async () => {
  const bundle = await loadBundle(dir);
  const ctx = await extractContext(bundle, "meetings/kickoff.md");
  const prompt = buildExtractPrompt(ctx);
  expect(prompt).toContain("認証基盤は IdP-X にする（決定）");
  expect(prompt).toContain(
    "- /requirements/mfa.md  Requirement  ログインに MFA を入れる",
  );
  expect(prompt).not.toContain("- /meetings/kickoff.md");
});

test("drafts derive from the meeting, link to each other and get free paths", async () => {
  const log = output();
  expect(
    await run([
      "extract",
      "meetings/kickoff",
      "--bundle",
      dir,
      "--llm",
      `${FAKE} extract`,
      "--by",
      "test/1",
      "--format",
      "json",
    ]),
  ).toBe(0);
  const out = JSON.parse(String(log.mock.calls[0]?.[0]));
  expect(out.proposals.map((p: { path: string }) => p.path)).toEqual([
    "decisions/auth-provider.md",
    "tasks/build-login-2.md", // tasks/build-login.md exists
    "risks/kickoff-3.md", // the id was not usable
  ]);
  expect(out.skipped).toEqual([
    {
      title: "次回の会議",
      reason: "type 'Meeting' is not drafted from meetings",
    },
  ]);
  const task = out.proposals[1].content as string;
  expect(task).toContain("status: draft");
  expect(task).toContain("derived_from: /meetings/kickoff.md");
  expect(task).toContain("- /decisions/auth-provider.md");
  expect(task).toContain("- /requirements/mfa.md");
  expect(task).toContain("owner: tanaka");
  expect(task).toContain("by: test/1");
  // Validated together: the link between two new drafts resolves.
  expect(out.newIssues).toEqual([]);
  expect(out.written).toEqual([]);
  expect(await readdir(join(dir, "decisions")).catch(() => [])).toEqual([]);
});

test("--write creates the drafts and nothing else", async () => {
  output();
  expect(
    await run([
      "extract",
      "meetings/kickoff.md",
      "--bundle",
      dir,
      "--llm",
      `${FAKE} extract`,
      "--write",
    ]),
  ).toBe(0);
  expect(
    await readFile(join(dir, "decisions/auth-provider.md"), "utf8"),
  ).toContain("type: Decision");
  expect(await readFile(join(dir, "tasks/build-login.md"), "utf8")).toContain(
    "title: Existing",
  );
  expect(
    validate(await loadBundle(dir)).filter((i) => i.severity === "error"),
  ).toEqual([]);
});

test("extract needs an LLM command; LLM failures exit 1", async () => {
  output();
  const error = spyOn(console, "error").mockImplementation(() => {});
  const saved = process.env.ADAPTRACE_LLM;
  delete process.env.ADAPTRACE_LLM;
  try {
    expect(await run(["extract", "meetings/kickoff", "--bundle", dir])).toBe(2);
    expect(
      await run([
        "extract",
        "meetings/kickoff",
        "--bundle",
        dir,
        "--llm",
        `${FAKE} fail`,
      ]),
    ).toBe(1);
    expect(String(error.mock.calls[1]?.[0])).toContain("model not found");
    expect(
      await run([
        "extract",
        "meetings/kickoff",
        "--bundle",
        dir,
        "--llm",
        `${FAKE} extract-empty`,
      ]),
    ).toBe(0);
  } finally {
    if (saved !== undefined) process.env.ADAPTRACE_LLM = saved;
  }
});

test("unknown paths are kept and reported; unknown #ids are dropped", async () => {
  const bundle = await loadBundle(dir);
  const result = draftDocuments(
    bundle,
    "meetings/kickoff.md",
    [
      { type: "Note", id: "note", title: "N" },
      {
        type: "Task",
        id: "x",
        title: "X",
        depends_on: ["/nope.md", "#missing", "#note"],
      },
    ],
    { by: "t", at: "2026-10-29T00:00:00Z" },
  );
  expect(result.newIssues.map((i) => i.code)).toEqual(["dependency-target"]);
  expect(result.proposals[0]?.content).not.toContain("#missing");
  expect(result.skipped.map((s) => s.title)).toEqual(["N"]);
  expect(result.dropped).toEqual([
    {
      path: "tasks/x.md",
      reference: "#missing",
      reason: "no draft has that id",
    },
    {
      path: "tasks/x.md",
      reference: "#note",
      reason: "the draft with that id was skipped",
    },
  ]);
});

test("bad items are skipped one by one; reserved names, prototype keys and case collisions are avoided", async () => {
  await writeFile(join(dir, "tasks/UPPER.md"), "---\ntype: Task\n---\n");
  const bundle = await loadBundle(dir);
  const result = draftDocuments(
    bundle,
    "meetings/kickoff.md",
    [
      { type: "Acceptance", id: "index", title: "A" },
      { type: "Decision", id: "log", title: "B" },
      { type: "constructor", id: "c", title: "C" },
      { type: "__proto__", title: "D" },
      { type: "Task", id: "upper", title: "E" },
      { type: "Risk", id: null, title: "F" },
      { type: "Risk", title: "" },
      "not an object",
    ],
    { by: "t", at: "2026-10-29T00:00:00Z" },
  );
  expect(result.proposals.map((p) => p.path)).toEqual([
    "acceptance/kickoff-1.md",
    "decisions/kickoff-2.md",
    "tasks/upper-2.md",
    "risks/kickoff-6.md",
  ]);
  expect(result.skipped.map((s) => s.title)).toEqual([
    "C",
    "D",
    "item 7",
    "item 8",
  ]);
});

test("if any draft's file exists, no draft is written", async () => {
  const bundle = await loadBundle(dir);
  const result = draftDocuments(
    bundle,
    "meetings/kickoff.md",
    [
      { type: "Task", id: "a", title: "A" },
      { type: "Task", id: "b", title: "B", depends_on: ["#a"] },
    ],
    { by: "t", at: "2026-10-29T00:00:00Z" },
  );
  // Appears between the plan and the write.
  await writeFile(join(dir, "tasks/a.md"), "mine\n");
  const write = await writeDrafts(dir, result);
  expect(write.failed.map((f) => [f.path, f.error])).toEqual([
    ["tasks/a.md", "the file already exists"],
    ["tasks/b.md", "not written because another draft exists"],
  ]);
  expect(await readFile(join(dir, "tasks/a.md"), "utf8")).toBe("mine\n");
  expect(await Bun.file(join(dir, "tasks/b.md")).exists()).toBe(false);
  expect(result.proposals.map((p) => p.written)).toEqual([false, false]);
  expect(formatExtract("meetings/kickoff.md", result, write)).toContain(
    "Not written",
  );
});

test("a dropped link exits 1", async () => {
  output();
  expect(
    await run([
      "extract",
      "meetings/kickoff",
      "--bundle",
      dir,
      "--llm",
      `${FAKE} extract-dangling`,
    ]),
  ).toBe(1);
});

test("issues the drafts cause in existing documents are shown and exit 1", async () => {
  await writeFile(
    join(dir, "requirements/mfa.md"),
    "---\ntype: Requirement\ntitle: MFA\ndepends_on: /decisions/auth-provider.md\n---\n",
  );
  const log = output();
  // The fake LLM's Decision depends_on /requirements/mfa.md: a cycle.
  expect(
    await run([
      "extract",
      "meetings/kickoff",
      "--bundle",
      dir,
      "--llm",
      `${FAKE} extract`,
    ]),
  ).toBe(1);
  expect(String(log.mock.calls[0]?.[0])).toContain("[dependency-cycle]");
  // An issue reported on an existing document has its own section.
  const bundle = await loadBundle(dir);
  const result = draftDocuments(bundle, "meetings/kickoff.md", [], {
    by: "t",
    at: "2026-10-29T00:00:00Z",
  });
  result.newIssues.push({
    severity: "error",
    code: "dependency-cycle",
    file: "requirements/mfa.md",
    message: "cycle",
  });
  expect(formatExtract("meetings/kickoff.md", result, null)).toContain(
    "New issues in existing documents\n  error requirements/mfa.md  cycle",
  );
});

test("--write marks the written proposals in JSON", async () => {
  const log = output();
  await run([
    "extract",
    "meetings/kickoff",
    "--bundle",
    dir,
    "--llm",
    `${FAKE} extract`,
    "--write",
    "--format",
    "json",
  ]);
  const out = JSON.parse(String(log.mock.calls[0]?.[0]));
  expect(out.proposals.every((p: { written: boolean }) => p.written)).toBe(
    true,
  );
  expect(out.written).toHaveLength(3);
});
