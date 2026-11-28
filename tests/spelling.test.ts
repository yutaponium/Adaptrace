import { expect, test } from "bun:test";
import { loadBundle } from "../src/bundle";
import { editDistance, suggestKey, suggestType } from "../src/spelling";
import { validate } from "../src/validate";

test("misspelled dependency keys and types are warned with the meant name", async () => {
  const issues = validate(await loadBundle("tests/fixtures/spelling"));
  const found = issues.map(
    (i) => `${i.severity} ${i.code} ${i.file}:${i.line} ${i.message}`,
  );
  expect(found).toEqual([
    "warning type-spelling decisions/auth.md:2 type 'Decison' looks like 'Decision'; as written, it is a different type",
    "warning type-spelling tasks/login.md:2 type 'Tasks' looks like 'Task'; as written, it is a different type",
    "warning key-spelling tasks/login.md:4 key 'dependsOn' looks like 'depends_on'; as written, it is not read as a dependency",
    "warning key-spelling tasks/login.md:5 key 'derived-from' looks like 'derived_from'; as written, it is not read as a dependency",
    "warning key-spelling tasks/login.md:7 key 'blocked_by' is not read as a dependency. Adaptrace records this relation on the other document: write 'blocks' there, or 'depends_on' here",
    "warning key-spelling tasks/login.md:8 key 'recieved_at' looks like 'received_at'; as written, Adaptrace does not read it",
    "warning key-spelling tasks/other.md:4 key 'dependencies' looks like 'depends_on'; as written, it is not read as a dependency",
    "warning key-spelling tasks/other.md:5 key 'superseded_by' is not read as a dependency. Adaptrace records this relation on the other document: write 'supersedes' there",
    "warning key-spelling tasks/other.md:8 key 'satisifes' looks like 'satisfies'; as written, it is not read as a dependency",
  ]);
});

test("suggestKey: known and unrelated keys pass, near misses name the key", () => {
  for (const key of [
    "depends_on",
    "state",
    "status",
    "owner",
    "due",
    "impact",
    "probability",
    "backlog",
    "size",
    "rule",
    "assignee",
    "changelog",
    "constructor",
    "Constructor",
    "toString",
    "requested_at",
    "received_by",
    "changed",
    "channel",
    "change_id",
    "chances",
    "Charges",
    "stages",
    "description_en",
    "verified_by",
    "generated_by",
    "title_en",
  ]) {
    expect(suggestKey(key)).toBeNull();
  }
  expect(suggestKey("depend_on")?.key).toBe("depends_on");
  expect(suggestKey("dpeends_on")?.key).toBe("depends_on");
  expect(suggestKey("Depends-On")?.key).toBe("depends_on");
  expect(suggestKey("satisfy")?.key).toBe("satisfies");
  expect(suggestKey("satisifes")?.key).toBe("satisfies");
  expect(suggestKey("block")?.key).toBe("blocks");
  expect(suggestKey("change")?.key).toBe("changes");
  expect(suggestKey("supercedes")?.key).toBe("supersedes");
  expect(suggestKey("tag")).toEqual({
    key: "tags",
    dependency: false,
    reverse: false,
  });
  expect(suggestKey("requestedBy")?.key).toBe("requested_by");
  expect(suggestKey("depend")?.key).toBe("depends_on");
  expect(suggestKey("derived")?.key).toBe("derived_from");
  expect(suggestKey("states")?.key).toBe("state");
  expect(suggestKey("stated")?.key).toBe("state");
  expect(suggestKey("depends_to")?.key).toBe("depends_on");
  expect(suggestKey("blocking")).toEqual({
    key: "blocks",
    dependency: true,
    reverse: false,
  });
  expect(suggestKey("superseded")).toEqual({
    key: "supersedes",
    dependency: true,
    reverse: true,
  });
  expect(suggestKey("satisfied")?.reverse).toBe(true);
  expect(suggestKey("roles")?.key).toBe("role");
  expect(suggestKey("backlogs")?.key).toBe("backlog");
  expect(suggestKey("statue")?.key).toBe("state");
  expect(suggestKey("backlgo")?.key).toBe("backlog");
  expect(suggestKey("satisifes")?.key).toBe("satisfies");
  for (const [key, meant] of [
    ["satisfiers", "satisfies"],
    ["blocks_by", "blocks"],
    ["depends_on_by", "depends_on"],
    ["depended_on", "depends_on"],
  ] as const) {
    expect(suggestKey(key)).toEqual({
      key: meant,
      dependency: true,
      reverse: true,
    });
  }
  for (const key of [
    "blocked",
    "blocker",
    "blockers",
    "blocked_on",
    "blocks_on",
  ]) {
    expect(suggestKey(key)).toEqual({
      key: "blocks",
      dependency: true,
      reverse: true,
    });
  }
  expect(suggestKey("satisfied_by")).toEqual({
    key: "satisfies",
    dependency: true,
    reverse: true,
  });
});

test("suggestType: listed and distant types pass, near misses name the type", () => {
  for (const type of [
    "Task",
    "Change Request",
    "Test",
    "Plan",
    "Stakeholder",
    "Ask",
    "Disk",
    "Revision",
    "Division",
    "Precision",
    "Melting",
    "Retirement",
  ]) {
    expect(suggestType(type)).toBeNull();
  }
  expect(suggestType("task")).toBe("Task");
  expect(suggestType("change-request")).toBe("Change Request");
  expect(suggestType("ChangeRequest")).toBe("Change Request");
  expect(suggestType("Requirment")).toBe("Requirement");
  expect(suggestType("Desicion")).toBe("Decision");
  expect(suggestType("Meetings")).toBe("Meeting");
  expect(suggestType("Tsak")).toBe("Task");
  expect(suggestType("Taask")).toBe("Task");
});

test("editDistance counts an adjacent swap as one edit", () => {
  expect(editDistance("depends", "dpeends")).toBe(1);
  expect(editDistance("", "abc")).toBe(3);
  expect(editDistance("kitten", "sitting")).toBe(3);
});
