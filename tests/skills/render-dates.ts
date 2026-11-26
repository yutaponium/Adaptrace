// Replaces date placeholders in the Markdown files under a directory:
// {{D+4}} becomes the date 4 days after the base day (YYYY-MM-DD), and
// {{T-2}} the datetime 2 days before it at 10:00 in +09:00. The test is
// about what is overdue or due soon, so its dates follow the day it runs.
// Usage: bun render-dates.ts <dir> [base day YYYY-MM-DD, default today]
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, baseArg] = process.argv.slice(2);
if (dir === undefined) {
  console.error("usage: bun render-dates.ts <dir> [YYYY-MM-DD]");
  process.exit(2);
}
// The base day in +09:00, as the documents' dates are.
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const base = baseArg ?? today;
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(base) ||
  Number.isNaN(new Date(`${base}T00:00:00Z`).getTime())
) {
  console.error(`not a day: ${base} (YYYY-MM-DD)`);
  process.exit(2);
}
const day = (offset: number) => {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

function walk(path: string): string[] {
  return statSync(path).isDirectory()
    ? readdirSync(path).flatMap((n) => walk(join(path, n)))
    : path.endsWith(".md")
      ? [path]
      : [];
}

for (const file of walk(dir)) {
  const text = readFileSync(file, "utf8");
  const out = text.replace(/\{\{([DT])([-+]\d+)\}\}/g, (_, kind, n) =>
    kind === "D" ? day(Number(n)) : `${day(Number(n))}T10:00:00+09:00`,
  );
  if (out !== text) writeFileSync(file, out);
}
