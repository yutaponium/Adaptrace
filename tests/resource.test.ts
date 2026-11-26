import { expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadBundle } from "../src/bundle";
import { buildGraph } from "../src/graph";
import { lastUpdated } from "../src/history";
import { stale } from "../src/impact";
import { createServer } from "../src/mcp";
import { formatStale, staleToJson } from "../src/output";
import {
  fileSha256,
  localResources,
  recordResources,
  resourceStates,
} from "../src/resource";
import { validate } from "../src/validate";

const FIXTURE = "tests/fixtures/resource";
const DOC = ".adaptrace/schedule/baseline.md";
const sha = (text: string) =>
  new Bun.CryptoHasher("sha256").update(text).digest("hex");

// A copy of the fixture: the bundle in .adaptrace/, the real files in pm/.
async function copy() {
  const dir = await mkdtemp(join(tmpdir(), "adaptrace-resource-"));
  await cp(FIXTURE, dir, { recursive: true });
  const original = await readFile(join(dir, DOC), "utf8");
  const doc = (extra: string) =>
    writeFile(join(dir, DOC), original.replace(/\n---\n$/, `\n${extra}---\n`));
  return { dir, doc, root: join(dir, ".adaptrace") };
}

async function check(root: string) {
  const bundle = await loadBundle(root);
  return stale(
    bundle,
    buildGraph(bundle),
    lastUpdated(bundle),
    new Date("2026-12-01T00:00:00Z"),
    resourceStates(bundle),
  );
}

test("local files in resource and sources; names, hosts, URLs and descriptions are not", async () => {
  const { dir, root } = await copy();
  try {
    const bundle = await loadBundle(root);
    const concept = bundle.concepts.get("schedule/baseline.md");
    if (concept === undefined) throw new Error("no concept");
    expect(
      localResources(bundle, concept).map((r) => [r.key, r.raw, r.file]),
    ).toEqual([
      ["resource", "../../pm/schedule.mpp", join(dir, "pm/schedule.mpp")],
      // The schedule again, written another way, counts once. Names, IDs,
      // "/..." and bare "pm/..." values and relative file: URLs are not
      // files: only "./", "../" and file:/// are.
      ["sources", "../../pm/wbs.xlsx", join(dir, "pm/wbs.xlsx")],
    ]);
    // A file:/// URL, a "./" path with spaces and "\\" separators.
    const other = {
      ...concept,
      frontmatter: {
        type: "Plan",
        resource: `file://${join(dir, "pm/wbs.xlsx")}`,
        sources: [
          { resource: "./Project Plan.xlsx" },
          { resource: "..\\..\\pm\\schedule.mpp" },
        ],
      },
    };
    expect(localResources(bundle, other).map((r) => r.file)).toEqual([
      join(dir, "pm/wbs.xlsx"),
      join(dir, ".adaptrace/schedule/Project Plan.xlsx"),
      join(dir, "pm/schedule.mpp"),
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("stale: no sha256 recorded, then recorded, then the file changes", async () => {
  const { dir, doc, root } = await copy();
  try {
    const schedule = sha("v1");
    // Nothing recorded yet: say so, with the sha256 to record.
    const first = await check(root);
    expect(first.stale[0]?.reasons).toEqual([
      {
        kind: "resource-unrecorded",
        resource: "../../pm/schedule.mpp",
        current: schedule,
      },
      {
        kind: "resource-unrecorded",
        resource: "../../pm/wbs.xlsx",
        current: sha("v1"),
      },
    ]);
    expect(formatStale(first)).toContain(
      `  no sha256 recorded for its file ../../pm/schedule.mpp (now ${schedule})`,
    );
    // Recorded as they are: not stale, in any clone, whatever the dates.
    const bundle = await loadBundle(root);
    const concept = bundle.concepts.get("schedule/baseline.md");
    if (concept === undefined) throw new Error("no concept");
    const record = recordResources(bundle, concept);
    expect(record.resource_sha256).toBe(schedule);
    expect((record.sources as { sha256?: string }[])[0]?.sha256).toBe(
      sha("v1"),
    );
    // The other entries are kept as they were.
    expect((record.sources as unknown[]).length).toBe(8);
    await doc(`resource_sha256: ${schedule}\n`);
    expect((await check(root)).stale[0]?.reasons.map((r) => r.kind)).toEqual([
      "resource-unrecorded",
    ]);
    // The schedule changes.
    await writeFile(join(dir, "pm/schedule.mpp"), "v2");
    const changed = await check(root);
    expect(changed.stale[0]?.reasons[0]).toEqual({
      kind: "resource-changed",
      resource: "../../pm/schedule.mpp",
      recorded: schedule,
      current: sha("v2"),
    });
    expect(staleToJson(changed).stale[0]?.reasons[0]).toEqual({
      kind: "resource-changed",
      resource: "../../pm/schedule.mpp",
      recorded: schedule,
      current: sha("v2"),
    });
    expect(fileSha256(join(dir, "pm/none.mpp"))).toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validate warns about a missing file and a malformed sha256, not for deprecated ones", async () => {
  const { dir, doc, root } = await copy();
  try {
    await rm(join(dir, "pm/schedule.mpp"));
    await doc("resource_sha256: not-a-hash\n");
    const issues = validate(await loadBundle(root));
    expect(issues.map((i) => [i.code, i.file, i.line])).toEqual([
      ["missing-resource", "schedule/baseline.md", 3],
      ["invalid-sha256", "schedule/baseline.md", 14],
    ]);
    expect(issues[0]?.message).toContain("'../../pm/schedule.mpp'");
    await doc("status: deprecated\n");
    expect(validate(await loadBundle(root))).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP propose_update with review records the files' sha256 too", async () => {
  const { dir, root } = await copy();
  const client = new Client({ name: "test", version: "0" });
  try {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer({ bundle: root, backlog: "no/such/backlog" }).connect(a);
    await client.connect(b);
    const result = await client.callTool({
      name: "propose_update",
      arguments: {
        path: "schedule/baseline.md",
        review: true,
        by: "human:sato",
      },
    });
    const [first] = result.content as { text: string }[];
    const value = JSON.parse(first?.text ?? "{}");
    expect(value.content).toContain(`resource_sha256: ${sha("v1")}`);
    expect(value.content).toContain(`sha256: ${sha("v1")}`);
    expect(value.content).toMatch(
      /\nverified: \{ by: human:sato, at: [^}]+\}\n/,
    );
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a directory, a missing file, uppercase and CRLF", async () => {
  const { dir, doc, root } = await copy();
  try {
    // Uppercase (PowerShell's Get-FileHash) matches.
    await doc(`resource_sha256: ${sha("v1").toUpperCase()}\n`);
    expect(
      (await check(root)).stale[0]?.reasons.map((r) => [r.kind, r.resource]),
    ).toEqual([["resource-unrecorded", "../../pm/wbs.xlsx"]]);
    // A text file checked out with CRLF hashes as with LF; another file is
    // hashed as it is.
    await writeFile(join(dir, "pm/est.csv"), "a\r\nb\r\n");
    expect(fileSha256(join(dir, "pm/est.csv"))).toBe(sha("a\nb\n"));
    // Text by content, as git decides it, whatever the extension; a file
    // with NUL bytes is hashed as it is.
    await writeFile(join(dir, "pm/flow.drawio"), "a\r\nb");
    expect(fileSha256(join(dir, "pm/flow.drawio"))).toBe(sha("a\nb"));
    await writeFile(join(dir, "pm/plan.bin"), "a\r\n\0b");
    expect(fileSha256(join(dir, "pm/plan.bin"))).toBe(sha("a\r\n\0b"));
    // Renamed away: stale says so instead of going quiet.
    await rm(join(dir, "pm/schedule.mpp"));
    expect((await check(root)).stale[0]?.reasons[0]).toEqual({
      kind: "resource-missing",
      resource: "../../pm/schedule.mpp",
    });
    // A directory: no crash, missing for stale and validate alike.
    await mkdir(join(dir, "pm/schedule.mpp"));
    expect((await check(root)).stale[0]?.reasons[0]?.kind).toBe(
      "resource-missing",
    );
    expect(validate(await loadBundle(root)).map((i) => i.code)).toContain(
      "missing-resource",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a Windows absolute path is not taken as a file; a non-string sha256 warns", async () => {
  const { dir, root } = await copy();
  try {
    const bundle = await loadBundle(root);
    const concept = bundle.concepts.get("schedule/baseline.md");
    if (concept === undefined) throw new Error("no concept");
    const other = {
      ...concept,
      frontmatter: { type: "Plan", resource: "C:\\Projects\\pm\\wbs.xlsx" },
    };
    expect(localResources(bundle, other)).toEqual([]);
    const { doc } = { doc: (t: string) => writeFile(join(dir, DOC), t) };
    await doc(
      "---\ntype: Plan\nresource: ../../pm/schedule.mpp\nresource_sha256: 123\n---\n",
    );
    expect(validate(await loadBundle(root)).map((i) => i.code)).toEqual([
      "invalid-sha256",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP propose_update with resources hashes the files the edit names", async () => {
  const { dir, root } = await copy();
  const client = new Client({ name: "test", version: "0" });
  try {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer({ bundle: root, backlog: "no/such/backlog" }).connect(a);
    await client.connect(b);
    const result = await client.callTool({
      name: "propose_update",
      arguments: {
        path: "schedule/baseline.md",
        set: { sources: [{ resource: "../../pm/wbs.xlsx" }] },
        unset: ["resource"],
        resources: true,
      },
    });
    const [first] = result.content as { text: string }[];
    const value = JSON.parse(first?.text ?? "{}");
    // The caller's new sources, hashed; nothing recorded for the resource
    // the edit removes.
    expect(value.content).toContain(
      `sources:\n  - resource: ../../pm/wbs.xlsx\n    sha256: ${sha("v1")}\n`,
    );
    expect(value.content).not.toContain("resource_sha256");
    expect(value.content).not.toContain("GA4");
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a file named twice uses whichever SHA-256 is recorded; every record is checked", async () => {
  const { dir, root } = await copy();
  try {
    await writeFile(
      join(dir, DOC),
      `---\ntype: Plan\nresource: ../../pm/wbs.xlsx\nsources:\n  - resource: ./../../pm/wbs.xlsx\n    sha256: ${sha("v1")}\n  - resource: GA4 users\n    sha256: nope\n---\n`,
    );
    expect((await check(root)).stale).toEqual([]);
    expect(validate(await loadBundle(root)).map((i) => i.code)).toEqual([
      "invalid-sha256",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP: removing resource with resources: true drops its resource_sha256", async () => {
  const { dir, root } = await copy();
  const client = new Client({ name: "test", version: "0" });
  try {
    await writeFile(
      join(dir, DOC),
      `---\ntype: Plan\nresource: ../../pm/wbs.xlsx\nresource_sha256: ${sha("v1")}\n---\n`,
    );
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer({ bundle: root, backlog: "no/such/backlog" }).connect(a);
    await client.connect(b);
    const result = await client.callTool({
      name: "propose_update",
      arguments: {
        path: "schedule/baseline.md",
        unset: ["resource"],
        resources: true,
      },
    });
    const [first] = result.content as { text: string }[];
    expect(JSON.parse(first?.text ?? "{}").content).not.toContain("resource");
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("hashing in chunks reads CRLF across chunk ends as LF", async () => {
  const { dir } = await copy();
  try {
    // A CR at the very end of the first 1 MiB chunk, its LF in the next.
    const body = `${"x".repeat((1 << 20) - 1)}\r\nend\r\n`;
    await writeFile(join(dir, "pm/big.csv"), body);
    expect(fileSha256(join(dir, "pm/big.csv"))).toBe(
      sha(body.replace(/\r\n/g, "\n")),
    );
    // A lone CR stays.
    await writeFile(join(dir, "pm/cr.txt"), "a\rb");
    expect(fileSha256(join(dir, "pm/cr.txt"))).toBe(sha("a\rb"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("recordResources updates every entry naming the same file; recorded is shown as written", async () => {
  const { dir, root } = await copy();
  try {
    await writeFile(
      join(dir, DOC),
      "---\ntype: Plan\nresource: ./../../pm/wbs.xlsx\nsources:\n  - resource: ../../pm/wbs.xlsx\n    sha256: OLD-Value\n---\n",
    );
    const bundle = await loadBundle(root);
    const concept = bundle.concepts.get("schedule/baseline.md");
    if (concept === undefined) throw new Error("no concept");
    const record = recordResources(bundle, concept);
    expect(record.resource_sha256).toBe(sha("v1"));
    expect((record.sources as { sha256: string }[])[0]?.sha256).toBe(sha("v1"));
    const reason = (await check(root)).stale[0]?.reasons[0];
    expect(reason).toMatchObject({
      kind: "resource-changed",
      recorded: "OLD-Value",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP: repointing resource to a renamed file keeps a record that still matches", async () => {
  const { dir, root } = await copy();
  const client = new Client({ name: "test", version: "0" });
  try {
    await writeFile(
      join(dir, DOC),
      `---\ntype: Plan\nresource: ../../pm/wbs.xlsx\nresource_sha256: ${sha("v1")}\n---\n`,
    );
    await writeFile(join(dir, "pm/wbs-renamed.xlsx"), "v1");
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer({ bundle: root, backlog: "no/such/backlog" }).connect(a);
    await client.connect(b);
    const call = async (resource: string) => {
      const result = await client.callTool({
        name: "propose_update",
        arguments: {
          path: "schedule/baseline.md",
          set: { resource },
          resources: true,
        },
      });
      const [first] = result.content as { text: string }[];
      return JSON.parse(first?.text ?? "{}").content as string;
    };
    expect(await call("../../pm/wbs-renamed.xlsx")).toContain(
      `resource_sha256: ${sha("v1")}`,
    );
    // A file not there yet: the old record goes.
    expect(await call("../../pm/not-yet.xlsx")).not.toContain(
      "resource_sha256",
    );
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a resource naming the document itself is not tracked", async () => {
  const { dir, root } = await copy();
  try {
    await writeFile(
      join(dir, DOC),
      "---\ntype: Plan\nresource: ./baseline.md\n---\n",
    );
    expect((await check(root)).stale).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a sha256 next to a value that is not a local file warns; self is never hashed", async () => {
  const { dir, root } = await copy();
  try {
    await writeFile(
      join(dir, DOC),
      `---\ntype: Plan\nresource: /pm/schedule.mpp\nresource_sha256: ${sha("v1")}\nsources:\n  - resource: ./baseline.md\n---\n`,
    );
    const bundle = await loadBundle(root);
    expect(validate(bundle).map((i) => [i.code, i.line])).toEqual([
      ["unlinked-sha256", 4],
    ]);
    const concept = bundle.concepts.get("schedule/baseline.md");
    if (concept === undefined) throw new Error("no concept");
    expect(recordResources(bundle, concept)).toEqual({});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP: resources alone is refused; moving resource without it drops the old record", async () => {
  const { dir, root } = await copy();
  const client = new Client({ name: "test", version: "0" });
  try {
    await writeFile(
      join(dir, DOC),
      `---\ntype: Plan\nresource: ../../pm/wbs.xlsx\nresource_sha256: ${sha("v1")}\n---\n`,
    );
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer({ bundle: root, backlog: "no/such/backlog" }).connect(a);
    await client.connect(b);
    const alone = await client.callTool({
      name: "propose_update",
      arguments: { path: "schedule/baseline.md", resources: true },
    });
    expect(alone.isError).toBe(true);
    const moved = await client.callTool({
      name: "propose_update",
      arguments: {
        path: "schedule/baseline.md",
        set: { resource: "../../pm/schedule.mpp" },
      },
    });
    const [first] = moved.content as { text: string }[];
    expect(JSON.parse(first?.text ?? "{}").content).not.toContain(
      "resource_sha256",
    );
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP: an edit that leaves resource alone keeps its record, however it is written", async () => {
  const { dir, root } = await copy();
  const client = new Client({ name: "test", version: "0" });
  try {
    await writeFile(
      join(dir, DOC),
      `---\ntype: Plan\nresource: /pm/schedule.mpp\nresource_sha256: ${sha("v1")}\n---\n`,
    );
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer({ bundle: root, backlog: "no/such/backlog" }).connect(a);
    await client.connect(b);
    const call = async (args: Record<string, unknown>) => {
      const result = await client.callTool({
        name: "propose_update",
        arguments: { path: "schedule/baseline.md", ...args },
      });
      const [first] = result.content as { text: string }[];
      return JSON.parse(first?.text ?? "{}").content as string;
    };
    expect(await call({ set: { state: "done" } })).toContain("resource_sha256");
    await writeFile(
      join(dir, DOC),
      `---\ntype: Plan\nresource: ../../pm/schedule.mpp\nresource_sha256: ${sha("v1")}\n---\n`,
    );
    // The same file, written another way: not moved.
    expect(
      await call({ set: { resource: "./../../pm/schedule.mpp" } }),
    ).toContain("resource_sha256");
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCP refuses a proposal whose frontmatter would not read back", async () => {
  const { dir, root } = await copy();
  const client = new Client({ name: "test", version: "0" });
  try {
    // A list at column 0 broken by a comment: rewriting sources would leave
    // the old items behind.
    await writeFile(
      join(dir, DOC),
      "---\ntype: Plan\nsources:\n- resource: ../../pm/wbs.xlsx\n# note\n- resource: ../../pm/schedule.mpp\n---\n",
    );
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createServer({ bundle: root, backlog: "no/such/backlog" }).connect(a);
    await client.connect(b);
    const result = await client.callTool({
      name: "propose_update",
      arguments: { path: "schedule/baseline.md", review: true },
    });
    expect(result.isError).toBe(true);
    const [first] = result.content as { text: string }[];
    expect(first?.text).toContain("would not read back as YAML");
  } finally {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
