---
type: Decision
title: CLIを1つの実行ファイルにして、タグを付けたときにGitHub Actionsで作り、Releaseに添付する
state: accepted
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-26T16:06:03+09:00 }
depends_on:
  - /decisions/adr-001-typescript-bun.md
  - /decisions/adr-035-pin-actions.md
---

# CLIを1つの実行ファイルにして、タグを付けたときにGitHub Actionsで作り、Releaseに添付する

## 決定

- CLIを `bun build --compile` で1つの実行ファイルにし、GitHubのReleaseに添付する。Bunのない環境でも、ダウンロードして使えるようにする
- 対象は、Linux（x64、arm64）、macOS（arm64、x64）、Windows（x64）。Linux・macOSは `.tar.gz`、Windowsは `.zip` にまとめ、`SHA256SUMS` を添付する
- `v*` のタグをpushしたときに、`.github/workflows/release.yml` が作る。Releaseがまだなければ、ドラフトのReleaseを作る。メンテナーが本文を書いて公開する。既存のタグには、手動の実行（`workflow_dispatch`）で添付する
- タグと `package.json` の `version` が違うときは、失敗させる
- macOS向けはmacOSのランナーで作る。Apple siliconでは署名のない実行ファイルが動かないため。Bunは、macOSで作るとアドホック署名をする
- 実行ファイルには、Adaptraceの `LICENSE` と、取り込んだ依存パッケージのライセンスの一覧（`THIRD_PARTY_LICENSES.md`）を同梱する。一覧は、ビルドの `--metafile` から、実際に取り込んだパッケージだけを `scripts/licenses.ts` で集める。Bunのランタイムのライセンスへの案内も書く
- コード署名（Apple Developer ID、Windows Authenticode）とnpmへの公開は、行わない
- `bun add -g github:...` でのインストールも残す

## 理由

- Bunをインストールしなくても使えるので、試す人の手間が減る。チームでCIに組み込むときも、ダウンロードだけで済む
- `bun build --compile` は依存パッケージとランタイムを1つにまとめる。追加の依存パッケージは要らない（ADR-012）
- 取り込んだパッケージを配布することになるので、MITなどのライセンスの表示が必要になる。`--metafile` を使えば、取り込んだものだけを漏れなく挙げられる
- コード署名には、有料の証明書とその管理が必要になる。利用者の規模を見てから検討する

## 検討した他の案

- 1つのランナーで全プラットフォームをクロスコンパイルする：macOS向けの実行ファイルに署名がなく、Apple siliconで起動できないおそれがある
- タグのpushではなく、Releaseの公開をきっかけにする：公開の時点で添付ファイルがそろわず、ダウンロードできない時間ができる
- 依存パッケージのライセンスを手で `THIRD_PARTY_NOTICES.md` に書く：依存パッケージの更新のたびに漏れが出る
