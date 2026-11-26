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
