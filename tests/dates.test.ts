import { expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBundle } from "../src/bundle";
import { run } from "../src/cli";
import { driftIssues, missingDateIssues } from "../src/drift";
import { migrateDates } from "../src/migrate";

const DOC = (fm: string, body: string) =>
  `---\ntype: Requirement\ntitle: A\n${fm}---\n\n# A\n\n${body}\n`;
const GENERATED =
  "generated: { by: human:sato, at: 2026-11-01T10:00:00+09:00 }\n";

// A git repository with a bundle, and helpers to change and commit it.
async function repo() {
  const dir = await mkdtemp(join(tmpdir(), "adaptrace-dates-"));
  const bundle = join(dir, ".adaptrace");
  await mkdir(join(bundle, "req"), { recursive: true });
  const git = (...args: string[]) =>
    Bun.spawnSync([
      "git",
      "-C",
      dir,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ]);
  git("init", "-q", "--template=");
  const write = (path: string, text: string) =>
    writeFile(join(bundle, path), text);
  const commit = (date = "2026-10-05T09:00:00+09:00") => {
    git("add", "-A");
    Bun.spawnSync(
      [
        "git",
        "-C",
        dir,
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.com",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "-q",
        "-m",
        "c",
      ],
      {
        env: {
          ...process.env,
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        },
      },
    );
  };
  const drift = async () =>
    driftIssues(await loadBundle(bundle)).map((i) => i.file);
  return { dir, bundle, write, commit, drift };
}

test("a body changed without a new generated or verified is reported", async () => {
  const r = await repo();
  try {
    await r.write("req/a.md", DOC(GENERATED, "one"));
    r.commit();
    expect(await r.drift()).toEqual([]);
    // Uncommitted, then committed: both reported.
    await r.write("req/a.md", DOC(GENERATED, "two"));
    expect(await r.drift()).toEqual(["req/a.md"]);
    r.commit();
    expect(await r.drift()).toEqual(["req/a.md"]);
    // With a new generated, or a new verified, it is not.
    await r.write(
      "req/a.md",
      DOC(
        "generated: { by: human:sato, at: 2026-11-02T10:00:00+09:00 }\n",
        "three",
      ),
    );
    r.commit();
    expect(await r.drift()).toEqual([]);
    await r.write(
      "req/a.md",
      DOC(
        "generated: { by: human:sato, at: 2026-11-02T10:00:00+09:00 }\nverified: { by: human:sato, at: 2026-11-03T10:00:00+09:00 }\n",
        "four",
      ),
    );
    r.commit();
    expect(await r.drift()).toEqual([]);
    // A frontmatter-only change (a dependency added) is not a body change.
    await r.write(
      "req/a.md",
      DOC(
        "depends_on: /req/b.md\ngenerated: { by: human:sato, at: 2026-11-02T10:00:00+09:00 }\nverified: { by: human:sato, at: 2026-11-03T10:00:00+09:00 }\n",
        "four",
      ),
    );
    r.commit();
    expect(await r.drift()).toEqual([]);
  } finally {
    await rm(r.dir, { recursive: true, force: true });
  }
});

test("the review found cases: a deleted first line, a YAML line, a frontmatter-only edit", async () => {
  const r = await repo();
  try {
    await r.write(
      "req/a.md",
      `---\ntype: Requirement\ntitle: A\n${GENERATED}---\nfirst\nsecond\n`,
    );
    r.commit();
    // Deleting the body's first line, right after "---".
    await r.write(
      "req/a.md",
      `---\ntype: Requirement\ntitle: A\n${GENERATED}---\nsecond\n`,
    );
    expect(await r.drift()).toEqual(["req/a.md"]);
    r.commit();
    // A body line that looks like a record (in a YAML example) is still body.
    await r.write("req/b.md", DOC(GENERATED, "```yaml\n  at: 2026-01-01\n```"));
    r.commit();
    await r.write("req/b.md", DOC(GENERATED, "```yaml\n  at: 2026-02-02\n```"));
    r.commit();
    // An uncommitted frontmatter-only edit does not hide the last commit.
    await r.write(
      "req/b.md",
      DOC(`state: done\n${GENERATED}`, "```yaml\n  at: 2026-02-02\n```"),
    );
    expect(await r.drift()).toEqual(["req/a.md", "req/b.md"]);
  } finally {
    await rm(r.dir, { recursive: true, force: true });
  }
});

test("signature lines in git log do not stop the check", async () => {
  const r = await repo();
  try {
    await r.write("req/a.md", DOC(GENERATED, "one"));
    r.commit();
    await r.write("req/a.md", DOC(GENERATED, "two"));
    r.commit();
    Bun.spawnSync(["git", "-C", r.dir, "config", "log.showSignature", "true"]);
    expect(await r.drift()).toEqual(["req/a.md"]);
  } finally {
    await rm(r.dir, { recursive: true, force: true });
  }
});

test("git's diff settings and an empty repository do not change the result", async () => {
  const r = await repo();
  try {
    // No commit yet: nothing to compare, and no warning.
    await r.write("req/a.md", DOC(GENERATED, "one"));
    expect(driftIssues(await loadBundle(r.bundle))).toEqual([]);
    r.commit();
    await r.write("req/a.md", DOC(`state: done\n${GENERATED}`, "two"));
    r.commit();
    Bun.spawnSync(["git", "-C", r.dir, "config", "diff.interHunkContext", "3"]);
    expect(await r.drift()).toEqual(["req/a.md"]);
  } finally {
    await rm(r.dir, { recursive: true, force: true });
  }
});

test("a newer generated.at counts even below a newer verified.at", async () => {
  const r = await repo();
  try {
    const fm = (generated: string) =>
      `generated: { by: human:a, at: ${generated} }\nverified: { by: human:a, at: 2026-11-20T10:00:00+09:00 }\n`;
    await r.write("req/a.md", DOC(fm("2026-11-01T10:00:00+09:00"), "one"));
    r.commit();
    await r.write("req/a.md", DOC(fm("2026-11-15T10:00:00+09:00"), "two"));
    r.commit();
    expect(await r.drift()).toEqual([]);
  } finally {
    await rm(r.dir, { recursive: true, force: true });
  }
});

test("a rename keeps the history, and an old verified is no record", async () => {
  const r = await repo();
  try {
    await r.write("req/a.md", DOC(GENERATED, "one"));
    r.commit();
    // Renamed and changed in one commit, without a new date.
    Bun.spawnSync([
      "git",
      "-C",
      r.dir,
      "mv",
      ".adaptrace/req/a.md",
      ".adaptrace/req/b.md",
    ]);
    await r.write("req/b.md", DOC(GENERATED, "two"));
    r.commit();
    expect(await r.drift()).toEqual(["req/b.md"]);
    // A verified older than the content does not settle it.
    await r.write(
      "req/b.md",
      DOC(
        `${GENERATED}verified: { by: human:x, at: 2020-01-01T00:00:00Z }\n`,
        "three",
      ),
    );
    r.commit();
    expect(await r.drift()).toEqual(["req/b.md"]);
  } finally {
    await rm(r.dir, { recursive: true, force: true });
  }
});

test("a shallow clone says the check was not made", async () => {
  const r = await repo();
  const clone = await mkdtemp(join(tmpdir(), "adaptrace-shallow-"));
  try {
    await r.write("req/a.md", DOC(GENERATED, "one"));
    r.commit();
    await r.write("req/a.md", DOC(GENERATED, "two"));
    r.commit();
    await rm(clone, { recursive: true, force: true });
    Bun.spawnSync([
      "git",
      "clone",
      "-q",
      "--depth",
      "1",
      `file://${r.dir}`,
      clone,
    ]);
    const issues = driftIssues(await loadBundle(join(clone, ".adaptrace")));
    expect(issues.map((i) => i.code)).toEqual(["stale-generated-skipped"]);
  } finally {
    await rm(r.dir, { recursive: true, force: true });
    await rm(clone, { recursive: true, force: true });
  }
});

test("a record is a newer date, not any change to its lines", async () => {
  const r = await repo();
  try {
    await r.write(
      "req/a.md",
      DOC("generated: { by: human:a, at: 2026-11-01T10:00:00+09:00 }\n", "one"),
    );
    r.commit();
    // A new by with the same at, and a body change: not dated.
    await r.write(
      "req/a.md",
      DOC("generated: { by: human:b, at: 2026-11-01T10:00:00+09:00 }\n", "two"),
    );
    r.commit();
    expect(await r.drift()).toEqual(["req/a.md"]);
  } finally {
    await rm(r.dir, { recursive: true, force: true });
  }
});

test("migrate-dates keeps the other fields of generated", async () => {
  const r = await repo();
  try {
    await r.write(
      "req/a.md",
      DOC("generated:\n  by: agent:x\n  model: m1\n", "one"),
    );
    r.commit("2026-10-05T09:00:00+09:00");
    const plan = migrateDates(await loadBundle(r.bundle));
    expect(plan.changes[0]?.text).toContain("model: m1");
    expect(plan.changes[0]?.text).toContain("2026-10-05T09:00:00+09:00");
  } finally {
    await rm(r.dir, { recursive: true, force: true });
  }
});

test("a Japanese key's change is not taken for a record", async () => {
  const r = await repo();
  try {
    await r.write("req/a.md", DOC(`${GENERATED}担当: 佐藤\n`, "one"));
    r.commit();
    await r.write("req/a.md", DOC(`${GENERATED}担当: 田中\n`, "two"));
    r.commit();
    expect(await r.drift()).toEqual(["req/a.md"]);
  } finally {
    await rm(r.dir, { recursive: true, force: true });
  }
});

test("a fix in the working tree, and a later frontmatter-only commit", async () => {
  const r = await repo();
  try {
    await r.write("req/a.md", DOC(GENERATED, "one"));
    r.commit();
    await r.write("req/a.md", DOC(GENERATED, "two"));
    r.commit();
    expect(await r.drift()).toEqual(["req/a.md"]);
    // A frontmatter-only commit after it does not hide it.
    await r.write("req/a.md", DOC(`state: done\n${GENERATED}`, "two"));
    r.commit();
    expect(await r.drift()).toEqual(["req/a.md"]);
    // A new generated in the working tree settles it, before the commit.
    await r.write(
      "req/a.md",
      DOC(
        "state: done\ngenerated: { by: human:sato, at: 2026-11-02T10:00:00+09:00 }\n",
        "two",
      ),
    );
    expect(await r.drift()).toEqual([]);
  } finally {
    await rm(r.dir, { recursive: true, force: true });
  }
});

test("migrate-dates refuses outside git and in a shallow clone", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adaptrace-nogit-"));
  try {
    await mkdir(join(dir, "req"));
    await writeFile(join(dir, "req/a.md"), DOC("", "one"));
    expect(migrateDates(await loadBundle(dir)).refused).toContain(
      "not a git repository",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const r = await repo();
  const clone = await mkdtemp(join(tmpdir(), "adaptrace-shallow-"));
  try {
    await r.write("req/a.md", DOC("", "one"));
    r.commit();
    await r.write("req/b.md", DOC("", "one"));
    r.commit();
    await rm(clone, { recursive: true, force: true });
    Bun.spawnSync([
      "git",
      "clone",
      "-q",
      "--depth",
      "1",
      `file://${r.dir}`,
      clone,
    ]);
    expect(
      migrateDates(await loadBundle(join(clone, ".adaptrace"))).refused,
    ).toContain("shallow clone");
  } finally {
    await rm(r.dir, { recursive: true, force: true });
    await rm(clone, { recursive: true, force: true });
  }
});

test("outside git, nothing is reported", async () => {
  const dir = await mkdtemp(join(tmpdir(), "adaptrace-nogit-"));
  try {
    await mkdir(join(dir, "req"));
    await writeFile(join(dir, "req/a.md"), DOC(GENERATED, "one"));
    expect(driftIssues(await loadBundle(dir))).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("migrate-dates writes the last commit date into undated documents", async () => {
  const r = await repo();
  try {
    await r.write("req/a.md", DOC("", "one"));
    await r.write("req/b.md", DOC(GENERATED, "one"));
    r.commit("2026-10-05T09:00:00+09:00");
    // generated without at: no date either. verified only: has a date.
    await r.write("req/d.md", DOC("generated: { by: human:sato }\n", "one"));
    await r.write(
      "req/e.md",
      DOC(
        "verified: { by: human:sato, at: 2026-10-01T10:00:00+09:00 }\n",
        "one",
      ),
    );
    await r.write("req/f.md", DOC("", "one"));
    r.commit("2026-10-05T09:00:00+09:00");
    await r.write("req/c.md", DOC("", "new"));
    // Committed, then changed: the last commit's date would be too old.
    await r.write("req/f.md", DOC("", "changed"));
    const before = await loadBundle(r.bundle);
    // Only verified: no date for the content either (ADR-029).
    expect(missingDateIssues(before).map((i) => i.file)).toEqual([
      "req/a.md",
      "req/c.md",
      "req/d.md",
      "req/e.md",
      "req/f.md",
    ]);
    const plan = migrateDates(before);
    // d keeps its by; e takes its last commit, as the last update did.
    expect(plan.changes.map((c) => [c.path, c.at])).toEqual([
      ["req/a.md", "2026-10-05T09:00:00+09:00"],
      ["req/d.md", "2026-10-05T09:00:00+09:00"],
      ["req/e.md", "2026-10-05T09:00:00+09:00"],
    ]);
    expect(plan.changes[1]?.text).toContain(
      "generated: { by: human:sato, at: 2026-10-05T09:00:00+09:00 }",
    );
    expect(plan.uncommitted).toEqual(["req/c.md", "req/f.md"]);
    expect(plan.unreadable).toEqual([]);
    const log = spyOn(console, "log").mockImplementation(() => {});
    expect(await run(["migrate-dates", r.bundle])).toBe(0);
    expect(String(log.mock.calls[0]?.[0])).toContain("not written");
    expect(await readFile(join(r.bundle, "req/a.md"), "utf8")).not.toContain(
      "generated",
    );
    expect(await run(["migrate-dates", r.bundle, "--write"])).toBe(0);
    log.mockRestore();
    expect(await readFile(join(r.bundle, "req/a.md"), "utf8")).toContain(
      "generated: { by: process:git, at: 2026-10-05T09:00:00+09:00 }",
    );
  } finally {
    await rm(r.dir, { recursive: true, force: true });
  }
});
