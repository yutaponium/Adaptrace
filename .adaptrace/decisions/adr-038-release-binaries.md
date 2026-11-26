---
type: Decision
title: CLIを1つの実行ファイルにして、タグを付けたときにGitHub Actionsで作り、Releaseに添付する
state: accepted
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-26T16:18:34+09:00 }
depends_on:
  - /decisions/adr-001-typescript-bun.md
  - /decisions/adr-035-pin-actions.md
---

# CLIを1つの実行ファイルにして、タグを付けたときにGitHub Actionsで作り、Releaseに添付する

## 決定

- CLIを `bun build --compile` で1つの実行ファイルにし、GitHubのReleaseに添付する。Bunのない環境でも、ダウンロードして使えるようにする
- 対象は、Linux（x64、arm64。glibc）、macOS（arm64、x64）、Windows（x64）。Linux・macOSは `.tar.gz`、Windowsは `.zip` にまとめ、`SHA256SUMS` を添付する。アーカイブには、`adaptrace-<版>-<環境>/` のディレクトリを1つだけ入れる。展開したときに、利用者の `LICENSE` などを上書きしないため
- `v*` のタグをpushしたときに、`.github/workflows/release.yml` が作る。Releaseがまだなければ、下書きのReleaseを作る。メンテナーが本文を書いて公開する。既存のタグには、手動の実行（`workflow_dispatch`）で添付する
- タグと `package.json` の `version` が違うときは、失敗させる
- 実行ファイルは、それぞれの環境のランナーで作り、そのランナーで `--version` と `validate` を実行してから添付する。macOS向けは、Apple siliconでは署名のない実行ファイルが動かないので、macOSで作る必要もある。Bunは、macOSで作るとアドホック署名をする
- 実行ファイルには、Adaptraceの `LICENSE` と `THIRD_PARTY_NOTICES.md`、取り込んだ依存パッケージのライセンスの一覧（`THIRD_PARTY_LICENSES.md`）を同梱する。一覧は、ビルドの `--metafile` から、実際に取り込んだパッケージだけを `scripts/licenses.ts` で集める。実行ファイルにはBunのランタイムも入るので、ビルドに使った版のBunの `LICENSE.md` も一覧に入れる
- コード署名（Apple Developer ID、Windows Authenticode）は行わない。npmへの公開は、この決定では扱わない（`docs/STATUS.md` の未確定事項）
- `bun add -g github:...` でのインストールも残す

## 理由

- Bunをインストールしなくても使えるので、試す人の手間が減る。チームでCIに組み込むときも、ダウンロードだけで済む
- `bun build --compile` は依存パッケージとランタイムを1つにまとめる。追加の依存パッケージは要らない（ADR-012）
- 取り込んだパッケージを配布することになるので、MITなどのライセンスの表示が必要になる。`--metafile` を使えば、取り込んだパッケージだけを漏れなく挙げられる
- コード署名には、有料の証明書とその管理が必要になる。利用者の規模を見てから検討する

## 検討した他の案

- 1つのランナーで全プラットフォームをクロスコンパイルする：起動できるかを確認できない。macOS向けの実行ファイルには署名がなく、Apple siliconで起動できないおそれもある
- タグのpushではなく、Releaseの公開をきっかけにする：公開の時点で添付ファイルがそろわず、ダウンロードできない時間ができる
- 依存パッケージのライセンスを手で `THIRD_PARTY_NOTICES.md` に書く：依存パッケージの更新のたびに漏れが出る
