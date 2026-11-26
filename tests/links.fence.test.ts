import { expect, test } from "bun:test";
import { unifiedDiff } from "../src/diff";
import { extractLinks, forEachProseLine } from "../src/links";

test("a fence closes only with the same character and enough length", () => {
  const body = [
    "````markdown",
    "~~~",
    "```",
    "[inside](/a.md)",
    "````",
    "[outside](/b.md)",
  ].join("\n");
  expect(extractLinks(body).map((l) => l.target)).toEqual(["/b.md"]);
  const prose: string[] = [];
  forEachProseLine("~~~\n## x\n```\n~~~\n## y", (line) => prose.push(line));
  expect(prose).toEqual(["## y"]);
});

test("unifiedDiff shows a change to the final newline", () => {
  const diff = unifiedDiff("a\nb", "a\nb\n", "f.md");
  expect(diff).toContain("-b\n\\ No newline at end of file\n+b\n");
  expect(unifiedDiff("same\n", "same\n", "f.md")).toBe("");
});
