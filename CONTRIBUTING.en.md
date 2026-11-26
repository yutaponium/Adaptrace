# Contributing

[日本語](CONTRIBUTING.md) | English

> The Japanese version is the original. This translation follows it (ADR-003).

Thank you for your interest in Adaptrace. Ideas and discussion in Issues are welcome.
Issues and pull requests may be written in English or Japanese.

## Issues

- Write bug reports, feature proposals and design discussions in Issues
- Do not report vulnerabilities in Issues. Follow [SECURITY.md](SECURITY.md) instead

## Pull requests

1. For a large change, discuss the direction in an Issue first
2. Work on a branch, and open a pull request to `main`
3. Make sure the following commands pass

   ```bash
   bun install
   bun run lint
   bun run typecheck
   bun test
   ```

4. Write commit messages in English, following [Conventional Commits](https://www.conventionalcommits.org/) (for example `feat: add impact command`)
5. If you change the public API or the CLI's output, add it to "Unreleased" in `CHANGELOG.md`
6. If you write Japanese documentation, follow 「文書の書き方と用語」 (writing style and terms) in [AGENTS.md](AGENTS.md)

## DCO (Developer Certificate of Origin)

Add a `Signed-off-by` line to every commit, to show that you agree to the [DCO](https://developercertificate.org/).

```bash
git commit -s -m "fix: handle empty frontmatter"
```

Commits made by Dependabot only change the versions of dependencies. As an exception, they do not need `Signed-off-by` (ADR-035).

## Using AI agents

Have your agent read [AGENTS.md](AGENTS.md). It sums up the design principles and conventions.
You are responsible for the code you submit, including code an agent wrote.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
