import { readdir, readFile } from "node:fs/promises";
import { posix } from "node:path";
import { type Frontmatter, parseDocument } from "./frontmatter";
import { type BodyLink, extractLinks } from "./links";
import { RESERVED_FILENAMES } from "./schema";

export interface Concept {
  // Bundle-relative path without a leading slash, e.g. "tasks/mfa.md".
  path: string;
  // OKF concept ID: the path without ".md".
  id: string;
  frontmatter: Frontmatter;
  frontmatterLines: string[];
  body: string;
  links: BodyLink[];
}

export interface ReservedFile {
  path: string;
  name: (typeof RESERVED_FILENAMES)[number];
  frontmatter: Frontmatter | null;
  body: string;
  bodyLine: number;
  links: BodyLink[];
}

export interface LoadError {
  path: string;
  message: string;
}

export interface Bundle {
  root: string;
  concepts: Map<string, Concept>;
  reserved: ReservedFile[];
  // Files that are not concepts because they could not be parsed or have no
  // frontmatter. Reported by validate.
  invalid: LoadError[];
  // All files in the bundle (any extension), for link checks.
  files: Set<string>;
}

const SKIPPED_DIRS = new Set([".git", "node_modules"]);

async function walk(root: string, dir = ""): Promise<string[]> {
  const entries = await readdir(posix.join(root, dir), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name))
        files.push(...(await walk(root, path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function isReserved(name: string): name is ReservedFile["name"] {
  return (RESERVED_FILENAMES as readonly string[]).includes(name);
}

export async function loadBundle(root: string): Promise<Bundle> {
  const files = await walk(root);
  const bundle: Bundle = {
    root,
    concepts: new Map(),
    reserved: [],
    invalid: [],
    files: new Set(files),
  };
  for (const path of files.filter((f) => f.endsWith(".md"))) {
    const text = await readFile(posix.join(root, path), "utf8");
    const parsed = parseDocument(text);
    if (!parsed.ok) {
      bundle.invalid.push({ path, message: parsed.error });
      continue;
    }
    const name = posix.basename(path);
    if (isReserved(name)) {
      bundle.reserved.push({
        path,
        name,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        bodyLine: parsed.bodyLine,
        links: extractLinks(parsed.body, parsed.bodyLine),
      });
      continue;
    }
    if (parsed.frontmatter === null) {
      bundle.invalid.push({ path, message: "missing YAML frontmatter" });
      continue;
    }
    bundle.concepts.set(
      path,
      toConcept(path, text, { ...parsed, frontmatter: parsed.frontmatter }),
    );
  }
  return bundle;
}

function toConcept(
  path: string,
  text: string,
  parsed: { frontmatter: Frontmatter; body: string; bodyLine: number },
): Concept {
  return {
    path,
    id: path.replace(/\.md$/, ""),
    frontmatter: parsed.frontmatter,
    frontmatterLines: text.split(/\r?\n/).slice(0, parsed.bodyLine - 1),
    body: parsed.body,
    links: extractLinks(parsed.body, parsed.bodyLine),
  };
}

// A copy of the bundle with concept files replaced or added, without
// touching the disk. Used to show what a proposed change would do.
export function withFiles(
  bundle: Bundle,
  files: { path: string; text: string }[],
): Bundle {
  const paths = new Set(files.map((f) => f.path));
  const next: Bundle = {
    ...bundle,
    concepts: new Map(bundle.concepts),
    invalid: bundle.invalid.filter((e) => !paths.has(e.path)),
    files: new Set([...bundle.files, ...paths]),
  };
  for (const { path, text } of files) {
    const parsed = parseDocument(text);
    if (!parsed.ok || parsed.frontmatter === null) {
      next.concepts.delete(path);
      next.invalid.push({
        path,
        message: parsed.ok ? "missing YAML frontmatter" : parsed.error,
      });
    } else {
      next.concepts.set(
        path,
        toConcept(path, text, { ...parsed, frontmatter: parsed.frontmatter }),
      );
    }
  }
  return next;
}

// 1-based line of the first frontmatter line matching `needle`, for messages.
export function findLine(concept: Concept, needle: RegExp): number | undefined {
  const i = concept.frontmatterLines.findIndex((line) => needle.test(line));
  return i === -1 ? undefined : i + 1;
}
