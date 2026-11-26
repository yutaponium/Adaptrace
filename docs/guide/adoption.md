# 既存のリポジトリにAdaptraceを導入する

日本語 | [English](adoption.en.md)

すでに開発が進んでいるリポジトリに、Adaptraceを後から導入する手順を説明します。
要件、設計の判断、タスクなどの文書が、Wiki、`docs/` フォルダ、Excel、Issueなどに散らばっている状態を想定しています。

導入のこつは、一度にすべてを移さないことです。変更の影響を追えなくて困っている文書から、小さく始めます。

- 対象は、Adaptrace v1.0.0です。キーとコマンドの正確な決まりは、[スキーマの仕様](../spec/schema.md) にあります
- このガイドの `adaptrace` は、手順1で `bun add -g` でインストールしたコマンドです。cloneして使う場合は、cloneしたAdaptraceのリポジトリでの `bun src/cli.ts` と読み替えてください
- 「導入先のリポジトリ」は、Adaptraceを使い始めるプロジェクトのリポジトリです。このガイドでは、`my-project` と書きます

## 全体の流れ

1. Adaptraceを使える状態にする
2. 最初に管理する文書を決める
3. 導入先のリポジトリにバンドルを作る
4. 既存の文書を取り込む
5. 依存関係を張って、検証する
6. PRにして、チームで確認する
7. CIとAIエージェントに組み込む
8. 運用を始める

## 1. Adaptraceを使えるようにする

Adaptraceは、[Bun](https://bun.sh/) で動きます。Bunをインストールしてから、次のどちらかの方法でインストールします。Bunのない環境では、実行ファイルをダウンロードして使います。
リリースしたバージョンのタグを指定すると、チームの全員が同じ動作で使えます。

**GitHubから直接インストールする**（いちばん簡単）

```bash
bun add -g github:yutaponium/Adaptrace#v1.0.0
adaptrace --version
```

`adaptrace` コマンドが使えるようになります。npmには公開していないので、GitHubのリポジトリからインストールします。

**実行ファイルをダウンロードする**（Bunが要りません）

[Releases](https://github.com/yutaponium/Adaptrace/releases) から、使う環境のファイル（`adaptrace-<版>-<環境>.tar.gz`、Windowsは `.zip`）をダウンロードし、展開した `adaptrace` をPATHの通ったフォルダに置きます。環境は、`linux-x64`、`linux-arm64`、`darwin-arm64`（Apple silicon）、`darwin-x64`（Intel Mac）、`windows-x64` です。ファイルが正しいかは、同じページの `SHA256SUMS` で確認できます。実行ファイルには署名がありません。macOSで開けないときは `xattr -d com.apple.quarantine adaptrace` を実行し、Windowsで警告が出たときは「詳細情報」から実行します。

```bash
tar -xzf adaptrace-v1.0.0-linux-x64.tar.gz
sudo mv adaptrace /usr/local/bin/
adaptrace --version
```

**リポジトリをcloneする**

skillのフォルダをコピーしたい場合や、仕様とガイドを手元で読みたい場合は、リポジトリをcloneします。

```bash
git clone https://github.com/yutaponium/Adaptrace.git ~/tools/adaptrace
cd ~/tools/adaptrace
git checkout v1.0.0
bun install
```

cloneした場合、毎回 `bun ~/tools/adaptrace/src/cli.ts` と打つのは長いので、別名を付けておくと便利です。

```bash
alias adaptrace='bun ~/tools/adaptrace/src/cli.ts'
```

コマンドは、導入先のリポジトリのルートで実行します。バンドルの既定の場所は、今のフォルダの `.adaptrace/` です。

## 2. 最初に管理する文書を決める

最初から、すべての文書をAdaptraceに移す必要はありません。次のような文書から始めると、効果を早く実感できます。

- 変更が多く、そのたびに関係する文書の更新もれが起きている文書。たとえば、要件と、それに基づく設計の判断やタスク
- 顧客や他部署から変更要求を受けることが多い領域の文書
- 1つの判断が、多くのタスクやリスクの前提になっている文書

最初は、1つの機能や1つの領域に絞ります。たとえば「ログインまわりの要件、判断、タスク、リスク」で10〜20件ほどです。
使い方に慣れてから、範囲を広げます。

一方で、次の文書は移さなくて構いません。

- 日々のタスクの細かな管理。IssueやBacklog.mdなど、今のツールを使い続けます。Backlog.mdとの連携は、[Backlog.mdと併用する](backlog-md.md) を参照してください
- 変更されない記録。過去の議事録や、完了したプロジェクトの資料などです

## 3. バンドルを作る

導入先のリポジトリに、作業用のブランチを作ってから、バンドルを作ります。
バンドルは、Adaptraceの文書をまとめて置くフォルダです。

```bash
cd my-project
git switch -c chore/adopt-adaptrace
adaptrace init --title "会員サイト"
```

`init` は、次のファイルを作ります。すでにあるファイルは上書きしません。

```text
.adaptrace/
├── index.md                # 全体の目次
├── log.md                  # 変更の記録（新しい順）
├── requirements/index.md
├── decisions/index.md
├── tasks/index.md
├── risks/index.md
└── meetings/index.md
```

PMBOKに沿って文書を管理しているプロジェクトでは、`init` の代わりに、[PMBOKの文書のテンプレート](../../examples/pmbok/README.md) をコピーしても構いません。
テンプレートの使い方と、PMBOKの文書の分け方は、[PMBOKの文書を変更要求に合わせて更新する](pmbok.md) にあります。

## 4. 既存の文書を取り込む

既存の文書を取り込む方法は、2つあります。

| 方法 | 向いている文書 | 正となる文書 |
|---|---|---|
| 文書をバンドルに移す | Markdownで書いていて、これからも更新する文書 | バンドルの文書 |
| 代わりの文書を置いて、元のファイルを指す | Excel、MS Project、Wiki、ほかのツールが読むファイルなど、移せない文書 | 元のファイル |

### 文書をバンドルに移す

Markdownの文書は、バンドルに移して、先頭にフロントマターを追加します。
フロントマターは、先頭の `---` で囲んだ部分です。文書の型や依存関係などの項目を書きます。

```markdown
---
type: Requirement
title: ログインに多要素認証（MFA）を入れる
owner: sato
generated: { by: human:sato, at: 2026-11-10T10:00:00+09:00 }
---

（元の文書の本文）
```

- 1つのファイルに複数の要件が書いてある場合は、1件1ファイルに分けます。依存関係は文書の単位で張るので、分けておくと影響の範囲を細かく追えます
- `type` は必須です。`Requirement`、`Decision`、`Task`、`Risk` などを書きます
- `generated` には、内容を書いた人と、内容の最終更新の日時を書きます。移しただけで内容を変えていない文書は、元のファイルを最後に変えたコミットの作者と日時にします（`git log -1 --format='%an %aI' -- <元のパス>`）。取り込んだ日時にすると、文書どうしの新旧が分からなくなります
- 日時には、`+09:00` のようにタイムゾーンを付けます
- 元の場所には、移した先を案内する1行を残しておくと、ほかの文書からのリンクをたどる人が迷いません

既存のADRがある場合は、`decisions/` に移して `type: Decision` にします。
置き換えられたADRがあれば、新しい方の文書に `supersedes` で古い方を書きます。

### 代わりの文書を置いて、元のファイルを指す

移せない文書は、その文書を表す「代わりの文書」をバンドルに置きます。
`resource` で、代わりの文書から元のファイルを指します。パスは、代わりの文書からの相対パスで、`./` か `../` から書きます。

```markdown
---
type: Requirement
title: 会員サイトの要件定義書
owner: sato
resource: ../../docs/requirements.md
generated: { by: human:sato, at: 2026-11-25T10:00:00+09:00 }
---

要件の本文は `docs/requirements.md` にあります。
```

`adaptrace stale` を実行すると、元のファイルのSHA-256（ファイルの内容から計算する値）が示されます。

```text
requirements/mfa.md  updated 2026-11-25T10:00:00+09:00 (generated.at)
  no sha256 recorded for its file ../../docs/requirements.md (now 3b1c255900b1c48d2e427656275ce6a5a8c501ac04745204efdba589c11f9d16)
```

示された64桁の値を `resource_sha256` に書くと、記録が完了します。`adaptrace stale --format json` でも、同じ値を `current` として取得できます。
その後に元のファイルが変わると、`stale` が知らせます。

```yaml
resource: ../../docs/requirements.md
resource_sha256: 3b1c255900b1c48d2e427656275ce6a5a8c501ac04745204efdba589c11f9d16
```

ExcelのWBSやMS Projectのスケジュールの扱い方は、[PMBOKのガイドの「ExcelやMS Projectの文書は、代わりの文書を置く」](pmbok.md#excelやms-projectの文書は代わりの文書を置く) に詳しく書いています。

### 議事録から下書きを作る

決まったことが議事録にしか残っていない場合は、`extract` で下書きを作れます。
LLM（文章を生成するAI）が、議事録から `Decision`、`Task`、`Risk` などの下書きを作ります。

```bash
adaptrace extract meetings/2026-11-20-review.md --llm "claude -p"
```

既定では、下書きを表示するだけです。内容を確認してから、`--write` を付けて新しいファイルとして作ります。
議事録自体も、`meetings/` に `type: Meeting` の文書として置いてください。

### Claude Codeに取り込みを手伝ってもらう

手順4と次の手順5は、Claude Codeのskill `adaptrace-adopt` で、対話しながら進めることもできます。
skillは、Claude Codeに作業の手順を教えるファイルです。

1. skillをインストールします。Claude Codeのプラグインとしてインストールする方法と、フォルダをコピーする方法があります
   - **プラグイン（おすすめ）**：Claude Codeで次の2つを実行します。Adaptraceの7つのskillが、まとめてインストールされます。skillの名前には、`adaptrace:` が付きます（例：`/adaptrace:adaptrace-adopt`）

     ```text
     /plugin marketplace add yutaponium/Adaptrace
     /plugin install adaptrace@adaptrace
     ```

     新しい版にするときは、ターミナルで `claude plugin marketplace update adaptrace` と `claude plugin update adaptrace@adaptrace` を実行します
   - **コピー**：Adaptraceのリポジトリの `skills/adaptrace-adopt/` を、導入先のリポジトリの `.claude/skills/` にコピーします。すべてのリポジトリで使う場合は、`~/.claude/skills/` にコピーします。skillは、オープンな標準「Agent Skills」の形式なので、ほかのエージェント（CodexやGemini CLIなど）でも、それぞれのskillのディレクトリにコピーすれば読み込まれます。ただし、skillの試験はClaude Codeでだけ実行しており、ほかのエージェントでの動作は確認していません。コピーする場所は、[README](../../README.md#ほかのコーディングエージェント) にあります

     ```bash
     mkdir -p .claude/skills
     cp -r ~/tools/adaptrace/skills/adaptrace-adopt .claude/skills/
     ```

   どちらの方法でも、CLIは手順1のとおりにインストールしておきます。skillは、CLIを呼び出して作業します

2. Claude Codeで、管理したいファイルを指定して頼みます

   ```text
   docs/requirements.md と docs/adr/ をAdaptraceで管理したい。依存関係も張って
   ```

Claudeは、次の順に進めます。

- ファイルごとに、バンドルに移すか、代わりの文書を置くかを尋ねます
- 型と、フロントマターの内容を提案します。担当者などの分からない項目は、推測せずに尋ねます
- 依存関係の候補を、根拠と確からしさを付けて示します。どれを採用するかは、あなたが選びます
- 書き込む前に、ファイルごとの差分を示します。承認したものだけを書きます
- 最後に `validate`、`stale`、`impact` で確認します

## 5. 依存関係を張って、検証する

文書を置いたら、文書どうしの依存関係をフロントマターに書きます。
依存関係があると、ある文書が変わったときに、見直すべき文書を `impact` で洗い出せます。

```yaml
---
type: Task
title: ログイン画面にMFAを追加する
state: to_do
owner: tanaka
generated: { by: human:tanaka, at: 2026-11-25T10:00:00+09:00 }
satisfies: /requirements/mfa.md
depends_on: /decisions/auth-provider.md
---
```

- 依存関係は、下流の文書から上流の文書へ書きます。「この文書は、どの文書が変わったら見直すか」を書きます
- パスは、`/` で始めるバンドルの中のパスで書きます
- 依存関係で指せるのは、バンドルの中の文書だけです。バンドルの外のファイルは、上の「代わりの文書」を置いて、それを指します
- 何でもつながないでください。つなぎすぎると、1つの変更で、ほとんどの文書が見直しの対象になります

張り方の考え方は、[プロジェクトマネジメントでの使い方の「依存関係の張り方」](project-management.md#依存関係の張り方) にあります。

書いたら、検証します。

```bash
adaptrace validate
adaptrace graph --format mermaid
```

- `validate` は、フロントマターの誤り、存在しない依存先、循環依存などをエラーにします
- `graph` の出力を、GitHubのMarkdownやMermaidのエディターに貼ると、依存関係を図で確認できます

試しに、上流の文書を1つ選んで `impact` を実行し、思ったとおりの文書が並ぶかを確認します。

```bash
adaptrace impact requirements/mfa.md --order review
```

## 6. PRにして、チームで確認する

バンドルはただのMarkdownです。コードと同じリポジトリに置き、PRでレビューできます。

- 最初のPRでは、どの文書を取り込み、どう依存関係を張ったかを、チームで確認します。`graph` の図をPRの本文に貼ると、説明しやすくなります
- PRをマージした時点が、導入の起点になります。この時点で `adaptrace stale` が何も示さない状態にしておくと、その後の変化を追いやすくなります

## 7. CIとAIエージェントに組み込む

### CIで検証する

CIで `adaptrace validate` を実行すると、壊れた依存関係を含むPRを、マージの前に止められます。
CIは、変更のたびに検査を自動で実行する仕組みです。
`validate` は、エラーがあれば終了コード1で終わり、警告だけなら0で終わります。

GitHub Actionsの例です。

```yaml
name: adaptrace
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/checkout@v5
        with:
          repository: yutaponium/Adaptrace
          ref: v1.0.0
          path: .tools/adaptrace
          token: ${{ secrets.ADAPTRACE_TOKEN }}
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
        working-directory: .tools/adaptrace
      - run: bun .tools/adaptrace/src/cli.ts validate .adaptrace
```

- Adaptraceのリポジトリは、今は非公開です。そのため、読み取りの権限を持つトークンをリポジトリのシークレット（`ADAPTRACE_TOKEN`）に登録する必要があります
- `ref` には、使うバージョンのタグを書きます

変更要求の見直しを終えるまでマージさせたくない場合は、`adaptrace progress <変更要求>` もCIで実行できます。すべての文書を見直すまで、終了コードが1になります。

### AIエージェントから使う

Claude CodeなどのAIエージェントに、MCPサーバーとして登録できます。
MCPは、AIエージェントが外部のツールを使うための仕組みです。

```bash
claude mcp add adaptrace -- adaptrace mcp .adaptrace
```

cloneして使う場合は、`adaptrace` を `bun ~/tools/adaptrace/src/cli.ts` に置き換えます。

MCPサーバーは、ファイルに書き込みません。エージェントは、更新案を作るだけです。適用するかどうかは、人が決めます。

導入先のリポジトリに `CLAUDE.md` や `AGENTS.md` がある場合は、エージェントへの指示を追加しておくと、使い忘れを防げます。

```markdown
## 要件と判断の文書

- 要件、設計の判断、タスク、リスクは `.adaptrace/` にある（Adaptraceのバンドル）
- 要件や判断を変更したら、`impact` で影響を受ける文書を確認し、更新案を示す
- 文書を変更したら `generated` を、見直して変更が要らなかったら `verified` を更新する
```

エージェントへの頼み方の例は、[プロジェクトマネジメントでの使い方の「AIエージェントに任せる」](project-management.md#aiエージェントに任せる) にあります。

## 8. 運用を始める

導入した後は、次の場面で使います。

| 場面 | 使うコマンド | 詳しい説明 |
|---|---|---|
| 文書を変更したとき | `impact`、`assess` | [変更要求が来たら](project-management.md#変更要求が来たら) |
| 変更要求を受けたとき | `estimate`、`conflicts`、`meeting` | [変更要求を受け付ける](pmbok.md#3-変更要求を受け付ける) |
| 変更要求の見直しの状況を確認するとき | `progress` | [もれがないことを確認する](pmbok.md#5-もれがないことを確認する) |
| 定例の会議の前 | `stale`、`board`、`list` | [定例の点検](project-management.md#定例の点検) |

文書を更新したときは、フロントマターも更新します。

- 内容を変えたら、`generated` を今の日時にします。その文書に依存する文書が、見直しの対象になります
- 見直して、変更が要らなかったら、`generated` は変えずに、`verified: { by, at }` を今の日時にします。依存する文書は、見直しの対象になりません

## つまずきやすい点

- **バンドルの中の `.md` ファイルには、すべてフロントマターが必要です。** `index.md` と `log.md` を除き、`type` のないMarkdownファイルは、`validate` のエラーになります。メモや説明の `README.md` は、バンドルの外に置きます
- **日時にはタイムゾーンを書きます。** `2026-11-25` や `2026-11-25 10:00` は「日時なし」として扱われ、比較できません。`2026-11-25T10:00:00+09:00` のように書きます
- **`status` に進み具合を書かないでください。** `status` は、ライフサイクル（`draft`、`stable`、`deprecated`）だけに使います。進み具合は `state` に書きます
- **整形ツールの設定を確認します。** リポジトリでMarkdownの整形ツールやlintを使っている場合は、フロントマターを書き換えないかを確認します。書き換える場合は、`.adaptrace/` を対象から外します
- **すべての文書に `generated` を書きます。** v0.9.0から、最終更新は `generated.at` だけで決まり、gitのコミットの日時は使いません。`generated` のない文書は比べられないので、`adaptrace validate` が警告します。これまでgitの日時に頼っていたバンドルは、`adaptrace migrate-dates --write` で一度だけ移行できます
