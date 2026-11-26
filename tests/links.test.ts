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
  const body = "- [x] done\n\nNote[^1].\n\n[^1]: TBD\n\n[x]: /x.md";
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

test("a bare '[label]:' needs a destination alone on the next line", () => {
  const targets = (body: string) => extractLinks(body).map((l) => l.target);
  expect(targets("[TODO]:\nSee [x](/x.md) here")).toEqual(["/x.md"]);
  expect(targets("[a]:\n# Heading [h](/h.md)")).toEqual(["/h.md"]);
  expect(targets('[n][1]\n\n[1]:\n  /n.md "title"')).toEqual(["/n.md"]);
});

test("labels and second labels may be inline code", () => {
  const defs = "\n\n[`validate`]: /spec.md";
  const targets = (line: string) =>
    extractLinks(line + defs).map((l) => l.target);
  expect(targets("See [the spec][`validate`].")).toEqual(["/spec.md"]);
  expect(targets("[WIP][`design`](/d.md)")).toEqual(["/d.md"]);
  expect(targets("![WIP][design](/d.md)")).toEqual(["/d.md"]);
});

test("empty destinations, autolinks and quoted task boxes are not references", () => {
  const defs = "\n\n[a]: /a.md\n[x]: /x.md";
  const targets = (line: string) =>
    extractLinks(line + defs).map((l) => l.target);
  expect(targets("[a]()")).toEqual([]);
  expect(targets("<https://x.com/[a]>")).toEqual([]);
  expect(targets("> - [x] done")).toEqual([]);
});

test("definitions after a setext underline, a thematic break or in a new quote", () => {
  const targets = (body: string) => extractLinks(body).map((l) => l.target);
  expect(targets("Title\n---\n[1]: /a.md\n\n[z][1]")).toEqual(["/a.md"]);
  expect(targets("[q][1]\n\ntext\n> [1]: /q.md")).toEqual(["/q.md"]);
});

test("balanced parentheses in a destination and linked images", () => {
  const targets = (body: string) => extractLinks(body).map((l) => l.target);
  expect(targets("[a](./guide_(v2).md)")).toEqual(["./guide_(v2).md"]);
  expect(targets("[![b](i.svg)](/doc.md)")).toEqual(["/doc.md"]);
});

test("links inside unresolved brackets are read", () => {
  const targets = (body: string) => extractLinks(body).map((l) => l.target);
  expect(targets("[Note: see [spec](/spec.md)]")).toEqual(["/spec.md"]);
  expect(targets("[TODO: [req][1] first]\n\n[1]: /r.md")).toEqual(["/r.md"]);
});

test("angle-bracket URLs, '<' inside a target, escapes and comments", () => {
  const targets = (body: string) => extractLinks(body).map((l) => l.target);
  expect(targets("[spec](<https://example.com>)")).toEqual([
    "https://example.com",
  ]);
  expect(targets("[a](x<y.md)")).toEqual(["x<y.md"]);
  expect(targets("See \\[1] here\n\n[1]: /a.md")).toEqual([]);
  expect(targets("<!-- [z][1] -->\n\n[1]: /gone.md")).toEqual([]);
});

test("definition edge cases", () => {
  const targets = (body: string) => extractLinks(body).map((l) => l.target);
  expect(targets('[x][b]\n\n[a]: /a.md\n  "Title"\n[b]: /b.md')).toEqual([
    "/b.md",
  ]);
  expect(targets("para\n- - -\n[1]: /a.md\n\n[z][1]")).toEqual(["/a.md"]);
  expect(targets("[z][1]\n\n[1]: <foo")).toEqual([]);
  expect(targets("[x][a]\n\n[a]: <>\n[a]: /gone.md")).toEqual([]);
});

test("a link inside link text, and escapes", () => {
  const targets = (body: string) => extractLinks(body).map((l) => l.target);
  expect(targets("[a [b](/b.md) c](/c.md)")).toEqual(["/b.md"]);
  expect(targets("[a [b][1] c](/c.md)\n\n[1]: /b.md")).toEqual(["/b.md"]);
  expect(targets("[a [b] c](/c.md)")).toEqual(["/c.md"]);
  expect(targets("\\\\[a](gone.md)")).toEqual(["gone.md"]);
  expect(targets("\\![a](/gone.md)")).toEqual(["/gone.md"]);
});

test("titles on the next line and quote boundaries", () => {
  const targets = (body: string) => extractLinks(body).map((l) => l.target);
  expect(targets('[z][2]\n\n[1]:\n  /a.md\n  "Title"\n[2]: /b.md')).toEqual([
    "/b.md",
  ]);
  expect(targets('[z][2]\n\n[1]: <my (v2).md>\n  "T"\n[2]: /b.md')).toEqual([
    "/b.md",
  ]);
  expect(targets('[1]: /a.md\n> "See [b](/missing.md)"')).toEqual([
    "/missing.md",
  ]);
  expect(targets("[TODO]:\n> [spec](/missing.md)")).toEqual(["/missing.md"]);
  expect(targets("> text\n> > [1]: /a.md\n\n[z][1]")).toEqual(["/a.md"]);
  expect(targets("[s][1]\n\n<!-- links -->\n[1]: /m.md")).toEqual(["/m.md"]);
});

test("only a bracket that resolves to a link makes the outer text plain", () => {
  const targets = (body: string) => extractLinks(body).map((l) => l.target);
  expect(targets("[a [b][] c](/c.md)")).toEqual(["/c.md"]);
  expect(targets("[See matrix[0][1]](/matrix.md)")).toEqual(["/matrix.md"]);
  expect(targets("[a [b] c](/c.md)\n\n[b]: /b.md")).toEqual(["/b.md"]);
});

test("labels fold case and keep ideographic spaces", () => {
  const targets = (body: string) => extractLinks(body).map((l) => l.target);
  expect(targets("[Straße][]\n\n[STRASSE]: /s.md")).toEqual(["/s.md"]);
  expect(targets("[要件　A][]\n\n[要件 A]: /a.md")).toEqual([]);
});

test("a definition after the end of a multi-line comment", () => {
  const body = "[s][1]\n\n<!--\nnote\n-->\n[1]: /m.md";
  expect(extractLinks(body).map((l) => l.target)).toEqual(["/m.md"]);
});
