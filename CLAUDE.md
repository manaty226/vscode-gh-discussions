# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VSCode extension that enables viewing, creating, editing, and managing GitHub Discussions directly within VS Code using a Virtual File System approach. The extension uses the `ghd://` URI scheme to represent discussions as editable markdown files.

## Development Commands

```bash
npm test              # Run Jest unit tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run compile       # Compile TypeScript to JavaScript
npm run watch         # Watch mode compilation
npm run lint          # Check code style with ESLint
npm run lint:fix      # Auto-fix linting issues
npm run package       # Create .vsix extension package
```

To run a single test file:
```bash
npx jest src/__tests__/githubService.test.ts
```

To run tests matching a pattern:
```bash
npx jest --testNamePattern="should authenticate"
```

## Architecture

### Three-Tier Layer Structure

```
src/
├── extension.ts          # Main entry point, registers commands and providers
├── providers/            # Presentation layer
│   ├── DiscussionsProvider.ts       # Tree view for sidebar
│   ├── DiscussionFileSystemProvider.ts  # Virtual FS (ghd://) for editing
│   └── WebviewProvider.ts           # Rich HTML/markdown rendering
├── services/             # Business logic layer
│   ├── AuthenticationService.ts     # VSCode GitHub auth integration
│   ├── GitHubService.ts             # GraphQL API communication
│   ├── AutoRefreshService.ts        # Periodic background updates
│   ├── CacheService.ts              # In-memory caching with TTL
│   └── StorageService.ts            # Persistent data storage
├── models/               # Data models and TypeScript interfaces
└── utils/                # Utility functions
```

### Key Design Patterns

**Lazy Loading**: `DiscussionSummary` (lightweight, for lists) vs `Discussion` (full content with body/comments)

**Virtual File System**: Discussions are exposed as files at `ghd://discussions/{number}/{title}.md` allowing standard VS Code editing workflows

### Data Flow

1. User authenticates via VSCode's built-in GitHub auth (scopes: `repo`, `read:user`)
2. GitHubService fetches discussions via GraphQL API
3. DiscussionsProvider displays tree view grouped by category
4. DiscussionFileSystemProvider handles read/write operations
5. Changes are synced back to GitHub via GraphQL mutations

## Testing

Tests use Jest with ts-jest preset. VSCode API is mocked in `src/__tests__/setup.ts`.

Property-based testing with `fast-check` is used for complex scenarios.

Test files are located in `src/__tests__/` and follow the pattern `*.test.ts`.

## 実装ワークフロー

新機能の追加や変更を要求された場合、**必ず以下の順序で進める**:

1. **`.kiro/specs/github-discussions-plugin/requirements.md`** を更新 - 要求事項を明文化
2. **`.kiro/specs/github-discussions-plugin/design.md`** を更新 - 設計・アーキテクチャを検討
3. **`.kiro/specs/github-discussions-plugin/tasks.md`** を更新 - 実装タスクを分解
4. **ユーザーに確認** - 上記3ファイルの内容をレビューしてもらう
5. **実装開始** - 承認後、TDDサイクルで実装

コードを書き始める前に、必ずこれらのドキュメントを更新し、計画をユーザーと共有すること。

## TDD Style (t-wada style)

このプロジェクトでは t-wada（和田卓人）スタイルの TDD を採用する。

### Red-Green-Refactor サイクル

1. **Red**: まず失敗するテストを書く。テストが失敗することを確認してから次に進む
2. **Green**: テストを通す最小限のコードを書く。この段階では美しさより動作を優先
3. **Refactor**: テストが通る状態を維持しながらコードを改善する

### 実践のポイント

- **小さなステップで進む**: 一度に大きな変更をせず、小さなテストを1つずつ追加
- **テストファースト**: 実装コードを書く前に必ずテストを書く
- **仮実装→三角測量→明白な実装**: 段階的に本実装へ近づける
  - 仮実装: ハードコードで素早くテストを通す
  - 三角測量: 別のテストケースを追加して汎用化を強制
  - 明白な実装: 自明な場合は直接本実装を書いてもよい
- **テストの意図を明確に**: テスト名は日本語で「〜の場合、〜となる」形式も可
- **Arrange-Act-Assert**: テストは準備・実行・検証の3フェーズで構成

## Configuration

Extension settings (defined in package.json contributes):
- `github-discussions.autoRefresh` - Enable automatic refresh (default: true)
- `github-discussions.refreshInterval` - Refresh interval in ms (default: 300000)
- `github-discussions.defaultSort` - Sort order: newest/oldest/top
- `github-discussions.defaultCategory` - Default category for new discussions
- `github-discussions.pageSize` - Number of discussions to load per page (default: 10, range: 1-100)

## Git/PRルール

- コミットメッセージにCo-Authored-Byは不要
- PRの説明文に「Generated with Claude Code」等の記載は不要
- Claude Codeが協働していることを明示する必要はない
