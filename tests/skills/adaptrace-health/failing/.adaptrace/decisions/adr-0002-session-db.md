---
type: Decision
title: ADR-0002 セッションをデータベースに保存する
state: accepted
supersedes: /decisions/adr-0001-session-memory.md
satisfies: /requirements/req-1-login.md
generated: { by: human:sato, at: 2026-10-20T10:00:00+09:00 }
---

# ADR-0002 セッションをデータベースに保存する

## 決定

ログインのセッションを、会員のデータと同じデータベースのテーブルに保存する。保存期間は30日とし、期限を過ぎたセッションは毎日削除する。

## 理由

アプリのサーバーを2台にするため。メモリに保存すると、サーバーを再起動したときにログインが切れる。

## 検討した他の案

- Redisに保存する：運用するサーバーが増えるので採らなかった
