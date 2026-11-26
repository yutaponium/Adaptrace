import { expect, test } from "bun:test";
import { licenses, packageDir } from "../scripts/licenses";

test("finds the package directory of a bundled input", () => {
  expect(packageDir("node_modules/zod/v4/core/core.js")).toBe(
    "node_modules/zod",
  );
  expect(packageDir("node_modules/@scope/name/dist/x.js")).toBe(
    "node_modules/@scope/name",
  );
  expect(packageDir("node_modules/a/node_modules/b/index.js")).toBe(
    "node_modules/a/node_modules/b",
  );
  expect(packageDir("node_modules\\zod\\index.js")).toBe("node_modules/zod");
  expect(packageDir("src/cli.ts")).toBeNull();
});

test("lists each bundled package once with its license text", async () => {
  const text = await licenses(
    [
      "src/cli.ts",
      "node_modules/zod/index.js",
      "node_modules/zod/v4/core/core.js",
    ],
    "Bun itself is MIT-licensed.",
  );
  expect(text.match(/^## zod@/gm)?.length).toBe(1);
  expect(text).toContain("(MIT)");
  expect(text).toContain("Permission is hereby granted");
  expect(text).toContain("## Bun");
  expect(text).toContain("Bun itself is MIT-licensed.");
});

test("fails when no bundled package is found", async () => {
  expect(licenses(["src/cli.ts"], "")).rejects.toThrow(
    "no bundled packages found",
  );
});
