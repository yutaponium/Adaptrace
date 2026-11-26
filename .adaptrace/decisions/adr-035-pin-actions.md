---
type: Decision
title: GitHub ActionsをSHAで固定してDependabotで更新し、DependabotのコミットはDCOの対象外にする
state: accepted
generated: { by: claude-code/opus-5.5, at: 2026-11-26T10:51:06+09:00 }
depends_on: /decisions/adr-006-dco.md
---

# GitHub ActionsをSHAで固定してDependabotで更新し、DependabotのコミットはDCOの対象外にする

## 決定

- ワークフローのアクションは、タグではなくコミットのSHAで指定する。版は、行末のコメントで示す
- アクションと、Bunの依存パッケージ（`bun.lock`）は、Dependabotが毎週PRで更新する。設定は `.github/dependabot.yml` に置く
- Dependabot（`dependabot[bot]`）のコミットは、DCOの `Signed-off-by` を求めない。ADR-006の例外とする

## 理由

- タグは、後から別のコミットに付け替えられる。アクションのリポジトリが乗っ取られると、同じタグのまま別のコードがCIで動く。SHAなら、確認したコードだけが動く
- SHAで固定すると、更新を手作業で追う必要がある。Dependabotは、SHAで固定したアクションも更新できる
- Dependabotのコミットは、依存パッケージの版を変えるだけで、人の著作物の貢献ではない。DCOは、貢献した人が権利を持つことを示すためのものなので、Botのコミットには当てはまらない。マージするかどうかは、メンテナーがPRを確認して決める

## 検討した他の案

- マージの前に、メンテナーが署名付きのコミットを追加する：毎週のPRごとに手間がかかる
- Dependabotを使わず、手作業で更新する：更新が漏れやすい
