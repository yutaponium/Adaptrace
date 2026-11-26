// Marks the last line of a text without a final newline, so that a change to
// the final newline is a changed line, shown with "\ No newline at end of
// file" as diff and patch expect.
const NO_NEWLINE = "\u0000no-newline";

function toLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  else lines[lines.length - 1] += NO_NEWLINE;
  return lines;
}

// A unified diff of two texts, line by line, for showing proposed changes.
// Documents are small, so a plain LCS table is enough.
export function unifiedDiff(
  before: string,
  after: string,
  path: string,
  context = 3,
): string {
  if (before === after) return "";
  const a = toLines(before);
  const b = toLines(after);
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lcs[i] as number[];
      row[j] =
        a[i] === b[j]
          ? (lcs[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(lcs[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  type Op = { kind: " " | "-" | "+"; line: string; ai: number; bi: number };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: " ", line: a[i] ?? "", ai: i++, bi: j++ });
    } else if (
      i < a.length &&
      (j >= b.length || (lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0))
    ) {
      ops.push({ kind: "-", line: a[i] ?? "", ai: i++, bi: j });
    } else {
      ops.push({ kind: "+", line: b[j] ?? "", ai: i, bi: j++ });
    }
  }
  const lines = [
    `--- ${before === "" ? "/dev/null" : `a/${path}`}`,
    `+++ b/${path}`,
  ];
  let k = 0;
  while (k < ops.length) {
    if (ops[k]?.kind === " ") {
      k++;
      continue;
    }
    // A hunk: changes plus up to `context` unchanged lines around them,
    // merging changes that are closer than 2 * context lines.
    const start = Math.max(0, k - context);
    let end = k;
    let quiet = 0;
    for (let m = k; m < ops.length; m++) {
      if (ops[m]?.kind === " ") {
        quiet++;
        if (quiet > context * 2) break;
      } else {
        quiet = 0;
        end = m;
      }
    }
    const stop = Math.min(ops.length, end + context + 1);
    const hunk = ops.slice(start, stop);
    const first = hunk[0];
    const aCount = hunk.filter((o) => o.kind !== "+").length;
    const bCount = hunk.filter((o) => o.kind !== "-").length;
    const aStart = first ? first.ai + (aCount > 0 ? 1 : 0) : 0;
    const bStart = first ? first.bi + (bCount > 0 ? 1 : 0) : 0;
    lines.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@`);
    for (const o of hunk) {
      if (o.line.endsWith(NO_NEWLINE)) {
        lines.push(`${o.kind}${o.line.slice(0, -NO_NEWLINE.length)}`);
        lines.push("\\ No newline at end of file");
      } else {
        lines.push(`${o.kind}${o.line}`);
      }
    }
    k = stop;
  }
  return `${lines.join("\n")}\n`;
}
