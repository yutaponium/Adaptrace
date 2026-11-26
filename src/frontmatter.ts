export type Frontmatter = Record<string, unknown>;

export type ParsedDocument =
  | {
      ok: true;
      frontmatter: Frontmatter | null;
      body: string;
      bodyLine: number;
    }
  | { ok: false; error: string };

export const DELIMITER = /^---[ \t]*$/;

// Splits a markdown file into YAML frontmatter and body. `frontmatter` is
// null when the file has no frontmatter block. `bodyLine` is the 1-based line
// number where the body starts, for error locations.
export function parseDocument(text: string): ParsedDocument {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (!DELIMITER.test(lines[0] ?? "")) {
    return { ok: true, frontmatter: null, body: lines.join("\n"), bodyLine: 1 };
  }
  const end = lines.findIndex((line, i) => i > 0 && DELIMITER.test(line));
  if (end === -1) {
    return { ok: false, error: "frontmatter is not closed with '---'" };
  }
  const yaml = lines.slice(1, end).join("\n");
  let value: unknown;
  try {
    value = yaml.trim() === "" ? {} : Bun.YAML.parse(yaml);
  } catch (e) {
    return {
      ok: false,
      error: `frontmatter is not valid YAML: ${(e as Error).message}`,
    };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "frontmatter must be a YAML mapping" };
  }
  return {
    ok: true,
    frontmatter: value as Frontmatter,
    body: lines.slice(end + 1).join("\n"),
    bodyLine: end + 2,
  };
}

// A whole document: YAML frontmatter, then the body.
export function serializeDocument(
  frontmatter: Frontmatter,
  body: string,
): string {
  const yaml = Bun.YAML.stringify(frontmatter, null, 2).replace(/\n*$/, "\n");
  const text = body.startsWith("\n") ? body : `\n${body}`;
  return `---\n${yaml}---\n${text.replace(/\n*$/, "\n")}`;
}

// Sets and removes top-level frontmatter keys in a document's text, leaving
// every other line as it was (comments, blank lines, line endings, a BOM),
// so a proposed change shows a small diff. `body`, when given, replaces the
// body after the frontmatter.
export function editFrontmatter(
  text: string,
  set: Record<string, unknown>,
  unset: string[] = [],
  body?: string,
): string {
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const raw = text.slice(bom.length);
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const withBody = (head: string[], rest: string[]) => {
    const tail =
      body === undefined
        ? rest
        : ["", ...body.replace(/^\n+/, "").replace(/\n*$/, "").split("\n"), ""];
    return bom + [...head, ...tail].join(eol);
  };
  if (!DELIMITER.test(lines[0] ?? "")) {
    const doc = serializeDocument(set, body ?? raw).replace(/\n/g, eol);
    return bom + doc;
  }
  const end = lines.findIndex((line, i) => i > 0 && DELIMITER.test(line));
  if (end === -1) return text;
  // A top-level key owns its line and the indented or "- " list lines below
  // it. Comments and blank lines are their own blocks, so they are kept.
  const blocks: { key: string | null; lines: string[] }[] = [];
  for (const line of lines.slice(1, end)) {
    if (/^(\s+\S|-(\s|$))/.test(line)) {
      // A continuation line belongs to the last key, together with any blank
      // lines since it (blank lines inside a block scalar).
      let k = blocks.length - 1;
      while (
        k >= 0 &&
        blocks[k]?.key === null &&
        blocks[k]?.lines.every((l) => l.trim() === "")
      ) {
        k--;
      }
      const owner = blocks[k];
      if (owner !== undefined && owner.key !== null) {
        for (const b of blocks.splice(k + 1)) owner.lines.push(...b.lines);
        owner.lines.push(line);
      } else {
        blocks.push({ key: null, lines: [line] });
      }
      continue;
    }
    const key = /^([^\s#'"-][^:]*):/.exec(line)?.[1]?.trim() ?? null;
    blocks.push({ key, lines: [line] });
  }
  const render = (key: string, value: unknown) =>
    Bun.YAML.stringify({ [key]: value }, null, 2)
      .replace(/\n+$/, "")
      .split("\n");
  const remaining = new Map(Object.entries(set));
  const out: string[] = [];
  for (const block of blocks) {
    if (block.key !== null && unset.includes(block.key)) continue;
    if (block.key !== null && remaining.has(block.key)) {
      const value = remaining.get(block.key);
      // generated and verified are always written as `{ by, at }` lines.
      const flow =
        block.key === "generated" ||
        block.key === "verified" ||
        (block.lines.length === 1 &&
          new RegExp(`^${escapeRegExp(block.key)}:\\s*\\{`).test(
            block.lines[0] ?? "",
          ));
      out.push(
        ...(flow
          ? (renderFlow(block.key, value) ?? render(block.key, value))
          : render(block.key, value)),
      );
      remaining.delete(block.key);
    } else {
      out.push(...block.lines);
    }
  }
  // A new generated or verified is written on one line, `{ by, at }`, as the
  // spec and the guides write them.
  for (const [key, value] of remaining) {
    out.push(
      ...(key === "generated" || key === "verified"
        ? (renderFlow(key, value) ?? render(key, value))
        : render(key, value)),
    );
  }
  return withBody(
    [lines[0] ?? "---", ...out, lines[end] ?? "---"],
    lines.slice(end + 1),
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// `key: { a: 1, b: x }` on one line, for a mapping of scalars that was
// written that way, so the diff stays one line. Null for anything else.
function renderFlow(key: string, value: unknown): string[] | null {
  // A list of flat mappings, one `- { ... }` line each.
  if (Array.isArray(value)) {
    const items = value.map((v) => renderFlow("x", v)?.[0]?.slice(3));
    if (items.length === 0 || items.some((i) => i === undefined)) return null;
    const lines = [`${key}:`, ...items.map((i) => `  - ${i}`)];
    try {
      const back = Bun.YAML.parse(lines.join("\n")) as Record<string, unknown>;
      if (JSON.stringify(back[key]) !== JSON.stringify(value)) return null;
    } catch {
      return null;
    }
    return lines;
  }
  if (value === null || typeof value !== "object") return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(value)) {
    if (v !== null && typeof v === "object") return null;
    const pair = Bun.YAML.stringify({ [k]: v }, null, 2).replace(/\n+$/, "");
    if (pair.includes("\n")) return null;
    parts.push(pair);
  }
  const line = `${key}: { ${parts.join(", ")} }`;
  // Only if it reads back as the same value.
  try {
    const back = Bun.YAML.parse(line) as Record<string, unknown>;
    if (JSON.stringify(back[key]) !== JSON.stringify(value)) return null;
  } catch {
    return null;
  }
  return [line];
}

// Records a review that needed no change (ADR-020): adds `stamp` to
// verified, after any earlier entries, without touching the other lines, so
// comments stay. A `verified: { ... }` line becomes a list of it and the new
// entry; an indented block list gets one more `- { by, at }` line; other
// layouts are rewritten. Null when the result would not read back as the
// earlier entries and the new one (a quoted key, for instance), so nothing
// is lost silently.
export function addVerified(
  text: string,
  stamp: { by: string; at: string },
): string | null {
  const entry = renderFlow("x", stamp)?.[0]?.slice(3);
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const raw = text.slice(bom.length);
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const end = lines.findIndex((l, i) => i > 0 && DELIMITER.test(l));
  const at = lines.findIndex(
    (l, i) => i > 0 && i < end && /^verified\s*:/.test(l),
  );
  const parsed = parseDocument(text);
  // Frontmatter that cannot be read: what is in verified is not known, so
  // nothing can be added without risking it.
  if (!parsed.ok) return null;
  const earlier =
    parsed.frontmatter !== null ? parsed.frontmatter.verified : undefined;
  const want =
    earlier === undefined || earlier === null
      ? stamp
      : [...(Array.isArray(earlier) ? earlier : [earlier]), stamp];
  const checked = (result: string): string | null => {
    // One verified key only, however it is quoted, in the frontmatter (the
    // body may show one as an example).
    const all = result.replace(/^\uFEFF/, "").split(/\r?\n/);
    const close = all.findIndex((l, i) => i > 0 && DELIMITER.test(l));
    const keys = all
      .slice(1, close === -1 ? all.length : close)
      .filter((l) => /^(["']?)verified\1\s*:/.test(l)).length;
    if (keys !== 1) return null;
    const back = parseDocument(result);
    return back.ok &&
      JSON.stringify(back.frontmatter?.verified) === JSON.stringify(want)
      ? result
      : null;
  };
  const rewrite = () => checked(editFrontmatter(text, { verified: want }));
  if (entry === undefined || !DELIMITER.test(lines[0] ?? "") || end === -1) {
    return rewrite();
  }
  // Not found as a plain key: new, or written some other way (rewrite and
  // check that nothing was lost).
  if (at === -1) return rewrite();
  const line = lines[at] ?? "";
  const rest = line.replace(/^verified\s*:\s*/, "");
  let next: string[] | null = null;
  if (rest.startsWith("{") && earlier !== null && !Array.isArray(earlier)) {
    // One mapping on the line (perhaps with a comment): make it a list.
    next = [
      ...lines.slice(0, at),
      "verified:",
      `  - ${rest}`,
      `  - ${entry}`,
      ...lines.slice(at + 1),
    ];
  } else if (/^(#.*)?$/.test(rest) && Array.isArray(earlier)) {
    // A block list: add after its last line. A comment at column 0 belongs
    // to what follows, not to the list.
    let last = at;
    // Items may start at column 0 ("- "), or be indented.
    while (last + 1 < end && /^(\s+\S|\s*$|-\s)/.test(lines[last + 1] ?? "")) {
      last++;
    }
    while (last > at && /^\s*$/.test(lines[last] ?? "")) last--;
    // As far in as the list's first item.
    const indent =
      lines
        .slice(at + 1, last + 1)
        .find((l) => /^\s*-\s/.test(l))
        ?.match(/^\s*/)?.[0] ?? "  ";
    next = [
      ...lines.slice(0, last + 1),
      `${indent}- ${entry}`,
      ...lines.slice(last + 1),
    ];
  }
  return (next === null ? null : checked(bom + next.join(eol))) ?? rewrite();
}
