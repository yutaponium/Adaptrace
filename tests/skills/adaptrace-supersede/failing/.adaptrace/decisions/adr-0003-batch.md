---
type: Decision
title: ADR-0003 給与システムへはAPIで渡す
state: accepted
satisfies: /requirements/req-1-payroll.md
depends_on: /decisions/adr-0002-db.md
generated: { by: human:hayashi, at: 2026-10-22T10:00:00+09:00 }
---

# ADR-0003 給与システムへはAPIで渡す

## 決定

勤怠データを確定したときに、給与システムのAPIを呼ぶ。

## 理由

給与システムがAPIを提供した。
