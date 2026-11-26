# 意思決定

* [ADR-001](adr-001-typescript-bun.md) - 実装言語にTypeScript、ランタイムにBunを使う
* [ADR-002](adr-002-backlog-md-format-only.md) - Backlog.mdとは形式だけ合わせる
* [ADR-003](adr-003-docs-language.md) - ドキュメントは日本語を正とし、公開時に英語版READMEを追加する
* [ADR-004](adr-004-conventional-commits-english.md) - コミットメッセージは英語のConventional Commitsにする
* [ADR-005](adr-005-dogfooding.md) - Accordant自身の要件・意思決定を.accordant/で管理する
* [ADR-006](adr-006-dco.md) - コントリビューションの権利処理にDCOを使う
* [ADR-007](adr-007-review-before-pr.md) - PRの前のレビューは当面/code-reviewのみ（ADR-017で置き換え）
* [ADR-008](adr-008-okf-alignment.md) - OKF 0.2に合わせてフロントマターの書き方を決める
* [ADR-009](adr-009-deadlock-warning.md) - デッドロックはエラーにせず、警告で対処を促す
* [ADR-010](adr-010-last-updated.md) - 最終更新はgenerated.atを基本にし、なければgitから取る
* [ADR-011](adr-011-backlog-sync.md) - Backlog.mdとは内容のハッシュで変化を見分けて双方向に変換する
* [ADR-012](adr-012-mcp-server.md) - MCPサーバーは公式SDKで作り、読み取りと書き込みの提案だけを許す
* [ADR-013](adr-013-llm-assess.md) - LLMによる影響の判定は、ユーザーが指定するコマンドを呼んで行う
* [ADR-014](adr-014-init.md) - accordant initは足りないファイルだけを作り、既存のファイルは上書きしない
* [ADR-015](adr-015-extract.md) - 議事録からの抽出は、新しい文書の下書きだけを作る
* [ADR-016](adr-016-estimate.md) - 変更要求の見積もりは、影響の範囲と作業の手がかりを示し、LLMの目安を添える
* [ADR-017](adr-017-gemini-review.md) - PRの前に、/code-reviewと同時にGeminiのレビューも実行する
* [ADR-018](adr-018-progress.md) - 変更要求ごとの見直しの状況は、影響範囲の中の依存先とだけ比べて3つの状態で示す
* [ADR-019](adr-019-list.md) - 文書の一覧は、フロントマターのキーを列にした表として出力する
* [ADR-020](adr-020-verified-review.md) - 見直して変更が要らなかったことはverifiedに記録し、下流の文書を古くしない
* [ADR-021](adr-021-verified-review-followup.md) - 見直しの記録で、gitの日時をgeneratedに書き込まない
* [ADR-022](adr-022-resource-freshness.md) - Markdown以外のファイルは、OKFのresourceとsourcesで指し、SHA-256で変更を知らせる
* [ADR-023](adr-023-changes-key.md) - 変更要求が変える文書はchangesで指し、影響範囲が重なる未決の変更要求を示す
* [ADR-024](adr-024-conflicts-llm.md) - 重なる変更要求が両立できるかは、LLMに4つに分けて判定させ、協議の材料にする
* [ADR-025](adr-025-meeting.md) - 変更要求を協議する会議の準備は、参加者と議題と下書きを示し、日程調整と送信はしない
* [ADR-026](adr-026-adopt-skill.md) - 既存のファイルの取り込みと依存関係の作成は、Claude Codeのskillで対話しながら支援し、リポジトリで配布する
* [ADR-027](adr-027-change-request-skill.md) - 変更要求の受付は、skillで文書を作り、影響範囲と重なりを示すまでを支援する
* [ADR-028](adr-028-review-skill.md) - 見直しの実施は、skillでステップごとに判断の材料と差分を示し、利用者が決める
* [ADR-029](adr-029-no-git-dates.md) - 最終更新にgitの日時を使わず、gitは更新漏れの検出と移行にだけ使う
* [ADR-030](adr-030-weekly-skill.md) - 定例の会議の準備は、skillで状況を集めて議題の案を示し、文書は変えない
* [ADR-031](adr-031-minutes-skill.md) - 議事録の取り込みは、skillが議事録をMeetingの文書にしてから、文書を作り、既存の文書も差分で更新する
* [ADR-032](adr-032-supersede-skill.md) - 判断の置き換えは、skillが新しい判断を作り、依存していた文書を1件ずつ利用者と決める
* [ADR-033](adr-033-health.md) - 依存関係のヘルスチェックをCLIの `health` に作り、エラーにせず提案として示す
* [ADR-034](adr-034-health-skill.md) - ヘルスチェックの結果は、skillが項目ごとに扱いを利用者と決め、承認された修正だけを書く
* [ADR-035](adr-035-pin-actions.md) - GitHub ActionsをSHAで固定してDependabotで更新し、DependabotのコミットはDCOの対象外にする
* [ADR-036](adr-036-rename-adaptrace.md) - 名前をAccordantからAdaptraceに変え、柔軟な意思決定と硬い開発プロセスをつなぐツールと説明する
* [ADR-037](adr-037-plugin.md) - skillをClaude Codeのプラグインとして配布し、skillに共通の書き方を各skillに置く
* [ADR-038](adr-038-release-binaries.md) - CLIを1つの実行ファイルにして、タグを付けたときにGitHub Actionsで作り、Releaseに添付する
* [ADR-039](adr-039-change-decision-skill.md) - 変更要求の判断は、skillが変更要求の文書に記録し、次の手順と影響を受ける変更要求を示す
* [ADR-040](adr-040-coverage.md) - 要件の充足は、CLIの `coverage` で依存関係から計算し、マイルストーンの範囲は待っている文書をたどって決める
* [ADR-041](adr-041-milestone-skill.md) - マイルストーンの判定は、skillが残っている作業と要件を示し、扱いを利用者と決めて、マイルストーンの計画だけを変える
* [ADR-042](adr-042-skill-test-judgement.md) - skillの試験は変更の内容から必要度を判断し、根拠と推奨案を示してメンテナーの確認を取る
* [ADR-043](adr-043-risk-skill.md) - リスクの見直しは、skillが見直しの対象を1件ずつ示し、評価、対応策、次の見直し日を利用者と決めて記録する
* [ADR-044](adr-044-review-order.md) - 重い指摘があるうちはClaudeのレビューだけを繰り返し、なくなってからGeminiのレビューを実行する
* [ADR-045](adr-045-sync-skill.md) - Backlog.mdとの同期は、skillが `sync` の計画を項目ごとに示し、衝突や問題の扱いを利用者と決めてから書き込む
