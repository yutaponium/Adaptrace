---
name: adaptrace-sync
description: AdaptraceのバンドルのタスクとBacklog.mdのタスクを、adaptrace syncで同期する。書き込む前に、変更と問題（両側で変わった衝突、Backlog.mdで見つからないタスク、対応しないstate、重複したbacklog.id）を項目ごとに示し、どちらにそろえるかなどの扱いを利用者と決める。利用者が「Backlog.mdと同期したい」「Backlog.mdの変更を取り込んで」「syncで衝突が出た」と言ったときに使う。判断は人が行う。書き込むのは、利用者が承認した後だけ。
---

# adaptrace-sync

バンドル（既定は `.adaptrace/`）のTaskと、Backlog.md（既定は `backlog/`）のタスクを、`adaptrace sync` で同期する。
`sync` は、変わった側から変わっていない側へ内容を写し、両側で変わったタスクは衝突として知らせる。
このskillは、`sync` の計画を項目ごとに示し、衝突などの扱いを利用者と決めてから書き込む。
キーとコマンドの正確な決まりは、Adaptraceの `docs/spec/schema.md` の「Backlog.mdとの変換」にある。使い方は `docs/guide/backlog-md.md` にある。
どれもAdaptraceのリポジトリにあり、探し方は下の「共通の書き方」にある。手順の判断に迷ったときに読む。

## 守ること

- **利用者が承認する前に、ファイルを書き換えない。** `sync` は、`--write` を付けたときだけ書き込む。`--write` を付けて実行する前に、実行するコマンドと、`--write` を付けない計画を示して承認を得る。文書を編集するときは、差分を示して承認を得る（Adaptraceの設計原則6）
- 利用者が「おすすめで」と判断を任せても、それは書き込みの承認ではない。おすすめの内容を示し、書き込んでよいかを改めて尋ねる
- **衝突でどちらにそろえるかを、自分で決めない。** 両側の内容を示し、利用者が決める。選ばなかった側の変更は失われることを伝える
- 書き換えてよいのは、次だけにする。ほかの文書は変えない
  - `sync --write` が書く、AdaptraceのTaskの文書と、Backlog.mdのタスクのファイル
  - 手順2で利用者と決めた、AdaptraceのTaskの文書のキーと本文
  - `log.md`：行を追加するだけ
- **Backlog.mdのファイル（`config.yml` を含む）は、`sync --write` のほかでは書き換えない。** 手で書き換えると、`backlog.sync` のハッシュと食い違い、次の `sync` で衝突になる。Backlog.mdの側で変えることは、利用者に案内する
- `backlog.sync` と `backlog.fields` は、手で書き換えない
- 文書を削除しない。利用者が明示したときだけ、差分を示して削除する
- コミットとpushは、利用者に頼まれたときだけ行う
- 利用者に尋ねるときは、選択肢で尋ねるツール（AskUserQuestion）があれば使う。なければ、番号付きの選択肢を文章で示して、返事を待つ

## パスの書き方

| 場面 | 書き方 | 例 |
|---|---|---|
| コマンドに渡す文書 | バンドルの中のパス。先頭に `/` を付けない | `adaptrace sync --resolve tasks/manual.md=backlog` |
| フロントマターのキーの値 | バンドルの中のパス。先頭に `/` を付ける | `depends_on: /tasks/login-mfa.md` |
| Backlog.mdのタスク | `--backlog` のディレクトリの中のパス | `tasks/back-3 - 操作マニュアルを書く.md` |

## 共通の書き方

Adaptraceのskillに共通の決まり。

- **コマンドの書き方**：手順0で決めた実行方法を、このskillでは `adaptrace` と書く。実行するときは、`adaptrace` をそのコマンドに置き換え、毎回省略せずに書く（例：`bun ~/tools/adaptrace/src/cli.ts validate`）。1回に1つのコマンドを実行する。シェルの変数、エイリアス、ループ、`&&` や `;` でのつなぎ、`$?` を使わない。実行環境によっては、拒否されたり承認を求められたりするため。終了コードは、コマンドが失敗したときにツールの結果に示される。ファイルを読むときは、シェルではなく、ファイルを読むツール（Readなど）を使う。コマンドは、作業中のリポジトリのルートで実行する。バンドルの既定の場所と、コマンドに渡すパスは、ルートを基準にするため
- **Adaptraceの仕様とガイドの場所**：Adaptraceのリポジトリにあり、作業中のリポジトリにはない。次の順に探す
  1. 実行方法が `bun <パス>/src/cli.ts` なら、仕様は `<パス>/docs/spec/schema.md`、ガイドは `<パス>/docs/guide/` にある
  2. `bun add -g` でインストールした `adaptrace` コマンドなら、Bunの既定では `~/.bun/install/global/node_modules/adaptrace/docs/` にある
  3. このskillをClaude Codeのプラグインとしてインストールした場合は、`${CLAUDE_PLUGIN_ROOT}/docs/` にある（仕様は `spec/schema.md`、ガイドは `guide/`）
  4. どれもないか、読めなければ、`adaptrace --version` で版を確認し、 `https://github.com/yutaponium/Adaptrace/tree/v<版>/docs` を読む。それも読めなければ、推測せずに利用者に尋ねる
  - 型、キー、`state` の値の決まりに迷ったら、文書を書く前に仕様を読む
- **`generated.by`**：skillの手順に `by` の決まりがあれば、それに従う（例：見直しの記録は、判断した人にする）。決まりがなければ、エージェントが書いた文書は `<エージェント>/<モデルのID>` にする（例：`claude-code/claude-opus-5-5`）。モデルのIDは、表示名ではなく、APIで使う識別子である。分からなければ、`<エージェント>` だけにする（例：`claude-code`）。利用者が自分の名前を希望したら、`human:<ID>` にする
- **日時**：`generated.at` などの日時は、タイムゾーン付きのISO 8601で書く（例：`2026-11-26T10:00:00+09:00`）。GNUのdateなら、`date --iso-8601=seconds` で取得できる
- **新しいキーの位置と書き方**：skillの手順に、キーの位置や書き方（1つの値か、リストか）の決まりがあれば、それに従う。決まりがなければ、次のとおりにする。フロントマターのキーの順序に、意味はない。既存の文書の並びにそろえる。手本がなければ、このskillの例の並びに従う。例にないキーは、`generated` の直前に置く。既存の文書がリストで書いていれば、値が1つでもリストにする
- **`log.md`**：日付の見出し（`## YYYY-MM-DD`）は、新しい順に並べる。今日の見出しがなければ、既存の日付の見出しより上に作る。ファイルの題（`# ...`）より上には置かない。行は `* **<ラベル>**: <説明>` の形にする。ラベル（`Creation`、`Update` など）は英語のまま書き、説明はバンドルの文書の本文と同じ言語で書く。`init` が書いた英語の行が既存にあっても、説明は本文の言語でよい。1回の作業は、文書を作ったなら `Creation`、更新したなら `Update` の1行ずつにする。同じ見出しの中では、新しい行を上に書く

## 0. 準備

1. Adaptraceの実行方法を確認する。`adaptrace --version` が動かなければ、利用者に尋ねる（例：`bun ~/tools/adaptrace/src/cli.ts`）。以降、ここで決めたコマンドを `adaptrace` と書く（「共通の書き方」）
2. バンドルの場所を確認する。既定は、リポジトリのルートの `.adaptrace/`。なければ、利用者に尋ねる。ほかの場所にあれば、以降のすべてのコマンドに `--bundle <ディレクトリ>` を付ける
3. Backlog.mdのディレクトリを確認する。既定は、リポジトリのルートの `backlog/` で、`config.yml` がある。なければ、利用者に尋ねる。ほかの場所にあれば、以降のすべての `sync` に `--backlog <ディレクトリ>` を付ける
4. `backlog/config.yml` を読み、ステータスの一覧（`statuses`）を控える。Adaptraceの `state` は、ステータスを小文字にして、空白などを `_` にした値で対応する（例：`In Progress` と `in_progress`）
5. `adaptrace validate` を実行し、同期の前からあるエラーと警告を把握しておく
6. 利用者が片方向だけを望んだときは、以降のすべての `sync` に `--direction import`（取り込むだけ）か `--direction export`（書き出すだけ）を付ける。除外した側の変更は `pending` として示され、書き込まれない

## 1. 計画を示す

1. `adaptrace sync --format json` を実行する。`--write` は付けない。終了コードが1でも、計画は出力される。`actions` の `kind` が、タスクごとの計画である
2. 計画を、変更と問題に分けて表で示す。`inSync` は、そろっているタスクの数である

| `kind` | 意味 | 分類 |
|---|---|---|
| `export-new` | AdaptraceのタスクをBacklog.mdに新しく作る。IDが振られる | 変更 |
| `export` | Adaptraceで変わった内容を、Backlog.mdに書き出す | 変更 |
| `import-new` | Backlog.mdのタスクを、Adaptraceに新しく作る（`tasks/<id>.md`） | 変更 |
| `import` | Backlog.mdで変わった内容を、Adaptraceに取り込む | 変更 |
| `link` | 両側の内容が同じで、対応づけの記録だけを書く | 変更 |
| `conflict` | 前回の同期の後に、両側で変わった | 問題 |
| `unmapped-state` | `state` に対応するステータスがBacklog.mdにないので、書き出せない | 問題 |
| `missing` | `backlog.id` のタスクがBacklog.mdにない。削除されたか、アーカイブに移された | 問題 |
| `duplicate-link` | 同じ `backlog.id` を持つTaskが2つ以上ある。文書をコピーしたときに起きやすい | 問題 |
| `pending` | `--direction` で除外した側の変更 | 保留 |

   - 変更には、タスク、Backlog.mdのファイル、変わった項目（`fields`）を示す。項目の名前は、`title`、`state`、`tags`、`dependencies`（`depends_on` のうちタスクへのもの）、`body`（本文）、`fields`（`assignee` など、対応する項目がないもの）である
   - `errors` があれば、ファイルと内容を示す。読めないBacklog.mdのファイルや、`task_prefix` の誤りである。Backlog.mdの側で直すよう案内する
3. 問題がなければ、手順3に進む

## 2. 問題の扱いを決める

問題ごとに、材料を示して扱いを尋ねる。おすすめと理由を添えてよい。すべての問題の扱いを決めてから、手順3に進む。

### 衝突（`conflict`）

1. Adaptraceの文書と、Backlog.mdのファイル（`backlogPath`）を読む
2. 違う項目（`fields`）ごとに、両側の今の値を並べて示す。本文が違うときは、違う行を示す。Backlog.mdの `status` は、Adaptraceの `state` に当たる。`labels` は `tags`、`dependencies` は `depends_on` に当たる
3. gitの履歴があれば、`git log -p -- <ファイル>` で、それぞれの側で何が変わったかを確認してよい。確認できなければ、今の値だけを示し、どちらが新しいかを断定しない
4. 扱いを尋ねる

| 扱い | 変更 |
|---|---|
| Backlog.mdの側にそろえる | `--resolve <タスク>=backlog` を付ける。Adaptraceの側の変更は失われる |
| Adaptraceの側にそろえる | `--resolve <タスク>=adaptrace` を付ける。Backlog.mdの側の変更は失われる |
| 両方の変更を残す | Backlog.mdの側の変更のうち残すものを、Adaptraceの文書に書いてから、`--resolve <タスク>=adaptrace` を付ける。書く内容は、利用者と項目ごとに決める |
| 今回はそろえない | `--resolve` を付けない。衝突のまま残り、次の `sync` でも知らせる |

- `<タスク>` は、バンドルの中のパス（`tasks/manual.md`）か、Backlog.mdのID（`back-3`）で書く。タスクごとに `--resolve` を1つ付ける
- 全体の `--resolve adaptrace` や `--resolve backlog` は、利用者がすべての衝突を同じ側にそろえると決めたときだけ使う

### 対応しない `state`（`unmapped-state`）

`state` の値（`state`）と、Backlog.mdのステータスの一覧（手順0の4）を示し、扱いを尋ねる。

- Adaptraceの `state` を、ステータスに対応する値に変える：変える値は、利用者が決める。差分を示して、文書の `state` だけを変える
- Backlog.mdにステータスを追加する：利用者に、Backlog.mdの側で追加するよう案内する。このskillは `config.yml` を書き換えない。追加された後に、手順1からやり直す
- 今回は書き出さない：そのまま残す。次の `sync` でも知らせる

### 見つからないタスク（`missing`）

Backlog.mdの `backlog/archive/` と `backlog/drafts/` に、同じIDのタスクがあるかを確認して示す。`sync` は、アーカイブと下書きのタスクを変換しない。扱いを尋ねる。

- Backlog.mdの側で戻す：利用者に、Backlog.mdの側で戻すよう案内する。戻された後に、手順1からやり直す
- Adaptraceの文書を残す：変更しない。`sync` は、このタスクを毎回知らせ、終了コードは1になる。`status: deprecated` にしても、知らせ続ける
- Adaptraceの文書を削除する：利用者が明示したときだけにする。削除する前に、`adaptrace graph --format json` の `backlinks` で、その文書を指している文書を確認して示す。指している文書があれば、削除すると `validate` のエラーになる
- `backlog` を削除して、新しいタスクとして書き出す：次の `sync` で、新しいIDのタスクがBacklog.mdにできる

### 重複した `backlog.id`（`duplicate-link`）

同じIDを持つ文書（`adaptrace` と `others`）を読み、違いを示す。どれがBacklog.mdのタスクと対応する元の文書かを、利用者に尋ねる。元の文書ではない文書から `backlog` を削除する。それらは、次の `sync` で新しいタスクとして書き出される。書き出さない文書は、削除するかを利用者と決める。

### 文書を編集するときの決まり

- 変えるのは、扱いで決めたキーと本文だけにする。キーの位置は変えない
- `state` だけ、または `backlog` だけを変えるときは、`generated` を変えない。本文やほかのキーを変えるときは、`generated` を今の日時と作業したエージェントにする（「共通の書き方」）
- 文書を編集したら、`sync` はそのタスクをAdaptraceの側で変わったものとして扱う。衝突しているタスクは、`--resolve <タスク>=adaptrace` を付けないと、衝突のまま残る

## 3. 書く

1. 手順2で決めた文書の編集があれば、文書ごとに差分を示し、承認を得てから書く
2. 決めた `--resolve` を付けて、`--write` を付けずに `adaptrace sync --format json` を実行する。計画が、決めた扱いのとおりになっているかを確認する。手順2で「今回はそろえない」「残す」と決めたもののほかに、`conflict` が残っていないかを確認する
3. 実行するコマンドと、その計画（書き出す、取り込む、作るタスク）を示して、承認を得る
4. `--write` を付けて実行する。`--resolve` の指定は、手順3の2と同じにする
5. `log.md` に記録するかを、最後に1回だけ尋ねる。手順3の3と一緒に尋ねてよい。追加する場合は、今日の日付で見出し（`## YYYY-MM-DD`）を作り、その下に `* **Update**: <説明>` の形で、この同期全体を1行で書く。Backlog.mdから新しいタスクを取り込んだなら、`* **Creation**: <説明>` の行も書く
6. `adaptrace sync --format json` をもう一度実行し、変更が残っていないこと、問題が利用者の決めたものだけであることを確認する
7. `adaptrace validate` を実行する。手順0の時点より増えたエラーがあれば、原因を説明して、修正の差分を示す
8. `adaptrace stale --format json` を実行する。取り込んだタスクは `generated` が新しくなるので、それに依存している文書が「依存先より古い」と出る。出た文書を報告に書く

## 4. 報告する

次をまとめて報告する。報告は会話の中で行い、ファイルには書かない。

- 書き出したタスクと、取り込んだタスク。新しく作ったタスクと、振られたID
- 衝突ごとに、そろえた側と、失われた変更
- 残した問題（そろえなかった衝突、見つからないタスクなど）と、`sync` が次も知らせること
- Backlog.mdの側で、利用者が行うこと（ステータスの追加、タスクを戻すなど）
- Backlog.mdから新しく取り込んだタスク。要件とのつながり（`satisfies`）がないので、必要ならPMが追加する
- 取り込んだタスクに依存していて、`stale` に出た文書。見直しが要るかは、skill `adaptrace-review` で確認できる
- 手順0の時点より増えた `validate` のエラーと警告
