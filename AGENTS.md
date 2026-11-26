# AGENTS.md

AIエージェント（Claude Code、Codex、Gemini CLI、Cursorなど）に共通の決まり。
Claude Codeは `CLAUDE.md` からこのファイルを読み込む。
今の状況と未確定事項は `docs/STATUS.md`、決定の理由は `.adaptrace/decisions/` にある。**このファイルと `docs/STATUS.md` が食い違う場合は、STATUS.mdの方が新しい。**

このファイルは公開される。個人の環境、アカウント、認証の情報は書かない。

## このリポジトリ

Adaptraceは、要件・意思決定・タスク・リスクとその依存関係を、
OKF（Open Knowledge Format）準拠のMarkdownで管理するCLIとMCPサーバー。
v1.0.0をリリースした。データの形式とコマンドは、Semantic Versioningに従って変える。機能の範囲は `README.md` の「ロードマップ」と「やらないこと」に従う。

## 守る設計原則

以下は決定済みの事項。**変更する場合は必ず理由を示し、`.adaptrace/decisions/` にADRを作成して確認を取ること。** レビューでは、これに反する変更を指摘する。

1. **データは常にプレーンなMarkdown**（YAMLフロントマター）。独自のDBやクラウドサービスを前提にしない
2. **OKFの仕様に従う。** 仕様にない拡張は、OKFの拡張の仕組みの中で行う
3. **依存関係はフロントマターのキー**（`depends_on`、`derived_from`、`satisfies`、`blocks`、`supersedes`、`changes`）で表す。本文のMarkdownリンクは「参照」であり、依存関係と混ぜない
4. **OKFの予約語を流用しない**（ADR-008）。`status` はライフサイクル（`draft` / `stable` / `deprecated`）だけ、進み具合は `state`、最終更新は `generated.at`。依存関係のパスは `/` で始めるバンドル絶対パス。スキーマの正は `docs/spec/schema.md`
5. **特定のLLMやエージェントに依存しない。** LLMを使う機能は、使わなくても他の機能が動くようにする
6. **ユーザーの文書を勝手に書き換えない。** 更新案は提示し、適用は人が決める
7. **Backlog.mdとは形式だけ合わせる**（ADR-002）。コードを取り込む場合は、著作権表示とライセンスを `THIRD_PARTY_NOTICES.md` に残す

### CLI・MCPとskillの使い分け（ADR-026）

- 新しくできるようにすること（計算、判定、材料の収集）は、CLIに作り、必要ならMCPのツールにする。同じ入力なら同じ結果になり、`bun test` で確認できる
- 複数の機能を組み合わせて、利用者と対話しながら進める作業は、skill（`skills/`）にする。skillには手順と判断の基準だけを書く
- skillの中で新しい計算や判定が必要になったら、skillに書かず、CLIやMCPに機能として追加する

## 技術スタック

- **TypeScript**。ランタイム、パッケージ管理、テストは **Bun**（ADR-001）
- lintと整形は **Biome**。対象はTypeScriptとJSON。BiomeのMarkdown整形はフロントマターを壊すので使わない
- 型チェックは `tsc --noEmit`（`strict`、`noUncheckedIndexedAccess`）
- 実行時の依存パッケージは `@modelcontextprotocol/sdk` と `zod` だけ（ADR-012）。MCPサーバーの中では標準出力に書き込まない（プロトコルが壊れる）

## コマンド

```bash
bun install          # 依存パッケージをインストールする（CI は --frozen-lockfile）
bun run lint         # Biome の lint と整形の検査
bun run format       # 整形を適用する
bun run typecheck    # 型チェック
bun test             # テスト
bun src/cli.ts validate .adaptrace   # このリポジトリ自身のバンドルを検証する（CI でも実行）
bun src/cli.ts migrate-dates <バンドル> # gitの日時に頼っていたバンドルにgeneratedを書く（一度だけ）
bun src/cli.ts impact <文書> / stale # 影響分析と陳腐化の検出
bun src/cli.ts health               # 依存関係を整理する提案（廃止した文書への依存、冗長な依存、孤立した文書）
bun src/cli.ts progress <変更要求>  # 変更要求ごとの見直しの状況
bun src/cli.ts assess <文書> --llm "<コマンド>" # LLM による影響の判定と更新案（書き込まない）
bun src/cli.ts init / extract <議事録> --llm "<コマンド>" # バンドルの作成と、議事録からの下書き
bun src/cli.ts estimate <文書>... --request <変更要求> # 変更が届く範囲と工数の目安
bun src/cli.ts list --type <型>      # 文書の一覧を表にする（text / markdown / csv / json）
bun src/cli.ts conflicts            # 影響範囲が重なる未決の変更要求
bun src/cli.ts coverage --milestone <マイルストーン> # 要件の充足と、マイルストーンに残っている作業
bun src/cli.ts meeting <変更要求>... # 協議の会議の準備（参加者、議題、下書き）
bun src/cli.ts sync / board         # Backlog.md との変換（--write で書き込む）とカンバン
bun src/cli.ts mcp                  # MCP サーバー（stdio）
```

## ディレクトリ構成

```text
.claude-plugin/  Claude Codeのプラグインとマーケットプレイスの定義（ADR-037）
.adaptrace/      Adaptrace 自身の要件・意思決定・タスク（OKF。自分たちで使いながら作る：ADR-005）
docs/            STATUS.md、仕様（spec/）、ガイド（guide/）、skillの英語の参考訳（skills/）
examples/        コピーして使うバンドルのテンプレート（pmbok/）
skills/          利用者に配布するClaude Codeのskill（adaptrace-adopt/、adaptrace-change-request/、adaptrace-change-decision/、adaptrace-review/、adaptrace-weekly/、adaptrace-minutes/、adaptrace-supersede/、adaptrace-health/）
src/             CLI とコア
scripts/         リリースのビルドで使うスクリプト（依存パッケージのライセンスの一覧など）
tests/           テスト。fixtures/ に検証用の OKF バンドル、skills/ にskillの試験
.github/         CI、Issue / PR のテンプレート
```

## コーディング規約

- 公開APIとCLIの出力形式を変更する場合は、`CHANGELOG.md` に記載する
- 新しい機能には、`tests/fixtures/` のOKFバンドルを使ったテストを追加する。skillの試験は例外で、試験の一式（模擬のリポジトリ、期待する結果）を `tests/skills/<skill>/` にまとめて置く
- 大きな依存ライブラリは相談なしに追加しない
- ドキュメントは日本語を正とする（ADR-003）。コード中の識別子とコメントは英語

## 文書の書き方と用語

日本語で書くドキュメントに適用する。対象は `README.md`、`docs/`、このファイル、`.adaptrace/` に新しく書く文書、IssueとPRの日本語の本文。
日本語版が正で、英語版（`README.en.md` など）は日本語版に合わせる（ADR-003）。英語版（`*.en.md`）がある日本語のドキュメントを変更するPRでは、英語版も同じPRで更新する。skill（`skills/<skill>/SKILL.md`）を変更するPRでは、参考訳（`docs/skills/<skill>.en.md`）も同じPRで更新する。レビューでは、これに反する新しい記述を指摘する。

### 書き方

- 一般的な技術文書の自然な日本語で書く。漢語を和語に言い換えない。「実行する」を「流す」、「修正する」を「直す」、「追加する」を「足す」、「インストールする」を「入れる」、「確認する」を「確かめる」としない
- 技術的な内容は、IT業界の一般的な用語で書く。独自の言い回しを作らない。このプロジェクトの用語は下の用語集に従う
- 読み手に合わせる
  - 利用者向けのドキュメント（`README.md`、`docs/guide/`）は平易に書く。専門用語は避けるか、初出で短く説明する
  - 仕様と開発者向けのドキュメント（`docs/spec/`、このファイル、`CONTRIBUTING.md`）は、IT業界の用語で簡潔に書く
- 結論を先に書く。一文を短くし、一文に入れる内容は一つにする
- 括弧の中に長い説明を入れない。括弧の入れ子もしない。補足は別の文にする
- 「の」を3つ以上続けない
- 数字・英字と日本語の間に半角スペースを入れない（「7日」「CLIとMCPサーバー」）。インラインコードの前後にはスペースを入れてよい
- コマンド、ファイル名、識別子、フロントマターのキーと値は `` ` `` で囲む
- 文体は1つのファイルの中でそろえる。利用者向けのドキュメントは「です・ます」、このファイルのような決まりの一覧は「だ・である」や体言止めにする

### 既存の記述との関係

- 意思決定の記録（`.adaptrace/decisions/` のADR）、`.adaptrace/log.md`、`CHANGELOG.md` は記録なので、後から書き換えない。ただし、`CHANGELOG.md` のまだリリースしていない節（Unreleased）は、リリースまで書き換えてよい（ADR-036）。古い用語は下の用語集で読み替える。ただし、ADRのフロントマターに見直しの記録（`verified`）を追加するのは、書き換えに当たらない（ADR-029）
- `CODE_OF_CONDUCT.md` はContributor Covenantの翻訳に従う。この決まりで書き換えない
- CLIの出力、エラーメッセージ、MCPのツール名は英語のまま。ドキュメントで引用するときは、コードの文言をそのまま引用する
- 文言を修正するときも、ADRの番号、コマンド、識別子、見出しへのリンクは変えない

### 用語集

英語の識別子（コマンド名、オプション、フロントマターのキー、`state` の値など）は訳さず、そのまま書く。

| 使う | 英語・識別子 | 注記・使わない言い方 |
|---|---|---|
| バンドル | bundle | OKFの文書をまとめたディレクトリ。「リポジトリ」「プロジェクト」と混同しない |
| 文書 | document | バンドルの中の1つのファイル。このリポジトリ自身の `README.md` などは「ドキュメント」と書いて区別する |
| 型 | `type` | Requirement、Decision、Task、Riskなど。「種類」としない |
| フロントマター | frontmatter | 「ヘッダー」「メタデータ」としない |
| 依存関係 | dependency | フロントマターのキーで表すものだけを指す |
| 依存先、依存元 | | 「被依存」としない |
| 参照 | | 本文のMarkdownリンク。依存関係とは別のもの |
| 循環依存 | cycle | |
| デッドロック | deadlock | `depends_on` と `blocks` で互いに待っている状態 |
| 検証 | `validate` | |
| 影響分析 | `impact` | 依存元をたどって見直し候補を列挙すること。たどり着く文書の集まりは「影響範囲」 |
| 陳腐化、陳腐化の検出 | `stale` | 説明では「依存先より古い」と書いてよい |
| 影響の判定 | `assess` | LLMによる、見直しが必要かどうかの判定 |
| 更新案 | | 「更新の提案」「修正案」としない。適用は人が決める |
| 下書き | draft | `extract` と `propose_document` が作る新しい文書の案。「ドラフト」としない。ライフサイクルの `status: draft` とは別のもの |
| 変更要求 | change request | |
| 見積もり | `estimate` | 「見積り」としない。工数は「人時」で書く |
| 議事録 | minutes | |
| 最終更新 | `generated.at` | |
| 進み具合 | `state` | `status`（ライフサイクル）と混同しない |
| 適用する | apply | 差分や更新案を「当てる」としない |
| ディレクトリ | directory | 仕様と開発者向けのドキュメントでは「フォルダ」としない。利用者向けのドキュメント（`README.md`、`docs/guide/`）では「フォルダ」と書いてよい |
| サーバー、ユーザー、メンテナー | | 長音を省かない |

## コミットとPR

- **ブランチを切ってPRを作成する。** `main` に直接pushしない。マージはメンテナーが行う
- **コミットメッセージとPRのタイトルは英語の[Conventional Commits](https://www.conventionalcommits.org/)**（`feat:`、`fix:`、`docs:`、`chore:`、`test:`、`refactor:`、`ci:`。ADR-004）。PRの本文は日本語でも英語でもよい
- **コミットにはDCOの `Signed-off-by` を付ける**（`git commit -s`。ADR-006）。Dependabotのコミットは例外（ADR-035）
- ワークフローのアクションは、コミットのSHAで指定し、版をコメントで示す（ADR-035）
- CIが通ること。`.github/workflows/ci.yml` はlint、型チェック、テスト、`secrets.yml` はgitleaksを実行する

## 操作の安全

- 秘密情報（トークン、APIキー、`.env*`、`*.key`、`*.pem`）をリポジトリに入れない。例示でも実物を書かない
- リリース、パッケージの公開、リポジトリの設定変更（公開範囲、ブランチ保護など）は、メンテナーの確認を取ってから行う
- リリースのPRでは、`package.json` と `.claude-plugin/plugin.json` の `version`、`.claude-plugin/marketplace.json` の `ref`（タグ）を、同じ版にそろえる（ADR-037）

## 未確定事項を勝手に埋めない

`docs/STATUS.md` の未確定事項は、推測で実装を進めず確認を取る。
