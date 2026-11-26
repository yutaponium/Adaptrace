# STATUS

最新の状況と、次にやること。`AGENTS.md` と食い違う場合はこのファイルを優先する。

最終更新：2026-11-26

## 今の状況

- v1.0の機能（残りのskill、名前の変更）を実装した。v1.0.0から安定版とし、データの形式とコマンドはSemantic Versioningに従って変える
- データモデル（型の一覧と依存関係のキー）は、v1.0.0で確定した。仕様は `docs/spec/schema.md`（v1.0）。型は、OKFの方針に従い、プロジェクトごとに追加できる。依存関係のキーを変えるときは、メジャーバージョンを上げる
- CLIは `init`、`validate`、`graph`、`impact`、`assess`、`extract`、`estimate`、`progress`、`stale`、`health`、`list`、`conflicts`、`coverage`、`meeting`、`migrate-dates`、`sync`、`board`、`mcp`。スキーマは `docs/spec/schema.md`
- v0.9.0までは、Accordantという名前でリリースした（GitHub Releaseのみ。npmには公開していない）
- v1.0.0を、公開用の新しいリポジトリ（`yutaponium/Adaptrace`）でリリースし、publicにした。履歴は移していない。`main` にブランチ保護（PRとCIの成功が必須、承認の数は0）を設定し、Private vulnerability reportingを有効にした。旧リポジトリ（`yutaponium/Accordant`）は、privateのままアーカイブした。プラグインのインストール（7つのskill）と、`bun add -g github:yutaponium/Adaptrace#v1.0.0` でのインストールを確認した（2026-11-26）
- 名称はAdaptraceにした（Accordantから変更、ADR-036）。ロゴを `docs/images/logo/` に置き、名称とロゴの使い方の方針を `TRADEMARKS.md` に書いた。名称とロゴはMIT Licenseの対象外（2026-11-26）
- skillを、Claude Codeのプラグインとして配布する。リポジトリのルートがプラグインとマーケットプレイスを兼ねる（`.claude-plugin/`）。skillに、共通の書き方の節を置いた（2026-11-26、ADR-037）
- 行動規範（`CODE_OF_CONDUCT.md`）の連絡先を、プロジェクト用のメールアドレス `adaptrace.project@gmail.com` にした（2026-11-26）
- GitHub Actionsのアクションを、コミットのSHAで固定した。DependabotがアクションとBun（`bun.lock`）の依存パッケージの更新を、毎週PRで提案する（2026-11-26、ADR-035）。Dependabotのコミットは、DCOの `Signed-off-by` の対象外にした
- skillの試験は一律には必須にせず、変更の内容から必要度を判断し、根拠と推奨案を示してメンテナーの確認を取る（2026-11-26、ADR-042）
- PRの前のレビューは、`/code-review` とGeminiのレビュー（skill「gemini-review」）を同時に開始する（2026-11-06、ADR-017）。重い指摘があるうちは `/code-review` だけを繰り返し、なくなってから最後にGeminiを実行する（2026-11-26、ADR-044）。ADR-007は `status: deprecated` にした。送らないものは `.gemini-review.json` で決める
- メール・チャットの文案やメモは、リポジトリの `.draft/` に書く（2026-11-06、`CLAUDE.md`）。`.draft/` は `.gitignore` で除外した
- `AGENTS.md` に「文書の書き方と用語」を追加した（2026-11-23）
- 変更管理の支援を順に追加している。`impact` と `estimate` に `--order review`（上流から見直す順番）を追加した（2026-11-25）。変更要求ごとの見直しの状況を示す `progress` を追加した（2026-11-25、ADR-018）。文書の一覧を表にする `list` を追加した（2026-11-25、ADR-019）。提案書の優先度「高」の候補は、これで実装した。PMBOKの文書のテンプレートを `examples/pmbok/` に置いた（2026-11-25）。`init --template` は、使われ方を見てから検討する。見直して変更が要らなかったことを `verified` に記録するようにした（2026-11-25、ADR-020）。見直しの記録でgitの日時を `generated` に書き込まないことにした（2026-11-25、ADR-021）。Markdown以外のファイルを、OKFの `resource` と `sources` で指し、SHA-256の記録で変更を検出するようにした（2026-11-25、ADR-022）。変更要求の起点を指すキー `changes` と、影響範囲が重なる未決の変更要求を示す `conflicts` を追加した（2026-11-25、ADR-023。候補7の段階A）。重なる組が両立できるかをLLMで判定する `conflicts --llm` を追加した（2026-11-25、ADR-024。候補7の段階B）。協議の会議の準備を支援する `meeting` を追加した（2026-11-25、ADR-025。候補7の段階C）。提案書の候補で残っているのは、`init --template`。既存のリポジトリに導入する手順のガイド（`docs/guide/adoption.md`）と、取り込みと依存関係の作成を対話しながら支援するClaude Codeのskill `adaptrace-adopt`（`skills/`）を追加した（2026-11-25、ADR-026）。skillの試験は `tests/skills/` に置き、LLMを使わない部分は `bun test` で、skillの実行は変更したときに `run.ts` で行う。変更要求の受付を支援するskill `adaptrace-change-request` を追加した（2026-11-25、ADR-027）。見直しの実施を支援するskill `adaptrace-review` を追加した（2026-11-25、ADR-028）。最終更新にgitの日時を使わないようにし、`validate` に日時の警告を、`migrate-dates` に移行の手段を加えた（2026-11-26、ADR-029）。定例の会議の準備を支援するskill `adaptrace-weekly` を追加した（2026-11-26、ADR-030）。議事録の取り込みを支援するskill `adaptrace-minutes` を追加した（2026-11-26、ADR-031）。判断の置き換えを支援するskill `adaptrace-supersede` を追加した（2026-11-26、ADR-032）。依存関係を整理する提案を示す `health` を、CLIとMCPに追加した（2026-11-26、ADR-033）。その結果を利用者と整理するskill `adaptrace-health` を追加した（2026-11-26、ADR-034）。`board` で、中止したタスク（`status: deprecated`）を待ちの相手にしないようにした（2026-11-26）。英語版のドキュメント（`README.en.md`、`CONTRIBUTING.en.md`、`docs/guide/*.en.md`、`docs/spec/schema.en.md`）を追加した。日本語版と英語版の冒頭で、互いにリンクする。skillの英語の参考訳を `docs/skills/` に置いた。実行されるのは日本語の `SKILL.md` である（2026-11-26、ADR-003）。本文のリンクとして、参照形式のリンクと、`<...>` で囲んだ空白入りのリンク先を読むようにした（2026-11-26）
- CLIを1つの実行ファイルにして、GitHubのReleaseに添付するようにした。`bun build --compile` で、Linux、macOS、Windows向けに作る。`v*` のタグをpushすると、GitHub Actionsが作り、Releaseがなければ下書きのReleaseを作る。依存パッケージのライセンスの一覧を同梱する（2026-11-26、ADR-038）。v1.0.0のReleaseにも、手動の実行で添付した（2026-11-26）
- 変更要求の判断（承認、却下、保留）を記録するskill `adaptrace-change-decision` を追加した。`state` と本文の「判断」の見出しに記録し、起点の更新は `adaptrace-review` に任せる（2026-11-26、ADR-039）
- 要件ごとに、満たす文書と進み具合を示す `coverage` を、CLIとMCPに追加した。`--milestone` で、マイルストーンが待っている文書をたどった範囲に絞る（2026-11-26、ADR-040）。期日がマイルストーンより後の作業に付ける `late` を、TaskだけでなくMilestoneにも付けるようにした（2026-11-26）
- マイルストーンの判定を支援するskill `adaptrace-milestone` を追加した。材料を示し、扱いを利用者と決め、マイルストーンの計画だけを変える（2026-11-26、ADR-041）
- リスクの見直しを支援するskill `adaptrace-risk` を追加した。1件ずつ扱いを利用者と決め、`verified` と `stale_after` に記録する（2026-11-26、ADR-043）

## 次にやること

- [ ] skillの候補（2026-11-26に4つ追加。ADR-026の使い分けに従い、既存の機能を組み合わせて対話しながら進める作業）。作ったら、`tests/skills/` に試験も置く
  - 済：既存のファイルの取り込み（`adaptrace-adopt`、ADR-026）、変更要求の受付（`adaptrace-change-request`、ADR-027）、見直しの実施（`adaptrace-review`、ADR-028）、定例の会議の準備（`adaptrace-weekly`、ADR-030）、議事録の取り込み（`adaptrace-minutes`、ADR-031）、判断の置き換え（`adaptrace-supersede`、ADR-032）、バンドルのヘルスチェック（`health` とskill `adaptrace-health`、ADR-033、ADR-034）、変更要求の判断の記録（`adaptrace-change-decision`、ADR-039）、マイルストーンの判定（`coverage` とskill `adaptrace-milestone`、ADR-040、ADR-041）、リスクの見直し（`adaptrace-risk`、ADR-043）
  - [ ] Backlog.mdとの同期（`adaptrace-sync`）：`sync` の差分を項目ごとに示し、どちらに合わせるか（`--resolve`）を利用者と決める。Backlog.mdを使うチーム向け
  - `state` を書き換えるskillは、`state` の値の一覧が未確定なので、バンドルで使っている値にそろえる（`adaptrace-change-request` と同じ方針）

## 未確定事項

推測で埋めず、確認を取ること。

- `state` の値の一覧（型ごとに決めるか、共通にするか）。Backlog.mdと変換するTaskは、Backlog.mdの `statuses` を小文字にした値（`to_do`、`in_progress`、`done` など）になる
- npmへの公開の有無とパッケージ名
