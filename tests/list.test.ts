import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { loadBundle, withFiles } from "../src/bundle";
import { run } from "../src/cli";
import { lastUpdated } from "../src/history";
import { type ListOptions, list } from "../src/list";
import { formatList, listToJson } from "../src/output";

const BUNDLE = "tests/fixtures/list";

afterEach(() => {
  mock.restore();
});

async function report(options: ListOptions = {}) {
  const bundle = await loadBundle(BUNDLE);
  // No git dates, so the results do not depend on the repository's history.
  return list(bundle, lastUpdated(bundle), options);
}

test("lists live documents with the default columns, by path", async () => {
  const r = await report();
  expect(r.columns).toEqual(["type", "state", "owner", "due", "updated"]);
  // risks/old.md is deprecated.
  expect(r.rows.map((row) => row.path)).toEqual([
    "change-requests/cr-001.md",
    "risks/delay.md",
    "risks/lockin.md",
    "risks/sim-swap.md",
  ]);
  expect(r.rows[2]).toEqual({
    path: "risks/lockin.md",
    title: "Locked in to IdP-X",
    // A list is joined; an unquoted date stays a date.
    values: [
      "Risk",
      "open",
      "sato, tanaka",
      "2026-12-15",
      "2026-11-01T10:00:00+09:00",
    ],
  });
});

test("filters by type, state and status; the type column goes when filtered on", async () => {
  const open = await report({ type: "Risk", state: "open" });
  expect(open.columns).toEqual(["state", "owner", "due", "updated"]);
  expect(open.rows.map((row) => row.path)).toEqual([
    "risks/lockin.md",
    "risks/sim-swap.md",
  ]);
  const deprecated = await report({ status: "deprecated" });
  expect(deprecated.rows.map((row) => row.path)).toEqual(["risks/old.md"]);
  expect((await report({ type: "Nothing" })).rows).toEqual([]);
});

test("picks columns, reads nested keys, and sorts numbers as numbers with empty values last", async () => {
  const r = await report({
    type: "Risk",
    columns: ["probability", "impact", "generated.by"],
    sort: "probability",
  });
  expect(r.rows.map((row) => [row.path, ...row.values])).toEqual([
    ["risks/sim-swap.md", "0.05", "high", "human:suzuki"],
    ["risks/lockin.md", "0.3", "high", "human:sato"],
    ["risks/delay.md", "0.5", "", "human:sato"],
  ]);
  const byImpact = await report({
    type: "Risk",
    columns: ["impact"],
    sort: "impact",
  });
  expect(byImpact.rows.map((row) => row.path)).toEqual([
    "risks/lockin.md",
    "risks/sim-swap.md",
    "risks/delay.md",
  ]);
});

test("text lines up wide characters; markdown and csv escape their values", async () => {
  const r = await report({ columns: ["state", "owner"] });
  const text = formatList(r, "text");
  const lines = text.split("\n");
  // The title of cr-001.md is Japanese: two cells per character.
  expect(lines[0]).toBe(
    "path                       title                                 state     owner",
  );
  expect(lines[1]).toBe(
    "change-requests/cr-001.md  SMS でもコードを受け取れるようにする  approved  sato",
  );
  expect(text.endsWith("4 documents")).toBe(true);
  const md = formatList(r, "markdown", "https://example.com/b");
  expect(md.split("\n").slice(0, 2)).toEqual([
    "| Document | state | owner |",
    "| --- | --- | --- |",
  ]);
  expect(md).toContain(
    "| [Locked in to IdP-X](https://example.com/b/risks/lockin.md) | open | sato, tanaka |",
  );
  const csv = formatList(r, "csv").split("\r\n");
  expect(csv[0]).toBe("path,title,state,owner");
  expect(csv).toContain(
    'risks/sim-swap.md,"SIM swap, ""port-out"" fraud",open,suzuki',
  );
  expect(csv).toContain(
    'risks/lockin.md,Locked in to IdP-X,open,"sato, tanaka"',
  );
  expect(formatList({ columns: ["state"], rows: [] }, "text")).toBe(
    "No documents.",
  );
});

test("json keys the values by column", async () => {
  const json = listToJson(
    await report({ type: "Change Request", columns: ["received_at"] }),
  );
  expect(json).toEqual({
    columns: ["received_at"],
    documents: [
      {
        path: "change-requests/cr-001.md",
        title: "SMS でもコードを受け取れるようにする",
        values: { received_at: "2026-11-18T10:00:00+09:00" },
      },
    ],
  });
});

test("the CLI: formats, options and usage errors", async () => {
  const log = spyOn(console, "log").mockImplementation(() => {});
  expect(
    await run([
      "list",
      BUNDLE,
      "--type",
      "Risk",
      "--columns",
      "probability, owner",
      "--sort",
      " probability ",
      "--format",
      "csv",
    ]),
  ).toBe(0);
  // A BOM for spreadsheets, and every line ends with CRLF, the last one too
  // (console.log adds the LF).
  expect(log.mock.calls[0]?.[0]).toBe(
    '\uFEFFpath,title,probability,owner\r\nrisks/sim-swap.md,"SIM swap, ""port-out"" fraud",0.05,suzuki\r\nrisks/lockin.md,Locked in to IdP-X,0.3,"sato, tanaka"\r\nrisks/delay.md,SDK survey is late,0.5,\r',
  );
  expect(await run(["list", "--bundle", BUNDLE, "--format", "json"])).toBe(0);
  expect(JSON.parse(log.mock.calls[1]?.[0]).documents).toHaveLength(4);
  const error = spyOn(console, "error").mockImplementation(() => {});
  expect(await run(["list", BUNDLE, "--columns", "state,,owner"])).toBe(2);
  expect(await run(["list", BUNDLE, "--sort", " "])).toBe(2);
  expect(await run(["list", BUNDLE, "--format", "xml"])).toBe(2);
  expect(await run(["list", BUNDLE, "--status", "deprecate"])).toBe(2);
  expect(await run(["list", BUNDLE, "--columns", "state,owner,state"])).toBe(2);
  expect(await run(["list", BUNDLE, "--columns", "title"])).toBe(2);
  // The list options are not taken, and ignored, by other commands.
  expect(await run(["board", BUNDLE, "--state", "open"])).toBe(2);
  const messages = error.mock.calls.map((c) => String(c[0]));
  expect(messages[0]).toContain("--columns needs");
  expect(messages[3]).toContain("--status must be one of");
  expect(messages[4]).toContain("'state' is given twice");
  expect(messages[5]).toContain("'title' is always shown");
  expect(messages[6]).toContain("--state is only for list");
});

test("sorting: datetimes by the instant, and one order for mixed values", async () => {
  const base = await loadBundle(BUNDLE);
  const doc = (path: string, value: string) => ({
    path,
    text: `---\ntype: Item\nv: "${value}"\n---\n`,
  });
  const sorted = (values: string[]) => {
    const bundle = withFiles(
      base,
      values.map((v, i) => doc(`items/${String.fromCharCode(97 + i)}.md`, v)),
    );
    return list(bundle, new Map(), {
      type: "Item",
      columns: ["v"],
      sort: "v",
    }).rows.map((r) => r.values[0]);
  };
  // 01:00+09:00 is 16:00 the day before in UTC, so before 20:00Z.
  expect(sorted(["2026-11-20T01:00:00+09:00", "2026-11-19T20:00:00Z"])).toEqual(
    ["2026-11-20T01:00:00+09:00", "2026-11-19T20:00:00Z"],
  );
  // A date without a time sorts as the start of that day, among datetimes.
  expect(sorted(["2026-12-31T09:00:00+09:00", "2026-01-10"])).toEqual([
    "2026-01-10",
    "2026-12-31T09:00:00+09:00",
  ]);
  // A day that does not exist is text, not a date in the next month.
  expect(sorted(["2026-03-01", "2026-02-30", "2026-03-03"])).toEqual([
    "2026-03-01",
    "2026-03-03",
    "2026-02-30",
  ]);
  // Text in code point order, whatever the locale.
  expect(sorted(["b", "B", "a"])).toEqual(["B", "a", "b"]);
  // Numbers, then datetimes, then text, then empty, whatever the input order.
  const mixed = ["10h", "", "2", "2026-11-01T00:00:00Z", "10", "1a"];
  const expected = ["2", "10", "2026-11-01T00:00:00Z", "10h", "1a", ""];
  expect(sorted(mixed)).toEqual(expected);
  expect(sorted([...mixed].reverse())).toEqual(expected);
});

test("--sort title sorts by the title as shown", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    { path: "items/a.md", text: "---\ntype: Item\ntitle: zebra\n---\n" },
    // No title: shown, and sorted, as its path.
    { path: "items/b.md", text: "---\ntype: Item\n---\n" },
  ]);
  const r = list(bundle, new Map(), {
    type: "Item",
    columns: [],
    sort: "title",
  });
  expect(r.rows.map((row) => row.title)).toEqual(["items/b.md", "zebra"]);
});

test("only the document's own keys are read", async () => {
  const r = await report({
    type: "Risk",
    columns: ["constructor", "toString", "generated.constructor"],
  });
  for (const row of r.rows) expect(row.values).toEqual(["", "", ""]);
});

test("csv keeps negative numbers as numbers; line breaks become spaces", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "items/n.md",
      text: '---\ntype: Item\ntitle: "a\\rb"\nv: -0.5\nw: "-x"\n---\n',
    },
  ]);
  const r = list(bundle, new Map(), { type: "Item", columns: ["v", "w"] });
  expect(formatList(r, "csv").split("\r\n")[1]).toBe(
    'items/n.md,"a\rb",-0.5,\'-x',
  );
  expect(formatList(r, "text").split("\n")[1]).toBe(
    "items/n.md  a b    -0.5  -x",
  );
});

test("csv defuses formulas; markdown escapes values", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "items/f.md",
      text: '---\ntype: Item\ntitle: "=HYPERLINK(1)"\nowner: "_sato_ a\\\\|b"\n---\n',
    },
  ]);
  const r = list(bundle, new Map(), { type: "Item", columns: ["owner"] });
  expect(formatList(r, "csv").split("\r\n")[1]).toBe(
    "items/f.md,'=HYPERLINK(1),_sato_ a\\|b",
  );
  expect(formatList(r, "markdown").split("\n")[2]).toBe(
    "| =HYPERLINK(1) (`items/f.md`) | \\_sato\\_ a\\\\\\|b |",
  );
});

test("control characters are blanked; empty markdown says so; an unknown sort key warns", async () => {
  const base = await loadBundle(BUNDLE);
  const bundle = withFiles(base, [
    {
      path: "items/c.md",
      text: '---\ntype: Item\ntitle: "a\\e[2Jb"\nowner: "x\\ay"\n---\n',
    },
  ]);
  const r = list(bundle, new Map(), { type: "Item", columns: ["owner"] });
  expect(formatList(r, "text").split("\n")[1]).toBe("items/c.md  a [2Jb  x y");
  expect(formatList({ columns: ["state"], rows: [] }, "markdown")).toBe(
    "No documents.",
  );
  spyOn(console, "log").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  expect(await run(["list", BUNDLE, "--sort", "recieved_at"])).toBe(0);
  expect(error.mock.calls[0]?.[0]).toBe(
    "adaptrace: warning: no document has a value for --sort recieved_at",
  );
  expect(await run(["list", BUNDLE, "--sort", "title"])).toBe(0);
  expect(error.mock.calls).toHaveLength(1);
});
