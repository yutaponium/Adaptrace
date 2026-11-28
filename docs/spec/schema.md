# Adaptraceのスキーマ（v1.0）

日本語 | [English](schema.en.md)

Adaptraceのバンドルは、[OKF 0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) に準拠したMarkdownのディレクトリです。
この文書は、OKFの上にAdaptraceが追加する決まりを定めます。書き方を決めた理由は [ADR-008](../../.adaptrace/decisions/adr-008-okf-alignment.md) にあります。

## バンドル

- 既定の場所は、リポジトリのルートの `.adaptrace/` です
- `index.md` と `log.md` はOKFの予約ファイルで、概念の文書にはなりません
- ルートの `index.md` には、フロントマターで `okf_version: "0.2"` を書けます。それ以外の `index.md` にはフロントマターを書きません
- `log.md` は日付ごとの見出し（`## YYYY-MM-DD`）で、新しい順に書きます
- 上記以外の `.md` ファイルはすべて概念の文書で、YAMLフロントマターと空でない `type` が必要です

## フロントマター

| キー | 必須 | 内容 | 由来 |
| --- | --- | --- | --- |
| `type` | 必須 | 文書の型（下の表） | OKF |
| `title` | | 表示名 | OKF |
| `description` | | 一文の要約 | OKF |
| `tags` | | タグのリスト | OKF |
| `status` | | `draft` / `stable` / `deprecated`。省略時は `stable` | OKF |
| `generated` | | `{ by: <actor>, at: <日時> }`。`at` が最終更新 | OKF |
| `verified` | | `{ by, at }` またはそのリスト。見直して変更が要らなかった記録 | OKF |
| `stale_after` | | この日時以降は古いとみなす | OKF |
| `resource` | | その文書が表しているもの（URIかパス）。ローカルのファイルなら、`stale` が変更を知らせる | OKF |
| `resource_sha256` | | 見直した時点での、`resource` が指すファイルのSHA-256 | Adaptrace |
| `sources` | | もとにした資料のリスト。各項目の `resource` がローカルのファイルなら、`stale` が変更を知らせる。各項目の `sha256` に、見直したときのSHA-256を記録する | OKF（`sha256` はAdaptrace） |
| `state` | | 進み具合（`proposed`、`in_progress`、`done`、`accepted` など）。値は型ごとにプロジェクトで決める | Adaptrace |
| `received_at` | | 変更要求を受け付けた日時。`progress` の基準日時になる | Adaptrace |
| `requested_by` | | 変更要求を出した人や組織。名前か、ステークホルダーの文書のパス（`/` で始める）。依存関係ではない | Adaptrace |
| `side` | | ステークホルダーの文書で、社内（`internal`）か顧客（`customer`）か。`meeting` が使う | Adaptrace |
| `role` | | ステークホルダーの文書で、その人や組織の役割 | Adaptrace |
| 依存関係のキー | | 下の表 | Adaptrace |

- 日時は、UTCオフセット付きのISO 8601で書きます（例：`2026-10-29T10:00:00+09:00`）
- actorはOKFの決まりに従います。人は `human:<id>`、エージェントやツールは `<producer>/<version>`、自動処理は `process:<id>` です
- `owner` や `due` など、ほかのキーも自由に追加できます。Adaptraceは知らないキーを削除しません
- 上の表のキーや依存関係のキーに近い綴りのキー（`depend_on`、`dependsOn`、`recieved_at` など）は、書き間違いとして警告が出ます。そのままでは読まれず、依存関係なら影響分析から漏れるためです（[ADR-047](../../.adaptrace/decisions/adr-047-key-spelling.md)）
- OKF 0.1の `timestamp` は読めますが、`generated.at` への移行を勧める警告が出ます

## 型

| `type` | 内容 |
| --- | --- |
| `Requirement` | 要件・顧客の要望 |
| `Acceptance` | 受け入れ基準・成果の定義 |
| `Decision` | 意思決定の記録（ADRに相当） |
| `Task` | 作業項目 |
| `Risk` | リスクと対応策 |
| `Milestone` | マイルストーン |
| `Change Request` | 変更要求 |
| `Meeting` | 議事録 |

型はプロジェクトごとに追加できます。表にない型もエラーにはなりません。
表の型を小文字やハイフンで書いた場合（`task`、`change-request`）は、書き方の修正を促す警告が出ます。
表の型と1〜2文字だけ違う型（`Decison`、`Tasks`）も、書き間違いとして警告が出ます。2文字違う型は、先頭の2文字が同じものだけを警告します（`Revision` は警告しません）。4〜5文字の型（`Task`、`Risk`）は、1文字多い型と、隣り合う2文字を入れ替えた型だけを警告します（`Taask`、`Tsak`、`Tasks`。`Ask` や `Disk` は警告しません）。

## 依存関係のキー

値はパス1つ、またはパスのリストです。どのキーも、「このキーを持つ文書」から「値の文書」への向きを持ちます。

| キー | 意味 | 値の文書が変わったら |
| --- | --- | --- |
| `depends_on` | この文書は相手に依存している | この文書を見直す |
| `derived_from` | この文書は相手から導かれた | この文書を見直す |
| `satisfies` | この文書は相手（要件など）を満たす | この文書を見直す |
| `blocks` | この文書が終わらないと相手が進めない | （この文書が遅れたら、相手に影響する） |
| `supersedes` | この文書は相手を置き換える | （相手は無効になる） |
| `changes` | この変更要求は相手を変える（相手は起点）。[ADR-023](../../.adaptrace/decisions/adr-023-changes-key.md) | （伝えない。承認したら、相手に `derived_from` で変更要求を追加する） |

- パスは、`/` で始めるバンドル絶対パスで書きます（`/requirements/security-mfa.md`）。そのファイルからの相対パス（`../requirements/security-mfa.md`）や、`.md` を省いた概念IDも読めます
- 本文のMarkdownリンクは「参照」で、依存関係とは別に扱います

## 検証（`adaptrace validate`）

終了コードは、問題がないか警告だけなら0、エラーがあれば1、コマンドや引数の誤りなら2です。

本文のリンクは、概念の文書に加えて、`index.md` と `log.md` のものも確認します。
読むのは、`[text](target)` の形のリンクと、参照形式のリンク（`[text][1]`、`[text][]`、`[text]`）です。参照形式のリンクは、定義（`[1]: target`）のリンク先を、リンクを使った行で確認します。リンク先に空白がある場合は、`<...>` で囲みます（`[text](<my file.md>)`）。リンク先には、1段の括弧を含められます（`[text](guide_(v2).md)`）。脚注（`[^1]`）とタスクリストのチェックボックス（`- [x]`）は、リンクとして扱いません。リスト項目にある定義、インデントで書いたコードブロック、複数行にわたるHTMLのコメント、`\]` でエスケープした閉じ括弧は、まだ区別しません。

| 重さ | コード | 内容 |
| --- | --- | --- |
| error | `frontmatter` | フロントマターがない、閉じていない、YAMLとして読めない |
| error | `missing-type` | `type` がない、または空 |
| error | `index-frontmatter` | `index.md` に許されないフロントマターがある |
| error | `log-date` | `log.md` の日付の見出しが `YYYY-MM-DD` でない |
| error | `invalid-dependency` | 依存関係のキーの値が、パスでもパスのリストでもない |
| error | `dependency-target` | 依存先が存在しない、概念の文書でない、バンドルの外にある |
| error | `dependency-cycle` | 見直しの連鎖（`depends_on`・`derived_from`・`satisfies`）か `supersedes` が循環している |
| warning | `okf-version` | `okf_version` が0.2でない |
| warning | `type-spelling` | 表の型を小文字やハイフンで書いている。または、表の型と1〜2文字だけ違う |
| warning | `key-spelling` | キーの綴りが、上の表のキーか依存関係のキーに近い（下の「キーの書き間違い」） |
| warning | `invalid-status` | `status` がOKFのライフサイクルの値でない |
| warning | `legacy-timestamp` | `timestamp` を使っている |
| warning | `invalid-generated` / `invalid-verified` / `invalid-datetime` | `generated`、`verified`、`stale_after`、`received_at` の形が正しくない |
| warning | `dependency-deadlock` | 文書どうしが互いに待っている（下の「デッドロック」） |
| warning | `broken-link` | 本文のリンク先が存在しない。OKFでは壊れたリンクが許されるため、警告にする |
| warning | `missing-resource` | `resource` か `sources[].resource` が指すローカルのファイルが存在しないか、通常のファイルでない（下の「Markdown以外のファイル」） |
| warning | `invalid-sha256` | `resource_sha256` か `sources[].sha256` が、16進数64桁の文字列でない |
| warning | `unlinked-sha256` | SHA-256を記録しているのに、指す値がローカルのファイルとして読めない（`/pm/...` と書いたなど）。追跡されていない |
| warning | `missing-generated` | `generated.at` も `timestamp` もない。内容の最終更新が分からない（下の「最終更新」）。`verified` だけがある文書と、`generated` に `at` がない文書も含む。`at` の形式が違う文書は、`invalid-datetime` が示す。CLIとMCPの `validate` だけが調べる |
| warning | `stale-generated` | 本文を変えたのに、`generated` も `verified` も変えていない（下の「更新漏れの検出」）。CLIとMCPの `validate` だけが、gitのリポジトリで調べる |
| warning | `stale-generated-skipped` | 浅いcloneなので、`stale-generated` を調べなかった。または、gitが比べられなかった文書がある |

### キーの書き間違い

OKFでは知らないキーも許されるので、依存関係のキーを書き間違えてもエラーになりません。その依存関係は存在しないものとして扱われ、`impact` や `stale` から漏れます。
そこで、次のキーを `key-spelling` として警告します（[ADR-047](../../.adaptrace/decisions/adr-047-key-spelling.md)）。

- 大文字・小文字と区切り（`_`、`-`、空白）を除くと、既知のキーと同じ（`dependsOn`、`derived-from`）
- 既知のキーに `s` を付けた形か、`s` を除いた形（`block`、`tag`）
- 6文字以上で、既知のキーと1〜2文字だけ違う（`depend_on`、`recieved_at`、`supercedes`）。既知のキーが5文字以下なら、1文字だけ長い（`stated`）
- 依存関係の別の言い方（`dependencies`、`depends`、`depend`、`derived`、`satisfy`、`blocking`）
- 依存関係を相手の側から書いたキー（`blocked_by`、`blocked`、`blocks_on`、`blocker`、`superseded_by`、`superseded`、`satisfied_by`、`satisfied`、`derived_by`、`changed_by`）。Adaptraceは、関係を一方の文書にだけ書きます。相手の文書に、対応するキーを書きます。`blocked_by` などは、この文書の `depends_on` でも書けます

既知のキーは、「フロントマター」の表のキー、依存関係のキー、`okf_version`、`timestamp` です。5文字以下の独自のキー（`size`、`due`）は、`s` の有無のほかは、1文字違いでも警告しません。依存関係でないキーの単語を丸ごと別の単語にしたキー（`requested_at`、`received_by`）と、日時に使われることが多い `changed` は、別のものを表すとみなし、警告しません。

### デッドロック

`blocks` と `depends_on` は、どちらも「待つ」関係を表します。

- `A blocks B`：BはAを待つ
- `A depends_on B`：AはBを待つ

この「待つ」関係が循環し、その中に `blocks` が1つでもあると、どの文書も先に進めないデッドロックになります。
たとえば `A depends_on B` と `A blocks B` が同時にあると、AとBは互いを待ちます。

デッドロックはエラーにせず、警告にします（[ADR-009](../../.adaptrace/decisions/adr-009-deadlock-warning.md)）。計画の途中では、一時的に起こりうるためです。
警告では、誰が誰を待っているかを示します。そのうえで、依存を1つ外すか、文書を分けて一部の作業を始められるようにすることを促します。

`depends_on` だけの循環は、見直しの連鎖の循環（`dependency-cycle`）としてエラーになります。

デッドロックの検出は、`status: deprecated` の文書も数えます。`board` は中止したTaskを待ちの相手にしないので、中止したTaskを含むデッドロックは、`board` には表れません。中止したTaskの依存関係を外すと、警告は消えます。

## グラフ（`adaptrace graph`）

- `--format mermaid`（既定）：Mermaidの `graph LR`。依存関係は実線で示します。`--references` を付けると、本文のリンクを点線で追加します
- `--format json`：`nodes`（パス、ID、型、表示名、`status`、`state`）、`edges`（`from`、`to`、`kind`）、`backlinks`（文書ごとの入ってくる辺）

## 最終更新

影響分析と陳腐化の検出は、文書の「最終更新」を比較します（[ADR-010](../../.adaptrace/decisions/adr-010-last-updated.md)、[ADR-029](../../.adaptrace/decisions/adr-029-no-git-dates.md)）。

1. `generated.at`
2. なければ、古い `timestamp`
3. どちらもなければ「不明」とし、比較しない

gitのコミットの日時は使いません。コミットするまで決まらず、cloneの深さでも変わるためです。どこで実行しても、同じ結果になります。
`generated` も `timestamp` もない文書は、`validate` が `missing-generated` で警告します。gitの日時で最終更新を補っていたバンドルは、`adaptrace migrate-dates` で一度だけ移行します（下の「日時の移行」）。

日時は、UTCオフセット付きのISO 8601だけを読みます。
`2026-10-29` や `2026-10-29 10:00` のような値は、実行する環境のタイムゾーンで結果が変わります。そのため「日時なし」として扱います（validateも警告します）。

見直して変更が要らなかった場合は、`generated` を変えずに、`verified: { by, at }` を今の日時にします（[ADR-020](../../.adaptrace/decisions/adr-020-verified-review.md)、[ADR-021](../../.adaptrace/decisions/adr-021-verified-review-followup.md)）。

- 文書の「見直した日時」は、内容の最終更新と `verified.at` のうち、新しい方です。`verified` がリストのときは、最も新しい `at` を使います
- 文書が古いかどうかは、自分の見直した日時と、依存先の内容の最終更新を比べて判定します。`impact`、`stale`、`progress` で同じです
- そのため、見直しだけなら、その文書に依存する文書は古くなりません。内容を変えたときは `generated` を更新するので、依存する文書が見直しの対象になります
- 内容の日時がなく `verified` だけがある文書は、最も古い `verified.at` を内容の最終更新として使います。見直すたびに内容の日時が進まないようにするためです
- `verified` を追加するときは、それまでの記録を残し、リストの末尾に追加します
- `assess` とMCPの更新案は、`verified` の行だけを変えます。1行の `verified: { ... }` と、ブロック形式のリストでは、ほかの行とコメントを残します。それ以外の書き方では、`verified` の部分を書き直します。それまでの記録を失わずに追加できないとき（引用符で囲んだキーなど）は、案を作らずにエラーにします
- 出力では、見直した日時を「reviewed」（JSONでは `reviewed`）として示します

### 更新漏れの検出

本文を変えたのに、`generated` も `verified` も変えていない文書は、`validate` が `stale-generated` で警告します（[ADR-029](../../.adaptrace/decisions/adr-029-no-git-dates.md)）。

- 変更の前後の版をそれぞれ読み、本文（フロントマターの後の部分）が同じかを比べます。gitの差分の設定には左右されません
- コミットしていない変更と、その文書を変えたコミットを、新しい順にさかのぼります。`generated.at`、`timestamp`、最新の `verified.at` のどれかを新しい日時にした変更に行き当たったら、そこで止めます。`by` だけの変更や書き方の変更は、記録として数えません。それまでに、記録を変えずに本文を変えた変更があれば、警告します。さかのぼるのは、最大50件のコミットです
- フロントマターだけの変更（依存関係の追加など）は、本文の変更として数えません。マージのコミットは、1つ目の親と比べます
- 内容の意味を変えたなら `generated` を、言い回しの修正だけなら `verified` を更新すると、警告は消えます
- gitのリポジトリでないときは調べません。浅いclone（`git clone --depth 1`）では、文書を最後に変えたコミットの前の版がないことがあるので調べず、`stale-generated-skipped` を1件示します。CIでは、`actions/checkout` に `fetch-depth: 0` を指定してください
- この検査と `missing-generated` は、CLIとMCPの `validate` が加えます。MCPの更新案の検査には含めません

### 日時の移行（`adaptrace migrate-dates [bundle]`）

gitの日時で最終更新を補っていたバンドルを、一度だけ移行します。

- `missing-generated` の文書に、その文書を最後に変えたコミットのauthor dateで、`generated: { by: process:git, at }` を書きます
- 既定では差分を示すだけです。`--write` を付けると書き込みます
- まだコミットしていない文書と、最後のコミットの後に変更した文書は、日時を取れないので、別に示します。コミットしてから実行し直すか、`generated` を手で書いてください
- `generated` に `by` だけがあり `at` がない文書は、`by` を残して日時を書きます。`generated` の日時が読めない文書（`at` の形式が違うなど）は、書き換えず、別に示します。手で修正してください
- `verified` だけがある文書も、最後のコミットの日時を書きます。コミットのない文書だけは、最も古い `verified.at` を書きます。どちらも、これまで最終更新にしていた日時です
- `generated` のほかの項目は残します
- gitのリポジトリの外と、浅いcloneでは実行しません。浅いcloneでは、どのファイルも同じコミットの日時になるためです
- 終了コードは、実行を断ったときと、書き込みに失敗した文書があったときに1、それ以外は0です
- `--format` は `text`（既定）と `json` です

## 影響分析（`adaptrace impact <文書>`）

文書が変わったときに見直す候補を列挙します。

- `depends_on`・`derived_from`・`satisfies` を逆にたどります。`blocks` と `supersedes` はたどりません
- 1段目を「Direct」、2段目以降を「Indirect」とし、近いものから並べます
- 変更された文書より古い文書と、最終更新が不明な文書に `needs review` を付けます。変更された文書の最終更新が不明なときは、比較できないので、すべてに付けます
- `status: deprecated` の文書は列挙しませんが、その先はたどります。deprecatedの文書に依存している文書は列挙します
- 文書は、次のどれでも指定できます。バンドルからのパス、`/` で始めるパス、概念ID（`.md` なし）、今のディレクトリからのパス、絶対パスです
- バンドルは `--bundle` で指定します。`validate`・`graph`・`stale` も `--bundle` を受け付けます（`[bundle]` と同時には指定できません）

### 見直す順番（`--order review`）

`--order review` を付けると、上流から順に並べます。どの文書も、届いた範囲の依存先をすべて見直した後の順番になります。順番に見直せば、同じ文書を2回見直さずに済みます。

- 既定は `--order depth` です。上の「Direct」「Indirect」の並び順です
- 順番は「ステップ」で示します。ステップは、起点からの最長経路の段数で決めます。`status: deprecated` の文書は列挙しないので、列挙する文書だけで1から振り直します
- 同じステップの文書は、循環依存の場合を除き、互いに依存しません。どの順番で見直しても構いません。同じステップの中はパスの順に並べます
- どこから届くか（`impact` の経路、`estimate` の「Via」）は、`--order` にかかわらず最短の経路を示します。ステップを決めた依存先とは限りません
- JSONの各文書には、`--order` にかかわらず `step` を含めます。`--order review` のときは、JSONの並び順もステップの順にします
- 届いた範囲に循環依存があっても、順番は出力します。循環の中の文書は、同じステップにします。互いに依存しているので、まとめて見直します。循環に依存する文書は、その後のステップになります。循環依存は `validate` のエラーです

## 陳腐化の検出（`adaptrace stale [bundle]`）

次のどれかに当たる文書を列挙します。古い文書が見つかっても、終了コードは0です。

- `depends_on`・`derived_from`・`satisfies` の直接の依存先より、最終更新が古い（間接の影響は `impact` で確認します）
- `resource` か `sources[].resource` が指すローカルのファイルが、記録したSHA-256と違う、または記録がない（下の「Markdown以外のファイル」）
- `stale_after` を過ぎている

`status: deprecated` の文書は、古い文書としても、新しい依存先としても対象外です。
同じ依存先を複数のキーで指していても、理由は1つにまとめます。
最終更新が不明な文書は比較できないので、名前だけを示します。

### Markdown以外のファイル

ExcelのWBSやMS Projectのスケジュールは、依存関係の相手にできません。それを表す「代わりの文書」をバンドルに置き、OKFのキーでファイルを指します（[ADR-022](../../.adaptrace/decisions/adr-022-resource-freshness.md)）。
代わりの文書を見直した時点で、ファイルの内容からSHA-256を計算し、代わりの文書に記録します。

```yaml
type: Schedule Baseline
resource: ../../pm/schedule.mpp      # この文書が表しているファイル
resource_sha256: 3f2a…c91e           # 見直したときの、そのファイルのSHA-256
sources:
  - resource: ../../pm/wbs.xlsx      # この文書のもとにしたファイル
    sha256: 9b0d…41aa
```

- `stale` は、ファイルの今のSHA-256を記録と比べます。違えば `resource-changed`、記録がなければ `resource-unrecorded` として列挙し、今のSHA-256を示します。ファイルがないか、ディレクトリなどの通常のファイルでないか、読めなければ、`resource-missing` として列挙します。日時もgitも使わないので、cloneやCIでも同じ結果になります
- 記録は16進数64桁で、小文字で書きます。大文字も読み、大文字と小文字を区別せずに比べます。記録するのは、`stale` が示す値です。テキストのファイルでは、`sha256sum` や PowerShellの `Get-FileHash` の値と違うことがあります
- テキストのファイルは、改行コードのCRLFをLFとして計算します。テキストかどうかは、先頭の8000バイトにNULがないかで決めます。gitが `core.autocrlf` でテキストとみなすファイルは、ふつうこの規則でもテキストになります。`core.autocrlf` で改行コードが変わっても、同じ値になります。そのため、`sha256sum` などで計算した値と違うことがあります。`stale` が示す値を記録してください
- ファイルに照らして文書を見直したら、示された値を `resource_sha256` か `sha256` に記録します。あわせて、内容を変えたら `generated` を、変えなかったら `verified` を更新します。MCPの `propose_update` の `review: true` は、この記録の案も作ります
- **ローカルのファイルは、その文書からの相対パスで、`./` か `../` から書きます。** `file:///` で始まる絶対のURIも使えます（ホスト名のある `file://host/...` は対象外です）。`\` は `/` として読みます。バンドルの外のファイルも指せます
- それ以外の値は、ファイルとして扱いません。`/` で始まる値、`pm/schedule.mpp` のような値、URL、リソース名（`projects/...`、`/subscriptions/...`）、説明の文などです。OKFの `resource` と `sources` には、こうした値も書けるためです
- `propose_update` の `review: true` や `resources: true` でSHA-256を記録すると、`sources` の部分は書き直されます。その部分のコメントは残りません
- パスは、そのまま書きます。`%20` のようなURLのエンコードは読みません（`file:///` のURIを除く）
- `resource` がその文書自身を指すときは、対象外です。記録するたびに文書が変わるためです
- MCPの更新案のフロントマターがYAMLとして読めなくなる場合（`sources` のリストの途中に、列0のコメントがあるときなど）は、案を作らずにエラーにします。文書を手で修正してください
- 次の場合は、正しく判定できないことがあります
  - `.gitattributes` の `text` で、NULを含むファイルの改行コードの変換を強制している
  - 文書自身を、シンボリックリンクや大文字と小文字の違う名前で指している（文書自身と判定しない）
  - 同じファイルを複数回指し、記録が食い違っている（最初の記録と比べる）
  - 記録が文字列でない（`stale` は「記録がない」と示し、`validate` が `invalid-sha256` で警告する）
- 同じファイルを複数回指していても、1つとして扱います
- `status: deprecated` の文書は調べません
- `impact` と `progress` は、ファイルを見ません。代わりの文書を更新すると、依存関係をたどって下流に伝わります
- JSONでは、理由が `{ "kind": "resource-changed", "resource": "<書いた値>", "recorded": "<記録>", "current": "<今の値>" }`、`recorded` のない `resource-unrecorded`、`resource` だけの `resource-missing` のどれかになります
- 最終更新が不明な文書も、ファイルは比べます。「Update date unknown, not compared with dependencies」は、依存先と比べられなかった文書の一覧です

## ヘルスチェック（`adaptrace health [bundle]`）

依存関係を整理するための提案を示します（[ADR-033](../../.adaptrace/decisions/adr-033-health.md)）。どれもエラーではありません。整理するかどうかは人が決めます。何も書き込みません。終了コードは0です。

| コード | 内容 |
| --- | --- |
| `deprecated-target` | `status: deprecated` でない文書が、`deprecated` の文書をキーで指している。`supersedes` と `changes` は除く |
| `redundant-dependency` | `depends_on`・`derived_from`・`satisfies` の依存A→Cが、同じキーの2つ以上の依存を通じても届く |
| `orphan` | `deprecated` でない文書で、ほかの `deprecated` でない文書との依存関係が1つもない |

- `deprecated-target` は、指しているキーと文書を示します。`deprecated` の文書を `supersedes` で置き換えた文書のうち、`deprecated` でないものを `replacedBy` に示します。置き換えた文書も `deprecated` なら、さらにそれを置き換えた文書をたどります。指している文書自身が置き換えた文書なら、`replacedBy` に含めず、依存を外すよう示します。ほかに置き換えた文書があれば、それも示します
- `changes` は、変更要求が何についてのものだったかの記録なので、対象にしません
- `redundant-dependency` は、同じ文書に届く、いちばん短い経路を `via` に示します
  - 経路は、直接の依存と同じキーだけでたどります。キーの違う経路は数えません。たとえば、タスクが要件を `satisfies` で指し、その要件から導いた判断に `depends_on` で依存するのは、冗長ではありません
  - 経路の文書は、どれも `deprecated` でないものに限ります。直接の依存を外すと、廃止した文書を通じた依存だけが残るためです
  - 依存元か依存先が、同じキーの循環依存に含まれるときは示しません。循環依存は `validate` が示します。循環依存の外では、示した依存をすべて外しても、届く文書は変わりません
  - 同じ文書を、同じキーに2回以上書いたときも示します。行は、2回目以降の記述の行です。`via` は空です
  - 直接の関係を明示するために、残してもかまいません
- `orphan` では、本文のリンク（参照）は依存関係に数えません。`deprecated` の文書との依存関係も数えません。ただし、次の文書は `orphan` にしません
  - `deprecated` の文書を `supersedes` で置き換えた文書と、`changes` で指す変更要求
  - `deprecated` でない文書の `owner` か `requested_by` で指されたステークホルダーの文書。`meeting` と同じく、`/` で始まるパスか、同じ表示名の文書が1つだけある名前で指します
- デッドロックと循環依存は、`validate` が示します。`health` では示しません
- `--format` は `text`（既定）と `json` です。`json` は、`code`、`file`、`line`（キーの行。`orphan` にはない）、`message` の配列です。`deprecated-target` と `redundant-dependency` には `kind` と `to`、`deprecated-target` には `replacedBy`、`redundant-dependency` には `via`（`from`、`to`、`kind` の配列）が付きます

## Backlog.mdとの変換（`adaptrace sync [bundle]`）

`type: Task` の文書と、Backlog.mdのタスク（`backlog/tasks/` と `backlog/completed/`）を双方向に変換します（[ADR-011](../../.adaptrace/decisions/adr-011-backlog-sync.md)）。

- 既定では、計画を表示するだけです。`--write` を付けたときだけ書き込みます
- Backlog.mdのディレクトリは、`--backlog`（既定は `backlog`）で指定します。`config.yml` の `statuses`、`default_status`、`task_prefix` を読みます
- `--direction import|export` で、片方向だけにできます。除外した側の変更は「pending」として示し、書き込みません。`--resolve` も、除外した側には書き込みません
- `--resolve <タスク>=<側>` で、衝突をタスクごとにそろえます。タスクは、バンドルの中のパス（`tasks/design.md`）か、Backlog.mdのID（`back-7`。大文字と小文字は区別しない）で指定します。何回でも指定できますが、1つのタスクに指定できる側は1つです。パスは、`./` や先頭の `/`、バンドルのディレクトリ（`.adaptrace/tasks/design.md`）が付いていても読みます。全体の `--resolve adaptrace|backlog` と一緒に指定すると、タスクごとの指定が優先されます。次の場合は、使い方の誤り（終了コード2）になります。Backlog.mdのタスクと対応付いていないタスクを指定したとき。同じタスクに、パスとIDなどで、別々の側を指定したとき。全体の指定に、両方の側を指定したとき

### 対応する項目

| Adaptrace | Backlog.md | 備考 |
| --- | --- | --- |
| `title` | `title` | |
| `state` | `status` | `In Progress` ⇔ `in_progress` のように、小文字にして空白などを `_` にした値で対応させる。Backlog.mdの `statuses` にない `state` は書き出さずに知らせる。`state` がなければ `default_status` |
| `tags` | `labels` | |
| `depends_on` のうち、Backlog.mdに対応するタスクを指すもの | `dependencies` | ほかの `depends_on`（要件や意思決定へのもの）は、Adaptrace側にだけ残す |
| 本文 | 本文 | そのまま |
| `backlog.id` | `id` | 対応づけ |
| `backlog.fields` | 上記以外のキー（`assignee`、`priority`、`milestone`、`created_date` など） | そのまま往復させる |
| `backlog.sync` | | 前回そろえたときの、共通の内容のハッシュ |
| `backlog.unmapped_dependencies` | `dependencies` のうち、Adaptraceに対応する文書がないもの | |

- 取り込んだタスクは `tasks/<id>.md`（例：`tasks/back-7.md`）に作ります。`generated` は、`adaptrace/<バージョン>` と同期した日時にします
- 書き出した新しいタスクには、Backlog.mdのID（`task_prefix` と次の番号）を振り、`backlog/tasks/<id> - <title>.md` に作ります
- `updated_date` はBacklog.md側にだけ書き、比較する内容には含めません
- Backlog.mdのファイルでは、日付・数値・真偽値に見える文字列（`'2026-10-29T00:00:00Z'` など）を引用符で囲みます。Backlog.mdのYAMLパーサーが、日付型として読まないようにするためです
- 新しいIDは、`drafts/` と `archive/` にあるタスクのIDとも重ならない番号にします
- Backlog.mdの `id` は、文字・数字・`.`・`_`・`-` だけを受け付けます。ファイル名になるためです。それ以外の `id` のファイルは、読み込みのエラーとして知らせます。`task_prefix` が同じ条件に合わないときは、新しいタスクを書き出しません

### 変化の見分け方

両側の今の内容（上の表の項目）をそれぞれハッシュにして、`backlog.sync` と比較します。

| Adaptrace | Backlog.md | 結果 |
| --- | --- | --- |
| 変わっていない | 変わっていない | そろっている |
| 変わった | 変わっていない | Backlog.mdへ書き出す |
| 変わっていない | 変わった | Adaptraceへ取り込む |
| 変わった | 変わった | 衝突。上書きせずに知らせる。`--resolve adaptrace` か `--resolve backlog` でどちらかにそろえる。タスクごとに `--resolve <タスク>=<側>` でもそろえられる |

両側の内容が同じで、`backlog.sync` だけがないときは、記録だけします。
`backlog.id` のタスクがBacklog.mdにないときは知らせ、作り直しも削除もしません。
そのタスクがBacklog.mdでアーカイブされている（`archive/tasks/` か `archive/drafts/` にある）ときは、`missing` ではなく `archived` として知らせます。どちらの側にも書き込みません。前回の同期の後にAdaptraceの文書が変わっていれば、`changed: true` を付けます。その変更は書き出されません。同じIDのタスクが `drafts/` にもあれば、`missing` です。
同じ `backlog.id` を持つTaskが2つ以上あるときは、どれも同期せずに知らせます。文書をコピーしたときに起きやすい状態です。

衝突、見つからないタスク、対応しない `state`、重複した `backlog.id`、読めないBacklog.mdのファイルのどれかがあると、終了コードは1です。`pending` と `archived` だけなら0です。

## カンバン（`adaptrace board [bundle]`）

`type: Task` の文書を `state` ごとの列に並べます。`--format` は `text`（既定）、`markdown`、`json` です。

- 列の順は、次のとおりです。Backlog.mdの `config.yml` があれば、`statuses` の順です。なければ `to_do`、`in_progress`、`done`、そのほかの `state`（名前順）、`state` なしの順です
- 終わっていないTaskを `depends_on` で待っている場合や、終わっていないTaskから `blocks` されている場合は、「waiting for」として示します。「終わった」は、`statuses` の最後の値（なければ `done`）です
- `status: deprecated` のTaskは表示しません。中止したTaskとして扱い、待ちの相手にもしません。中止したTaskに依存しているTaskは、待っていると示しません。廃止していない文書から中止したTaskへの依存関係（`depends_on` など）は、`health` が `deprecated-target` として示します。中止したTask自身に書いた `blocks` は、どのコマンドも示しません
- `--format markdown` では、パスをコード（`` `tasks/a.md` ``）で示します。バンドルからの相対リンクは、Issueなどに貼ると切れるためです。`--link-base <URL>` を付けると、表示名を `<URL>` とパスをつないだリンクにします（例：`--link-base https://github.com/<owner>/<repo>/blob/main/.adaptrace/`）

## 影響の判定（`adaptrace assess <文書>`）

変わった文書の直接の依存元（`depends_on`・`derived_from`・`satisfies`）ごとに、見直しが必要かを判定する材料を示します。LLMがあれば、判定と更新案も出します（[ADR-013](../../.adaptrace/decisions/adr-013-llm-assess.md)）。ファイルには書きません。

- 対象は、`impact` で `needs review` が付く直接の依存元です。`--all` を付けると、付かないものも含めます
- 間接の依存元は対象にしません。直接の依存元を更新してから、その文書について `assess` を実行します
- 依存元ごとに、依存先の差分を示します。比較するのは、その依存元を最後に変えたgitのコミットでの依存先と、今の作業ツリーの依存先です。依存元にコミットがないか、そのコミットに依存先がなければ、前の版は「不明」です

### LLMによる判定

`--llm <コマンド>` か、環境変数 `ADAPTRACE_LLM` でコマンドを指定したときだけ、LLMに判定させます。

- コマンドはシェルで実行します。プロンプトを標準入力に渡し、標準出力からJSONを1つ読みます。前後の文章やコードフェンスは読み飛ばします
- `claude -p`、`ollama run <model>`、`llm` のように、標準入力からプロンプトを読んで答えを標準出力に書くコマンドなら使えます
- コマンドは、引数か環境変数からだけ受け取ります。バンドルやリポジトリの設定からは読みません
- 依存元ごとに1回ずつ呼びます。同時に呼ぶのは `--jobs <n>`（既定4）までで、`--jobs 1` なら1つずつです。`--timeout <秒>`（既定300）を過ぎたら打ち切ります。AdaptraceをCtrl-Cで止めると、実行中のコマンドも止めます
- 依存先が前の版から変わっていないときは、LLMを呼ばずに `none` とします

答えの形：

```json
{ "verdict": "none" | "minor" | "major", "reason": "理由", "body": "新しい本文" | null }
```

| `verdict` | 意味 | 更新案 |
| --- | --- | --- |
| `none` | 今のままで正しい | `verified` を追加する案（見直した記録）。`generated` は変えない |
| `minor` | 言い回しや細部の修正 | `body` があれば、本文を置き換え `generated` を更新する案 |
| `major` | 内容が成り立たなくなった | 同上 |

更新案は、MCPの提案のツールと同じ形（全文、差分、増える・減る問題）です。
`generated.by`（`none` では `verified.by`）は `--by`（既定は `adaptrace/<バージョン>`）、`at` は今の日時です。
差分は `patch -p1 -d <バンドル>` で適用できます。

答えが読めない、コマンドが失敗した、時間切れになった依存元は、エラーとして示します。このとき終了コードは1です。それ以外は0です。`--format json` に対応します。

## バンドルの作成（`adaptrace init [bundle]`）

新しいバンドルを作ります（[ADR-014](../../.adaptrace/decisions/adr-014-init.md)）。既定の場所は `.adaptrace` です。

- 次のファイルを作ります
  - ルートの `index.md`（`okf_version: "0.2"` と各ディレクトリへの目次）
  - `log.md`（今日の日付の見出し）
  - `requirements`・`decisions`・`tasks`・`risks`・`meetings` の各ディレクトリの `index.md`
- すでにあるファイルは上書きせず、`exists` と示します。足りないファイルだけを作るので、何度実行しても構いません
- `--title` で `index.md` の題を指定します。既定は、今のディレクトリの名前です
- 日付は、実行する環境のタイムゾーンでの今日です

## 議事録からの抽出（`adaptrace extract <議事録>`）

議事録で決まったこと、割り当てられた作業、要件、リスクを、新しい文書の案にします（[ADR-015](../../.adaptrace/decisions/adr-015-extract.md)）。

- LLMのコマンドは、`assess` と同じく `--llm` か `ADAPTRACE_LLM` で指定します。指定がなければ、使い方の誤り（終了コード2）です
- LLMには、議事録の全文と、バンドルにある文書の一覧（パス、型、題、`state`）を渡します。既存の文書と同じものは作らず、リンクさせます
- 案の型は `Requirement`・`Acceptance`・`Decision`・`Task`・`Risk`・`Milestone` です。ほかの型は「Skipped」として示します
- 案はすべて `status: draft`、`derived_from: /<議事録>` で、`generated` は `{ by: --by の値, at: 今 }` です。`state`・`owner`・`due`・`tags`・`depends_on`・`satisfies`・`blocks` は、LLMが返したものを使います
- パスは `<型のフォルダ>/<id>.md` です（`requirements`、`acceptance`、`decisions`、`tasks`、`risks`、`milestones`）。`id` は、LLMが返す小文字の英数字とハイフンです。使えなければ `<議事録のファイル名>-<番号>` にします。同じパスがあれば `-2`、`-3` を付けます
- `id` が `index` や `log`（OKFの予約ファイルの名前）のときも、代わりの名前にします。同じパスがあるかは、大文字と小文字を区別せずに比較します
- 案どうしのリンクは、LLMの答えでは `#<id>` で書き、Adaptraceがパスに変換します。どの案の `id` でもなければ、そのリンクを外して「Links removed from drafts」に示します。その案がSkippedになった場合も同じです。同じ `id` が複数あれば、最初の案を指します
- 答えの形に合わない項目は、その項目だけを「Skipped」にします
- 案はまとめて検証し、存在しない依存先などを示します。既存の文書に出る問題（循環など）は、「New issues in existing documents」に示します
- 既定では表示するだけです。`--write` を付けると、案のファイルを作ります。既存のファイルは変更しません。作る直前に、案のどれかのファイルができていた場合は、どの案も作らずに「Not written」に示します。案どうしのリンクが、他人のファイルを指さないようにするためです。`--format json` に対応します

LLMの答えの形：

```json
{ "documents": [ { "type": "Task", "id": "build-login", "title": "…", "body": "…", "state": "to_do", "owner": "tanaka", "due": "2026-12-15", "depends_on": ["/decisions/auth.md", "#auth-provider"] } ] }
```

次のどれかに当たるとき、終了コードは1です。LLMが失敗したか答えが読めないとき、案が `validate` のエラーを増やすとき、案どうしのリンクを外したとき、書けなかったファイルがあるときです。

## 変更の見積もり（`adaptrace estimate <文書>...`）

変更の起点となる文書（変える要件など）を渡すと、変更が届く範囲と、作業の手がかりをまとめます（[ADR-016](../../.adaptrace/decisions/adr-016-estimate.md)）。何も書き込みません。

- 届く文書は、`impact` と同じ向き（`depends_on`・`derived_from`・`satisfies` を逆に）にたどります。起点は深さ0で、複数の起点から届く文書は、近い方の深さにします。`status: deprecated` の文書は、起点に渡した場合も含めず、「Left out as deprecated」（JSONでは `ignored`）に示します
- `--request <変更要求>` で、変更要求の文書を添えます。LLMに渡す材料と、出力の見出しに使います
- 起点の文書を渡さず `--request` だけを渡すと、その変更要求の `changes` を起点にします。`deprecated` の文書は、ほかの起点と同じく「Left out as deprecated」に示します
- 示すもの
  - 文書ごとの型、`state`、`owner`、`due`、どこから届くか
  - 型ごとの数と、Taskの `state` ごとの数
  - 作り直しになるTask：`state` が「終わった」値（Backlog.mdの `statuses` の最後、なければ `done`）のもの
  - 関わる人：`owner` の一覧（`owner` はリストでも構いません）
  - 期日に響くMilestone：届いたTaskが `blocks` しているか、届いたTaskに `depends_on` しているMilestoneと、その `due`。`state` が「終わった」値のMilestoneは除きます
- 「終わった」値は、`--backlog`（既定は `backlog`）にあるBacklog.mdの `config.yml` から取ります
- `--format` は `text`（既定）、`markdown`、`json` です。`markdown` での文書の示し方は `board` と同じで、`--link-base` でリンクにします
- `--order review` で、更新と見直しの順番に並べます。考え方は `impact` と同じです。起点もステップに含めます。起点が別の起点から届く場合は、その起点の後になります。`text` と `markdown` では、ステップを示します

### LLMによる目安

`--llm <コマンド>` か `ADAPTRACE_LLM` を指定すると、届く文書（起点を含む）ごとに、LLMに見積もらせます。

```json
{ "size": "none" | "small" | "medium" | "large", "hours": 6 | null, "work": "やること", "reason": "理由" }
```

- LLMには、変更要求、起点の文書の全文、その文書の全文、起点からの経路を渡します。経路には、作り直しになるTaskかどうかも含めます
- `hours` は、その文書自身の作業にかかる人時です。Taskなら実装の作業です。依存先の作業を重ねて数えないよう、プロンプトで指示します
- LLMは、`--jobs`（既定4）まで並行して呼びます
- 規模ごとの数と、工数の合計（小数第2位まで）を示します。`hours` のない文書（`none` を除く）と、答えが得られなかった文書は、「見積もりなし」として数えます
- LLMの目安であり、見積書ではありません。出力にもそう書きます

答えが得られなかった文書があれば、終了コードは1です。

## 見直しの状況（`adaptrace progress <変更要求>`）

変更要求1件について、影響範囲の文書をどこまで見直したかを示します（[ADR-018](../../.adaptrace/decisions/adr-018-progress.md)）。何も書き込みません。

- 影響範囲は、`impact <変更要求>` と同じです。変更要求から `depends_on`・`derived_from`・`satisfies` を逆にたどります
- 変更要求を直接指す文書を「起点」とします。起点は、変更要求を受け付けた日時（基準日時）より古くなければ、更新したものとみなします
- 基準日時は、変更要求の `received_at` です。変更要求を作るときに書いてください。`received_at` がなければ、変更要求の最終更新を使います。この場合、変更要求の `state` を更新して `generated.at` を変えると、起点が `to review` に戻ります
- `received_at` の形式が正しくないときは、`validate` が警告します。`progress` は出力に警告を出し、変更要求の最終更新を基準日時にします。基準日時が分からないときは、そう示し、起点を基準日時と比べません
- 基準日時は、出力の先頭に示します。JSONでは `baseline` で、`source` は `received_at`、`generated.at`、`timestamp`、`verified.at` のどれかです
- どの文書も、影響範囲にある直接の依存先と比べます。起点は、基準日時とも比べます。影響範囲の外の依存先による古さは、`stale` で確認します
- `status: deprecated` の文書は列挙しません。`deprecated` の文書を経由する依存は、その先の依存先と比べます。影響範囲の文書がすべて `deprecated` のときは、そう示します
- 循環依存がある場合、循環を1つの単位として判定します。循環の中の文書は同じステップになり、互いには比べません。それぞれ、循環の全員が持つ循環の外の依存先と比べます。循環の中に起点があれば、全員を基準日時とも比べます。循環の中に `reviewed` でない文書があるあいだは、ほかの文書も `waiting` にします。循環依存は `validate` のエラーです
- 見直した結果、変更が要らなかった文書は、`verified` を更新すると `reviewed` になります。`generated` は変えないので、下流の文書は古くなりません（[ADR-020](../../.adaptrace/decisions/adr-020-verified-review.md)）
- 終了コードは、すべて `reviewed` なら0、そうでなければ1です。影響範囲が空のときも0です
- 変更要求の型は検査しません。どの文書でも指定できます
- `--format` は `text`（既定）、`markdown`、`json` です。`markdown` での文書の示し方は `board` と同じで、`--link-base` でリンクにします

## 一覧（`adaptrace list [bundle]`）

文書を1行1件の表にします（[ADR-019](../../.adaptrace/decisions/adr-019-list.md)）。変更ログやリスク登録簿を、定例の資料に貼るためのものです。何も書き込みません。

- 絞り込みは `--type`、`--state`、`--status` です。どれも、書かれた値との完全一致です。MCPの `list_documents` と同じです。文字列の値だけが一致します。`state: 2` のように数として書いた値は、`--state 2` に一致しません。引用符で囲んで `state: "2"` と書いてください。`--status` は `draft`、`stable`、`deprecated` のどれかです
- 一覧のためのオプション（`--type`、`--state`、`--status`、`--columns`、`--sort`）は、ほかのコマンドでは使えません。ただし、`--type` は `coverage` でも使えます（要件の型）
- `status: deprecated` の文書は、既定で除きます。`--status` を指定したときは、その値の文書だけを示します
- 先頭の列は、文書（パスと表示名）です
- 既定の列は `type`、`state`、`owner`、`due`、`updated` です。`--columns` を指定せずに `--type` で絞り込んだときは、`type` の列を省きます
- `--columns` に、列にするキーをカンマ区切りで指定します。例：`--columns state,probability,impact,owner`
  - `generated.by` のように `.` で区切ると、入れ子のキーを読みます。文書に書かれたキーだけを読みます
  - `updated` は、フロントマターのキーではなく最終更新（[最終更新](#最終更新)）です
  - リストの値は「, 」でつなぎます。ほかのオブジェクトはJSONで示します。値がなければ空にします
  - 値は、YAMLとして読んだ値を示します。数は正規化されます（`1.10` は `1.1`、`007` は `7`）。書いたとおりに示すには、引用符で囲みます
  - 同じ列を2回指定したり、`path` や `title` を指定したりすると、エラーになります
- 並び順は、既定でパスの順です。`--sort <列>` で、その列の値の順にします。数、日時、そのほかの文字列、空の値の順にまとめ、それぞれの中で比べます。日時は、UTCオフセット付きの日時と日付だけの値（`2026-12-15`）です。オフセットにかかわらず時刻で比べ、日付だけの値はその日のUTCの0時として比べます。`2026-02-30` のように存在しない日付は、文字列として扱います。文字列とパスは、実行環境のロケールによらず、コードポイントの順に比べます。同じ値の中はパスの順です。`--sort path` と `--sort title` は、表示しているパスと表示名の順です。どの文書にも値がないキーで並べると、標準エラーに警告を出します
- `--format` は `text`（既定）、`markdown`、`csv`、`json` です
  - `text` は、列をそろえた表です。全角文字と、絵文字として表示される文字は、2文字分の幅で数えます。改行、タブ、制御文字は空白にします。該当する文書がないときは `No documents.` と示します（`markdown` も同じです）
  - `markdown` での文書の示し方は `board` と同じで、`--link-base` でリンクにします
  - `csv` は、RFC 4180に従います。先頭の行は `path,title,` と列の名前です。行の区切りはCRLFです。日本語版のExcelで文字化けしないよう、先頭にBOMを付けます。`=`、`+`、`-`、`@` で始まる値は、表計算ソフトが数式として実行しないよう、先頭に `'` を付けます。数として読める値（`-3` など）には付けません
  - `json` は `{ "columns": [...], "documents": [{ "path", "title", "values": { 列: 値 } }] }` です

## 重なる変更要求（`adaptrace conflicts [bundle]`）

未決の変更要求のうち、影響範囲が重なる組を示します（[ADR-023](../../.adaptrace/decisions/adr-023-changes-key.md)）。重なる変更要求は、互いに矛盾しているかもしれません。どちらかを決める前に、まとめて協議します。何も書き込みません。終了コードは0です。

- 変更要求が変える文書（起点）は、`changes` で指します。承認したら、これまでどおり起点の文書の `derived_from` に変更要求を追加します
- 未決の変更要求は、`changes` を持ち、`status: deprecated` でなく、`state` が決着した値でない文書です。型は見ません
- 決着した値は、既定で `approved`、`accepted`、`rejected`、`deferred`、`implemented`、`closed`、`done` です。大文字と小文字は区別しません。`--settled <値,...>` で変えられます
- 影響範囲は、起点と、起点から `impact` と同じ向きにたどって届く文書です。`status: deprecated` の文書は含めません
- 組ごとに、両方が変える文書（`sharedTargets`）と、両方が届く文書（`overlap`）、その型ごとの数（`byType`）を示します。同じ起点を持つ組を先に並べ、その中では重なりの大きい組から並べます
- `changes` を持たないか、`changes` の文書がすべて `deprecated` の未決の変更要求は、比べられなかった変更要求として示します（JSONでは `unlinked`）
- `--format` は `text`（既定）、`markdown`、`json` です。`markdown` での文書の示し方は `board` と同じで、`--link-base` でリンクにします

### LLMによる判定

`--llm <コマンド>` か `ADAPTRACE_LLM` を指定すると、重なる組ごとに、2つの変更要求が両立できるかをLLMに判定させます（[ADR-024](../../.adaptrace/decisions/adr-024-conflicts-llm.md)）。

```json
{ "verdict": "conflict" | "duplicate" | "compatible" | "unclear", "reason": "理由", "decide": ["協議で決めるべき点"] }
```

- `conflict` は両立できない、`duplicate` は同じことを求めている、`compatible` は両立できる、`unclear` は文書だけでは判断できない、です
- LLMには、2つの変更要求の全文と、両方が変える文書の全文を渡します。両方が変える文書がない組では、それぞれが変える文書の全文を渡します。それぞれが変えるほかの文書と、両方が届くそのほかの文書は、パスと表示名だけです
- 組ごとに判定、理由、決めるべき点を示し、最後に判定ごとの数を示します。`markdown` では、LLMの答えをエスケープし、URLはコードとして示します。JSONでは、各組に `judgment`（失敗したときは `null` と `error`）が付きます
- LLMが失敗したか、答えが読めない組があると、終了コードは1です
- `--jobs` と `--timeout` は、`assess` と同じです
- LLMの判定は、協議の材料です。決定ではありません。何も書き込みません

## 要件の充足（`adaptrace coverage [bundle]`）

要件ごとに、満たす文書（`satisfies` で要件を指す文書）と、その進み具合を示します（[ADR-040](../../.adaptrace/decisions/adr-040-coverage.md)）。要求事項トレーサビリティ・マトリックスに当たる表を、依存関係から計算します。何も書き込みません。終了コードは0です。

| 状況 | 内容 |
| --- | --- |
| `uncovered` | 数える文書のうち、要件を `satisfies` で指すものがない |
| `open` | 数える文書のうち、終わっていないものがある |
| `covered` | それ以外 |

- 要件は、`type: Requirement` の文書です。`--type` で別の型にできます。`Task` と `Milestone` は作業なので、要件の型にはできません。`status: deprecated` の要件と、`deprecated` の満たす文書は含めません
- 満たす文書が終わったかは、型で決めます。JSONでは `done` です
  - Task：`state` が `done` なら、終わったとみなします。値は `--done` で変えられます。カンマ区切りで複数の値を指定できます。大文字と小文字は区別しません
  - 要件の型の文書：その要件が `covered` なら、終わったとみなします。JSONの `status` に、その要件の状況を示します
  - Milestone：Taskと同じく、`state` が `done` なら終わったとみなします。マイルストーンの範囲の作業から判断はしません。リリースが終わったら、Milestoneの `state` を終わった値にしてください
  - それ以外（Decisionなど）：あれば満たしているとみなします。`state` は見ません。却下した判断などは、`status: deprecated` にするか、`satisfies` を外してください。`done` は `null` です
- `--milestone <文書>` を付けると、マイルストーンの範囲だけを示します。文書は、`status: deprecated` でない `type: Milestone` の文書です
  - 範囲は、マイルストーンが待っている文書（`depends_on` と `blocks`）から始めて、近い順にたどります。向きは `board` と同じです
  - TaskとMilestoneからは、それが待っている文書をたどります。待っているMilestone（前のリリースなど）も、その先までたどります。要件からは、それを満たすTaskと要件をたどります。ただし、ほかのMilestoneが直接待っているTaskは、そのリリースの作業なので、たどりません
  - それ以外の文書（判断など）は範囲に入りますが、その先はたどりません。`status: deprecated` の文書は範囲に含めず、その先もたどりません
  - 示す要件は、範囲の要件と、範囲のTaskとMilestoneが `satisfies` で満たす要件です。マイルストーン自身が満たす要件も含みます
  - マイルストーンが待っている要件（範囲の要件）は、満たす文書をすべて数えます。その要件を、どのリリースの作業かにかかわらず、すべて終える必要があるためです。範囲の作業が満たすので示す要件は、範囲のTaskとMilestone（マイルストーン自身を含む）だけを数えます。それ以外のTaskとMilestoneは、別のリリースの作業とみなし、数えません。JSONの `counted` は、その要件に対して数えたかどうかです。示す要件は、範囲の中の作業だけで状況を決めます。示さない要件が、示す要件を満たしている場合は、その要件の作業をすべて数えて、`covered` かどうかを決めます
- `--milestone` のときは、範囲の文書を近い順に示します（JSONでは `scope`）。担当者（`owner`）と期日（`due`）を示します。終わっていないTaskかMilestoneの期日がマイルストーンの `due` より後なら、`late` が `true` です。`done` を持つのはTaskとMilestoneです。`text` と `markdown` では、TaskとMilestoneを示します
- `--format` は `text`（既定）、`markdown`、`json` です。`markdown` での文書の示し方は `board` と同じで、`--link-base` でリンクにします

## 協議の会議の準備（`adaptrace meeting <変更要求>...`）

まとめて協議する変更要求について、会議の準備の材料を示します（[ADR-025](../../.adaptrace/decisions/adr-025-meeting.md)）。日程調整と招待の送信はしません。連絡先は扱わず、名前と役割だけを示します。

- `--audience internal`（既定）は社内の会議、`--audience customer` は顧客との会議です。まず社内で方針を決め、次に顧客と相談する、という2段階を想定しています
- 社内か顧客かは、ステークホルダーの文書の `side`（`internal` か `customer`）だけで決めます。`owner` と `requested_by` に、その文書のパスを `/` から書きます（`/stakeholders/a-corp.md` など）
  - 名前だけの値は、`status: deprecated` でないステークホルダーの文書に、同じ表示名の文書が1つだけあれば、その文書として扱います。`side` のないステークホルダーの文書も数えます
  - パスで指したステークホルダーの文書が `status: deprecated` なら、その `side` は使いません。パスで指した文書がステークホルダーの文書でない場合（型が `Stakeholder` でなく、`side` もない場合）は、見つからないパスと同じに扱います
  - それ以外は、すべて `unknown` です。名前だけの値、文書が見つからないパス、`/` で始まらないパス、`side` のない文書、`side` が `internal` と `customer` 以外の文書が該当します。`side` は大文字と小文字を区別しません
  - 規則を厳しくしているのは、入力の誤りや同名の別人で、顧客を社内の会議に呼ばないためです
- 参加者の候補は、変更要求が届く文書の `owner` と、変更要求の `requested_by` です。それぞれの役割（どの文書の担当か、どの要求を出したか、ステークホルダーの文書の `role`）を示します。社内の会議では `internal` の人だけを候補にし、`unknown` の人は「招待の前に確認が必要」として別に示します。パスのように見えるのに文書が見つからない値も示します。`/`、`./`、`../` で始まる値と、`.md` で終わる値をパスとみなします。`Meeting` の下書きにも、確認が必要な人を書きます
- ほかの変更要求（`changes` を持つ文書と、型が `Change Request` の文書）は、届く文書に数えません。その `owner` も参加者の候補にしません
- 議題は、社内の会議では、変更要求の組ごとの重なりと、届くベースライン（型の名前に `Baseline` を含む文書）です。顧客との会議では、社内の検討の詳細を示しません。示さないのは、届く文書、重なり、ベースライン、変更要求が変える文書、担当者が担当する文書の名前、LLMの判定の理由、見つからない文書のパスです。JSONの出力、`Meeting` の下書き、招集の文案のためにLLMに渡す材料も同じです。顧客向けの招集の文案では、LLMに変更要求の表示名だけを渡します。本文とパスは渡しません。本文には、社内の文書を指す書き方がいろいろあり、すべてを機械的に除けないためです。MCPの `meeting_context` も、顧客向けには、返した材料だけで文案を作るようエージェントに指示します
- `--llm` を付けると、招集の文案（件名と本文）をLLMに書かせます。文案は文書と同じ言葉で、日時と場所は空けておきます
  - 社内の会議では、組ごとの判定（`conflicts --llm` と同じ）と協議で決めるべき点を、議題に加えます
  - 顧客との会議では、組ごとの判定をしません。判定の材料に社内の検討が含まれるためです。顧客に決めてもらう点は、変更要求の本文だけから、文案の中で挙げさせます
- 決着した `state` の変更要求や、`status: deprecated` の変更要求も渡せます。その場合は、その旨を示します
- `Meeting` の下書きを示します。`depends_on` で変更要求を指し、`status: draft` です。パスは `meetings/<日付>-<最初の変更要求>-<audience>.md` で、同じパスがあれば `-2`、`-3` を付けます。`--write` を付けたときだけ、新しいファイルとして作ります
- 終了コードは、LLMが失敗したか、下書きを書けなかったときに1です。それ以外は0です
- 同じ変更要求を別の書き方で渡しても、1つとして扱います。下書きのパスの衝突は、大文字と小文字を区別せずに確認します
- `--format` は `text`（既定）、`markdown`、`json` です。`markdown` では、文書とLLMの言葉をエスケープし、招集の文案はコードブロックで示します
- 会議の後は、議事録を `extract` に渡して方針の `Decision` を下書きし、各変更要求の `state` を更新します

## MCPサーバー（`adaptrace mcp [bundle]`）

stdioのMCPサーバーとして起動します（[ADR-012](../../.adaptrace/decisions/adr-012-mcp-server.md)）。
ツールはどれもファイルに書きません。呼ばれるたびに、バンドルをディスクから読み直します。

| ツール | 内容 |
| --- | --- |
| `validate` | `adaptrace validate` と同じ問題の一覧 |
| `list_documents` | 文書の一覧（パス、型、表示名、`status`、`state`、最終更新、見直した日時（`reviewed`））。`type`・`state`・`status` で絞り込める |
| `read_document` | 1つの文書の全文、フロントマター、出ていく依存（`outgoing`）、入ってくる依存（`incoming`） |
| `graph` | `adaptrace graph --format json` と同じ |
| `impact` | `adaptrace impact --format json` と同じ |
| `stale` | `adaptrace stale --format json` と同じ |
| `health` | `adaptrace health --format json` と同じ |
| `progress` | `adaptrace progress --format json` と同じ。`request`（変更要求）を受け取る |
| `conflicts` | `adaptrace conflicts --format json` と同じ。`settled`（決着した `state` の値）を受け取る |
| `coverage` | `adaptrace coverage --format json` と同じ。`milestone`、`types`（要件の型）、`done`（終わったTaskとMilestoneの `state` の値）を受け取る |
| `meeting_context` | `meeting` の材料（参加者、変更要求、重なり、ベースライン）と、議題・招集の文案・`Meeting` の下書きを作る手順（`instructions`）。`requests` と `audience` を受け取る。顧客向けでは、社内の検討の詳細を返さない |
| `conflicts_context` | `conflicts` の内容に、組ごとに読む文書のパス（`materials`）、パスごとの全文（`texts`、1回ずつ）、判定の手順（`instructions`）を加えたもの。判定はエージェントが行う |
| `estimate_context` | `estimate --format json` の内容に、変更要求の全文（`requestContent`）、届く文書の全文（`contents`）、見積もりの手順を加えたもの。`documents`（起点）と `request` を受け取る |
| `extract_context` | 議事録の全文、既存の文書の一覧、下書きの手順（`instructions`）。下書きは、エージェントが `propose_document` で作る |
| `assess_context` | `adaptrace assess --format json` の材料に、依存先と依存元の全文と、判定の手順（`instructions`）を加えたもの。判定はエージェントが行い、更新案は `propose_update` で作る |
| `board` | `adaptrace board --format json` と同じ |
| `sync_plan` | `adaptrace sync --format json` の計画。書き込まない |
| `propose_document` | 新しい文書の案。`path`、`type`、`title`、ほかのキー（`frontmatter`）、本文、`by`（`generated.by` にするactor）を受け取る |
| `propose_update` | 既存の文書の変更案。`set`（キーを設定）、`unset`（キーを削除）、`body`（本文を置き換え）、`by` を受け取る。指定したキーの行だけを書き換える。`review: true` だけを指定すると、見直して変更が要らなかった記録として、`verified` を今の日時にする案を作る。このとき、`resource` と `sources` のファイルのSHA-256も今の値にする。内容を変える案では、`resources: true` で同じようにする |

提案のツールは、次を返します。

- `content`：変更後の全文
- `diff`：unified diff（`patch` でそのまま適用できる）
- `issues`：変更後の文書で見つかる問題
- `newIssues` / `resolvedIssues`：その変更でバンドル全体に新しく出る問題と、消える問題。別の文書で報告される循環なども含む
- `written: false`

提案では、`generated` を `{ by, at: 今 }` にし、古い `timestamp` は削除します。`review: true` のときは、`generated` を変えずに `verified` を `{ by, at: 今 }` にします。
`type` は削除できず、空でない文字列だけを受け付けます。
`propose_document` の `frontmatter` で、`type` と `title` を上書きすることはできません。
予約ファイル（`index.md`、`log.md`）と、バンドルの外のパスは受け付けません。
パスはそのまま使い、`#` や `%` も文字として扱います。

`propose_update` は、指定したキーの行だけを書き換えます。その下の字下げされた行やリストの行も、書き換えの対象に含みます。
1行のマッピング（`generated: { by, at }`）は、1行のまま書き換えます。
コメント、空行、改行コード（CRLF）、BOMはそのまま残します。
差分は、末尾の改行の有無も示します（`\ No newline at end of file`）。

