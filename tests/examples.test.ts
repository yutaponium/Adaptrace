import { expect, test } from "bun:test";
import { loadBundle } from "../src/bundle";
import { buildGraph } from "../src/graph";
import { DEPENDENCY_KEYS } from "../src/schema";
import { validate } from "../src/validate";

const ROOT = "examples/pmbok";

test("the PMBOK templates have no issues", async () => {
  for (const kind of ["minimal", "standard"]) {
    expect(validate(await loadBundle(`${ROOT}/${kind}`))).toEqual([]);
  }
});

test("the minimal template is a part of the standard one", async () => {
  const minimal = await loadBundle(`${ROOT}/minimal`);
  const standard = await loadBundle(`${ROOT}/standard`);
  for (const [path, concept] of minimal.concepts) {
    const same = standard.concepts.get(path);
    expect(same, path).toBeDefined();
    expect(same?.frontmatter.type, path).toBe(concept.frontmatter.type);
    expect(same?.frontmatter.title, path).toBe(concept.frontmatter.title);
  }
  // Every document but two depends on something through a key a change
  // travels along, so a change reaches it: the root of the plan, and the
  // change request, which is linked only once it is approved.
  for (const [bundle, root] of [
    [minimal, "initiating/project-charter.md"],
    [standard, "initiating/business-case.md"],
  ] as const) {
    const graph = buildGraph(bundle);
    const free = [...bundle.concepts.keys()].filter(
      (p) =>
        !graph.edges.some(
          (e) =>
            e.from === p &&
            e.kind !== "references" &&
            DEPENDENCY_KEYS[e.kind].propagates,
        ),
    );
    expect(free.sort()).toEqual(["change-requests/cr-001.md", root].sort());
  }
});
