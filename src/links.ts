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
// [text](target), [text][label], [label][] or [label], but not images
// (and not the [label] that follows an image's alt text).
const LINK = new RegExp(
  String.raw`(?<![!\]])\[([^\]]*)\](?:\(\s*${DEST}${TITLE}\s*\)|\[([^\]]*)\])?`,
  "g",
);
// A link reference definition: [label]: target "title"
const DEFINITION = new RegExp(
  String.raw`^ {0,3}\[([^\]]+)\]:\s*${DEST}${TITLE}\s*$`,
);
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

// Markdown links in the body, skipping fenced code blocks and inline code.
// Reads inline links and reference-style links; a reference link is reported
// on the line where it is used, with the target of its definition.
export function extractLinks(body: string, firstLine = 1): BodyLink[] {
  const definitions = new Map<string, string>();
  const prose: { line: string; index: number }[] = [];
  forEachProseLine(body, (raw, index) => {
    const line = raw.replace(INLINE_CODE, "");
    const def = DEFINITION.exec(line);
    if (def) {
      const label = normalizeLabel(def[1] ?? "");
      const target = def[2] ?? def[3] ?? "";
      // The first definition of a label wins (CommonMark).
      if (label && !definitions.has(label)) definitions.set(label, target);
    } else {
      prose.push({ line, index });
    }
  });
  const links: BodyLink[] = [];
  for (const { line, index } of prose) {
    for (const match of line.matchAll(LINK)) {
      const [, text = "", angle, bare, ref] = match;
      let target: string | undefined;
      if (angle !== undefined || bare !== undefined) target = angle ?? bare;
      else if (ref !== undefined && ref.trim() !== "")
        target = definitions.get(normalizeLabel(ref));
      // [label][] and [label]; "[label]:" is not a link.
      else if (!line.slice(match.index + match[0].length).startsWith(":"))
        target = definitions.get(normalizeLabel(text));
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
