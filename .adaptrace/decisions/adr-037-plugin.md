---
type: Decision
title: skillをClaude Codeのプラグインとして配布し、skillに共通の書き方を各skillに置く
state: accepted
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-26T12:41:24+09:00 }
depends_on:
  - /decisions/adr-026-adopt-skill.md
---

# skillをClaude Codeのプラグインとして配布し、skillに共通の書き方を各skillに置く

## 決定

- skillを、Claude Codeのプラグインとして配布する。リポジトリのルートを、プラグインとマーケットプレイスの両方にする。`.claude-plugin/plugin.json` と `.claude-plugin/marketplace.json` を置き、既存の `skills/` をそのまま使う
- 利用者は、`/plugin marketplace add yutaponium/Adaptrace` と `/plugin install adaptrace@adaptrace` で、7つのskillをまとめてインストールする。ディレクトリをコピーする方法も残す。skillはAgent Skillsの形式なので、ほかのエージェントでもコピーすれば使える
- プラグインの版は、`plugin.json` の `version` で示す。マーケットプレイスは、プラグインの取得元をリリースのタグに固定する（`marketplace.json` の `source` の `ref`）。リリースのたびに、`version` と `ref` の両方を上げる。これで、プラグインのskillと、同じタグからインストールしたCLIの版がそろう
- CLIとMCPのサーバーは、プラグインに含めない。CLIは、これまでどおり利用者がcloneして `bun install` する
- `adaptrace` のコマンドでskillをインストールする機能は作らない
- skillの試験で繰り返し不明とされた事柄を、「共通の書き方」の節として、7つのskillに同じ内容で置く。コマンドの書き方、仕様とガイドの場所、`generated.by`、日時、新しいキーの位置、`log.md` の書き方である

## 理由

- プラグインなら、利用者は2つのコマンドで、すべてのskillをインストールでき、更新もコマンドで済む。コピーでは、skillごとに手作業が要り、更新を追えない
- リポジトリのルートをプラグインにすれば、skillのファイルを二重に持たずに済む
- CLIは依存パッケージ（`@modelcontextprotocol/sdk`、`zod`）が要る。プラグインのインストールでは依存パッケージがインストールされないので、プラグインからCLIを動かすと失敗するおそれがある
- コマンドでのインストールは、CLIがエージェントのディレクトリ（`.claude/`）に書き込むので、設計原則5（特定のエージェントに依存しない）に関わる
- 各skillは単独でもコピーして使えるので、共通の決まりを1つのファイルにまとめず、各skillに置く

## 検討した他の案

- skillごとに、別のプラグインにする：利用者が7回インストールする必要がある
- skillを別のリポジトリに分ける：skillと、それが呼ぶCLIの版がずれやすい
