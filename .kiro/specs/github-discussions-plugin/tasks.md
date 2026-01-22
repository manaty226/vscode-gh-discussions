# 実装計画: GitHub Discussions Plugin

## 概要

VSCode上でGitHub Discussionsを管理する拡張機能をTypeScriptで実装する。Virtual File Systemを活用してDiscussionsを構造化されたファイルとして編集できる革新的なアプローチを採用する。

## タスク

- [x] 1. プロジェクト構造とコアインターフェースの設定
  - TypeScript設定とVSCode拡張機能の基本構造を作成
  - コアインターフェースと型定義を実装
  - テストフレームワーク（Jest、fast-check）の設定
  - _要件: 全要件の基盤_

- [x] 2. 認証サービスの実装
  - [x] 2.1 AuthenticationServiceクラスの実装
    - VSCode組み込みGitHub認証プロバイダーとの連携
    - 認証セッション管理とユーザー情報取得
    - _要件: 1.1, 1.3, 1.5_

  - [x] 2.2 認証サービスのプロパティテスト
    - **プロパティ1: 認証セッション管理の一貫性**
    - **検証: 要件 1.1, 1.3, 1.5**

  - [x] 2.3 認証エラーハンドリングの実装
    - 認証失敗時のエラー表示とVSCode認証設定への案内
    - _要件: 1.4_

  - [x] 2.4 認証エラーハンドリングのユニットテスト
    - 認証失敗ケースのテスト
    - _要件: 1.4_

- [x] 3. GitHub APIサービスの実装
  - [x] 3.1 GitHubServiceクラスの実装
    - GraphQL クライアントの実装
    - リポジトリ検出機能
    - _要件: 2.1, 2.2_

  - [x] 3.2 リポジトリ検出のプロパティテスト
    - **プロパティ2: リポジトリ検出の信頼性**
    - **検証: 要件 2.1**

  - [x] 3.3 Discussions CRUD操作の実装
    - Discussions取得、作成、更新機能
    - コメント投稿機能
    - _要件: 2.2, 4.3, 5.2, 6.3_

  - [x] 3.4 GitHub API呼び出しのプロパティテスト
    - **プロパティ3: GitHub API呼び出しの整合性**
    - **検証: 要件 2.2, 4.3, 5.2, 6.3**

- [x] 4. チェックポイント - 基本サービスの動作確認
  - 全てのテストが通ることを確認し、ユーザーに質問があれば尋ねる

- [x] 5. データモデルとキャッシュサービスの実装
  - [x] 5.1 コアデータモデルの作成
    - Discussion、DiscussionCategory、Userインターフェースの実装
    - データ変換ユーティリティ
    - _要件: 3.2, 3.3, 3.4_

  - [x] 5.2 CacheServiceクラスの実装
    - メモリキャッシュとローカルストレージ
    - キャッシュ無効化ロジック
    - _要件: 7.2, 7.3_

  - [x] 5.3 データ表示のプロパティテスト
    - **プロパティ4: データ表示の完全性**
    - **検証: 要件 3.2, 3.3, 3.4**

- [x] 6. Virtual File System Providerの実装
  - [x] 6.1 DiscussionFileSystemProviderクラスの実装
    - `ghd://` スキーマのファイルシステム実装
    - ディレクトリ構造（discussion.md、_discussion_metadata.json、_comments.json）
    - _要件: 4.1, 4.2, 6.2_

  - [x] 6.2 Virtual File System操作のプロパティテスト
    - **プロパティ6: Virtual File System操作の正確性**
    - **検証: 要件 4.1, 4.2, 6.2**

  - [x] 6.3 ファイル保存とAPI連携の実装
    - ファイル内容の解析とGitHub API呼び出し
    - 新規作成と更新の判定ロジック
    - _要件: 4.3, 6.3_

  - [x] 6.4 Discussion操作のラウンドトリップテスト
    - **プロパティ12: Discussion操作のラウンドトリップ整合性**
    - **検証: 要件 6.3**

- [x] 7. Tree View Providerの実装
  - [x] 7.1 DiscussionsProviderクラスの実装
    - Tree Data Providerインターフェースの実装
    - カテゴリ別階層表示
    - _要件: 2.3_

  - [x] 7.2 検索・フィルタ機能の実装
    - 検索入力フィールドとフィルタロジック
    - カテゴリベースフィルタリング
    - _要件: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 7.3 検索・フィルタ機能のプロパティテスト
    - **プロパティ10: 検索・フィルタ機能の正確性**
    - **検証: 要件 8.2, 8.3, 8.4, 8.5**

  - [x] 7.4 UI要素存在のプロパティテスト
    - **プロパティ11: UI要素の存在保証**
    - **検証: 要件 5.1, 8.1**

- [x] 8. Webview Providerの実装
  - [x] 8.1 WebviewProviderクラスの実装
    - Discussion詳細表示のWebview
    - マークダウンレンダリング機能
    - _要件: 3.1, 3.5_

  - [x] 8.2 マークダウンレンダリングのプロパティテスト
    - **プロパティ5: マークダウンレンダリングの一貫性**
    - **検証: 要件 3.5, 5.5**

  - [x] 8.3 コメント機能の実装
    - コメント入力エリアとプレビュー機能
    - コメント投稿とUI更新
    - _要件: 5.1, 5.2, 5.3, 5.5_

  - [x] 8.4 権限ベースUI表示の実装
    - 編集ボタンの条件付き表示
    - 作成者権限の確認
    - _要件: 6.1_

  - [x] 8.5 権限ベースUI表示のプロパティテスト
    - **プロパティ8: 権限ベースUI表示の正確性**
    - **検証: 要件 6.1**

- [x] 9. チェックポイント - コア機能の統合テスト
  - 全てのテストが通ることを確認し、ユーザーに質問があれば尋ねる
  - **147テスト全て合格**

- [x] 9.5 UX改善
  - [x] サイドメニューを開いた際の自動認証処理の実装
    - DiscussionsProviderにAuthenticationServiceを追加
    - サインインコマンドなしで自動的に認証フローを開始
  - [x] ディスカッション編集時のタイトル表示改善
    - ファイル名にディスカッションタイトルを表示
    - 本文からタイトル行を削除
  - [x] 新規ディスカッション作成フローの改善
    - タイトル入力ダイアログの追加
    - .github/DISCUSSION_TEMPLATE/からのテンプレート読み込み対応

- [x] 10. 自動更新機能の実装
  - [x] 10.1 自動更新サービスの実装
    - AutoRefreshServiceクラスの実装
    - 設定可能な更新間隔（最小30秒）
    - VSCode設定との連携（github-discussions.autoRefresh, github-discussions.refreshInterval）
    - 認証状態に応じた自動開始/停止
    - _要件: 7.1, 7.2_

  - [x] 10.2 UI更新の同期機能
    - DiscussionFileSystemProviderにキャッシュ無効化機能を追加
    - notifyDiscussionsUpdated()でファイル変更イベントを発火
    - 自動更新時にTreeViewとファイルシステムを同期更新
    - _要件: 7.3, 7.4, 7.5_

  - [x] 10.3 自動更新機能のプロパティテスト
    - autoRefreshService.test.ts作成（20テスト）
    - **プロパティ9: 自動更新機能の動作保証**
    - **検証: 要件 7.1, 7.2**

  - [x] 10.4 UI更新同期のプロパティテスト
    - discussionFileSystemProvider.test.tsにキャッシュ無効化テストを追加
    - ファイル名にはタイトルをURLエンコードして使用（スペースや特殊文字の問題を回避）
    - **プロパティ7: UI更新の同期性**
    - **検証: 要件 4.4, 5.3, 6.4, 7.3**

- [x] 10.5 遅延読み込み（Lazy Loading）の実装
  - [x] 10.5.1 DiscussionSummaryモデルの作成
    - 一覧表示用の軽量モデル（本文・コメントを除外）
    - commentsCountフィールドの追加
    - _要件: 2.2_

  - [x] 10.5.2 getDiscussionSummaries()の実装
    - GraphQLクエリの軽量化（body, bodyHTML, commentsを除外）
    - メタデータのみを返す新しいメソッド
    - _要件: 2.2_

  - [x] 10.5.3 DiscussionsProviderの更新
    - DiscussionSummaryを使用するように変更
    - ツールチップから本文プレビューを削除（コメント数表示に変更）
    - _要件: 2.3_

  - [x] 10.5.4 遅延読み込みのテスト
    - 一覧取得時に本文が含まれないことを検証
    - 詳細取得時に本文・コメントが取得されることを検証
    - _要件: 2.2, 3.1_

- [x] 10.6 WebviewProviderの統合
  - [x] 10.6.1 extension.tsにWebviewProviderを統合
    - WebviewProviderのインポートと初期化
    - openDiscussionコマンドでWebviewを開くように変更
    - Discussionクリック時にコメント付きで表示
    - _要件: 3.1, 3.3, 5.1_

- [x] 11. エラーハンドリングとユーザーエクスペリエンスの向上
  - [x] 11.1 包括的エラーハンドリングの実装
    - errorUtils.tsにErrorType, classifyError, createAppError, showErrorWithRetryを追加
    - GraphQLClientにリトライロジックを追加（指数バックオフ）
    - ネットワークエラー、認証エラー、APIエラーの処理
    - _要件: 2.5_

  - [x] 11.2 エラーハンドリングのユニットテスト
    - errorUtils.test.tsを拡張（classifyError, createAppErrorのテスト追加）
    - 229テスト全て通過
    - _要件: 2.5, 4.5, 5.4, 6.5_

  - [x] 11.3 空の状態とローディング状態の実装
    - DiscussionsProviderにLoadingState列挙型を追加
    - 空のDiscussions一覧に「No discussions found」メッセージを表示
    - ローディング中に「Loading discussions...」を表示
    - エラー時にクリックでリトライ可能なメッセージを表示
    - 認証必要時に「Sign in to view discussions」を表示
    - _要件: 2.4_

- [x] 12. 拡張機能の統合と設定
  - [x] 12.1 Extension Entry Pointの実装
    - extension.tsに全コマンド・プロバイダーの登録完了
    - authenticate, refresh, createDiscussion, openDiscussion, editDiscussion
    - WebviewProvider, DiscussionFileSystemProvider, DiscussionsProviderの統合
    - _要件: 全要件_

  - [x] 12.2 設定管理の実装
    - VSCode設定との統合完了
    - autoRefresh, refreshInterval, showNotifications, defaultSort, defaultCategory
    - _要件: 7.1_

  - [x] 12.3 package.jsonの更新
    - コマンド、ビュー、設定の定義完了
    - viewsContainers, views, viewsWelcome, menus, configuration
    - 依存関係の定義完了
    - _要件: 全要件_

- [x] 13. 最終チェックポイント - 全機能テスト
  - 229テスト全て通過
  - コンパイルエラーなし

- [x] 14. コードリファクタリング（要件9対応）
  - [x] 14.1 ユーティリティ関数の統一
    - [x] 14.1.1 `utils/fileNameUtils.ts`の作成
      - `sanitizeFileName()`を統一実装
      - `parseDiscussionUri()`と`createDiscussionUri()`を統一
      - _要件: 9.1_
    - [x] 14.1.2 `utils/dateTimeUtils.ts`の作成
      - `parseDateTime()`を実装
      - `formatDate()`を拡張
      - _要件: 9.1_
    - [x] 14.1.3 `utils/errorUtils.ts`の作成
      - `extractErrorMessage()`を統一
      - `handleApiError()`を追加
      - _要件: 9.3_
    - [x] 14.1.4 `constants.ts`の作成
      - マジックナンバーを定数化
      - `CACHE_DEFAULT_TTL_MS`, `AUTO_REFRESH_INTERVAL_MS`等
      - _要件: 9.1_
    - [x] 14.1.5 重複コードの削除
      - `extension.ts`の`sanitizeFileName()`を削除
      - `DiscussionFileSystemProvider`の`sanitizeFileName()`を削除
      - 新しいユーティリティを使用するように更新
      - _要件: 9.1, 9.4_

  - [x] 14.2 キャッシング戦略の統一
    - [x] 14.2.1 `CacheService`の拡張
      - `getOrSet()`メソッドは既に実装済み
      - `invalidateByPattern()`も既に実装済み
      - _要件: 9.2_
    - [x] 14.2.2 `GitHubService`のキャッシュ統一
      - `cachedRepoInfo`を`CacheService`に移行
      - _要件: 9.2_
    - [x] 14.2.3 `DiscussionFileSystemProvider`のキャッシュ統一
      - `discussionCache`を`CacheService`に移行
      - _要件: 9.2_
    - [x] 14.2.4 キャッシュ統一のテスト
      - 統一されたキャッシュの動作を検証
      - _要件: 9.2_

  - [x] 14.3 インフラストラクチャ層の抽出
    - [x] 14.3.1 `infrastructure/gitRemoteParser.ts`の作成
      - `IGitRemoteParser`インターフェース定義
      - `GitRemoteParser`実装クラス
      - `execSync`を内包
      - _要件: 9.5_
    - [x] 14.3.2 `infrastructure/graphqlClient.ts`の作成
      - `IGraphQLClient`インターフェース定義
      - `GraphQLClient`実装クラス
      - GraphQLフラグメントの共通化（`USER_FRAGMENT`, `CATEGORY_FRAGMENT`等）
      - _要件: 9.1, 9.3, 9.5_
    - [x] 14.3.3 `GitHubService`のリファクタリング
      - 新しいインフラストラクチャクラスを使用
      - `graphqlQuery()`を`GraphQLClient`に移行
      - `parseGitRemote()`を`GitRemoteParser`に移行
      - 依存性注入パターンを採用
      - _要件: 9.5_

  - [x] 14.4 リファクタリングの検証
    - [x] 14.4.1 全テストの実行と確認
      - 212テスト全て通過
      - _要件: 9.1-9.5_
    - [x] 14.4.2 コードカバレッジの確認
      - インフラストラクチャ層: 100%カバレッジ
      - _要件: 9.1-9.5_

- [x] 15. UI/UXの改善（Discussionクリック動作とコメントアイコン）
  - [x] 15.1 Discussionクリック時の動作変更
    - [x] 15.1.1 openDiscussionコマンドをeditDiscussionに変更
      - DiscussionsProviderのTreeItemのcommandを変更
      - クリック時にWebviewではなくマークダウンエディタを開く
      - _要件: 3.1_
    - [x] 15.1.2 extension.tsの更新
      - openDiscussionコマンドをopenCommentsに置き換え
      - _要件: 3.1_
    - [x] 15.1.3 テストの更新
      - Discussionクリック時の動作テストを更新
      - 235テスト全て通過
      - _要件: 3.1_

  - [x] 15.2 コメントアイコンの追加
    - [x] 15.2.1 package.jsonの更新
      - view/item/contextにopenCommentsコマンドを追加
      - コメントアイコン（comment）を設定
      - グループ設定でインラインに表示
      - _要件: 5.1_
    - [x] 15.2.2 openCommentsコマンドの実装
      - extension.tsに新しいコマンドを追加
      - WebviewProviderを使用してコメント一覧を表示
      - _要件: 5.2_
    - [x] 15.2.3 WebviewProviderの更新
      - showCommentsメソッドを実装
      - コメント一覧と返信UIを提供
      - _要件: 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_
    - [x] 15.2.4 テストの追加
      - showCommentsメソッドのテスト（5テスト追加）
      - 26テスト全て通過（webviewProvider.test.ts）
      - _要件: 5.1, 5.2_

  - [x] 15.3 チェックポイント - UI/UX改善の確認
    - 235テスト全て通過
    - Discussionクリック→エディタ、コメントアイコン→Webviewの動作確認

- [x] 16. コメントへのリプライ機能の実装（要件5.10-5.13）
  - [x] 16.1 IGitHubServiceインターフェースの更新
    - addReply(commentId: string, body: string): Promise<void> メソッドを追加
    - _要件: 5.11_

  - [x] 16.2 GitHubServiceにaddReply実装を追加
    - GitHub GraphQL API `addDiscussionComment` mutation（replyToIdパラメータ付き）
    - _要件: 5.11_

  - [x] 16.3 WebviewProviderにリプライUI機能を追加
    - 各コメントに「Reply」ボタンを追加
    - クリック時にインライン返信フォームを展開
    - リプライ送信メッセージハンドリング
    - _要件: 5.10, 5.11, 5.12_

  - [x] 16.4 リプライの階層表示を改善
    - リプライを親コメントの下にインデント付きで表示
    - 適切なスタイリングの適用
    - _要件: 5.13_

  - [x] 16.5 リプライ機能のテストを追加
    - addReplyのユニットテスト (3テスト追加)
    - WebviewProviderのリプライUIテスト (5テスト追加)
    - _要件: 5.10-5.13_

  - [x] 16.6 チェックポイント - リプライ機能の確認
    - **243テスト全て通過**

- [x] 17. コメントWebViewのモダンUI改善（要件10対応）
  - [x] 17.1 カードデザインの強化
    - [x] 17.1.1 シャドウ（box-shadow）を使った立体感のあるカード
    - [x] 17.1.2 ホバー時に浮き上がるエフェクト（transform, transition）
    - [x] 17.1.3 角丸（border-radius）で柔らかい印象
    - _要件: 10.1, 10.2, 10.3_

  - [x] 17.2 ビジュアル階層の改善
    - [x] 17.2.1 作者バッジ（「OP」）でディスカッション作成者を識別
    - [x] 17.2.2 相対タイムスタンプ（「3時間前」「昨日」など）
    - [x] 17.2.3 タイポグラフィの改善（フォントサイズ、行間、文字間隔）
    - _要件: 10.4, 10.5, 10.9_

  - [x] 17.3 レイアウト改善
    - [x] 17.3.1 スレッド形式の返信表示を改善
    - [x] 17.3.2 折りたたみ可能な長いコメント（「続きを読む」）
    - [x] 17.3.3 スティッキーヘッダー（スクロール時に固定）
    - _要件: 10.6, 10.7, 10.8_

  - [x] 17.4 テストの追加
    - [x] 17.4.1 相対タイムスタンプ関数のユニットテスト（9テスト追加）
    - [x] 17.4.2 WebviewProviderテストの日本語化対応
    - _要件: 10.1-10.9_

  - [x] 17.5 チェックポイント - モダンUI改善の確認
    - **252テスト全て通過**

- [x] 18. コメントのページング機能の実装（要件11対応）
  - [x] 18.1 データモデルの更新
    - [x] 18.1.1 CommentsPageインターフェースの作成
      - comments: DiscussionComment[]
      - pageInfo: { hasNextPage: boolean; endCursor: string | null }
      - _要件: 11.6_
    - [x] 18.1.2 DiscussionモデルにcommentsPageInfoを追加
      - 初回取得時のページング情報を保持
      - _要件: 11.6_

  - [x] 18.2 GitHubServiceの更新
    - [x] 18.2.1 getDiscussionCommentsメソッドの実装
      - discussionNumber と afterカーソルを受け取る
      - 100件ずつページングしてコメントを取得
      - pageInfoを含むCommentsPageを返却
      - _要件: 11.1, 11.6_
    - [x] 18.2.2 getDiscussionのコメント取得をページング対応に更新
      - 初回は100件を取得しpageInfoを返却
      - _要件: 11.1_
    - [x] 18.2.3 返信（replies）のページング対応
      - 各コメントの返信も100件ずつ取得
      - _要件: 11.2_

  - [x] 18.3 IGitHubServiceインターフェースの更新
    - getDiscussionComments(discussionNumber: number, after?: string): Promise<CommentsPage>
    - _要件: 11.1, 11.6_

  - [x] 18.4 WebviewProviderの更新
    - [x] 18.4.1 「さらに読み込む」ボタンの追加
      - hasNextPageがtrueの場合に表示
      - _要件: 11.3_
    - [x] 18.4.2 loadMoreCommentsメッセージハンドラの実装
      - endCursorを使って次のページを取得
      - 既存のコメントに追加表示
      - _要件: 11.4_
    - [x] 18.4.3 ローディング状態の管理
      - 読み込み中はボタンをdisabled状態に
      - _要件: 11.7_
    - [x] 18.4.4 全件読み込み後のボタン非表示
      - hasNextPageがfalseの場合はボタンを非表示
      - _要件: 11.5_

  - [x] 18.5 ページング機能のテスト
    - [x] 18.5.1 GitHubServiceのページングテスト
      - getDiscussionCommentsのユニットテスト
      - カーソルベースのページネーション検証
      - _要件: 11.1, 11.2, 11.6_
    - [x] 18.5.2 WebviewProviderのページングUIテスト
      - 「さらに読み込む」ボタンの表示/非表示
      - loadMoreCommentsの動作検証
      - _要件: 11.3, 11.4, 11.5, 11.7_

  - [x] 18.6 チェックポイント - ページング機能の確認
    - **262テスト全て通過**
    - 100件以上のコメントがある場合のページング動作確認

- [x] 19. Mermaid図レンダリング機能の実装（要件12対応）
  - [x] 19.1 Mermaidバンドルの作成
    - [x] 19.1.1 esbuild設定ファイルの作成（esbuild.mermaid.js）
      - IIFE形式で単一ファイルにバンドル
      - minify有効化
      - _要件: 12.2_
    - [x] 19.1.2 mermaid-entry.jsの作成
      - mermaidモジュールのエクスポート設定
      - _要件: 12.2_
    - [x] 19.1.3 package.jsonのスクリプト更新
      - build:mermaidスクリプトの追加
      - vscode:prepublishにmermaidビルドを統合
      - _要件: 12.2_
    - [x] 19.1.4 .vscodeignoreの更新
      - media/mermaid.bundle.jsを含める
      - _要件: 12.2_

  - [x] 19.2 WebviewProviderのCSP更新
    - [x] 19.2.1 getNonce()メソッドの追加
      - crypto.randomBytes(16)で暗号学的に安全なnonce生成
      - _要件: 12.3_
    - [x] 19.2.2 getMermaidScriptUri()メソッドの追加
      - vscode.Uri.joinPath()とwebview.asWebviewUri()でスクリプトパスを変換
      - _要件: 12.2_
    - [x] 19.2.3 CSPヘッダーの更新
      - script-srcにnonce-basedポリシーを追加
      - style-srcにcspSourceと'unsafe-inline'を追加
      - _要件: 12.3_

  - [x] 19.3 Mermaidレンダリングロジックの実装
    - [x] 19.3.1 Webviewスクリプトの実装
      - mermaid.initialize()の呼び出し（securityLevel: 'strict'）
      - _要件: 12.4_
    - [x] 19.3.2 renderMermaidDiagrams()関数の実装
      - pre code.language-mermaidの検出
      - mermaid.render()による図生成
      - _要件: 12.1_
    - [x] 19.3.3 エラーハンドリングの実装
      - 構文エラー時の元コードブロック保持
      - エラーメッセージの表示
      - _要件: 12.5_

  - [x] 19.4 スタイリングの追加
    - [x] 19.4.1 Mermaid図コンテナのスタイル
      - .mermaid-diagramクラスのCSS
      - overflow-x: autoでスクロール対応
      - _要件: 12.1_
    - [x] 19.4.2 エラー表示のスタイル
      - .mermaid-errorクラスのCSS
      - VSCodeエラーカラーの使用
      - _要件: 12.5_

  - [x] 19.5 テストの追加
    - [x] 19.5.1 nonce生成のユニットテスト（12テスト追加）
      - 一意性の検証
      - 長さの検証（32文字のhex）
      - _要件: 12.3_
    - [x] 19.5.2 CSPヘッダーのユニットテスト
      - nonceが含まれることの検証
      - script-srcの正確性検証
      - _要件: 12.3_
    - [x] 19.5.3 Mermaidスクリプトパスのユニットテスト
      - URIの正確性検証
      - _要件: 12.2_

  - [x] 19.6 チェックポイント - Mermaid機能の確認
    - **275テスト全て通過**
    - CSP違反がないことの確認（nonce-based policy）

- [ ] 20. コメント編集・削除機能の実装（要件13対応）
  - [ ] 20.1 IGitHubServiceインターフェースの更新
    - updateComment(commentId: string, body: string): Promise<void> メソッドを追加
    - deleteComment(commentId: string): Promise<void> メソッドを追加
    - _要件: 13.3, 13.6_

  - [ ] 20.2 GitHubServiceにupdateComment実装を追加
    - GitHub GraphQL API `updateDiscussionComment` mutationを使用
    - _要件: 13.3_

  - [ ] 20.3 GitHubServiceにdeleteComment実装を追加
    - GitHub GraphQL API `deleteDiscussionComment` mutationを使用
    - _要件: 13.6_

  - [ ] 20.4 WebviewProviderに編集・削除UI機能を追加
    - 自分のコメントにのみ「編集」「削除」ボタンを表示
    - 編集ボタンクリックでインライン編集モードに切り替え
    - 編集モード中は「保存」「キャンセル」ボタンを表示
    - 削除ボタンクリックで確認ダイアログを表示
    - _要件: 13.1, 13.2, 13.4, 13.5_

  - [ ] 20.5 編集・削除メッセージハンドラの実装
    - updateComment, deleteCommentメッセージの処理
    - 成功時にWebviewを更新
    - エラー時にエラーメッセージを表示
    - _要件: 13.7, 13.8_

  - [ ] 20.6 返信（リプライ）の編集・削除対応
    - 返信コメントにも編集・削除ボタンを追加
    - 同様のUI/UX体験を提供
    - _要件: 13.9_

  - [ ] 20.7 コメント編集・削除機能のテスト
    - GitHubService.updateComment のユニットテスト
    - GitHubService.deleteComment のユニットテスト
    - WebviewProviderの編集・削除UIテスト
    - _要件: 13.1-13.9_

  - [ ] 20.8 チェックポイント - コメント編集・削除機能の確認
    - 全テスト通過確認
    - 自分のコメントの編集・削除動作確認

## 注意事項

- 各タスクは特定の要件への追跡可能性のために要件を参照
- チェックポイントは段階的な検証を保証
- プロパティテストは普遍的な正確性プロパティを検証
- ユニットテストは特定の例とエッジケースを検証
- 全てのタスクが必須として実装される