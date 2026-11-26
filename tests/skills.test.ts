// The parts of the skill tests that do not need an LLM: each checker passes
// the expected result, fails a known bad one, and setup.sh builds the test
// repository. Running the skills themselves is manual: tests/skills/run.ts.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { appendFile, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SKILLS = [
  {
    name: "adaptrace-adopt",
    date: "2026-11-10T10:00:00+09:00",
    inputs: ["docs/requirements.md", "pm/schedule.xlsx"],
    failures: [
      "FAIL  a Task from the minutes, derived_from them",
      "FAIL  ADR-0001 keeps the date of its last commit",
    ],
  },
  {
    name: "adaptrace-change-request",
    date: "2026-11-15T10:00:00+09:00",
    inputs: ["inbox/2026-11-20-sms.eml", ".adaptrace/index.md"],
    failures: [
      "FAIL  its changes names /requirements/req-1-mfa.md",
      "FAIL  received_at is the e-mail's Date",
      "FAIL  state is submitted",
      "FAIL  no e-mail addresses or phone numbers",
      "FAIL  the report's table judges the pair with cr-001 a conflict",
    ],
  },
  {
    name: "adaptrace-review",
    date: "2026-11-24T18:00:00+09:00",
    inputs: [".adaptrace/change-requests/cr-002-sms.md"],
    failures: [
      "FAIL  progress change-requests/cr-002-sms.md exits 0",
      "FAIL  decisions/adr-0001-idp.md: generated kept, verified added",
      "FAIL  milestones/release.md: generated kept, verified added",
      "FAIL  stale: no documents",
      // The origin (made stale by the request's newer generated) and the
      // risk (by the decision's newer generated).
      "requirements/req-1-mfa.md, risks/idp-lock-in.md",
    ],
  },
  {
    name: "adaptrace-weekly",
    date: "2026-11-26T10:00:00+09:00",
    inputs: [
      ".adaptrace/tasks/login-mfa.md",
      ".adaptrace/risks/idp-lock-in.md",
    ],
    failures: [
      "FAIL  the report calls the overdue task overdue (login-mfa)",
      "FAIL  the report names the risk past stale_after (idp-lock-in)",
      "FAIL  the report names the request not yet decided (cr-003)",
    ],
  },
  {
    name: "adaptrace-minutes",
    date: "2026-11-26T10:00:00+09:00",
    inputs: ["notes/minutes-1120.md", ".adaptrace/tasks/smtp-setup.md"],
    failures: [
      "FAIL  no e-mail address or phone number in the bundle (meetings/2026-11-20.md)",
      "FAIL  a new decision supersedes ADR-0001, and ADR-0001 is deprecated",
      "FAIL  no requirement added or changed for the attachments",
    ],
  },
  {
    name: "adaptrace-supersede",
    date: "2026-11-26T10:00:00+09:00",
    inputs: [".adaptrace/decisions/adr-0003-batch.md"],
    failures: [
      "FAIL  one new decision supersedes ADR-0003",
      "FAIL  ADR-0003's body is kept",
      "FAIL  the monitoring task now depends on the new decision",
    ],
  },
  {
    name: "adaptrace-change-decision",
    date: "2026-11-26T10:00:00+09:00",
    inputs: [
      ".adaptrace/change-requests/cr-002-sms.md",
      ".adaptrace/change-requests/cr-005-voice.md",
    ],
    failures: [
      "FAIL  CR-004 uses the bundle's value for rejection (declined)",
      "FAIL  CR-002 keeps its body and has a 判断 section",
    ],
  },
  {
    name: "adaptrace-health",
    date: "2026-11-26T10:00:00+09:00",
    inputs: [".adaptrace/tasks/data-migration.md"],
    failures: [
      "FAIL  no deadlock (tasks/data-migration.md)",
      "FAIL  the audit report keeps its direct dependency on ADR-0002",
      "FAIL  the Redis PoC is stopped",
    ],
  },
];

for (const skill of SKILLS) {
  const dir = join(import.meta.dir, "skills", skill.name);
  // A dialog file next to the result, when the checker reads one.
  const check = (result: string) => {
    const dialog = join(dir, `${result}.dialog.md`);
    const run = Bun.spawnSync([
      process.execPath,
      join(dir, "check.ts"),
      join(dir, result),
      ...(existsSync(dialog) ? [dialog] : []),
    ]);
    return { code: run.exitCode, out: run.stdout.toString() };
  };

  describe(skill.name, () => {
    if (skill.name === "adaptrace-change-request") {
      test("only a table row judging the pair with cr-001 counts", async () => {
        const parent = await mkdtemp(join(tmpdir(), "adaptrace-skill-"));
        try {
          const verdict = async (body: string) => {
            const file = join(parent, "dialog.md");
            await writeFile(file, `## Runner 1\n\n${body}\n`);
            const out = Bun.spawnSync([
              process.execPath,
              join(dir, "check.ts"),
              join(dir, "expected"),
              file,
            ]).stdout.toString();
            return out.includes("ok    the report's table judges");
          };
          expect(
            await verdict(
              "| 組 | 判定 | 理由 |\n|---|---|---|\n| cr-001とcr-002 | **conflict（両立できない）** | 理由 |",
            ),
          ).toBe(true);
          expect(
            await verdict(
              "| 組 | 判定 | 理由 |\n|---|---|---|\n| `cr-001` と `cr-002` | `conflict` | 安全ではない |",
            ),
          ).toBe(true);
          expect(
            await verdict(
              "| 組 | 判定 | 理由 |\n|---|---|---|\n| cr-001とcr-002 | conflict：両立できない | 理由 |",
            ),
          ).toBe(true);
          // The reason column does not count: only the 判定 column.
          expect(
            await verdict(
              "| 組 | 判定 | 理由 |\n|---|---|---|\n| cr-001とcr-002 | compatible | conflictにはならない |",
            ),
          ).toBe(false);
          // Not a verdict: a negation in prose, a legend, another verdict.
          expect(
            await verdict(
              "cr-001 とは、`conflict` ではなく `compatible` と判定した",
            ),
          ).toBe(false);
          expect(
            await verdict(
              "cr-001 があります。\n\n| `conflict` | 両立できない |",
            ),
          ).toBe(false);
          expect(
            await verdict(
              "| 組 | 判定 | 理由 |\n|---|---|---|\n| cr-001とcr-002 | compatible | conflict ではない |",
            ),
          ).toBe(false);
        } finally {
          await rm(parent, { recursive: true, force: true });
        }
      });
      test("a changed existing document fails, a new staged one does not", async () => {
        const parent = await mkdtemp(join(tmpdir(), "adaptrace-skill-"));
        try {
          const dest = join(parent, "repo");
          expect(
            Bun.spawnSync(["sh", join(dir, "setup.sh"), dest]).exitCode,
          ).toBe(0);
          await cp(join(dir, "expected/.adaptrace"), join(dest, ".adaptrace"), {
            recursive: true,
          });
          expect(
            Bun.spawnSync(
              [
                "git",
                "-c",
                "core.excludesFile=/dev/null",
                "add",
                "-f",
                ".adaptrace",
              ],
              { cwd: dest },
            ).exitCode,
          ).toBe(0);
          const run = () =>
            Bun.spawnSync([
              process.execPath,
              join(dir, "check.ts"),
              dest,
            ]).stdout.toString();
          expect(run()).toContain("ok    existing documents unchanged");
          await appendFile(
            join(dest, ".adaptrace/requirements/req-1-mfa.md"),
            "\nSMS\n",
          );
          expect(run()).toContain("FAIL  existing documents unchanged");
          // Removing the frontmatter delimiter of index.md is a change too.
          await cp(
            join(dir, "repo/.adaptrace/requirements/req-1-mfa.md"),
            join(dest, ".adaptrace/requirements/req-1-mfa.md"),
          );
          const index = join(dest, ".adaptrace/index.md");
          const original = await Bun.file(index).text();
          await Bun.write(index, original.replace(/^---\n/, ""));
          expect(run()).toContain("FAIL  existing documents unchanged");
          await Bun.write(index, original);
          // Removing a line from log.md is a change too.
          const log = join(dest, ".adaptrace/log.md");
          const text = await Bun.file(log).text();
          await Bun.write(
            log,
            text.replace(/^\* \*\*Creation\*\*: 業務部門.*\n/m, ""),
          );
          expect(run()).toContain("FAIL  existing documents unchanged");
        } finally {
          await rm(parent, { recursive: true, force: true });
        }
      });
    }
    if (skill.name === "adaptrace-supersede") {
      test("a changed document fails, the expected changes do not", async () => {
        const parent = await mkdtemp(join(tmpdir(), "adaptrace-skill-"));
        try {
          const dest = join(parent, "repo");
          expect(
            Bun.spawnSync(["sh", join(dir, "setup.sh"), dest]).exitCode,
          ).toBe(0);
          await cp(join(dir, "expected/.adaptrace"), join(dest, ".adaptrace"), {
            recursive: true,
          });
          const run = () =>
            Bun.spawnSync([
              process.execPath,
              join(dir, "check.ts"),
              dest,
            ]).stdout.toString();
          expect(run()).toContain("ok    no other document changed");
          // The indirectly reached task is not to change.
          const test = join(dest, ".adaptrace/tasks/payroll-test.md");
          const original = await Bun.file(test).text();
          await Bun.write(test, original.replace("owner: kudo", "owner: mori"));
          expect(run()).toContain("FAIL  no other document changed");
          await Bun.write(test, original);
          // A key the replacement does not change on the old decision.
          const old = join(dest, ".adaptrace/decisions/adr-0003-batch.md");
          const text = await Bun.file(old).text();
          await Bun.write(old, text.replace("state: accepted\n", ""));
          expect(run()).toContain("FAIL  no other document changed");
        } finally {
          await rm(parent, { recursive: true, force: true });
        }
      });
    }
    if (skill.name === "adaptrace-change-decision") {
      test("a changed key or document fails, the decisions do not", async () => {
        const parent = await mkdtemp(join(tmpdir(), "adaptrace-skill-"));
        try {
          const dest = join(parent, "repo");
          expect(
            Bun.spawnSync(["sh", join(dir, "setup.sh"), dest]).exitCode,
          ).toBe(0);
          await cp(join(dir, "expected/.adaptrace"), join(dest, ".adaptrace"), {
            recursive: true,
          });
          const run = () =>
            Bun.spawnSync([
              process.execPath,
              join(dir, "check.ts"),
              dest,
            ]).stdout.toString();
          expect(run()).toContain("ok    no other document changed");
          // The origin: the review adds derived_from, not this skill.
          const req = join(dest, ".adaptrace/requirements/req-1-mfa.md");
          const original = await Bun.file(req).text();
          await Bun.write(
            req,
            original.replace(
              "owner: sato\n",
              "owner: sato\nderived_from: /change-requests/cr-002-sms.md\n",
            ),
          );
          expect(run()).toContain("FAIL  no other document changed");
          await Bun.write(req, original);
          // A key of a decided request other than state and generated.
          const cr = join(dest, ".adaptrace/change-requests/cr-002-sms.md");
          const text = await Bun.file(cr).text();
          await Bun.write(
            cr,
            text.replace(
              "2026-11-18T09:30:00+09:00",
              "2026-11-26T10:00:00+09:00",
            ),
          );
          expect(run()).toContain("FAIL  no other document changed");
          // The body as received must stay in front of the new section.
          await Bun.write(
            cr,
            text.replace("メールが届かない会員がいるので、", ""),
          );
          expect(run()).toContain("FAIL  no other document changed");
        } finally {
          await rm(parent, { recursive: true, force: true });
        }
      });
    }
    if (skill.name === "adaptrace-health") {
      test("a body or an untouched document changed fails, the fixes do not", async () => {
        const parent = await mkdtemp(join(tmpdir(), "adaptrace-skill-"));
        try {
          const dest = join(parent, "repo");
          expect(
            Bun.spawnSync(["sh", join(dir, "setup.sh"), dest]).exitCode,
          ).toBe(0);
          await cp(join(dir, "expected/.adaptrace"), join(dest, ".adaptrace"), {
            recursive: true,
          });
          const run = () =>
            Bun.spawnSync([
              process.execPath,
              join(dir, "check.ts"),
              dest,
            ]).stdout.toString();
          expect(run()).toContain("ok    no other document changed");
          // The body of a document whose dependency was re-pointed.
          const form = join(dest, ".adaptrace/tasks/login-form.md");
          const original = await Bun.file(form).text();
          await Bun.write(
            form,
            original.replace("ボタンを作る", "ボタンを置く"),
          );
          expect(run()).toContain("FAIL  no other document changed");
          await Bun.write(form, original);
          // A document kept as it is.
          const adr = join(dest, ".adaptrace/decisions/adr-0003-coding.md");
          const text = await Bun.file(adr).text();
          await Bun.write(
            adr,
            text.replace(
              "state: accepted\n",
              "state: accepted\nstatus: deprecated\n",
            ),
          );
          expect(run()).toContain("FAIL  no other document changed");
        } finally {
          await rm(parent, { recursive: true, force: true });
        }
      });
    }
    if (skill.name === "adaptrace-minutes") {
      test("a changed document fails, the minutes' own changes do not", async () => {
        const parent = await mkdtemp(join(tmpdir(), "adaptrace-skill-"));
        try {
          const dest = join(parent, "repo");
          expect(
            Bun.spawnSync(["sh", join(dir, "setup.sh"), dest]).exitCode,
          ).toBe(0);
          await cp(join(dir, "expected/.adaptrace"), join(dest, ".adaptrace"), {
            recursive: true,
          });
          const run = () =>
            Bun.spawnSync([
              process.execPath,
              join(dir, "check.ts"),
              dest,
            ]).stdout.toString();
          expect(run()).toContain("ok    no other document changed");
          // A key the minutes do not change.
          const form = join(dest, ".adaptrace/tasks/form-ui.md");
          const original = await Bun.file(form).text();
          await Bun.write(form, original.replace("owner: kato", "owner: ito"));
          expect(run()).toContain("FAIL  no other document changed");
          await Bun.write(form, original);
          // A line removed from log.md.
          const log = join(dest, ".adaptrace/log.md");
          const text = await Bun.file(log).text();
          await Bun.write(log, text.replace(/^\* \*\*Initialization.*\n/m, ""));
          expect(run()).toContain("FAIL  no other document changed");
        } finally {
          await rm(parent, { recursive: true, force: true });
        }
      });
    }
    test("the expected result passes every check", () => {
      const { code, out } = check("expected");
      expect(out).not.toContain("FAIL");
      expect(out).not.toContain("warn");
      expect(code).toBe(0);
    });

    test("a known bad result fails", () => {
      const { code, out } = check("failing");
      expect(code).toBe(1);
      for (const line of skill.failures) expect(out).toContain(line);
    });

    test("setup.sh builds the test repository", async () => {
      const parent = await mkdtemp(join(tmpdir(), "adaptrace-skill-"));
      try {
        const dest = join(parent, "repo");
        const run = Bun.spawnSync(["sh", join(dir, "setup.sh"), dest]);
        expect(run.exitCode).toBe(0);
        const log = Bun.spawnSync(["git", "log", "--format=%aI"], {
          cwd: dest,
        });
        expect(log.stdout.toString().trim()).toBe(skill.date);
        expect(
          existsSync(join(dest, `.claude/skills/${skill.name}/SKILL.md`)),
        ).toBe(true);
        for (const input of skill.inputs) {
          expect(existsSync(join(dest, input))).toBe(true);
        }
        // Dates written relative to today: no placeholder is left.
        for (const input of skill.inputs.filter((i) => i.endsWith(".md"))) {
          expect(await Bun.file(join(dest, input)).text()).not.toContain("{{");
        }
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    });
  });
}
