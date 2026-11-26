// Writes the licenses of the third-party code bundled into the single
// executable (ADR-038). Usage: bun scripts/licenses.ts <metafile> <out>
// The metafile comes from `bun build --metafile`; only the packages whose
// files were bundled are listed.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The package directory of a bundled input, e.g.
// "node_modules/@scope/name/dist/x.js" -> "node_modules/@scope/name".
// The last "node_modules/" wins, so nested packages are found too.
export function packageDir(input: string): string | null {
  const marker = "node_modules/";
  const at = input.lastIndexOf(marker);
  if (at < 0) return null;
  const parts = input.slice(at + marker.length).split("/");
  const name = parts[0]?.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0];
  return name ? input.slice(0, at + marker.length) + name : null;
}

const BUN_NOTICE = `## Bun

This executable includes the Bun runtime (MIT License), which statically links
JavaScriptCore and WebKit (LGPL-2) and other libraries. See
https://bun.com/docs/project/license for the licenses and for how to obtain the
corresponding source. The source of Adaptrace is available at
https://github.com/yutaponium/Adaptrace, so the executable can be rebuilt with
\`bun build --compile\`, including with a modified Bun.
`;

export async function licenses(inputs: string[], root = "."): Promise<string> {
  const dirs = [
    ...new Set(inputs.map(packageDir).filter((d) => d !== null)),
  ].sort();
  const sections: string[] = [];
  for (const dir of dirs) {
    const pkg = JSON.parse(
      await readFile(join(root, dir, "package.json"), "utf8"),
    ) as { name?: string; version?: string; license?: string };
    const files = (await readdir(join(root, dir)))
      .filter((f) => /^(licen[cs]e|copying|notice)/i.test(f))
      .sort();
    if (files.length === 0)
      throw new Error(
        `${dir}: no license file found (license: ${pkg.license})`,
      );
    const texts = await Promise.all(
      files.map((f) => readFile(join(root, dir, f), "utf8")),
    );
    sections.push(
      `## ${pkg.name}@${pkg.version} (${pkg.license})\n\n${texts.map((t) => t.trim()).join("\n\n")}\n`,
    );
  }
  return [
    "# Third-party licenses\n",
    "Licenses of the third-party code bundled into this executable.\n",
    BUN_NOTICE,
    ...sections,
  ].join("\n");
}

if (import.meta.main) {
  const [metafile, out] = process.argv.slice(2);
  if (!metafile || !out) {
    console.error("usage: bun scripts/licenses.ts <metafile> <out>");
    process.exit(2);
  }
  const meta = JSON.parse(await readFile(metafile, "utf8")) as {
    inputs: Record<string, unknown>;
  };
  await writeFile(out, await licenses(Object.keys(meta.inputs)));
}
