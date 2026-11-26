# プロジェクトマネジメントでの使い方

日本語 | [English](project-management.en.md)

AdaptraceをPMの仕事で使うときの、便利な使い方をまとめたガイドです。
1つのプロジェクトを例に、次の場面を順に説明します。変更要求の影響の見積もり、定例の点検、意思決定の置き換え、AIエージェントへの依頼などです。

- 対象は、v0.7の後の開発版です。v0.7にない `progress` と、`verified` による見直しの記録を使います。キーとコマンドの正確な決まりは、[スキーマの仕様](../spec/schema.md) にあります
- パッケージは未公開です。この文書の `adaptrace` は、cloneしたリポジトリでの `bun src/cli.ts` と読み替えてください
- バンドル（`.adaptrace/`）は、Adaptraceの文書をまとめて置くフォルダです。`adaptrace init` で作れます。既存のファイルは上書きしません

## 例のプロジェクト

会員サイトのログインに、多要素認証（MFA）を年内に導入するプロジェクトです。

```text
.adaptrace/
├── index.md
├── log.md
├── meetings/2026-10-01-kickoff.md     # Meeting：キックオフ
├── requirements/mfa.md                # Requirement：ログインに MFA を入れる
├── acceptance/mfa.md                  # Acceptance：受け入れ基準
├── decisions/auth-provider.md         # Decision：認証基盤に IdP-X を使う
├── tasks/mfa-login.md                 # Task：ログイン画面に MFA を追加する
├── tasks/mfa-e2e.md                   # Task：MFA の E2E テストを書く
├── risks/idp-lockin.md                # Risk：IdP-X へのロックイン
└── milestones/release.md              # Milestone：年内リリース
```

文書の中身は、たとえば次のようになります。
先頭の `---` で囲んだ部分をフロントマターと呼びます。文書の型や依存関係などの項目を書く欄です。

```markdown
---
type: Task
title: ログイン画面に MFA を追加する
state: in_progress
owner: tanaka
due: 2026-12-15
generated: { by: human:tanaka, at: 2026-10-10T10:00:00+09:00 }
satisfies: /requirements/mfa.md
depends_on: /decisions/auth-provider.md
blocks: /milestones/release.md
---

# ログイン画面に MFA を追加する
```

`owner` や `due` は、Adaptraceが決めたキーではありません。プロジェクトで自由に追加でき、Adaptraceが削除することはありません。

## 依存関係の張り方

依存関係のキーは、次の2種類に分けて考えると迷いません。

- **見直しの連鎖**（`depends_on`、`derived_from`、`satisfies`）：相手が変わったら、こちらを見直す。`impact` と `stale` がたどる
- **待ち**（`blocks`、`depends_on`）：相手が終わらないと、こちらが進めない。`board` とデッドロックの検出が使う

`depends_on` は、両方の意味を持ちます。`blocks` は待ちだけを表し、`impact` と `stale` はたどりません。

型どうしの張り方の目安です。

| 文書 | キー | 相手 | 意味 |
| --- | --- | --- | --- |
| Requirement | `derived_from` | Meeting、Change Request | どの合意から出てきた要件か |
| Acceptance | `derived_from` | Requirement | 要件から導いた受け入れ基準 |
| Decision | `depends_on` | Requirement | 要件を前提にした判断 |
| Task | `satisfies` | Requirement | このタスクで満たす要件 |
| Task | `depends_on` | Decision、Acceptance、Task | 前提にする判断、基準、先行タスク |
| Task | `blocks` | Milestone、Task | このタスクが終わらないと進まないもの |
| Risk | `depends_on` | Decision | その判断から生じるリスク |
| Decision | `supersedes` | Decision | 古い判断を置き換える |

**Milestoneは、`blocks` で受けるのがおすすめです。**
Milestoneからタスクへ `depends_on` を張ると、タスクを更新するたびに、`stale` がMilestoneを「古い」と表示します。これが点検の邪魔になります。
タスクの側に `blocks: /milestones/release.md` と書けば、待ちの関係を表せます。しかも、見直しの連鎖には入りません。

本文のMarkdownリンク（`[ADR](../decisions/auth-provider.md)`）は「参照」で、依存関係には数えません。
関連として読んでほしいだけの文書は、本文でリンクします。変わったら見直すべき文書だけを、フロントマターに書きます。

## 変更要求が来たら

顧客から「SMSでもコードを受け取れるようにしてほしい」と言われたとします。Adaptraceが一番役に立つ場面です。

### 1. 変更要求を登録する

バンドルに `change-requests/cr-001-sms.md` を新しく作成し、次のように書きます。

```markdown
---
type: Change Request
title: SMS でもコードを受け取れるようにする
state: proposed
requested_by: 顧客 A 社
received_at: 2026-10-28T10:00:00+09:00
generated: { by: human:sato, at: 2026-10-28T10:00:00+09:00 }
---
```

`received_at` は、変更要求を受け付けた日時です。後で `state` を変えても、この値は変えません。`progress` で見直しの進み具合を確認するときに使います。

### 2. 受け入れる前に、波及する範囲を確認する

`impact` は、変わる文書に依存している文書を、日付に関係なくすべて列挙します。
要件を書き換える前に実行すれば、この要件を変えると何を見直すことになるかがわかります。

```bash
adaptrace impact requirements/mfa.md
```

```text
Direct (3)
  acceptance/mfa.md  derived_from  ...
  decisions/auth-provider.md  depends_on  ...
  tasks/mfa-login.md  satisfies  ...

Indirect (2)
  tasks/mfa-e2e.md  depends_on -> acceptance/mfa.md  ...
  risks/idp-lockin.md  depends_on -> decisions/auth-provider.md  ...
```

波及するのは、受け入れ基準、認証基盤の判断、実装とテストのタスク、リスクの5つです。
成果ベースの契約なら、これが判断の根拠になります。受け入れるか、追加の費用で受けるか、断るかの判断です。
認証基盤の判断まで見直しになることもわかります。そこで、IdP-XがSMSを扱えるかを先に確認する、といった段取りも見えてきます。

`--format json` を付けると、表計算ソフトや見積もりのツールに渡せる形で出力します。

`estimate` を使うと、判断の材料を1枚にまとめられます。

```bash
adaptrace estimate requirements/mfa.md --request change-requests/cr-001-sms.md --format markdown
```

- 変更が届く文書の一覧を示します。あわせて、次のものも示します。Taskの `state` ごとの数、作り直しになる終わったTask、関わる人（`owner`）、期日に響くMilestoneです
- `--llm "claude -p"` を付けると、文書ごとの規模（`small` / `medium` / `large`）と工数（人時）の目安が付き、合計も出ます。LLM（文章を生成するAI）による目安なので、見積もりの下書きとして使います。数字は担当者と確認してください
- `--format markdown` の出力は、そのまま変更要求の文書やIssueに貼れます

### 3. 受け入れたら、要件を更新する

変更要求を `state: accepted` にします。
次に、要件の `derived_from` に変更要求を追加し、`generated.at` を今の日時にします。

```yaml
generated: { by: human:sato, at: 2026-10-29T10:00:00+09:00 }
derived_from:
  - /meetings/2026-10-01-kickoff.md
  - /change-requests/cr-001-sms.md
```

こうしておくと、あとから「この要件はなぜ変わったのか」を、変更要求までたどれます。
`adaptrace impact change-requests/cr-001-sms.md` を使えば、変更要求1件の波及をまとめて確認することもできます。
見直しがどこまで進んだかは、`adaptrace progress change-requests/cr-001-sms.md` で確認できます。詳しくは [PMBOKの文書を変更要求に合わせて更新する](pmbok.md) を参照してください。

### 4. 見直す文書を順に確認する

要件より古い文書に、`needs review`（要確認）が付きます。

```text
Direct (3)
  acceptance/mfa.md  derived_from  updated 2026-10-03T10:00:00+09:00 (generated.at)  needs review
  ...
5 documents to review
```

1つずつ開いて、修正が必要なら修正し、`generated.at` を更新します。
**見直した結果、変更が要らなかった場合は、`generated` を変えずに、`verified: { by, at }` を今の日時にします。**
記録しないと、いつまでも `needs review` のまま残ります。
`verified` で記録すると、その文書に依存する文書は見直しの対象になりません。内容が変わっていないからです。

### 5. LLMに一次判定をさせる

見直す文書が多いときは、`assess` を使ってLLMに一次判定をさせると速くなります。
`--llm` には、標準入力でプロンプトを受け取り、答えを標準出力に書くコマンドを渡します。

```bash
adaptrace assess requirements/mfa.md --llm "claude -p"
```

直接の依存元ごとに、見直しの要否（`none` / `minor` / `major`）、理由、更新案の差分が出ます。

```text
acceptance/mfa.md  derived_from  updated 2026-10-03T10:00:00+09:00 (generated.at)  minor
  既存の受け入れ基準（TOTP アプリのコードでログインできる）は今も正しい。ただ、要件に追加された SMS でのワンタイムコード受け取りを検証する基準がないため、1 行追加する。
  Proposal:
    ...
    -generated: { by: human:sato, at: 2026-10-03T10:00:00+09:00 }
    +generated: { by: adaptrace/0.5.0, at: 2026-10-29T03:00:00Z }
    ...
     - TOTP アプリで発行したコードでログインできる
    +- SMS で受け取ったワンタイムコードでログインできる

decisions/auth-provider.md  depends_on  updated 2026-10-05T10:00:00+09:00 (generated.at)  none
  認証基盤に IdP-X を使うという決定の前提や結論は変わらない。ただし IdP-X が SMS のワンタイムコード配信に対応しているかは、この差分からは確認できない。
  Proposal: record the review in verified
```

- LLMが読むのは、次の2つです。1つは、その文書を最後にコミットしてから要件のどこが変わったかを示す差分です。もう1つは、その文書の全文です。`--llm` を付けなければ、差分だけを表示します。差分は、人が見直すときの材料にもなります
- **ファイルには書きません。** 判定を読み、案が妥当なら適用します。`--format json` の `proposal.diff` は、`patch -p1 -d .adaptrace` で適用できます
- `none` の案は、`verified` だけを更新して「見直した」記録を残すものです。`generated` は変えません。理由の中に、確認すべき点が書かれていることがあります。上の例では、IdP-XがSMSに対応しているかどうかです。理由を読んでから適用してください
- 対象は、直接の依存元だけです。受け入れ基準を更新したら、次は `adaptrace assess acceptance/mfa.md` でE2Eテストのタスクを確認します
- 案の `generated.by`（`none` の案では `verified.by`）は、既定で `adaptrace/<バージョン>` です。`--by claude-code/1.0` のように判定したツールを書いておくと、区別できます

PMBOKのスコープ記述書、WBS、ベースラインなどを、変更要求に合わせてもれなく更新する方法は、[PMBOKの文書を変更要求に合わせて更新する](pmbok.md) で説明しています。

## 定例の点検

週次の定例の前に、次の3つを実行すると、状況を一通りつかめます。

```bash
adaptrace validate   # 壊れた依存先、循環、デッドロック
adaptrace stale      # 依存先より古い文書、見直しの期限を過ぎた文書
adaptrace board      # タスクの state ごとの一覧と、待っているタスク
```

`board` は、終わっていないタスクを待っているタスクに、`waiting for` を付けます。

```text
to_do (1)
  - MFA の E2E テストを書く  tasks/mfa-e2e.md  waiting for tasks/mfa-login.md

in_progress (1)
  - ログイン画面に MFA を追加する  tasks/mfa-login.md
```

`--format markdown` を付けると、議事録やIssueに貼れる形になります。
`--link-base` に、リポジトリ上のバンドルのURLを渡すと、タスク名がその文書へのリンクになります。

```bash
adaptrace board --format markdown --link-base https://github.com/<owner>/<repo>/blob/main/.adaptrace/
```

Claude Codeを使っている場合は、skill `adaptrace-weekly` で、これらの確認をまとめて行えます。skillは、Claude Codeに作業の手順を教えるファイルです。期限を過ぎたタスク、待っているタスク、見直しが必要な文書、変更要求の状況を区分ごとの表にし、議題の案と次の一手を示します。skillの入手方法は、[既存のリポジトリに導入するガイド](adoption.md#claude-codeに取り込みを手伝ってもらう) と同じです。プラグインでインストールした場合は、すべてのskillがそろっています。フォルダをコピーする場合は、コマンドの `adaptrace-adopt` を `adaptrace-weekly` に置き換えてください。

### マイルストーンの判定

マイルストーンの前には、`coverage` で、範囲の要件と残っている作業を確認します。

```bash
adaptrace coverage --milestone milestones/release-1.md
```

満たす作業がない要件は `uncovered`、作業が終わっていない要件は `open` と示されます。続けて、マイルストーンが待っている作業を、担当者と期日とともに一覧にします。期日がマイルストーンより後の作業には、`(after the milestone)` が付きます。`coverage` は、v1.0.0の次のリリースから使えます。

Claude Codeを使っている場合は、skill `adaptrace-milestone` で、判定の材料をまとめ、残っている事柄の扱いを対話しながら決められます。範囲に関わる未決の変更要求と古くなった文書も示し、作業を次のマイルストーンに移す、期日を変えるなどの変更を、承認を得てから書きます。このskillも、v1.0.0の次のリリースから使えます。skillの入手方法は、上の `adaptrace-weekly` と同じです。

### リスクの定期的な見直し

リスクには、`stale_after` で次の見直し日を書いておきます。その日を過ぎると、`stale` に表示されます。

```yaml
type: Risk
title: IdP-X へのロックイン
state: open
stale_after: 2026-10-26T00:00:00+09:00
depends_on: /decisions/auth-provider.md
```

```text
risks/idp-lockin.md  updated 2026-10-05T11:00:00+09:00 (generated.at)
  past stale_after (2026-10-26T00:00:00+09:00)
```

見直したら、`stale_after` を次の見直し日にし、`generated.at` を今の日時にします。
リスクを `depends_on` で判断につないでおけば、判断が変わったときにも `stale` に表示されます。

## 意思決定を置き換える

判断を覆すときは、古いDecisionを書き換えずに、新しいDecisionを作ります。たとえば、認証基盤をIdP-XからIdP-Yに切り替える場合です。

```yaml
type: Decision
title: 認証基盤を IdP-Y に切り替える
supersedes: /decisions/auth-provider.md
depends_on: /requirements/mfa.md
```

古いDecisionには、`status: deprecated` を付けます。経緯が残り、`impact` と `stale` の一覧からは外れます。

ただし、古いDecisionを `depends_on` で指していた文書は、自動では新しいDecisionに付け替わりません。
置き換える前に、古いDecisionについて `impact` を実行し、付け替える文書を洗い出します。

```bash
adaptrace impact decisions/auth-provider.md
```

```text
Direct (2)
  risks/idp-lockin.md  depends_on  ...
  tasks/mfa-login.md  depends_on  ...
```

この2つの文書について、依存先を新しいDecisionに修正し、内容も見直します。

Claude Codeを使っている場合は、skill `adaptrace-supersede` で、この作業を対話しながら進められます。skillは、Claude Codeに作業の手順を教えるファイルです。

- 新しいDecisionを作り、古いDecisionに `status: deprecated` を付けます。古いDecisionの本文は変えません
- 古いDecisionに依存していた文書ごとに、新しいDecisionに付け替えるか、外すか、中止するか、そのままにするかを、あなたと決めます
- 付け替えた文書と、間接的に影響を受ける文書は、見直しの対象として示します。見直しは、skill `adaptrace-review` で進められます

skillの入手方法は、[既存のリポジトリに導入するガイド](adoption.md#claude-codeに取り込みを手伝ってもらう) と同じです。プラグインでインストールした場合は、すべてのskillがそろっています。フォルダをコピーする場合は、コマンドの `adaptrace-adopt` を `adaptrace-supersede` に置き換えてください。

## 待ちとデッドロック

タスクの順序は、`depends_on` か `blocks` で書きます。`depends_on` は、こちらが相手を待つ関係です。`blocks` は、相手がこちらを待つ関係です。
どちらで書いても、`board` の `waiting for` に表示されます。

お互いを待つ書き方をすると、`validate` が警告します。この状態をデッドロックと呼びます。

```text
warning tasks/mfa-e2e.md:12  deadlock: tasks/mfa-login.md waits for tasks/mfa-e2e.md (blocks), tasks/mfa-e2e.md waits for tasks/mfa-login.md (depends_on). Remove one of these dependencies, or split a document so part of the work can start  [dependency-deadlock]
```

計画の途中では起こりうるので、エラーではなく警告にしています。理由は [ADR-009](../../.adaptrace/decisions/adr-009-deadlock-warning.md) にあります。
解消するには、依存を1つ外すか、タスクを分けて一部を先に始められるようにします。
たとえば「E2Eテストの準備」と「E2Eテストの実行」に分ければ、準備は実装と並行して進められます。

## 依存関係を整理する

文書が増えると、依存関係に整理したい箇所が出てきます。`health` は、整理の候補を示します。どれもエラーではありません。

```bash
adaptrace health
```

| 候補 | 内容 | 主な扱い |
|---|---|---|
| `deprecated-target` | 廃止した文書を指している | 置き換えた文書に付け替える |
| `redundant-dependency` | 同じキーの別の経路でも同じ文書に届く依存や、2回書いた依存 | 外す。直接の関係を明示したいときは残す |
| `orphan` | 廃止していない文書との依存関係がない | 依存関係を張るか、不要なら廃止する |

デッドロックや循環依存は、`validate` が示します。

Claude Codeを使っている場合は、skill `adaptrace-health` で、この作業を対話しながら進められます。

- `health` と `validate` の結果を区分ごとに数えて示し、どこから整理するかを尋ねます
- 候補ごとに、関係する文書を読んで、おすすめの扱いと理由を示します。決めるのはあなたです
- 承認した差分だけを書きます。文書の本文と最終更新（`generated`）は変えません

skillの入手方法は、[既存のリポジトリに導入するガイド](adoption.md#claude-codeに取り込みを手伝ってもらう) と同じです。プラグインでインストールした場合は、すべてのskillがそろっています。フォルダをコピーする場合は、コマンドの `adaptrace-adopt` を `adaptrace-health` に置き換えてください。

## 議事録から要件や判断を起こす

会議で決まったことは、まずMeetingの文書にします。そこから要件や判断の文書を作ります。

```yaml
type: Requirement
title: ログインに多要素認証を入れる
derived_from: /meetings/2026-10-01-kickoff.md
```

こうすると、いつ、どの会議で合意したかが残ります。
議事録を訂正したときには、`impact` で影響する要件と判断がわかります。

### LLMに下書きを作らせる

`extract` を使うと、議事録からDecision、Task、Requirement、Riskの下書きを、LLMに作らせられます。

```bash
adaptrace extract meetings/2026-10-01-kickoff.md --llm "claude -p"           # 案を表示するだけ
adaptrace extract meetings/2026-10-01-kickoff.md --llm "claude -p" --write   # 新しいファイルを作る
```

- 下書きは、すべて `status: draft` で、`derived_from` で議事録を指します。内容を確認したら、`status` を削除するか `stable` にします
- 既存の文書の一覧もLLMに渡します。そのため、すでにある要件や判断は作り直さず、`depends_on` や `satisfies` でつなぎます
- `--write` を付けても、既存のファイルは変更しません。新しいファイルを作るだけです
- 担当者や期日が議事録に書いてあれば、`owner` や `due` に入ります
- 「来週もう一度話す」のように結論の出ていない話は、下書きにしません

### Claude Codeに取り込みを手伝ってもらう

Claude Codeを使っている場合は、skill `adaptrace-minutes` で、議事録の取り込みを対話しながら進められます。skillは、Claude Codeに作業の手順を教えるファイルです。

- 議事録がバンドルの外にあれば、まずMeetingの文書にします。メールアドレスなどの連絡先は写しません
- 新しい文書を作るだけでなく、既存の文書の更新も提案します。たとえば、終わったタスクの `state` や、置き換えた判断です。判断を置き換えるときは、新しい判断に `supersedes` を書き、古い判断を `status: deprecated` にします
- 顧客からの要望のように、要件を変える内容は、要件を書き換えず、変更要求として受け付けるよう案内します
- `--llm` のコマンドは要りません。どのファイルを書くかは、差分を見て、あなたが決めます

skillの入手方法は、[既存のリポジトリに導入するガイド](adoption.md#claude-codeに取り込みを手伝ってもらう) と同じです。プラグインでインストールした場合は、すべてのskillがそろっています。フォルダをコピーする場合は、コマンドの `adaptrace-adopt` を `adaptrace-minutes` に置き換えてください。

## Backlog.mdと併用する

日々のタスク管理は、[Backlog.md](https://github.com/MrLesk/Backlog.md) のカンバンで行います。要件や判断とのつながりは、Adaptraceで管理します。このような分担ができます。

```bash
adaptrace sync            # 何が変わるかを表示するだけ
adaptrace sync --write    # 実際に書き込む
```

- `type: Task` の文書と、Backlog.mdのタスクを双方向に変換します。`state` と、Backlog.mdの `status` が対応します
- `depends_on` のうち、要件や判断へのものは、Adaptrace側にだけ残ります。Backlog.md側はタスク間の依存だけになるので、カンバンが散らかりません
- 両側で同じタスクが変わったときは、上書きせずに衝突として知らせます。`--resolve adaptrace` か `--resolve backlog` で、どちらかにそろえます

開発者はBacklog.mdでタスクを動かします。PMは定例の前に `sync` で取り込み、`stale` と `board` を確認します。
この流れにすると、それぞれが慣れたツールを使えます。

インストールから併用の流れまでは、[Backlog.mdと併用する](backlog-md.md) で画面付きで説明しています。

## AIエージェントに任せる

`adaptrace mcp` をClaude CodeなどのAIエージェントに登録すると、エージェントがバンドルを読み、更新案を作れます。
MCPは、AIエージェントが外部のツールを使うための仕組みです。

```bash
claude mcp add adaptrace -- bun /path/to/Adaptrace/src/cli.ts mcp .adaptrace
```

たとえば、次のように頼めます。

- 「この議事録から決まったことをDecisionに、宿題をTaskにして」
- 「requirements/mfa.mdにSMSの要件を追加した。assess_contextで影響を判定して、それぞれの更新案を出して」
- 「staleに出ている文書を見直して、変更が要るものと要らないものに分けて」
- 「今週のboardを見て、待ちが詰まっているタスクを教えて」

エージェントは、次の順に作業します。

1. `impact`、`stale`、`board` で状況を調べる
2. `assess_context` で、変わった文書の差分と、依存元の全文を受け取って判定する
3. `propose_document` と `propose_update` で更新案を作る

更新案には、差分と、その変更で増える・減る `validate` の問題が付きます。
**MCPサーバーはファイルに書きません。** 適用するかどうかは、人が決めます。
エージェント自身の編集の機能で適用する場合も、差分を確認してから適用してください。

エージェントが作った文書は、`generated.by` を `claude-code/1.0` のような値にしておきます。そうすると、人が書いたもの（`human:<id>`）と区別できます。

## GitとCIに組み込む

バンドルはただのMarkdownです。そのため、コードと同じリポジトリに置き、PRでレビューできます。

- 要件や判断の変更もPRにすると、差分が残ります。誰がいつ合意したかを、gitの履歴でたどれます
- 最終更新は、フロントマターの `generated.at` だけで決まります。gitのコミットの日時は使わないので、いつコミットしたか、どこで実行したかで結果は変わりません
- CIで `adaptrace validate` を実行すると、壊れた依存先や循環を、PRの段階で止められます。CIは、変更のたびに検査を自動で実行する仕組みです。エラーがあれば終了コードが1になり、警告だけなら0です
- 本文を変えたのに `generated` を更新し忘れると、`validate` が警告します。この検査は、gitの履歴を使います。CIでは、履歴をすべて取得する設定にしてください（GitHub Actionsなら `actions/checkout` の `fetch-depth: 0`）

## つまずきやすい点

- **日時にはタイムゾーンを書きます。** `2026-10-29` や `2026-10-29 10:00` は「日時なし」として扱われ、比較できません。`2026-10-29T10:00:00+09:00` のように書きます
- **`status` に進み具合を書かないでください。** `status` は、OKFのライフサイクル（`draft`、`stable`、`deprecated`）だけに使います。進み具合は `state` に書きます
- **`state` の値はプロジェクトで決めます。** Backlog.mdと変換するTaskは、Backlog.mdの `statuses` を小文字にした値（`to_do`、`in_progress`、`done` など）にそろえます
- **依存関係のパスは `/` で始めます。** 相対パスも読めます。ただ、ファイルを移動したときに壊れにくいのは、`/` で始めるバンドル絶対パスです
- **何でも `depends_on` でつながないでください。** 見直しの連鎖が長くなりすぎて、1つの変更ですべての文書が `needs review` になります。相手が変わったら本当にこの文書を見直すか、を基準に決めます
