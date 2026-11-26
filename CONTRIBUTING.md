# コントリビュートの手引き

日本語 | [English](CONTRIBUTING.en.md)

Adaptraceへの関心をありがとうございます。Issueでのアイデアや議論を歓迎します。
English contributions are welcome too. Issues and pull requests may be written in English or Japanese.

## Issue

- 不具合の報告、機能の提案、設計の議論はIssueに書いてください
- 脆弱性はIssueに書かず、[SECURITY.md](SECURITY.md)の手順で報告してください

## Pull Request

1. 大きな変更は、先にIssueで方向性を相談してください
2. ブランチを切って作業し、`main` へのPRを作成してください
3. 次のコマンドが通ることを確認してください

   ```bash
   bun install
   bun run lint
   bun run typecheck
   bun test
   ```

4. コミットメッセージは英語の[Conventional Commits](https://www.conventionalcommits.org/)で書いてください（例：`feat: add impact command`）
5. 公開APIやCLIの出力を変更する場合は、`CHANGELOG.md` の「Unreleased」に記載してください
6. 日本語のドキュメントを書く場合は、[AGENTS.md](AGENTS.md)の「文書の書き方と用語」に従ってください

## DCO（Developer Certificate of Origin）

すべてのコミットに、[DCO](https://developercertificate.org/)に同意したことを示す `Signed-off-by` を付けてください。

```bash
git commit -s -m "fix: handle empty frontmatter"
```

Dependabotが作るコミットは、依存パッケージの版を変えるだけなので、例外として `Signed-off-by` を求めません（ADR-035）。

## AIエージェントを使う場合

エージェントには[AGENTS.md](AGENTS.md)を読ませてください。設計原則と規約がまとめてあります。
エージェントが書いたコードも、提出する人が内容に責任を持ってください。

## 行動規範

このプロジェクトは[Contributor Covenant](CODE_OF_CONDUCT.md)に従います。
