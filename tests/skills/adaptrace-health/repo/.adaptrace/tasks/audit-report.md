---
type: Task
title: ログインの監査レポート
owner: yamada
state: to_do
due: 2026-12-19
depends_on:
  - /tasks/session-table.md
  - /decisions/adr-0002-session-db.md
generated: { by: human:sato, at: 2026-10-24T10:00:00+09:00 }
---

# ログインの監査レポート

月ごとに、ログインの件数とセッションの件数を集計する。集計の期間は、ADR-0002で決めたセッションの保存期間（30日）に合わせる。
