import { posix } from "node:path";

export interface BodyLink {
  target: string;
  line: number;
}

// An opening fence: up to 3 spaces, then 3+ backticks or tildes.
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /`[^`]*`/g;
// A link destination: <...> (may contain spaces), or a run without spaces
// that does not start with "<" and may hold balanced parentheses one level
// deep.
const DEST = String.raw`(?:<([^<>\n]*)>|((?!<)(?:[^\s()]|\([^\s()]*\))+))`;
const TITLE = String.raw`(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?`;
// Link text may hold one level of brackets, as in a linked image [![b](i)](t).
const TEXT = String.raw`\[((?:[^\[\]]|\[[^\[\]]*\])*)\]`;
// One bracketed span, optionally followed by an inline destination (possibly
// empty) or a second bracketed label. Images ("!" first) are matched to skip
// them.
const LINK = new RegExp(
  String.raw`(!?)${TEXT}(?:(\(\s*(?:${DEST}${TITLE}\s*)?\))|(\[([^\[\]]*)\]))?`,
  "g",
);
// A link reference definition: [label]: target "title". The target may be on
// the next line, alone or with a title. Blockquote markers before it are
// allowed.
const QUOTE = /^ {0,3}(?:> ?)+/;
const DEFINITION = new RegExp(
  String.raw`^ {0,3}\[([^\]]+)\]:(?:\s*${DEST}(${TITLE}))?\s*$`,
);
const NEXT_LINE_DEST = new RegExp(String.raw`^\s*${DEST}(${TITLE})\s*$`);
const NEXT_LINE_TITLE = /^\s*(?:"[^"]*"|'[^']*'|\([^)]*\))\s*$/;
// A line after which a new block starts: blank, an ATX heading, a setext
// underline, a thematic break, or an HTML comment or the end of one.
const BLOCK_END =
  /^(?:|#{1,6}(?:\s.*)?|=+|-+|(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,}|<!--.*-->|.*-->)$/;
const TASK_BOX = /^\s*(?:[-*+]|\d+[.)])\s+$/;
// Autolinks (<https://...>) are not link text; an inline destination in
// angle brackets ("](<https://...>)") is not an autolink.
const AUTOLINK = /(?<!\]\(\s*)<[a-z][a-z0-9+.-]*:[^\s<>]*>/gi;
// An HTML comment on one line.
const COMMENT = /<!--.*?-->/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Calls `visit` for each body line outside fenced code blocks. A fence closes
// only with the same character, at least as long as the one that opened it.
export function forEachProseLine(
  body: string,
  visit: (line: string, index: number) => void,
) {
  let open: string | null = null;
  body.split("\n").forEach((line, i) => {
    const fence = FENCE.exec(line)?.[1];
    if (open === null) {
      if (fence !== undefined) open = fence;
      else visit(line, i);
    } else if (
      fence !== undefined &&
      fence[0] === open[0] &&
      fence.length >= open.length &&
      line.trim() === fence
    ) {
      open = null;
    }
  });
}

// Matches reference labels case-insensitively (close to Unicode case folding:
// "Straße" matches "STRASSE"), treating runs of spaces, tabs and newlines as
// one space. Other whitespace, such as an ideographic space, is kept.
function normalizeLabel(label: string): string {
  return label
    .replace(/^[ \t\n]+|[ \t\n]+$/g, "")
    .replace(/[ \t\n]+/g, " ")
    .toLowerCase()
    .toUpperCase();
}

// Replaces inline code, autolinks and comments with spaces of the same length,
// so that links inside them are not read but positions in the line stay the
// same.
function mask(line: string): string {
  const blank = (code: string) => " ".repeat(code.length);
  return line
    .replace(INLINE_CODE, blank)
    .replace(COMMENT, blank)
    .replace(AUTOLINK, blank);
}

// The number of blockquote markers (">") that start a line.
function quoteDepth(raw: string): number {
  return (QUOTE.exec(raw)?.[0].match(/>/g) ?? []).length;
}

// Whether the character at `at` is escaped by an odd number of backslashes.
function escaped(line: string, at: number): boolean {
  let count = 0;
  for (let i = at - 1; i >= 0 && line[i] === "\\"; i--) count++;
  return count % 2 === 1;
}

interface ProseLine {
  raw: string;
  index: number;
}

// Link reference definitions, by normalized label. A definition starts a block
// (it cannot interrupt a paragraph), and the first one for a label wins.
// Footnote definitions ("[^1]: ...") are not link definitions.
function readDefinitions(lines: ProseLine[]) {
  const definitions = new Map<string, string>();
  const used = new Set<number>();
  let blockStart = true;
  let depth = 0;
  // The text of line n + k without its quote markers, when it directly follows
  // and has the same quote depth; a definition does not cross a quote boundary.
  const follow = (n: number, k: number) => {
    const from = lines[n] as ProseLine;
    const to = lines[n + k];
    if (to === undefined || to.index !== from.index + k) return undefined;
    if (quoteDepth(to.raw) !== quoteDepth(from.raw)) return undefined;
    return to.raw.replace(QUOTE, "");
  };
  for (let n = 0; n < lines.length; n++) {
    const { raw, index } = lines[n] as ProseLine;
    const prev = lines[n - 1];
    const line = raw.replace(QUOTE, "");
    if (prev !== undefined && prev.index !== index - 1) blockStart = true;
    // A deeper quote starts a new block, even inside a paragraph.
    if (quoteDepth(raw) > depth) blockStart = true;
    depth = quoteDepth(raw);
    const def = blockStart ? DEFINITION.exec(line) : null;
    const label = def ? normalizeLabel(def[1] ?? "") : "";
    if (def && label && !label.startsWith("^")) {
      let target = def[2] ?? def[3];
      let title = def[4];
      let taken = 0;
      if (target === undefined) {
        // "[label]:" alone is a definition only when the next line holds just
        // the destination (and an optional title).
        const next = follow(n, 1);
        const dest = next === undefined ? null : NEXT_LINE_DEST.exec(next);
        if (dest) {
          target = dest[1] ?? dest[2];
          title = dest[3];
          taken = 1;
        }
      }
      if (target !== undefined) {
        // Without a title, the title may be on the following line.
        const after = title ? undefined : follow(n, taken + 1);
        if (after !== undefined && NEXT_LINE_TITLE.test(after)) taken++;
        for (let k = 0; k <= taken; k++) used.add(index + k);
        n += taken;
        if (!definitions.has(label)) definitions.set(label, target);
        continue;
      }
    }
    blockStart = BLOCK_END.test(line.trim());
  }
  return { definitions, used };
}

interface Resolved {
  // The target, if the span is a link (or an image) with a known target.
  target?: string;
  // Whether the span is an inline link or image, "[text](target)".
  inline: boolean;
  // Where the link text starts.
  textStart: number;
  // Whether the span is an image.
  image: boolean;
}

// Resolves one LINK match in `line` (with inline code masked), reading labels
// from `raw`.
function resolveMatch(
  m: RegExpExecArray,
  raw: string,
  line: string,
  lookup: (label: string) => string | undefined,
): Resolved {
  const [whole, mark = "", masked = "", inline, angle, bare, second] = m;
  const start = m.index;
  const textStart = start + mark.length + 1;
  // "\![a](b)" is a "!" and a link.
  const image = mark !== "" && !escaped(line, start);
  const text = raw.slice(textStart, textStart + masked.length);
  if (inline !== undefined)
    return { target: angle ?? bare, inline: true, textStart, image };
  let target: string | undefined;
  if (second !== undefined && second.length > 2) {
    const end = start + whole.length;
    target = lookup(raw.slice(end - second.length + 1, end - 1));
  } else if (
    second !== undefined ||
    !(
      /^[ xX]$/.test(text) &&
      TASK_BOX.test(line.slice(0, start).replace(QUOTE, ""))
    )
  ) {
    target = lookup(text);
  }
  return { target, inline: false, textStart, image };
}

// Whether link text holds a link (not an image), so that it is not one itself:
// "[a [b](c) d](e)" links only "b". An unresolved "[b]" inside does not count.
function holdsLink(
  raw: string,
  line: string,
  lookup: (label: string) => string | undefined,
): boolean {
  const find = new RegExp(LINK.source, "g");
  for (let m = find.exec(line); m !== null; m = find.exec(line)) {
    if (escaped(line, m.index + (m[1]?.length ?? 0))) continue;
    const r = resolveMatch(m, raw, line, lookup);
    if (!r.image && (r.inline || r.target !== undefined)) return true;
  }
  return false;
}

// Markdown links in the body, skipping fenced code blocks, inline code and
// autolinks. Reads inline links and reference-style links ([text][label],
// [label][] and [label]); a reference link is reported on the line where it is
// used, with the target of its definition.
export function extractLinks(body: string, firstLine = 1): BodyLink[] {
  const lines: ProseLine[] = [];
  forEachProseLine(body, (raw, index) => lines.push({ raw, index }));
  const { definitions, used } = readDefinitions(lines);
  const lookup = (label: string) => {
    const key = normalizeLabel(label);
    return key.startsWith("^") ? undefined : definitions.get(key);
  };
  const links: BodyLink[] = [];
  for (const { raw, index } of lines) {
    if (used.has(index)) continue;
    const line = mask(raw);
    const find = new RegExp(LINK.source, "g");
    for (let m = find.exec(line); m !== null; m = find.exec(line)) {
      const start = m.index;
      const open = start + (m[1]?.length ?? 0);
      // "\[a](b)" is not a link.
      if (escaped(line, open)) {
        find.lastIndex = open + 1;
        continue;
      }
      const r = resolveMatch(m, raw, line, lookup);
      const textEnd = r.textStart + (m[2]?.length ?? 0);
      if (
        !r.image &&
        holdsLink(
          raw.slice(r.textStart, textEnd),
          line.slice(r.textStart, textEnd),
          lookup,
        )
      ) {
        find.lastIndex = r.textStart;
        continue;
      }
      // An unresolved "[...]" is plain text; links inside it or right after
      // it ("[a][b](c)" with b undefined) are read from just past its "[".
      if (!r.inline && r.target === undefined) find.lastIndex = r.textStart;
      if (r.image) continue;
      if (r.target) links.push({ target: r.target, line: firstLine + index });
    }
  }
  return links;
}

// Resolves a path-valued reference (OKF §6.2) to a bundle-relative file path
// without a leading slash, e.g. "requirements/mfa.md". Returns null for URLs,
// fragments, and paths that escape the bundle.
export function resolvePath(target: string, fromFile: string): string | null {
  const path = target.split("#")[0]?.split("?")[0] ?? "";
  if (path === "" || SCHEME.test(path)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    decoded = path;
  }
  const resolved = decoded.startsWith("/")
    ? posix.normalize(decoded.replace(/^\/+/, ""))
    : posix.normalize(posix.join(posix.dirname(fromFile), decoded));
  if (resolved === ".." || resolved.startsWith("../")) return null;
  return resolved === "." ? "" : resolved;
}
