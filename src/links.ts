import { posix } from "node:path";

export interface BodyLink {
  target: string;
  line: number;
}

// An opening fence: up to 3 spaces, then 3+ backticks or tildes.
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /`[^`]*`/g;
// A link destination: <...> (may contain spaces) or a run without spaces.
const DEST = String.raw`(?:<([^<>\n]*)>|([^\s<>)]+))`;
const TITLE = String.raw`(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?`;
// One bracketed span, optionally followed by an inline destination or a
// second bracketed label. Images ("!" before "[") are matched to skip them.
const LINK = new RegExp(
  String.raw`(!?)\[([^\]]*)\](?:\(\s*${DEST}${TITLE}\s*\)|(\[([^\]]*)\]))?`,
  "g",
);
// A link reference definition: [label]: target "title". The target may be on
// the next line. Blockquote markers before it are allowed.
const QUOTE = /^ {0,3}(?:> ?)+/;
const DEFINITION =
  /^ {0,3}\[([^\]]+)\]:(?:\s*(?:<([^<>\n]*)>|(\S+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?)?\s*$/;
const TASK_BOX = /^\s*(?:[-*+]|\d+[.)])\s+$/;
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

// Matches reference labels case-insensitively, ignoring runs of whitespace.
function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

// Replaces inline code with spaces of the same length, so that links inside it
// are not read but positions in the line stay the same.
function maskInlineCode(line: string): string {
  return line.replace(INLINE_CODE, (code) => " ".repeat(code.length));
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
  for (let n = 0; n < lines.length; n++) {
    const { raw, index } = lines[n] as ProseLine;
    const prev = lines[n - 1];
    const line = raw.replace(QUOTE, "");
    if (prev !== undefined && prev.index !== index - 1) blockStart = true;
    const def = blockStart ? DEFINITION.exec(line) : null;
    const label = def ? normalizeLabel(def[1] ?? "") : "";
    if (def && label && !label.startsWith("^")) {
      let target = def[2] ?? def[3];
      used.add(index);
      const next = lines[n + 1];
      if (target === undefined && next?.index === index + 1) {
        // The destination is on the next line.
        const dest = /^\s*(?:<([^<>\n]*)>|(\S+))/.exec(
          next.raw.replace(QUOTE, ""),
        );
        target = dest?.[1] ?? dest?.[2];
        if (target !== undefined) {
          used.add(next.index);
          n++;
        }
      }
      if (target && !definitions.has(label)) definitions.set(label, target);
      continue;
    }
    blockStart = line.trim() === "" || /^#{1,6}(\s|$)/.test(line.trim());
  }
  return { definitions, used };
}

// Markdown links in the body, skipping fenced code blocks and inline code.
// Reads inline links and reference-style links ([text][label], [label][] and
// [label]); a reference link is reported on the line where it is used, with
// the target of its definition.
export function extractLinks(body: string, firstLine = 1): BodyLink[] {
  const lines: ProseLine[] = [];
  forEachProseLine(body, (raw, index) => lines.push({ raw, index }));
  const { definitions, used } = readDefinitions(lines);
  const links: BodyLink[] = [];
  for (const { raw, index } of lines) {
    if (used.has(index)) continue;
    const line = maskInlineCode(raw);
    const find = new RegExp(LINK.source, "g");
    for (let m = find.exec(line); m !== null; m = find.exec(line)) {
      const [whole, bang = "", , angle, bare, second, ref] = m;
      const start = m.index;
      // Labels are read from the raw line, so inline code in a label counts.
      const text = raw.slice(
        start + bang.length + 1,
        start + whole.indexOf("]"),
      );
      const lookup = (label: string) => {
        const key = normalizeLabel(label);
        return key.startsWith("^") ? undefined : definitions.get(key);
      };
      let target: string | undefined;
      if (angle !== undefined || bare !== undefined) target = angle ?? bare;
      else if (second !== undefined && ref?.trim()) {
        target = lookup(
          raw.slice(
            start + whole.length - second.length + 1,
            start + whole.length - 1,
          ),
        );
        // "[a][b](c)" with b undefined: "[b](c)" may still be a link.
        if (target === undefined && !bang)
          find.lastIndex = start + whole.length - second.length;
      } else if (
        !(
          second === undefined &&
          /^[ xX]$/.test(text) &&
          TASK_BOX.test(line.slice(0, start))
        )
      ) {
        target = lookup(text);
      }
      if (bang) continue;
      if (target) links.push({ target, line: firstLine + index });
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
