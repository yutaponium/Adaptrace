import { expect, test } from "bun:test";
import { editFrontmatter, parseDocument } from "../src/frontmatter";

test("splits frontmatter and body", () => {
  const doc = parseDocument("---\ntype: Task\n---\n\n# Body\n");
  expect(doc).toEqual({
    ok: true,
    frontmatter: { type: "Task" },
    body: "\n# Body\n",
    bodyLine: 4,
  });
});

test("a file without frontmatter has null frontmatter", () => {
  const doc = parseDocument("# Title\n");
  expect(doc.ok && doc.frontmatter).toBeNull();
});

test("keeps datetimes as strings", () => {
  const doc = parseDocument(
    "---\ngenerated: { by: human:a, at: 2026-10-29T00:00:00Z }\n---\n",
  );
  expect(doc.ok && doc.frontmatter?.generated).toEqual({
    by: "human:a",
    at: "2026-10-29T00:00:00Z",
  });
});

test("reports unclosed frontmatter, invalid YAML and non-mappings", () => {
  expect(parseDocument("---\ntype: Task\n").ok).toBe(false);
  expect(parseDocument("---\ntype: [x\n---\n").ok).toBe(false);
  expect(parseDocument("---\n- a\n- b\n---\n").ok).toBe(false);
});

function fm(text: string) {
  const doc = parseDocument(text);
  return doc.ok ? doc.frontmatter : doc.error;
}

test("editFrontmatter keeps CRLF line endings and a BOM", () => {
  const crlf = editFrontmatter(
    "---\r\ntype: Task\r\ntitle: A\r\n---\r\n\r\nBody\r\n",
    { state: "done" },
  );
  expect(crlf).toBe(
    "---\r\ntype: Task\r\ntitle: A\r\nstate: done\r\n---\r\n\r\nBody\r\n",
  );
  const bom = editFrontmatter("﻿---\ntype: Task\n---\nBody\n", {
    state: "done",
  });
  expect(bom.startsWith("﻿---\ntype: Task\nstate: done\n---")).toBe(true);
});

test("editFrontmatter replaces a whole list, even unindented items with colons", () => {
  const text = editFrontmatter(
    "---\ntype: Task\ndepends_on:\n- https://x.example/a\n- b.md\n---\n",
    { depends_on: ["c.md"] },
  );
  expect(fm(text)).toEqual({ type: "Task", depends_on: ["c.md"] });
});

test("editFrontmatter keeps comments and blank lines when removing a key", () => {
  const text = editFrontmatter(
    "---\ntype: Task\ntimestamp: 2025-01-01\n# Dependencies\n\ndepends_on: [a.md]\n---\n",
    {},
    ["timestamp"],
  );
  expect(text).toBe(
    "---\ntype: Task\n# Dependencies\n\ndepends_on: [a.md]\n---\n",
  );
});

test("editFrontmatter treats a block scalar with blank lines as one value", () => {
  const text = editFrontmatter(
    "---\ntype: Task\nnote: |\n  one\n\n  two\ntitle: T\n---\n",
    { note: "x" },
  );
  expect(fm(text)).toEqual({ type: "Task", note: "x", title: "T" });
});

test("editFrontmatter replaces the body after the real closing delimiter", () => {
  const text = editFrontmatter(
    "---\ntype: Task\nnote: |\n  ----\n---\n\nOld\n",
    {},
    [],
    "New body.",
  );
  expect(text).toBe("---\ntype: Task\nnote: |\n  ----\n---\n\nNew body.\n");
});

test("editFrontmatter keeps a one-line mapping on one line", () => {
  const text =
    "---\ntype: Task\ngenerated: { by: human:x, at: 2026-10-01T00:00:00+09:00 }\n---\n\nBody\n";
  const out = editFrontmatter(text, {
    generated: { by: "a: b, c", at: "2026-10-29T00:00:00Z" },
  });
  expect(out).toContain(
    'generated: { by: "a: b, c", at: 2026-10-29T00:00:00Z }\n',
  );
  const parsed = parseDocument(out);
  expect(parsed.ok && parsed.frontmatter?.generated).toEqual({
    by: "a: b, c",
    at: "2026-10-29T00:00:00Z",
  });
  // Nested values fall back to the block style.
  expect(editFrontmatter(text, { generated: { by: ["x"] } })).toContain(
    "generated:\n  by:\n    - x\n",
  );
});
