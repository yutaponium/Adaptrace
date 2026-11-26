---
type: Decision
title: PRの前に、/code-reviewと同時にGeminiのレビューも実行する
state: accepted
generated: { by: claude-code/opus-5.5, at: 2026-11-06T03:50:00+09:00 }
supersedes: /decisions/adr-007-review-before-pr.md
verified: { by: human:yutaponium, at: 2026-11-26T00:22:00+09:00 }
---

# PRの前に、/code-reviewと同時にGeminiのレビューも実行する

> 注：2026-11-23に文言だけを修正した。決定の内容は変えていない。

## 決定

- コードを変更するPRでは、Claude Codeの `/code-review` に加えて、Claude Codeのskill「gemini-review」でGemini（別の会社のモデル）のレビューも実行する
- 2つは同時に開始する。どちらもバックグラウンドで動くので、順番に実行すると待ち時間が足し算になる
- skillはリポジトリに置かず、使う人の環境（`~/.claude/skills/`）にインストールする。インストールされていない環境では実行せず、PRの本文の「レビュー」にそう書く
- 送らないものは、skillの既定（秘密の置き場、`CLAUDE.md`、`docs/` など）に、リポジトリの `.gemini-review.json` で追加する。ただし `docs/` は送る（`send_dirs`）。スキーマの正 `docs/spec/schema.md` と `docs/STATUS.md` を、コードと突き合わせられるようにするため
- Geminiの指摘はそのまま修正せず、コードと照らして採用・不採用を決め、PRの本文の「レビュー」に書く

## 理由

- 同じモデルのレビューだけでは、同じ思い込みを見逃しやすい。別の会社のモデルの目を追加する。メンテナーの別のプロジェクトでは2026-10-25から使っている
- skillにしたので、どのリポジトリでも同じ形で実行できるようになった。以前はリポジトリごとにスクリプトをコピーしていた
- 同時に開始すれば、待ち時間はほとんど増えない

## 影響

- ADR-007（当面 `/code-review` のみ）を置き換える。ADR-007には `status: deprecated` を付けた
- 外部のコントリビューターはskillを持たないので、Geminiのレビューは実行できる環境だけで行う。PRのひな形にそう書く
- `CLAUDE.md` の「PR の前のレビュー」と、PRのひな形の「レビュー」を修正する
