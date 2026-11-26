---
type: Decision
title: 見直して変更が要らなかったことはverifiedに記録し、下流の文書を古くしない
state: accepted
generated: { by: claude-code/opus-5.5, at: 2026-11-25T20:00:00+09:00 }
depends_on:
  - /decisions/adr-010-last-updated.md
  - /decisions/adr-012-mcp-server.md
  - /decisions/adr-013-llm-assess.md
verified: { by: human:yutaponium, at: 2026-11-26T00:22:00+09:00 }
---

# 見直して変更が要らなかったことはverifiedに記録し、下流の文書を古くしない

ADR-010のうち、「`verified` は最終更新に含めない。見直した結果、変更が不要だった場合も、`generated.at` を更新して記録する」を、この決定で置き換える。ADR-010のほかの決定は変えない。

## 決定

- 文書の日時を、次の2つに分けて扱う
  - **内容の最終更新**：これまでどおり `generated.at`、古い `timestamp`、gitのauthor dateの順に取る（ADR-010）
  - **見直した日時**：内容の最終更新と `verified.at`（OKFのキー）のうち、新しい方。`verified` がリストのときは、最も新しい `at` を使う
- 文書が古いかどうかは、「自分の見直した日時」と「依存先の内容の最終更新」を比べて判定する。`impact`、`stale`、`progress` に適用する
- 見直して変更が要らなかったときは、`verified: { by, at }` を今の日時にする。`generated` は変えない。内容を変えたときは、これまでどおり `generated` を更新する
- 内容の日時がなく、`verified` だけがある文書は、`verified.at` を内容の最終更新としても使う
- `assess --llm` の判定が `none` のときの更新案は、`verified` を更新する形にする。MCPの `propose_update` に `review: true` を追加し、`verified` だけを更新する案を作れるようにする。`review` と、`set`・`unset`・`body` は同時に指定できない
- `verified` を追加するときは、それまでの記録を残し、リストの末尾に追加する
- `generated` がなく、gitの日時を内容の最終更新にしている文書に `verified` を追加するときは、そのときの最終更新を `generated: { by: process:git, at }` として書き込む。`verified` を追加したコミットで、内容の最終更新が動かないようにするため
- `generated` と `verified` は、`{ by, at }` の1行の形式で書く。リストは、1件を1行の `- { by, at }` で書く
- 出力のJSONの最終更新に `reviewed`（見直した日時、なければ `null`）を追加する。テキストでは「reviewed」として示す

## 理由

- ADR-010の方式では、見直しだけで `generated.at` を更新するので、その文書に依存するすべての文書が「依存先より古い」になる。内容が変わっていないのに、見直しの対象が下流へ連鎖して広がる
- 「内容を更新した」と「見直したが変更不要」が、フロントマターから区別できない。PMBOKの変更管理では、ベースラインを変えたかどうかが重要になる
- OKFの `verified` は、確認した記録のためのキーである。OKFの仕組みの中で区別でき、新しいキーは要らない（設計原則2）
- ADR-010は「`verified` を含めると、何を確認したのかが曖昧なまま要確認が消える」として、`verified` を使わなかった。この決定では、`verified` を「その文書自身が、依存先の今の内容に照らして正しいと確認した」という意味に限る。依存先の内容の最終更新と比べるので、依存先が後から変われば、再び見直しの対象になる

## 検討した他の案

- 見直しも `generated.at` で記録し、区別は別のキーに残すだけにする（提案書の案）：ADR-010を変えずに済むが、下流への連鎖は残る
- 今のまま変えない：区別が必要なら、gitのコミットメッセージに書く。フロントマターからは区別できない
- `verified` を、内容の最終更新としても使う：単純だが、見直しだけで下流が古くなり、今と変わらない
