import { expect, test } from "bun:test";
import { extractLinks, resolvePath } from "../src/links";

test("extracts links but not images, code fences or inline code", () => {
  const body = [
    "See [a](/a.md) and ![img](/img.png).",
    "```",
    "[b](/b.md)",
    "```",
    'Inline `[c](/c.md)` and [d](./d.md "title").',
  ].join("\n");
  expect(extractLinks(body, 10)).toEqual([
    { target: "/a.md", line: 10 },
    { target: "./d.md", line: 14 },
  ]);
});

test("resolves bundle-absolute and relative paths", () => {
  expect(resolvePath("/requirements/mfa.md", "tasks/t.md")).toBe(
    "requirements/mfa.md",
  );
  expect(resolvePath("../requirements/mfa.md", "tasks/t.md")).toBe(
    "requirements/mfa.md",
  );
  expect(resolvePath("other.md#section", "tasks/t.md")).toBe("tasks/other.md");
  expect(resolvePath("my%20file.md", "t.md")).toBe("my file.md");
});

test("ignores URLs, fragments and paths outside the bundle", () => {
  expect(resolvePath("https://example.com/a.md", "t.md")).toBeNull();
  expect(resolvePath("mailto:a@example.com", "t.md")).toBeNull();
  expect(resolvePath("#section", "t.md")).toBeNull();
  expect(resolvePath("../../outside.md", "tasks/t.md")).toBeNull();
});

test("reads angle-bracket targets that contain spaces", () => {
  const body = '[a](<my file.md>) and [b](</b.md> "t")';
  expect(extractLinks(body).map((l) => l.target)).toEqual([
    "my file.md",
    "/b.md",
  ]);
});

test("reads reference-style links on the line where they are used", () => {
  const body = [
    "Full [a][1], collapsed [B][] and shortcut [c].",
    "Unknown [x][9] and [plain text] are not links. ![img][1] is an image.",
    "",
    "[1]: /a.md",
    '  [b]: <./my b.md> "title"',
    "[C]: https://example.com/c",
    "[1]: /ignored.md",
    "```",
    "[d][1]",
    "```",
  ].join("\n");
  expect(extractLinks(body, 5)).toEqual([
    { target: "/a.md", line: 5 },
    { target: "./my b.md", line: 5 },
    { target: "https://example.com/c", line: 5 },
  ]);
});

test("reference labels ignore case and runs of whitespace", () => {
  const body = "See [the  Spec][].\n\n[THE SPEC]: /spec.md";
  expect(extractLinks(body).map((l) => l.target)).toEqual(["/spec.md"]);
});

test("definitions inside code are not definitions", () => {
  const body = "[a]\n\n```\n[a]: /a.md\n```\n`[a]: /b.md`";
  expect(extractLinks(body)).toEqual([]);
});

test("reads links that follow each other or a bracketed word", () => {
  const defs = "\n\n[1]: /a.md\n[2]: /b.md";
  const targets = (line: string) =>
    extractLinks(line + defs).map((l) => l.target);
  expect(targets("[a][1][b][2]")).toEqual(["/a.md", "/b.md"]);
  expect(targets("[a][1][b](/c.md)")).toEqual(["/a.md", "/c.md"]);
  expect(targets("[WIP][design](/d.md)")).toEqual(["/d.md"]);
  expect(targets("See [1]: the first. And [2][]: the second.")).toEqual([
    "/a.md",
    "/b.md",
  ]);
  expect(targets("![img][1] [x][2]")).toEqual(["/b.md"]);
});

test("labels may contain inline code", () => {
  const body = "See [`validate`].\n\n[`validate`]: /spec.md";
  expect(extractLinks(body).map((l) => l.target)).toEqual(["/spec.md"]);
});

test("footnotes and task boxes are not links", () => {
  const body = "- [x] done\n\nNote[^1].\n\n[^1]: TBD\n[x]: /x.md";
  expect(extractLinks(body)).toEqual([]);
});

test("definitions in a blockquote, on two lines, or with ')' in the target", () => {
  const body = [
    "[q][1] [n][2] [p][3]",
    "",
    "> [1]: /q.md",
    "",
    "[2]:",
    "  /n.md",
    "[3]: ./guide_(v2).md",
  ].join("\n");
  expect(extractLinks(body).map((l) => l.target)).toEqual([
    "/q.md",
    "/n.md",
    "./guide_(v2).md",
  ]);
});

test("a definition cannot interrupt a paragraph", () => {
  const body = "text\n[a]: /x.md\n\nsee [a]";
  expect(extractLinks(body)).toEqual([]);
});
