// Writes the licenses of the third-party code bundled into the single
// executable (ADR-038).
// Usage: bun scripts/licenses.ts <metafile> <bun-license> <out>
// The metafile comes from `bun build --metafile`; only the packages whose
// files were bundled are listed. <bun-license> is Bun's LICENSE.md for the Bun
// version that built the executable, since the runtime is bundled too.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The package directory of a bundled input, e.g.
// "node_modules/@scope/name/dist/x.js" -> "node_modules/@scope/name".
// The last "node_modules/" wins, so nested packages are found too. Windows
// separators are accepted.
export function packageDir(input: string): string | null {
  const path = input.replaceAll("\\", "/");
  const marker = "node_modules/";
  const at = path.lastIndexOf(marker);
  if (at < 0) return null;
  const parts = path.slice(at + marker.length).split("/");
  const name = parts[0]?.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0];
  return name ? path.slice(0, at + marker.length) + name : null;
}

// LICENSE, LICENSE.md, LICENSE-MIT.txt, NOTICE and the like, but not code.
const LICENSE_FILE =
  /^(licen[cs]e|copying|notice)([.-][\w-]+)?(\.(md|txt|markdown))?$/i;

// The license named in package.json: a string, or the legacy object forms.
function licenseName(pkg: { license?: unknown; licenses?: unknown }): string {
  const name = (value: unknown) =>
    typeof value === "string"
      ? value
      : typeof value === "object" && value !== null && "type" in value
        ? String(value.type)
        : undefined;
  if (pkg.license !== undefined) return name(pkg.license) ?? "see below";
  if (Array.isArray(pkg.licenses))
    return pkg.licenses.map(name).filter(Boolean).join(" OR ") || "see below";
  return "see below";
}

export async function licenses(
  inputs: string[],
  bunLicense: string,
  root = ".",
): Promise<string> {
  const dirs = [
    ...new Set(inputs.map(packageDir).filter((d) => d !== null)),
  ].sort();
  // The CLI always bundles its runtime dependencies (ADR-012); none found
  // means the metafile was not read correctly.
  if (dirs.length === 0) throw new Error("no bundled packages found");
  const sections: string[] = [];
  for (const dir of dirs) {
    const pkg = JSON.parse(
      await readFile(join(root, dir, "package.json"), "utf8"),
    ) as {
      name?: string;
      version?: string;
      license?: unknown;
      licenses?: unknown;
    };
    const files = (await readdir(join(root, dir), { withFileTypes: true }))
      .filter((e) => e.isFile() && LICENSE_FILE.test(e.name))
      .map((e) => e.name)
      .sort();
    if (files.length === 0)
      throw new Error(
        `${dir}: no license file found (license: ${licenseName(pkg)})`,
      );
    const texts = await Promise.all(
      files.map((f) => readFile(join(root, dir, f), "utf8")),
    );
    sections.push(
      `## ${pkg.name}@${pkg.version} (${licenseName(pkg)})\n\n${texts.map((t) => t.trim()).join("\n\n")}\n`,
    );
  }
  return [
    "# Third-party licenses\n",
    "Licenses of the third-party code bundled into this executable.\n",
    "## Bun\n",
    "This executable includes the Bun runtime. Its license follows. The source of Adaptrace is at https://github.com/yutaponium/Adaptrace, so the executable can be rebuilt with `bun build --compile`, including with a modified Bun.\n",
    // Bun's own headings go one level down, under "## Bun".
    `${bunLicense.trim().replace(/^(#+) /gm, "#$1 ")}\n`,
    ...sections,
  ].join("\n");
}

if (import.meta.main) {
  const [metafile, bunLicense, out] = process.argv.slice(2);
  if (!metafile || !bunLicense || !out) {
    console.error(
      "usage: bun scripts/licenses.ts <metafile> <bun-license> <out>",
    );
    process.exit(2);
  }
  const meta = JSON.parse(await readFile(metafile, "utf8")) as {
    inputs: Record<string, unknown>;
  };
  await writeFile(
    out,
    await licenses(
      Object.keys(meta.inputs),
      await readFile(bunLicense, "utf8"),
    ),
  );
}
