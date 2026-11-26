// `adaptrace init`: a new bundle with the OKF reserved files and a folder per
// common type (ADR-014). Only creates what is missing; never overwrites.
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const FOLDERS = [
  { dir: "requirements", title: "Requirements" },
  { dir: "decisions", title: "Decisions" },
  { dir: "tasks", title: "Tasks" },
  { dir: "risks", title: "Risks" },
  { dir: "meetings", title: "Meetings" },
] as const;

export interface InitResult {
  created: string[];
  // Files that already existed and were left as they were.
  skipped: string[];
}

export function initFiles(
  title: string,
  today: string,
): { path: string; text: string }[] {
  const toc = FOLDERS.map((f) => `* [${f.title}](${f.dir}/index.md)`).join(
    "\n",
  );
  return [
    {
      path: "index.md",
      text: `---\nokf_version: "0.2"\n---\n\n# ${title}\n\n${toc}\n`,
    },
    {
      path: "log.md",
      text: `# Log\n\n## ${today}\n\n* **Initialization**: created the bundle with \`adaptrace init\`\n`,
    },
    ...FOLDERS.map((f) => ({
      path: `${f.dir}/index.md`,
      text: `# ${f.title}\n`,
    })),
  ];
}

async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null;
}

export async function init(
  root: string,
  options: { title: string; today: string },
): Promise<InitResult> {
  const result: InitResult = { created: [], skipped: [] };
  for (const file of initFiles(options.title, options.today)) {
    const full = join(root, file.path);
    if (await exists(full)) {
      result.skipped.push(file.path);
      continue;
    }
    await mkdir(dirname(full), { recursive: true });
    // "wx" fails instead of overwriting if the file appeared meanwhile.
    await writeFile(full, file.text, { flag: "wx" });
    result.created.push(file.path);
  }
  return result;
}
