---
type: Decision
title: ADR-0004 給与システムへはAPIで渡す
state: accepted
supersedes: /decisions/adr-0003-batch.md
satisfies: /requirements/req-1-payroll.md
depends_on: /decisions/adr-0002-db.md
generated: { by: claude-code/opus-5.5, at: 2026-11-26T11:00:00+09:00 }
---

# ADR-0004 給与システムへはAPIで渡す

## 決定

勤怠データを確定したときに、給与システムのAPIを呼んで渡す。

## 理由

給与システムがAPIを提供した。夜間のバッチでは、当日の修正が翌日まで給与システムに届かない。

## 検討した他の案

- バッチの回数を増やす：給与システムの負荷が大きくなる
