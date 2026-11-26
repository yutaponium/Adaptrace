import { posix } from "node:path";

export interface BodyLink {
  target: string;
  line: number;
}

// An opening fence: up to 3 spaces, then 3+ backticks or tildes.
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const INLINE_CODE = /`[^`]*`/g;
// [text](target) but not ![alt](image). The target ends at whitespace or ')'.
const LINK = /(?<!!)\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
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

// Markdown links in the body, skipping fenced code blocks and inline code.
export function extractLinks(body: string, firstLine = 1): BodyLink[] {
  const links: BodyLink[] = [];
  forEachProseLine(body, (raw, i) => {
    const line = raw.replace(INLINE_CODE, "");
    for (const match of line.matchAll(LINK)) {
      const target = match[1];
      if (target) links.push({ target, line: firstLine + i });
    }
  });
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
