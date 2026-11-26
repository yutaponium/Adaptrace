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
