# Changelog

このプロジェクトの主な変更。形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に従い、バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

## [Unreleased]

### Added

- `adaptrace sync`：Backlog.mdでアーカイブされたタスク（`archive/tasks/`、`archive/drafts/`）を、`missing` ではなく `archived` として知らせるようにした（ADR-046）。問題として扱わないので、`archived` だけなら終了コードは0。前回の同期の後にAdaptraceの文書が変わっていれば `changed: true` を付け、書き出されないことを示す。テキストの出力は `ARCHIVED in Backlog.md` で、最後の行に `N archived` を加える。MCPの `sync_plan` の結果にも `archived` が出る
- Claude Codeのskill `adaptrace-sync`（`skills/adaptrace-sync/`、ADR-045）：Backlog.mdとの同期で、`sync` の計画を変更と問題に分けて示し、衝突、対応しない `state`、見つからないタスク、重複した `backlog.id` の扱いを、タスクごとに利用者と決めてから書き込む。Backlog.mdのファイルは、`sync --write` のほかでは書き換えない
- `adaptrace sync --resolve <タスク>=<側>`：Backlog.mdとの衝突を、タスクごとにそろえられるようにした。タスクは、バンドルの中のパスか、Backlog.mdのIDで指定する。何回でも指定でき、全体の `--resolve adaptrace|backlog` より優先する。Backlog.mdのタスクと対応付いていないタスクや、同じタスクに別々の側を指定すると、終了コード2。全体の指定に `--resolve adaptrace --resolve backlog` と両方の側を指定した場合も、これまでは後の値を使っていたが、終了コード2にした
- Claude Codeのskill `adaptrace-risk`（`skills/adaptrace-risk/`、ADR-043）：見直し時期を過ぎたリスクと、依存先が更新されたリスクを、1件ずつ利用者と見直す。評価の更新、対応策のタスクの作成、リスクを閉じるかどうか、次の見直し日を決め、`verified` と `stale_after` に記録する。閉じたリスクは `stale_after` を削除する。書き込みは承認を得てから行う
- Claude Codeのskill `adaptrace-milestone`（`skills/adaptrace-milestone/`、ADR-041）：マイルストーンの前に、範囲の要件の状況、終わっていない作業、期日に間に合わない作業、範囲に関わる未決の変更要求、古くなった文書を示す。作業を別のマイルストーンに移す、期日を変えるなどの扱いを項目ごとに利用者と決め、マイルストーンの計画（`due`、`depends_on`、`blocks`、`state`）と作業の `due`・`blocks` だけを変える。書き込みは承認を得てから行う
- `adaptrace coverage [bundle]` とMCPのツール `coverage`（ADR-040）：要件ごとに、満たす文書（`satisfies`）と進み具合を示す。数える文書のうち、満たす文書がない要件は `uncovered`、終わっていない文書がある要件は `open`、それ以外は `covered`。TaskとMilestoneは `state` で、要件は `covered` かどうかで、終わったかを決める。`--milestone` で、マイルストーンが待っている文書をたどった範囲に絞り、範囲のTaskとMilestoneを担当者と期日とともに示す。終わっていない作業の期日がマイルストーンより後なら、`late` を付ける。`--done` で終わったTaskとMilestoneの `state`、`--type` で要件の型を変えられる。`--format text|markdown|json`
- Claude Codeのskill `adaptrace-change-decision`（`skills/adaptrace-change-decision/`、ADR-039）：変更要求の承認、却下、保留の判断を記録する。`state` をバンドルで使っている値にし、本文の末尾に「判断」の見出しで、判断した日、判断した人、理由を書く。判断の前に、影響範囲が重なる未決の変更要求を調べ、承認した変更要求の見直し（skill `adaptrace-review`）と合わせて報告する。書き込みは承認を得てから行う
- CLIを1つの実行ファイルにして、GitHubのReleaseに添付するようにした（ADR-038）。Bunのない環境でも使える。対象は `linux-x64`、`linux-arm64`、`darwin-arm64`、`darwin-x64`、`windows-x64`。`v*` のタグをpushすると、`.github/workflows/release.yml` が作り、`SHA256SUMS` と、取り込んだ依存パッケージのライセンスの一覧（`THIRD_PARTY_LICENSES.md`）も添える
- 本文のリンクとして、参照形式のリンク（`[text][1]`、`[text][]`、`[text]`）と、`<...>` で囲んだ空白入りのリンク先（`[text](<my file.md>)`）を読むようにした。`validate` のリンク切れの検査と、参照の一覧が対象になる。参照形式のリンクは、リンクを使った行で示す

## [1.0.0] - 2026-11-26

最初の公開のリリース。名前をAccordantからAdaptraceに変えた。判断の置き換えと、依存関係のヘルスチェックを、skillとCLIで支援する。v0.9.0までの履歴は、公開のリポジトリには含めていない。

### Changed

- **名前を「Accordant」から「Adaptrace」に変えた**（ADR-036）。同じ名前の開発者向けのOSSがあるため。互換性はない
  - コマンドは `adaptrace`、既定のバンドルの場所は `.adaptrace/`、環境変数は `ADAPTRACE_LLM`、MCPのサーバー名は `adaptrace`
  - 提案の `generated.by` の既定は `adaptrace/<version>`。`sync` の `--resolve` の値は `adaptrace`、出力は `create in Adaptrace` などになり、JSONのキーも `adaptrace` になった
  - skillの名前は `adaptrace-*`
  - 今の環境から移るには、次の3つを行う。既存のバンドルを `git mv .accordant .adaptrace` で移す。MCPのサーバーを登録し直す（`claude mcp remove accordant` の後に、`claude mcp add adaptrace -- bun <パス>/src/cli.ts mcp .adaptrace`）。コピーしたskill（`.claude/skills/accordant-*`）を削除し、`skills/adaptrace-*` をコピーし直す
- READMEの考え方の説明を改め、名前の由来を書いた。ステータスを、pre-alphaから安定版にした。今後は、互換性を崩すときにメジャーバージョンを上げる
- ドキュメントの英語版（`*.en.md`）と、skillの英語の参考訳（`docs/skills/`）を追加した

### Added

- Claude Codeのskill `adaptrace-health`（`skills/adaptrace-health/`、ADR-034）：`health` と `validate` の結果を、利用者と1件ずつ整理する。項目を区分ごとに示し、廃止した文書への依存の付け替え、冗長な依存の削除、孤立した文書への依存関係の追加や廃止、デッドロックの解消などを、項目ごとに利用者と決める。本文と `generated` は変えない。書き込みは承認を得てから行う
- `adaptrace health [bundle]` とMCPのツール `health`（ADR-033）：依存関係を整理するための提案を示す。`deprecated-target`：廃止した文書を指している文書と、廃止した文書を置き換えた文書。`redundant-dependency`：同じキーの、より長い経路でも届く依存と、同じキーに2回書いた依存。`orphan`：廃止していない文書との依存関係がない文書。どれもエラーではなく、終了コードは0。`--format text|json`
- Claude Codeのskill `adaptrace-supersede`（`skills/adaptrace-supersede/`、ADR-032）：判断を新しい判断に置き換える。新しい判断を `supersedes` 付きで作り、古い判断を `status: deprecated` にする。古い判断に依存していた文書ごとに、付け替える、外す、中止する、そのままにする、を利用者と決める。間接的に影響を受ける文書と、古い判断を起点にする変更要求は、報告する。書き込みは承認を得てから行う

### Fixed

- `board`（CLIとMCP）：`status: deprecated` のTask（中止したTask）を、待ちの相手にしないようにした。中止したTaskに依存しているTaskが、「waiting for」と示され続けていた。中止したTaskへの依存関係は、`health` が `deprecated-target` として示す

## [0.9.0] - 2026-11-26

AIエージェントのskillで作業を支援するリリース。既存のファイルの取り込み、変更要求の受付、見直しの実施、定例の会議の準備、議事録の取り込みを、Claude Codeと対話しながら進められる。最終更新にgitの日時を使わないようにした。

### Changed

- 最終更新に、gitのコミットの日時を使わないようにした（ADR-029）。最終更新は `generated.at`、なければ古い `timestamp` だけで決める。どちらもない文書は「不明」で、比べない。出力の最終更新の出どころに `git` は出なくなった。MCPサーバーは、gitの日時を読み直さなくなった
- `validate`（CLIとMCP）の問題の一覧は、ファイルと行の順に並べる。`validate`（CLIとMCP）は、日時についての警告を加える。`missing-generated`：`generated` も `timestamp` もない文書。`stale-generated`：本文を変えたのに、`generated` も `verified` も変えていない文書（gitのリポジトリのときだけ）。`stale-generated-skipped`：浅いcloneなどで、`stale-generated` を調べなかった。`invalid-datetime` は、形式が合っていても実在しない日時（13月など）も示す

### Added

- Claude Codeのskill `accordant-minutes`（`skills/accordant-minutes/`、ADR-031）：議事録を `type: Meeting` の文書としてバンドルに置き、決まったこと、割り当てられた作業、見つかったリスクを新しい文書にする。終わったタスクの `state` や、置き換えた判断（`supersedes` と `status: deprecated`）など、既存の文書の更新も差分で示す。要件を変える要望は、変更要求として受け付けるよう案内する。書き込みは承認を得てから行う
- Claude Codeのskill `accordant-weekly`（`skills/accordant-weekly/`、ADR-030）：定例の会議の前に、期限を過ぎたものと次の定例までに期限が来るもの、待っているタスク、見直しが必要な文書、見直し時期を過ぎた文書、変更要求の状況をまとめ、区分ごとの議題の案と次の一手を示す。文書は変えず、議事録の下書きは承認を得て作る
- `accordant migrate-dates [bundle]`（ADR-029）：gitの日時に頼っていたバンドルを一度だけ移行する。`generated` のない文書に、最後のコミットの日時で `generated: { by: process:git, at }` を書く。既定では差分を示すだけで、`--write` で書く。`--format text|json`
- Claude Codeのskill `accordant-review`（`skills/accordant-review/`、ADR-028）：承認された変更要求や内容を変えた文書から、影響を受ける文書を上流から順に見直す。`progress` のステップごとに、変更が要るかの判断の材料と差分を示し、利用者の承認を得て `generated` か `verified` を更新する。すべて見直し済みになったら、変更要求を反映済みにすることを提案する
- Claude Codeのskill `accordant-change-request`（`skills/accordant-change-request/`、ADR-027）：メールやチャットで受けた依頼を変更要求として受け付け、起点と依頼者を特定して文書を作る。影響範囲の見積もりと、重なる未決の変更要求の判定を示し、重なりがあれば協議の会議の準備を提案する
- Claude Codeのskill `accordant-adopt`（`skills/accordant-adopt/`、ADR-026）：既存のファイルをバンドルに取り込み、依存関係の候補を根拠付きで示して、利用者と対話しながら張る。書き込むのは、利用者が差分を承認した後だけ
- ガイド「既存のリポジトリにAccordantを導入する」（`docs/guide/adoption.md`）

## [0.8.0] - 2026-11-25

変更管理の支援を追加したリリース。見直しの順番と状況、見直しの記録、Markdown以外のファイルの更新の検出、重なる変更要求の協議を支援する。

### Changed

- 見直して変更が要らなかったことは、OKFの `verified` に記録するようにした（ADR-020）。文書が古いかどうかは、自分の内容の最終更新と `verified.at` の新しい方を、依存先の内容の最終更新（`generated.at`、`timestamp`、gitの日時）と比べる。見直しだけなら、下流の文書は古くならない。`impact`、`stale`、`progress` に適用する
- `assess --llm` の判定が `none` のときの更新案は、`generated` ではなく `verified` を更新する。出力の文言は `Proposal: record the review in verified`
- 出力のJSONの最終更新に `reviewed`（見直した日時）を追加した。テキストでは `reviewed` と示す
- 見直しの記録で、gitの日時を `generated` に書き込まないようにした（ADR-021）。下流の文書を古くしない効果は、`generated.at` を持つ文書にだけ働く。更新案は `verified` の行だけを変え、既存の行とコメントを残す。記録を失わずに追加できないときは、案を作らずにエラーにする（`assess` は `No proposal: ...` と示し、終了コード1）。`verified` だけの文書は、最も古い `verified.at` を内容の最終更新にする。MCPの `propose_update` の `review: true` は、空の `set` と `unset` を受け付ける

### Added

- `accordant meeting <変更要求>...`（ADR-025）：変更要求を協議する会議の準備の材料を示す。参加者の候補（`owner` と `requested_by`）、議題（重なりとベースライン）、`Meeting` の下書き（`--write` で作る）。`--audience internal|customer`。`--llm` で、決めるべき点と招集の文案も示す。ステークホルダーの文書の `side`（`internal`、`customer`）と `role` を読む。MCPの `meeting_context` も追加した
- `conflicts --llm <コマンド>`（ADR-024）：重なる組ごとに、2つの変更要求が両立できるかをLLMに判定させる。`conflict`、`duplicate`、`compatible`、`unclear` と、理由、協議で決めるべき点を示す。`--jobs`、`--timeout`。MCPの `conflicts_context` は、判定の材料と手順を返す
- 依存関係のキー `changes`（ADR-023）：変更要求から、その変更要求が変える文書（起点）を指す。見直しの連鎖は伝えない
- `accordant conflicts [bundle]`：未決の変更要求のうち、影響範囲が重なる組を、両方が変える文書と両方が届く文書とともに示す。`--settled` で決着した `state` の値を変えられる。`--format text|markdown|json`、`--link-base`。MCPの `conflicts` も追加した
- `estimate` は、起点の文書を渡さず `--request` だけを渡したとき、その変更要求の `changes` を起点にする。MCPの `estimate_context` の `documents` も省略できる
- Markdown以外のファイルで更新を検出する（ADR-022）：OKFの `resource` か `sources[].resource` がローカルのファイルを指すとき、見直したときのSHA-256を `resource_sha256` と `sources[].sha256` に記録する。`stale` は、今のファイルと違えば理由 `resource-changed`、記録がなければ `resource-unrecorded` で、今のSHA-256とともに知らせる。ファイルがなければ `resource-missing` で知らせる。テキストのファイル（gitと同じ規則で判断）は、改行コードのCRLFをLFとして計算する。ローカルのファイルは、`./` か `../` で始まる相対パスか `file:///` のURIで書く。`stale` の「Update date unknown, not compared:」の表示は「Update date unknown, not compared with dependencies:」にした。`validate` は、ファイルが存在しないとき `missing-resource`、記録の形が正しくないとき `invalid-sha256`、記録があるのに指す値がローカルのファイルとして読めないとき `unlinked-sha256` で警告する。MCPの `propose_update` は、`review: true`（または `resources: true`）でSHA-256の記録を更新する。MCPの `propose_update` は、フロントマターがYAMLとして読めなくなる案を、案として返さずにエラーにする
- MCPの `propose_update` の `review: true`：`verified` に今の日時を追加する案を作る。MCPの `list_documents` に `reviewed` を追加した
- `examples/pmbok/`：PMBOKの文書のテンプレート。依存関係を張ったバンドルで、最小構成（12件）と標準構成（28件）がある。コピーして使う
- `accordant list [bundle]`：文書を1行1件の表にする。`--type`、`--state`、`--status` で絞り込み、`--columns` でフロントマターのキーを列にし、`--sort` で並べる。`status: deprecated` の文書は既定で除く。`--format text|markdown|csv|json`（`csv` はBOM付き）、`--link-base`
- `accordant progress <変更要求>`：変更要求の影響範囲の文書ごとに、見直しの状況（`reviewed`、`to review`、`waiting`）を上流からの順に示す。すべて `reviewed` になるまで終了コードは1。`--format text|markdown|json`、`--link-base`。起点は、変更要求の `received_at` より古ければ `to review` になる
- MCPの `progress`：`progress --format json` と同じ内容を返す
- フロントマターの `received_at`：変更要求を受け付けた日時。`progress` の基準日時に使う。`validate` は、形式が正しくなければ `invalid-datetime` で警告する
- `impact` と `estimate` の `--order review`：上流から順に、どの文書も依存先の後になるように並べる。`impact` の `text` と、`estimate` の `text` と `markdown` では、ステップを示す。`text` では、ステップの数字を右に寄せる。既定（`--order depth`）の並び順は変えない
- `impact` と `estimate` のJSONの各文書に `step`（見直す順番のステップ）を追加した。MCPの `impact` と `estimate_context` の結果にも含まれる

## [0.7.0] - 2026-11-02

v0.5 から v0.7 の機能をまとめたリリース。0.5.0 と 0.6.0 は切っていない。

### Added

- `accordant init [bundle]`：`index.md`、`log.md`、型ごとのフォルダ（requirements、decisions、tasks、risks、meetings）を作る。既存のファイルは上書きしない。`--title`
- `accordant extract <meeting>`：議事録から Decision・Task・Requirement・Risk などの下書き（`status: draft`、`derived_from` で議事録を指す）を LLM で作る。既定は表示だけで、`--write` で新しいファイルだけを作る（どれかのファイルがすでにあれば、どれも作らない）。案が `validate` のエラーを増やすとき、案どうしのリンクを外したとき、書けなかったときは終了コード 1。`--llm`、`--by`、`--timeout`、`--format json`（`written`、`failed`、`skipped`、`dropped`）
- MCP の `extract_context`：議事録の全文、既存の文書の一覧、下書きの手順を返す
- `accordant estimate <document>...`：変更が届く文書、型と Task の `state` ごとの数、作り直しになる終わった Task、関わる人、期日に響く Milestone をまとめる。`--llm` で文書ごとの規模と工数の目安を LLM に出させ、合計する。`--request`、`--jobs`、`--format text|markdown|json`、`--link-base`
- MCP の `estimate_context`：`estimate` と同じ内容に、変更要求と文書の全文、見積もりの手順を足して返す
- `accordant assess <document>`：変わった文書の直接の依存元ごとに、その依存元を最後にコミットしてからの依存先の差分を示す。`--llm <command>`（または `ACCORDANT_LLM`）を付けると、そのコマンドに判定させ（`none` / `minor` / `major` と理由）、更新案を差分で出す。ファイルには書かない。`--all`、`--by`、`--timeout`、`--format json` に対応
- MCP の `assess_context`：`assess` と同じ材料を、依存先と依存元の全文と判定の手順付きで返す
- `accordant board --link-base <url>`：Markdown の表示名を `<url>` とパスをつないだリンクにする

### Changed

- `accordant board --format markdown` は、`--link-base` がなければパスをコードで示す（バンドルからの相対リンクは、貼った先で切れていた）。`waiting for` の前の空白が2つになっていたのを直した
- `assess` も LLM を `--jobs`（既定 4）まで並行して呼ぶ。Ctrl-C で止めると、実行中の LLM のコマンドも止める
- `propose_update` は、1行のマッピング（`generated: { by, at }` など）を1行のまま書き換える

## [0.4.0] - 2026-10-29

### Added

- `accordant mcp [bundle]`：stdio の MCP サーバー。読み取りのツール（`validate`、`list_documents`、`read_document`、`graph`、`impact`、`stale`、`board`、`sync_plan`）と、ファイルに書かない提案のツール（`propose_document`、`propose_update`）。提案は全文、差分、その変更で増える・減る問題を返す
- 実行時の依存として `@modelcontextprotocol/sdk` と `zod` を追加

## [0.3.0] - 2026-10-29

### Added

- `accordant sync [bundle]`：`type: Task` の文書と Backlog.md のタスクを双方向に変換する。既定は計画の表示で、`--write` で書き込む。両側で変わったタスクは衝突として知らせ、`--resolve accordant|backlog` で解消する。`--direction import|export` で片方向にできる
- `accordant board [bundle]`：Task を `state` ごとの列に並べる（text、markdown、json）。終わっていない Task を待っているものを示す

## [0.2.0] - 2026-10-29

### Added

- `accordant impact <document>`：文書が変わったときに見直す候補を、直接と間接に分けて列挙する。変更された文書より古いものに `needs review` を付ける。`--bundle` と `--format json` に対応
- `accordant stale [bundle]`：直接の依存先より古い文書と、`stale_after` を過ぎた文書を列挙する。`--format json` に対応
- 最終更新は `generated.at`、古い `timestamp`、git の最終コミットの author date の順に取る。日時は UTC オフセット付きの ISO 8601 だけを読む
- `--bundle <dir>`：すべてのコマンドでバンドルを指定できる（`[bundle]` と同時には指定できない）

## [0.1.0] - 2026-10-29

### Added

- `accordant validate`：OKF 0.2 への準拠（フロントマター、`type`、`index.md`、`log.md`）と、依存関係（存在しない依存先、循環）を検証する。`blocks` と `depends_on` による文書どうしの待ち合い（デッドロック）は警告として知らせる。`--format json` に対応
- 終了コード：問題がないか警告だけなら 0、`validate` のエラーがあれば 1、コマンドや引数の誤りなら 2
- `accordant graph`：依存グラフを Mermaid または JSON（バックリンク付き）で出力する。`--references` で本文のリンクも含める
- スキーマの仕様（`docs/spec/schema.md`）
- リポジトリの土台（AGENTS.md、CLAUDE.md、TypeScript と Bun の雛形、CI、コントリビュートの文書）

[Unreleased]: https://github.com/yutaponium/Adaptrace/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yutaponium/Adaptrace/releases/tag/v1.0.0
